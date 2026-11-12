(function (root) {
// ── CONTEXTO PRIVADO DEL MOTOR ─────────────────────────────────────────────
// Estas variables SOMBREAN a los globals homónimos: el cuerpo del motor (más
// abajo, sin tocar) ya no ve state.js/types.js. Las rellena configure(ctx),
// llamado por engine/index.js antes de cada ejecución.
let schema = [], respuestas = [], respondentes = [], ausencias = [];
let lastHorariosRange = null, mcUseEmpiricalProb = true, UMBRAL_HORA_SOLAPE = 1.5;
const { extractAnswer, getRadioStepperConfig, getFranjas, dispToMap, optVal } = root.Esquema;
let P = {};
const par = (k, d) => (P[k] != null ? P[k] : d);
function getEffectiveProb(nombre) { return root.EngineProb.efectiva(nombre, respondentes, ausencias); }
function configure(ctx) {
  schema = ctx.schema || []; respuestas = ctx.respuestas || [];
  respondentes = ctx.respondentes || []; ausencias = ctx.ausencias || [];
  lastHorariosRange = ctx.lastHorariosRange || null;
  mcUseEmpiricalProb = ctx.mcEmpirico !== false;
  UMBRAL_HORA_SOLAPE = (ctx.params && ctx.params.UMBRAL_HORA_SOLAPE != null) ? ctx.params.UMBRAL_HORA_SOLAPE : 1.5;
  P = ctx.params || {};
}
// ══════════════════════════════════════════════════════════════════════════
//  MOTOR MATEMÁTICO PURO — src/js/engine/optimizador.js
//
//  Extraído de reformulario.js (líneas 40–912; sin getMySubmittedAnswers,
//  que sí depende del estado global). Capa SIN dependencias de DOM: recibe
//  datos crudos y devuelve modelos/soluciones. Espejo JS de las R1–R8 del
//  README. Variables libres inyectadas por el
//  envoltorio: UMBRAL_HORA_SOLAPE, weightByProb, mcUseEmpiricalProb,
//  respondentes, ausencias, schema, getFranjas.
//
//
//  Incluye:
//  · Soporte completo para `probabilidad-opcion` (E[X], P25[X], Frontera de
//    Pareto, opción predilecta, cuadrantes 2x2 y alertas §6).
//  · Simulación Monte Carlo condicional por opción en `simularFragilidad`.
//  · Soporte para Slider Dual ({ ideal, max }) en restricciones de presupuesto.
//  · Emparejamiento bilateral de transporte (prefPasajeros + prefCoches).
// ══════════════════════════════════════════════════════════════════════════


function createSeededRNG(seed = 22) {
  let a = seed >>> 0;
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Acota la probabilidad individual al rango operativo [0.00, 0.95] (§3)
function clipProbMotor(p) {
  const n = Number(p);
  if (!isFinite(n) || n <= 0) return 0.00;
  if (n > 1 && n <= 100) return Math.min(0.95, Math.round(n) / 100);
  return Math.min(0.95, Math.round(n * 100) / 100);
}

// Percentil 25 robusto (§4.2):
// - n in [4, 7]: segundo valor más bajo del vector ordenado.
// - n <= 3: mínimo.
// - n >= 8: interpolación lineal estándar.
function calcP25Motor(sortedProbs) {
  const n = sortedProbs.length;
  if (n === 0) return 0;
  if (n <= 3)  return sortedProbs[0];
  if (n < 8)   return sortedProbs[1];
  const pos = 0.25 * (n - 1);
  const lo  = Math.floor(pos);
  const hi  = Math.ceil(pos);
  const a   = pos - lo;
  return sortedProbs[lo] + a * (sortedProbs[hi] - sortedProbs[lo]);
}

// Determina si una pregunta `probabilidad-opcion` representa un catálogo de alojamientos
function esCatalogoCasasProb(q) {
  if (!q || q.tipo !== 'probabilidad-opcion') return false;
  if (q.config && q.config.modoCasas) return true;
  return (q.opciones || []).some(o => o && typeof o === 'object' && (o.precio || o.url || o.foto));
}

// ── 2b. CRUCE DE HORARIOS (capa B del modelo de dos capas) ──────────────────
function duracionPlanHoras(qHor) {
  const raw = qHor && qHor.config ? Number(qHor.config.duracionHoras) : NaN;
  if (!isFinite(raw) || raw <= 0) return 3;
  if (raw <= 12) {
    const f = getFranjas(qHor);
    return Math.max(1, Math.round(raw)) * (f[0].end - f[0].start);
  }
  return raw;
}

function ventanasHorariasDelDia(franjasIds, durH, franjas) {
  const ivs = [];
  franjas.forEach(f => {
    if (!franjasIds.includes(f.id)) return;
    const ini = Math.max(f.start, f.end - durH);
    ivs.push([ini, f.end]);
  });
  if (!ivs.length) return [];
  const merged = [];
  ivs.sort((a, b) => a[0] - b[0]);
  let cur = ivs[0];
  for (let i = 1; i < ivs.length; i++) {
    if (ivs[i][0] <= cur[1]) cur[1] = Math.max(cur[1], ivs[i][1]);
    else { merged.push(cur); cur = ivs[i]; }
  }
  merged.push(cur);
  return merged;
}

function intersectIntervalLists(A, B) {
  const out = [];
  for (const [a1, a2] of A) {
    for (const [b1, b2] of B) {
      const lo = Math.max(a1, b1), hi = Math.min(a2, b2);
      if (hi > lo) out.push([lo, hi]);
    }
  }
  return out;
}

function cruzarHorariosPareja(vA, vB, diasRango, durH, franjas) {
  if (!vA.horFranjasPorDia || !vB.horFranjasPorDia) return null;
  let best = null;
  for (const d of diasRango) {
    const fa = vA.horFranjasPorDia[d], fb = vB.horFranjasPorDia[d];
    if (!fa || !fb) continue;
    const inter = intersectIntervalLists(
      ventanasHorariasDelDia(fa, durH, franjas),
      ventanasHorariasDelDia(fb, durH, franjas)
    );
    for (const iv of inter) {
      const len = iv[1] - iv[0];
      if (!best || len > best.solape) best = { dia: d, ini: iv[0], fin: iv[1], solape: len };
    }
  }
  if (!best) return null;
  const fIni = fmtShortDate(best.dia);
  const hIni = Math.floor(best.ini), mIni = Math.round((best.ini - hIni) * 60);
  const fFin = fmtShortDate(addDaysISO(best.dia, Math.floor(hIni / 24)));
  const hFin = ((Math.floor(best.fin) % 24) + 24) % 24, mFin = Math.round((best.fin - Math.floor(best.fin)) * 60);
  const pad = n => String(n).padStart(2, '0');
  const mismoDia = fIni === fFin;
  best.texto = `${fIni} (${pad(hIni)}:${pad(mIni)})`
             + (mismoDia ? '' : ` → ${fFin}`)
             + ` (${pad(hFin)}:${pad(mFin)})`;
  return best;
}

// ── 2c. EVALUADOR UNIFICADO PARETO DE PROBABILIDAD POR OPCIÓN (§4, §5, §6 y §7) ──
function checkTemporalDriftMotor(qid, currentEMap) {
  if (typeof localStorage === 'undefined') return {};
  const eid = (typeof root.user !== 'undefined' && root.user && root.user.eid) ? root.user.eid : 'default';
  const key = `viajes:prob_snap:${eid}:${qid}`;
  const now = Date.now();
  const H24 = 24 * 3600 * 1000;
  const drifts = {};

  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify({ ts: now, eMap: currentEMap }));
      return drifts;
    }
    const snap = JSON.parse(raw);
    if (!snap || !snap.ts || !snap.eMap) {
      localStorage.setItem(key, JSON.stringify({ ts: now, eMap: currentEMap }));
      return drifts;
    }
    const elapsedMs = now - snap.ts;
    if (elapsedMs >= H24) {
      const horas = Math.round(elapsedMs / 3600000);
      Object.entries(currentEMap).forEach(([optKey, curE]) => {
        const prevE = Number(snap.eMap[optKey]);
        if (isFinite(prevE) && (curE - prevE) < -0.8) {
          drifts[optKey] = { delta: curE - prevE, prevE, curE, horas };
        }
      });
      if (elapsedMs >= H24 * 3) {
        localStorage.setItem(key, JSON.stringify({ ts: now, eMap: currentEMap }));
      }
    }
  } catch (e) {}
  return drifts;
}

function evaluarCatalogoProbabilidad(q, viajerosSubgrupo = null, incluirDeriva = false) {
  if (!q || !Array.isArray(q.opciones) || !q.opciones.length) return null;
  const qid = q.id;

  // Si se pasa `viajerosSubgrupo` (ventana concreta), evalúa ese subgrupo;
  // si es null (vista general de consenso), evalúa a todos los `respuestas` que votaron `q`.
  let votantesActivos = [];
  if (Array.isArray(viajerosSubgrupo)) {
    votantesActivos = viajerosSubgrupo
      .filter(v => v.probRespuestas && v.probRespuestas[qid] && Object.keys(v.probRespuestas[qid]).length > 0)
      .map(v => ({
        nombre: v.nombre,
        dict: v.probRespuestas[qid],
        probEfectiva: clipProbMotor(v.probEfectiva ?? 0.80),
      }));
  } else {
    const fuenteResp = (Array.isArray(respuestas) && respuestas.length) ? respuestas : (root.respuestas || []);
    fuenteResp.forEach(r => {
      const rawP = extractAnswer(r.answers || {}, q);
      if (rawP && typeof rawP === 'object' && !Array.isArray(rawP)) {
        const clean = {};
        Object.entries(rawP).forEach(([k, val]) => {
          if (isFinite(Number(val))) clean[k] = clipProbMotor(val);
        });
        if (Object.keys(clean).length > 0) {
          votantesActivos.push({
            nombre: r.nombre,
            dict: clean,
            probEfectiva: clipProbMotor(getEffectiveProb(r.nombre)),
          });
        }
      }
    });
  }

  const nVotantes = votantesActivos.length;
  const eBase = votantesActivos.reduce((acc, v) => acc + v.probEfectiva, 0);
  const currentEMap = {};

  const items = (q.opciones || []).map(rawOp => {
    const key = typeof optVal === 'function'
      ? optVal(q, rawOp)
      : (rawOp && typeof rawOp === 'object' ? String(rawOp.nombre || '') : String(rawOp));
    const label = (rawOp && typeof rawOp === 'object') ? String(rawOp.nombre || key) : key;
    const precioStr = (rawOp && typeof rawOp === 'object' && rawOp.precio) ? String(rawOp.precio) : null;
    const precioNum = parsePrecioNumerico(precioStr);

    const vec = [];
    const probPorViajero = {};
    votantesActivos.forEach(v => {
      if (v.dict && key in v.dict) {
        const p = clipProbMotor(v.dict[key]);
        vec.push(p);
        probPorViajero[v.nombre] = p;
      }
    });

    const sorted = [...vec].sort((a, b) => a - b);
    const nOpt   = sorted.length;
    const E      = sorted.reduce((a, b) => a + b, 0);
    const P25    = calcP25Motor(sorted);
    const nVetos = sorted.filter(p => p === 0).length;
    const nBajos = sorted.filter(p => p <= 0.20).length;

    currentEMap[key] = E;

    const eBaseOpt  = nVotantes > 0 ? eBase * (nOpt / nVotantes) : 0;
    const deltaBase = E - eBaseOpt;

    // §5.5 Regla para grupos pequeños (n <= 4): un 0.00 marca la opción como inviable
    const inviableGrupoPequeno = (nOpt > 0 && nOpt <= 4 && nVetos > 0);

    // §5.3 Mensajes operativos en pareja (única definición en todo el proyecto)
    const diffAbs = Math.abs(deltaBase).toFixed(1);
    let diffPhrase = `igual a lo que se esperaba a priori (${eBaseOpt.toFixed(1)})`;
    if (deltaBase <= -0.05) diffPhrase = `lo cual es ${diffAbs} menos de lo que se esperaba a priori (${eBaseOpt.toFixed(1)})`;
    else if (deltaBase >= 0.05) diffPhrase = `lo cual es ${diffAbs} más de lo que se esperaba a priori (${eBaseOpt.toFixed(1)})`;

    const msgE   = `Se espera que a este viaje asistan ${E.toFixed(1)} personas, ${diffPhrase}.`;
    const msgP25 = `El 75% de los votantes tienen como mínimo ${P25.toFixed(2)} de probabilidad de asistir a esta opción.`;

    // §4.3 Cuadrante 2x2
    const refE  = eBaseOpt > 0 ? eBaseOpt * 0.75 : nOpt * 0.55;
    const highE = nOpt > 0 && E >= refE;
    const highP = P25 >= 0.50;
    let cuadrante;
    if (highE && highP) {
      cuadrante = { id: 'ganador', label: 'Ganador claro', tradeoff: 'Alta asistencia media esperada y sólido compromiso en la cola baja.' };
    } else if (highE && !highP) {
      cuadrante = { id: 'polarizante', label: 'Popular pero polarizante', tradeoff: 'Lleva a más gente en media, pero depende de que los indecisos se animen.' };
    } else if (!highE && highP) {
      cuadrante = { id: 'tibio', label: 'Consensuado pero tibio', tradeoff: 'Nadie expresa rechazo fuerte, pero el entusiasmo general es moderado.' };
    } else {
      cuadrante = { id: 'rechazar', label: 'Rechazar / Baja tracción', tradeoff: 'Baja asistencia esperada y escasa garantía entre los votantes.' };
    }

    return {
      key,
      label,
      precio: precioStr,
      precio_num: precioNum,
      nOpt,
      E,
      P25,
      eBaseOpt,
      deltaBase,
      nVetos,
      nBajos,
      inviableGrupoPequeno,
      vectorProbabilidades: sorted,
      probPorViajero,
      porUsuario: probPorViajero,
      msgE,
      msgP25,
      cuadrante,
      alertas: [],
      dominadaPor: null,
    };
  });

  // §6 Alertas priorizadas (1. Colapso de cola, 2. Caída respecto al plan base, 3. Deriva temporal)
  const drifts = incluirDeriva ? checkTemporalDriftMotor(qid, currentEMap) : {};

  items.forEach(it => {
    if (it.nOpt === 0) return;

    if (it.P25 === 0 || it.P25 < 0.15) {
      const det = it.nVetos > 0
        ? `${it.nVetos} ${it.nVetos === 1 ? 'persona declara' : 'personas declaran'} «Nunca» (0.00)`
        : `${it.nBajos} ${it.nBajos === 1 ? 'persona tiene' : 'personas tienen'} probabilidad ≤ 0.20`;
      it.alertas.push({
        tipo: 'colapso_cola',
        prioridad: 1,
        mensaje: `Colapso de cola (P25 = ${it.P25.toFixed(2)}): ${det}. Riesgo real de bajas si se elige esta opción.`,
      });
    }
    if (it.deltaBase < -1.5) {
      it.alertas.push({
        tipo: 'caida_base',
        prioridad: 2,
        mensaje: `Caída respecto al plan base: se pierden ${Math.abs(it.deltaBase).toFixed(1)} asistentes esperados respecto a la expectativa a priori (${it.eBaseOpt.toFixed(1)} → ${it.E.toFixed(1)}).`,
      });
    }
    if (drifts[it.key]) {
      const d = drifts[it.key];
      it.alertas.push({
        tipo: 'deriva_temporal',
        prioridad: 3,
        mensaje: `Deriva temporal: E[X] ha caído ${Math.abs(d.delta).toFixed(1)} puntos en las últimas ${d.horas}h. El grupo está cambiando de opinión sobre esta opción.`,
      });
    }
  });

  // §5.2 Dominancia de Pareto
  const EPS = 1e-9;
  const evaluables = items.filter(it => it.nOpt > 0 && !it.inviableGrupoPequeno);
  evaluables.forEach(b => {
    const dom = evaluables.find(a =>
      a.key !== b.key &&
      a.E >= b.E - EPS &&
      a.P25 >= b.P25 - EPS &&
      (a.E > b.E + EPS || a.P25 > b.P25 + EPS)
    );
    if (dom) b.dominadaPor = dom.label;
  });

  const frontera = evaluables
    .filter(it => !it.dominadaPor)
    .sort((a, b) => (b.E - a.E) || (b.P25 - a.P25));

  const descartadas = items
    .filter(it => it.nOpt > 0 && (it.dominadaPor || it.inviableGrupoPequeno))
    .sort((a, b) => (b.E - a.E) || (b.P25 - a.P25));

  const totalConVotos = items.filter(it => it.nOpt > 0).length;
  const predilecta = (frontera.length === 1 && totalConVotos >= 2) ? frontera[0] : null;

  return {
    questionId: qid,
    label: q.label,
    nVotantes,
    eBase,
    opciones: items,
    frontera,
    descartadas,
    predilecta,
  };
}



// ── 3. GENERACIÓN DE TRAYECTORIAS ÓPTIMAS (Port de trayectorias.py) ─────────
function generarTrayectoriasOptimas(conjuntoFechas, dMax, diasRango) {
  const limite = parseInt(dMax, 10);
  if (!limite || limite < 1) return [];
  const diasOrdenados = [...conjuntoFechas].sort();
  if (!diasOrdenados.length) return [];

  const bloques = [];
  let actual = [diasOrdenados[0]];
  for (let i = 1; i < diasOrdenados.length; i++) {
    if (diffDaysISO(actual[actual.length - 1], diasOrdenados[i]) === 1) {
      actual.push(diasOrdenados[i]);
    } else {
      bloques.push(actual);
      actual = [diasOrdenados[i]];
    }
  }
  bloques.push(actual);

  const rangoSet = new Set(diasRango);
  const candidatas = [];

  for (const bloque of bloques) {
    const n = bloque.length;
    const maxLen = Math.min(n, limite);
    for (let len = 1; len <= maxLen; len++) {
      for (let ini = 0; ini <= n - len; ini++) {
        const traj = bloque.slice(ini, ini + len);
        let inter = 0, finde = 0;
        for (const d of traj) {
          if (rangoSet.has(d)) inter++;
          if (isSatSunISO(d)) finde++;
        }
        if (inter > 0) {
          candidatas.push({ traj, inter, len: traj.length, finde });
        }
      }
    }
  }

  candidatas.sort((a, b) => (b.inter - a.inter) || (b.len - a.len) || (b.finde - a.finde));
  return candidatas.map(c => c.traj);
}

// ── 4. FLUJO DE TRANSPORTE Y EMPAREJAMIENTO BILATERAL ──────────────────────
function afinidadCochePasajero(mapViajeros, nomConductor, nomPasajero) {
  const d = mapViajeros.get(nomConductor);
  const p = mapViajeros.get(nomPasajero);
  let score = 0;
  if (d && d.prefPasajeros && nomPasajero in d.prefPasajeros) {
    score += Number(d.prefPasajeros[nomPasajero]) || 0;
  }
  if (p && p.prefCoches && nomConductor in p.prefCoches) {
    score += Number(p.prefCoches[nomConductor]) || 0;
  }
  return score; // en [-2, +2]
}


// ── 5. SOLVER COMBINATORIO DE VENTANAS (Port de optimizacion.py) ────────────
function resolverVentana(viajerosCandidatos, matriz, indiceFechas, nombresNucleo, diasRango, longitud) {
  const nucleoSet = new Set(nombresNucleo);
  const rangoSet  = new Set(diasRango);

  const mitad = viajerosCandidatos.length / 2;
  const pesosDias = {};
  indiceFechas.forEach(f => {
    if (rangoSet.has(f)) {
      pesosDias[f] = par('W_NUCLEO', 100);
    } else {
      const disp = viajerosCandidatos.reduce((acc, v) => acc + (matriz[f]?.[v.nombre] || 0), 0);
      pesosDias[f] = disp >= mitad ? par('W_EXPANSION', 10) : par('W_MINORIA', -50);
    }
  });

  const scoreTraj = traj => traj.reduce((s, d) => s + (pesosDias[d] ?? par('W_MINORIA', -50)), 0);

  const baseAsignacion = {};
  let baseScore = 0;
  nombresNucleo.forEach(n => {
    baseAsignacion[n] = diasRango;
    baseScore += scoreTraj(diasRango);
  });

  const satelites = viajerosCandidatos.filter(v => !nucleoSet.has(v.nombre));
  const opcionesSat = satelites.map(sat => {
    const trajs = generarTrayectoriasOptimas(sat.conjuntoFechas, sat.diasMax, diasRango)
      .slice(0, 6)
      .map(t => ({ traj: t, score: scoreTraj(t) }))
      .filter(x => x.score > 0);
    return { nombre: sat.nombre, opciones: [...trajs, null] };
  });

  let bestSol = null;
  let bestScore = -Infinity;
  let nodesVisited = 0;
  const MAX_NODES = 1200;

  const maxRem = new Array(opcionesSat.length + 1).fill(0);
  for (let i = opcionesSat.length - 1; i >= 0; i--) {
    const bestOpt = opcionesSat[i].opciones.reduce((m, o) => Math.max(m, o ? o.score : 0), 0);
    maxRem[i] = maxRem[i + 1] + bestOpt;
  }

  function dfs(idx, curScore, curAsignacion) {
    if (nodesVisited > MAX_NODES) return;
    if (curScore + maxRem[idx] + 20 <= bestScore) return;

    if (idx === opcionesSat.length) {
      nodesVisited++;
      const res = construirFlujoTransporte(viajerosCandidatos, curAsignacion);
      if (res.viable) {
        // Bonificación suave por afinidad en los coches asignados
        const totalScore = curScore + (res.flujo.afinidadTotal || 0) * 2;
        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestSol = {
            asignacion: Object.assign({}, curAsignacion),
            flujo: res.flujo,
            objetivo: -totalScore,
          };
        }
      }
      return;
    }

    const sat = opcionesSat[idx];
    for (const opt of sat.opciones) {
      if (opt) {
        curAsignacion[sat.nombre] = opt.traj;
        dfs(idx + 1, curScore + opt.score, curAsignacion);
        delete curAsignacion[sat.nombre];
      } else {
        dfs(idx + 1, curScore, curAsignacion);
      }
    }
  }

  dfs(0, baseScore, baseAsignacion);
  if (!bestSol) return null;

  const asignadosSet = new Set(Object.keys(bestSol.asignacion));
  bestSol.viajerosAsignados = viajerosCandidatos.filter(v => asignadosSet.has(v.nombre));
  return bestSol;
}

// ── 6. SIMULACIÓN MONTE CARLO DE RESILIENCIA (Con soporte condicional p_{i,X}) ──
function simularFragilidad(dictAsignacion, viajerosAsignados, nSim = 250, pGlobal = 0.12, nCadena = 100, seed = 23, probCondicionalMap = null) {
  const personas = Object.keys(dictAsignacion);
  if (!personas.length) return null;

  const rng = createSeededRNG(seed);
  const probFalta = {};
  viajerosAsignados.forEach(v => {
    // Si la ventana tiene una opción candidata con probabilidades condicionales p_{i,X},
    // usamos 1 - p_{i,X} (donde p_{i,X} = 0.00 es un veto duro -> ausencia segura 1.00).
    if (probCondicionalMap && v.nombre in probCondicionalMap) {
      const pCond = clipProbMotor(probCondicionalMap[v.nombre]);
      probFalta[v.nombre] = pCond === 0 ? 1.00 : Math.max(0.05, Math.min(0.95, 1 - pCond));
    } else {
      probFalta[v.nombre] = mcUseEmpiricalProb
        ? Math.max(0.02, Math.min(0.95, 1 - v.probEfectiva))
        : pGlobal;
    }
  });

  // 1. Impacto individual determinista
  const impactoIndividual = {};
  for (const p of personas) {
    const sinP = {};
    personas.forEach(k => { if (k !== p) sinP[k] = dictAsignacion[k]; });
    if (!Object.keys(sinP).length) {
      impactoIndividual[p] = 1.0;
      continue;
    }
    const grupoSinP = viajerosAsignados.filter(v => v.nombre !== p);
    const { viable } = construirFlujoTransporte(grupoSinP, sinP);
    impactoIndividual[p] = viable ? 0.0 : 1.0;
  }

  function simularEscenario(ausentesSet) {
    const asig = {};
    personas.forEach(k => { if (!ausentesSet.has(k)) asig[k] = dictAsignacion[k]; });
    if (!Object.keys(asig).length) return false;
    const subGrupo = viajerosAsignados.filter(v => !ausentesSet.has(v.nombre));
    return construirFlujoTransporte(subGrupo, asig).viable;
  }

  // 2. Viabilidad global Monte Carlo
  let nViables = 0;
  for (let s = 0; s < nSim; s++) {
    const ausentes = new Set(personas.filter(p => rng() < (probFalta[p] ?? pGlobal)));
    if (simularEscenario(ausentes)) nViables++;
  }
  const viabilidadGlobal = nViables / nSim;

  // 3. Impacto en cadena condicional por persona
  const impactoCadena = {};
  for (const p of personas) {
    let nViablesCond = 0;
    for (let s = 0; s < nCadena; s++) {
      const ausentes = new Set([p]);
      personas.forEach(otro => {
        if (otro !== p && rng() < (probFalta[otro] ?? pGlobal)) ausentes.add(otro);
      });
      if (simularEscenario(ausentes)) nViablesCond++;
    }
    const viaCond = nViablesCond / nCadena;
    impactoCadena[p] = Math.max(0.0, viabilidadGlobal - viaCond);
  }

  return {
    impactoIndividual,
    viabilidadGlobal,
    impactoCadena,
    probFalta,
    nSim,
    pGlobal,
  };
}

// ── HELPER DE COHERENCIA CONDICIONAL ENTRE PLAN Y SUB-PREGUNTAS ─────────────
function _reglasCondicionalesDe(q) {
  if (!q) return { logic: 'OR', rules: [] };
  let raw = q.config && q.config.mostrarSi;
  if (!raw || (!raw.qid && !Array.isArray(raw) && !Array.isArray(raw.rules))) {
    const h = typeof _condDeSeccion === 'function' ? _condDeSeccion(q) : null;
    raw = h && h.config ? h.config.mostrarSi : null;
  }
  if (!raw) return { logic: 'OR', rules: [] };
  if (Array.isArray(raw)) return { logic: 'OR', rules: raw.filter(r => r && r.qid) };
  if (Array.isArray(raw.rules)) return { logic: raw.logic === 'AND' ? 'AND' : 'OR', rules: raw.rules.filter(r => r && r.qid) };
  if (raw.qid) return { logic: 'OR', rules: [raw] };
  return { logic: 'OR', rules: [] };
}

// Comprueba si una pregunta hija (p.ej. qCasas) es coherente con la opción de plan `planKey` y la ventana
function preguntaEsCoherenteConPlan(qHija, qPlan, planKey, esExcursion = false) {
  if (!qHija) return false;
  const esAlojamiento = qHija.tipo === 'casas' || esCatalogoCasasProb(qHija);

  // En excursiones de ir y venir en el día no aplican alojamientos de pernocta
  if (esAlojamiento && esExcursion) return false;

  const { logic, rules } = _reglasCondicionalesDe(qHija);
  const rulesSobrePlan = qPlan ? rules.filter(r => r.qid === qPlan.id) : [];

  if (rulesSobrePlan.length > 0) {
    if (!planKey) return false;
    const evalRule = r => {
      const vals = (Array.isArray(r.valor) ? r.valor : [r.valor]).map(v => String(v).trim().toLowerCase());
      const target = String(planKey).trim().toLowerCase();
      const hit = vals.includes(target);
      return r.no ? !hit : hit;
    };
    return logic === 'AND' ? rulesSobrePlan.every(evalRule) : rulesSobrePlan.some(evalRule);
  }

  // Heurística de seguridad si el creador olvidó poner `mostrarSi` en qCasas pero el plan elegido
  // es explícitamente de día/restaurante/cine mientras otra opción del mismo plan sí menciona casa/hotel/dormir:
  if (esAlojamiento && qPlan && planKey) {
    const reCasa = /\b(casa|rural|hotel|alojamiento|hostal|apartamento|dormir|pernocta|finde|viaje)\b/i;
    const reDia  = /\b(restaurante|comida|cena|cine|bar|cañas|tardeo|excursi[oó]n|pasar el d[ií]a|ir y venir)\b/i;
    const todasOpts = (qPlan.opciones || []).map(o => typeof optVal === 'function' ? optVal(qPlan, o) : String(o));
    const algunaEsCasa = todasOpts.some(k => reCasa.test(k));
    if (algunaEsCasa && reDia.test(planKey) && !reCasa.test(planKey)) {
      return false;
    }
  }
  return true;
}

// Extrae qué valor dio un viajero `v` a la opción `optKey` en la pregunta `q`
function detalleVotoViajeroEnPregunta(v, q, optKey) {
  if (!v || !q) return null;
  const raw = v.rawAnswers ? extractAnswer(v.rawAnswers, q) : null;
  if (raw == null) return null;

  if (q.tipo === 'probabilidad-opcion') {
    if (typeof raw === 'object' && !Array.isArray(raw) && optKey in raw) {
      const p = clipProbMotor(raw[optKey]);
      return { tipo: 'prob', val: p, apoya: p > 0.5, veto: p === 0, texto: `${Math.round(p * 100)}%` };
    }
    return null;
  }
  if (q.tipo === 'voto-ponderado') {
    if (typeof raw === 'object' && !Array.isArray(raw) && optKey in raw) {
      const pts = Number(raw[optKey]);
      if (!isFinite(pts) || pts === 0) return null;
      return { tipo: 'pond', val: pts, apoya: pts > 0, veto: pts < 0, texto: pts > 0 ? `+${pts}` : `${pts}` };
    }
    return null;
  }
  if (q.tipo === 'casas' || q.tipo === 'checkbox') {
    const arr = Array.isArray(raw) ? raw : [];
    const hit = arr.some(item => (typeof item === 'string' ? item : (item && item.nombre)) === optKey);
    return hit ? { tipo: 'bin', val: 1, apoya: true, veto: false, texto: '✓' } : null;
  }
  return null;
}

// ── 2. NORMALIZACIÓN Y MATRIZ DE DISPONIBILIDAD ─────────────────────────────
function buildModelData() {
  const qDisp  = schema.find(q => q.tipo === 'disponibilidad');
  const qTrans = schema.find(q => getRadioStepperConfig(q));
  const qPrec  = schema.find(q => q.tipo === 'slider' && q.id !== 'prob_asistencia_propia') || schema.find(q => q.tipo === 'slider');
  const qCasas = schema.find(q => q.tipo === 'casas') || schema.find(esCatalogoCasasProb);
  const qOpts  = schema.find(q => q.tipo === 'checkbox' || q.tipo === 'voto-ponderado' || (q.tipo === 'probabilidad-opcion' && q !== qCasas));
  const qHor   = schema.find(q => q.tipo === 'horarios');
  const qProbs = schema.filter(q => q.tipo === 'probabilidad-opcion');

  const viajeros = [];
  const allDatesSet = new Set();

  const _expand = (a, b) => {
    const out = []; if (!a || !b || b < a) return out;
    const cur = new Date(a + 'T00:00:00Z'), end = new Date(b + 'T00:00:00Z');
    for (let g = 0; cur <= end && g < 180; g++, cur.setUTCDate(cur.getUTCDate() + 1))
      out.push(cur.toISOString().slice(0, 10));
    return out;
  };

  const fechasGlobal = new Set();
  respuestas.forEach(r => {
    const d = qDisp ? extractAnswer(r.answers || {}, qDisp) : null;
    if (d && d.noSe) return;
    ((d && d.rangos) || []).forEach(rg => _expand(rg.desde, rg.hasta).forEach(f => fechasGlobal.add(f)));
    const h = qHor ? extractAnswer(r.answers || {}, qHor) : null;
    if (h && Array.isArray(h.disponibilidades)) for (const f of dispToMap(h.disponibilidades).keys()) fechasGlobal.add(f);
  });

  respuestas.forEach(r => {
    const ans = r.answers || {};
    const disp = qDisp ? extractAnswer(ans, qDisp) : null;
    const trans = qTrans ? extractAnswer(ans, qTrans) : null;
    const prec = qPrec ? extractAnswer(ans, qPrec) : null;
    const casasRaw = qCasas ? extractAnswer(ans, qCasas) : [];
    const optsRaw  = qOpts ? extractAnswer(ans, qOpts) : [];
    const hor = qHor ? extractAnswer(ans, qHor) : null;

    const diasMax = Math.max(1, parseInt((disp && disp.diasMax) ?? ans.diasMax ?? (qDisp ? 5 : 1), 10) || 1);
    const soloFinde = !!(disp && disp.soloFinde);
    const irYVenir  = !!(disp && disp.irYVenir);
    const meDaIgual = !!(disp && disp.meDaIgual);
    const prefPuente = !!(disp && disp.preferirPuente);
    const rangos = (disp && Array.isArray(disp.rangos)) ? disp.rangos : (ans.rangosFechas || []);

    let forzarFechas = null;
    if (disp && disp.noSe) {
      const pAns = ans.prob_asistencia_propia;
      const pVal = (pAns && typeof pAns === 'object') ? (pAns.ideal ?? pAns.value) : pAns;
      const pResp = (respondentes.find(x => x.nombre.toLowerCase() === r.nombre.toLowerCase()) || {}).prob_asistencia;
      const p = (pVal != null ? pVal : (pResp != null ? pResp : 80)) / 100;
      if (p <= 0.5 || !fechasGlobal.size) return;
      forzarFechas = new Set(fechasGlobal);
    }

    const rangoSet = new Set();
    rangos.forEach(rg => {
      if (!rg || !rg.desde || !rg.hasta || rg.hasta < rg.desde) return;
      const cur = new Date(rg.desde + 'T00:00:00Z');
      const end = new Date(rg.hasta + 'T00:00:00Z');
      let guard = 0;
      while (cur <= end && guard < 180) {
        rangoSet.add(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
        guard++;
      }
    });

    const horFechas = new Set();
    if (hor && Array.isArray(hor.disponibilidades)) {
      for (const f of dispToMap(hor.disponibilidades).keys()) horFechas.add(f);
    }

    let conjuntoFechas = forzarFechas || new Set([...rangoSet, ...horFechas]);
    if (!forzarFechas && rangoSet.size && horFechas.size) {
      const inter = new Set([...rangoSet].filter(f => horFechas.has(f)));
      if (inter.size) conjuntoFechas = inter;
    }

    if (soloFinde && conjuntoFechas.size) {
      conjuntoFechas = new Set([...conjuntoFechas].filter(isWeekendISO));
    }
    if (conjuntoFechas.size === 0) {
      const fb = lastHorariosRange && (lastHorariosRange.desde || lastHorariosRange.fecha);
      if (fb) { conjuntoFechas.add(fb); allDatesSet.add(fb); }
      else return;
    }

    const horFranjasPorDia = hor && Array.isArray(hor.disponibilidades) ? {} : null;
    if (horFranjasPorDia) {
      dispToMap(hor.disponibilidades).forEach((setIds, f) => {
        if (conjuntoFechas.has(f)) horFranjasPorDia[f] = [...setIds];
      });
    }

    conjuntoFechas.forEach(f => allDatesSet.add(f));

    // Normalización de transporte y preferencias bilaterales (coches <-> pasajeros)
    const estadoTransRaw = trans ? (typeof trans === 'object' ? trans.estado : String(trans)) : '';
    const cs = qTrans ? getRadioStepperConfig(qTrans) : null;
    const driverTrigger = (cs && cs.when) ? String(cs.when).trim().toLowerCase() : 'llevo-coche';
    const estadoNorm = String(estadoTransRaw || '').trim().toLowerCase();
    const esConductor = !!estadoNorm && (estadoNorm === driverTrigger || estadoNorm === 'llevo-coche' || estadoNorm === 'coche');
    const transporte = esConductor ? 'llevo-coche' : estadoNorm;

    const keyPlazas = (cs && cs.key) ? cs.key : 'plazasLibres';
    const plazasLibres = (trans && typeof trans === 'object' && trans[keyPlazas] != null)
      ? Math.max(0, parseInt(trans[keyPlazas], 10) || 0)
      : (esConductor ? ((cs && cs.default) || 3) : 0);
    const prefPasajeros = (trans && typeof trans === 'object' && trans.prefPasajeros) ? trans.prefPasajeros : {};
    const prefCoches    = (trans && typeof trans === 'object' && trans.prefCoches)    ? trans.prefCoches    : {};
    const notaRuta      = (trans && typeof trans === 'object' && trans.notaRuta)      ? String(trans.notaRuta) : '';

    // Soporte de Slider Dual: distingue `precioIdealPP` (precio aceptado/cómodo) y `precioMaxPP` (se lo puede permitir / Hard Cap)
    let precioIdealPP = null, precioMaxPP = null, tieneHardCap = false;
    if (prec != null && typeof prec === 'object') {
      const idVal = Number(prec.ideal ?? prec.value);
      const mxVal = Number(prec.max ?? prec.ideal ?? prec.value);
      if (isFinite(idVal) && idVal >= 0) precioIdealPP = idVal;
      if (isFinite(mxVal) && mxVal >= 0) precioMaxPP   = Math.max(idVal || 0, mxVal);
      if (precioIdealPP != null && precioMaxPP != null && precioMaxPP > precioIdealPP) {
        tieneHardCap = true;
      }
    } else if (prec != null && isFinite(Number(prec)) && Number(prec) >= 0) {
      precioIdealPP = Number(prec);
      precioMaxPP   = Number(prec);
    }

    const probRespuestas = {};
    qProbs.forEach(qp => {
      const rawP = extractAnswer(ans, qp);
      if (rawP && typeof rawP === 'object' && !Array.isArray(rawP)) {
        const clean = {};
        Object.entries(rawP).forEach(([k, v]) => {
          if (isFinite(Number(v))) clean[k] = clipProbMotor(v);
        });
        probRespuestas[qp.id] = clean;
      }
    });

    const casasParsed = [];
    if (Array.isArray(casasRaw)) {
      casasRaw.forEach(c => {
        const nombre = typeof c === 'string' ? c : c.nombre;
        let precioStr = (typeof c === 'object' && c.precio) ? c.precio : null;
        if (!precioStr && qCasas) {
          const schemaCasa = (qCasas.opciones || []).find(o => o && o.nombre === nombre);
          if (schemaCasa) precioStr = schemaCasa.precio;
        }
        const pNum = parsePrecioNumerico(precioStr);
        if (nombre && pNum != null && pNum > 0) {
          casasParsed.push({ nombre, precio_num: pNum, pts: 1 });
        }
      });
    } else if (casasRaw && typeof casasRaw === 'object' && qCasas) {
      Object.entries(casasRaw).forEach(([nombre, rawVal]) => {
        const schemaCasa = (qCasas.opciones || []).find(o => {
          const k = typeof optVal === 'function' ? optVal(qCasas, o) : (o && o.nombre ? o.nombre : String(o));
          return k === nombre;
        });
        const precioStr = schemaCasa && typeof schemaCasa === 'object' ? schemaCasa.precio : null;
        const pNum = parsePrecioNumerico(precioStr);
        if (!nombre || pNum == null || pNum <= 0) return;

        if (qCasas.tipo === 'probabilidad-opcion') {
          const prob = clipProbMotor(rawVal);
          if (prob > 0.5) casasParsed.push({ nombre, precio_num: pNum, prob });
        } else {
          const pts = Number(rawVal);
          if (pts > 0) casasParsed.push({ nombre, precio_num: pNum, pts });
        }
      });
    }

    let opcionesList = [];
    if (Array.isArray(optsRaw)) {
      opcionesList = optsRaw;
    } else if (optsRaw && typeof optsRaw === 'object') {
      const umbral = (qOpts && qOpts.tipo === 'probabilidad-opcion') ? 0.5 : 0;
      opcionesList = Object.entries(optsRaw).filter(([, pts]) => Number(pts) > umbral).map(([k]) => k);
    }

    viajeros.push({
      nombre: r.nombre,
      rawAnswers: ans,
      diasMax,
      precioMaxPP,
      precioIdealPP,
      tieneHardCap,
      transporte,
      plazasLibres,
      prefPasajeros,
      prefCoches,
      notaRuta,
      soloFinde,
      conjuntoFechas,
      casasParsed,
      opcionesList,
      probRespuestas,
      irYVenir,
      meDaIgual,
      horFranjasPorDia,
      preferirPuente: prefPuente,
      probEfectiva: getEffectiveProb(r.nombre),
      tieneLogistica: !!estadoNorm,
    });
  });

  if (!viajeros.length || !allDatesSet.size) {
    return { viajeros: [], indiceFechas: [], matriz: {}, lMaxEval: 0, logistica: false, nLog: 0, probGlobal: {} };
  }

  const sortedBounds = [...allDatesSet].sort();
  const indiceFechas = [];
  const c = new Date(sortedBounds[0] + 'T00:00:00Z');
  const e = new Date(sortedBounds[sortedBounds.length - 1] + 'T00:00:00Z');
  let guard = 0;
  while (c <= e && guard < 180) {
    indiceFechas.push(c.toISOString().slice(0, 10));
    c.setUTCDate(c.getUTCDate() + 1);
    guard++;
  }

  const matriz = {};
  indiceFechas.forEach(f => {
    matriz[f] = {};
    viajeros.forEach(v => {
      matriz[f][v.nombre] = v.conjuntoFechas.has(f) ? 1 : 0;
    });
  });

  const probGlobal = {};
  qProbs.forEach(qp => {
    probGlobal[qp.id] = evaluarCatalogoProbabilidad(qp, viajeros);
  });

  const hayPlanDia = viajeros.some(v => v.diasMax === 1 || v.irYVenir || v.conjuntoFechas.size === 1);
  const lMinEval = hayPlanDia ? 1 : 2;
  const lMaxEval = Math.min(12, Math.max(lMinEval, ...viajeros.map(v => v.diasMax)));
  const nLog = viajeros.filter(v => v.tieneLogistica).length;
  return { viajeros, indiceFechas, matriz, lMinEval, lMaxEval, logistica: nLog > 0, nLog, probGlobal };
}

// ── 4. FLUJO DE TRANSPORTE CON EMPAREJAMIENTO EXPLÍCITO COCHE <-> PASAJERO ──
function detalleAfinidadPar(mapViajeros, nomConductor, nomPasajero) {
  const d = mapViajeros.get(nomConductor);
  const p = mapViajeros.get(nomPasajero);
  let prefCond = 0, prefPax = 0;

  if (d && d.prefPasajeros) {
    const entry = Object.entries(d.prefPasajeros).find(([k]) => k.toLowerCase() === nomPasajero.toLowerCase());
    if (entry) prefCond = Number(entry[1]) || 0;
  }
  if (p && p.prefCoches) {
    const entry = Object.entries(p.prefCoches).find(([k]) => k.toLowerCase() === nomConductor.toLowerCase());
    if (entry) prefPax = Number(entry[1]) || 0;
  }

  // Penalización fuerte si cualquiera de los dos marcó -1 (evitar), salvo que sea la única plaza
  const hayVeto = (prefCond < 0 || prefPax < 0);
  const score   = hayVeto ? -10 + (prefCond + prefPax) : (prefCond + prefPax);
  return {
    prefCond,
    prefPax,
    score,
    hayVeto,
    notaPax: (p && p.notaRuta) ? p.notaRuta : '',
  };
}

function construirFlujoTransporte(viajerosGrupo, dictAsignacion) {
  const idasCoches = {}, vueltasCoches = {};
  const idasPax = {}, vueltasPax = {};
  const conductoresObj = [];
  const fechasActivas = new Set();

  const mapViajeros = new Map(viajerosGrupo.map(v => [v.nombre, v]));
  if (!viajerosGrupo.some(v => v.tieneLogistica)) {
    return { viable: true, flujo: { idas: [], vueltas: [], rango_activo: null, sinLogistica: true, afinidadTotal: 0 } };
  }

  for (const [nombre, traj] of Object.entries(dictAsignacion)) {
    const row = mapViajeros.get(nombre);
    if (!row || !traj || !traj.length) continue;
    const dias = [...traj].sort();
    dias.forEach(d => fechasActivas.add(d));
    const tIn = dias[0], tOut = dias[dias.length - 1];
    const estado = row.transporte;
    const plazas = row.plazasLibres;

    if (estado === 'propio' || !row.tieneLogistica) continue;

    if (!idasPax[tIn]) idasPax[tIn] = [];
    if (!vueltasPax[tOut]) vueltasPax[tOut] = [];
    if (!idasCoches[tIn]) idasCoches[tIn] = [];
    if (!vueltasCoches[tOut]) vueltasCoches[tOut] = [];

    if (estado === 'llevo-coche') {
      const coche = { nombre, plazas, t_in: tIn, t_out: tOut, aparcado: false };
      conductoresObj.push(coche);
      idasCoches[tIn].push(coche);
      vueltasCoches[tOut].push(coche);
    } else {
      idasPax[tIn].push(nombre);
      vueltasPax[tOut].push(nombre);
    }
  }

  // Heurística de aparcamiento: aparcar coche solo si la holgura sobra y ningún pasajero pidió expresamente ese coche
  conductoresObj.sort((a, b) => a.plazas - b.plazas);
  for (const coche of conductoresObj) {
    const tIn = coche.t_in, tOut = coche.t_out;
    const pedidoExpresamente = [...(idasPax[tIn] || []), ...(vueltasPax[tOut] || [])].some(pax => {
      const det = detalleAfinidadPar(mapViajeros, coche.nombre, pax);
      return det.prefPax > 0 || det.prefCond > 0;
    });
    if (pedidoExpresamente) continue;

    const plazasIn = (idasCoches[tIn] || []).filter(x => !x.aparcado).reduce((s, x) => s + x.plazas, 0);
    const paxIn    = (idasPax[tIn] || []).length + (idasCoches[tIn] || []).filter(x => x.aparcado).length;
    const slackIn  = plazasIn - paxIn;

    const plazasOut = (vueltasCoches[tOut] || []).filter(x => !x.aparcado).reduce((s, x) => s + x.plazas, 0);
    const paxOut    = (vueltasPax[tOut] || []).length + (vueltasCoches[tOut] || []).filter(x => x.aparcado).length;
    const slackOut  = plazasOut - paxOut;

    const coste = coche.plazas + 1;
    if (slackIn >= coste && slackOut >= coste) {
      coche.aparcado = true;
    }
  }

  let afinidadTotal = 0;
  const flujo = { idas: [], vueltas: [], rango_activo: null, afinidadTotal: 0 };
  const pares = [
    [idasCoches, idasPax, 'idas'],
    [vueltasCoches, vueltasPax, 'vueltas'],
  ];

  for (const [dictCoches, dictPax, clave] of pares) {
    const dias = [...new Set([...Object.keys(dictCoches), ...Object.keys(dictPax)])].sort();
    for (const dia of dias) {
      const activos = (dictCoches[dia] || []).filter(c => !c.aparcado).sort((a, b) => b.plazas - a.plazas);
      const pasajeros = [
        ...(dictPax[dia] || []),
        ...(dictCoches[dia] || []).filter(c => c.aparcado).map(c => c.nombre),
      ];
      const estadoCoches = activos.map(c => ({
        nombre: c.nombre,
        plazasIniciales: c.plazas,
        plazas: c.plazas,
        notaConductor: (mapViajeros.get(c.nombre) && mapViajeros.get(c.nombre).notaRuta) || '',
        asignados: [],
        pasajerosDetalle: [],
      }));

      while (pasajeros.length > 0) {
        if (estadoCoches.length === 0) {
          return { viable: false, flujo: { error: `Sin coches el ${fmtShortDate(dia)} (${pasajeros.length} pax sin plaza)` } };
        }
        const conHueco = estadoCoches.filter(c => c.plazas > 0);
        if (conHueco.length === 0) {
          return { viable: false, flujo: { error: `Faltan plazas el ${fmtShortDate(dia)} (${pasajeros.length} pax sin asignar)` } };
        }

        let bestCar = null, bestPaxIdx = 0, bestComposite = -Infinity, bestDet = null;
        for (let pIdx = 0; pIdx < pasajeros.length; pIdx++) {
          const paxName = pasajeros[pIdx];
          for (const car of conHueco) {
            const det = detalleAfinidadPar(mapViajeros, car.nombre, paxName);
            const composite = det.score * 100 + car.plazas;
            if (composite > bestComposite) {
              bestComposite = composite;
              bestCar       = car;
              bestPaxIdx    = pIdx;
              bestDet       = det;
            }
          }
        }

        const chosenPax = pasajeros.splice(bestPaxIdx, 1)[0];
        afinidadTotal += (bestDet.prefCond + bestDet.prefPax);
        bestCar.asignados.push(chosenPax);
        bestCar.pasajerosDetalle.push({
          nombre: chosenPax,
          prefCond: bestDet.prefCond,
          prefPax: bestDet.prefPax,
          hayVeto: bestDet.hayVeto,
          notaPax: bestDet.notaPax,
        });
        bestCar.plazas -= 1;
      }

      for (const c of estadoCoches) {
        flujo[clave].push({
          fecha: dia,
          conductor: c.nombre,
          plazasTotales: c.plazasIniciales,
          plazasLibresRestantes: c.plazas,
          notaConductor: c.notaConductor,
          pasajeros: c.asignados,
          pasajerosDetalle: c.pasajerosDetalle,
        });
      }
    }
  }

  flujo.afinidadTotal = afinidadTotal;
  if (fechasActivas.size > 0) {
    const s = [...fechasActivas].sort();
    flujo.rango_activo = [s[0], s[s.length - 1]];
  }
  return { viable: true, flujo };
}

// ── 7. BÚSQUEDA GLOBAL DE SOLUCIONES FACTIBLES (Con Presupuesto Núcleo, Coherencia y Desglose) ──
function ejecutarMotorFactibilidad(model) {
  const { viajeros, indiceFechas, matriz, lMaxEval } = model;
  if (!viajeros.length || indiceFechas.length < 2) return { soluciones: [], diagnosticos: [] };

  const qHor   = schema.find(q => q.tipo === 'horarios');
  const qCasas = schema.find(q => q.tipo === 'casas') || schema.find(esCatalogoCasasProb);
  const qOpts  = schema.find(q => q.tipo === 'checkbox' || q.tipo === 'voto-ponderado' || (q.tipo === 'probabilidad-opcion' && q !== qCasas));
  const qProbs = schema.filter(q => q.tipo === 'probabilidad-opcion');
  const durH   = qHor ? duracionPlanHoras(qHor) : null;
  const franjas = qHor ? getFranjas(qHor) : null;

  function cruzHorarioNucleo(nombresNucleo, diasRango) {
    if (!qHor) return { ok: true, solape: null };
    const conHor = nombresNucleo
      .map(n => viajeros.find(v => v.nombre === n))
      .filter(v => v && v.horFranjasPorDia);
    if (conHor.length < 2) return { ok: true, solape: null };
    let best = null;
    for (let i = 0; i < conHor.length; i++) {
      for (let j = i + 1; j < conHor.length; j++) {
        const c = cruzarHorariosPareja(conHor[i], conHor[j], diasRango, durH, franjas);
        if (!c || c.solape < UMBRAL_HORA_SOLAPE) return { ok: false, solape: c };
        if (!best || c.solape > best.solape) best = c;
      }
    }
    return { ok: true, solape: best };
  }

  const candidatosBrutos = [];
  const diagnosticos = [];
  const lMin = model.lMinEval || 1;

  function nucleoPernocta(L, diasRango) {
    return viajeros
      .filter(v => !(v.irYVenir && !v.meDaIgual && L > 1) &&
                   v.diasMax >= L && diasRango.every(d => matriz[d][v.nombre] === 1))
      .map(v => v.nombre);
  }

  function nucleoExcursion(fIni) {
    if (!viajeros.some(v => v.irYVenir)) return [];
    return viajeros
      .filter(v => v.diasMax >= 1 && matriz[fIni]?.[v.nombre] === 1)
      .map(v => v.nombre);
  }

  for (let L = lMin; L <= lMaxEval; L++) {
    for (let i = 0; i <= indiceFechas.length - L; i++) {
      const diasRango = indiceFechas.slice(i, i + L);
      const fIni = diasRango[0], fFin = diasRango[diasRango.length - 1];

      let nombresNucleo = nucleoPernocta(L, diasRango);
      const esExcursion = L === 1 && nombresNucleo.length < 2;
      if (esExcursion) nombresNucleo = nucleoExcursion(fIni);

      if (nombresNucleo.length < 2) continue;

      const cruceHor = cruzHorarioNucleo(nombresNucleo, diasRango);
      if (!cruceHor.ok) {
        diagnosticos.push(`Ventana ${fmtShortDate(fIni)}–${fmtShortDate(fFin)} (${L}d): horarios incompatibles entre el núcleo (solape < ${UMBRAL_HORA_SOLAPE} h).`);
        continue;
      }

      const nucleoSet = new Set(nombresNucleo);
      const minSatDays = L === 1 ? 1 : 2;
      const satelites = viajeros.filter(v => {
        if (nucleoSet.has(v.nombre)) return false;
        const diasEnVentana = diasRango.reduce((s, d) => s + matriz[d][v.nombre], 0);
        return diasEnVentana >= minSatDays;
      });

      const dfCandidatos = [
        ...viajeros.filter(v => nucleoSet.has(v.nombre)),
        ...satelites,
      ];

      const sol = resolverVentana(dfCandidatos, matriz, indiceFechas, nombresNucleo, diasRango, L);
      if (!sol) {
        diagnosticos.push(`Ventana ${fmtShortDate(fIni)}–${fmtShortDate(fFin)} (${L}d): sin flujo logístico factible.`);
        continue;
      }

      const asig = sol.asignacion;
      const dfAsig = sol.viajerosAsignados;
      const asistentesNucleo = nombresNucleo.filter(n => n in asig);
      const nucleoAsigSet = new Set(asistentesNucleo);
      const dfNucleo = dfAsig.filter(v => nucleoAsigSet.has(v.nombre));
      const satelitesAsignados = dfAsig.map(v => v.nombre).filter(n => !nucleoAsigSet.has(n));
      const nTotal = dfAsig.length;
      const esPlanExcursion = esExcursion || (L === 1 && viajeros.some(v => v.irYVenir && nucleoAsigSet.has(v.nombre)));

      // ── 1. PRESUPUESTOS: NÚCLEO vs GRUPO TOTAL Y DETECCIÓN DE DOBLE BARRA ──
      const calcMinBudget = (lista, key) => {
        const conDato = lista
          .map(v => ({ nombre: v.nombre, val: v[key] ?? v.precioMaxPP }))
          .filter(x => x.val != null && isFinite(x.val))
          .sort((a, b) => a.val - b.val);
        return conDato.length ? { min: conDato[0].val, autor: conDato[0].nombre, nConDato: conDato.length } : { min: null, autor: null, nConDato: 0 };
      };

      const bMaxGrupo    = calcMinBudget(dfAsig, 'precioMaxPP');
      const bIdealGrupo  = calcMinBudget(dfAsig, 'precioIdealPP');
      const bMaxNucleo   = calcMinBudget(dfNucleo, 'precioMaxPP');
      const bIdealNucleo = calcMinBudget(dfNucleo, 'precioIdealPP');

      const pMaxGrupo     = bMaxGrupo.min;
      const pIdealGrupo   = bIdealGrupo.min;
      const pMaxNucleo    = bMaxNucleo.min;
      const pIdealNucleo  = bIdealNucleo.min;
      const hayDobleBarraPresupuesto = dfAsig.some(v => v.tieneHardCap && v.precioMaxPP > v.precioIdealPP);

      // Evaluación de Pareto condicional al subgrupo asignado a esta ventana (`dfAsig`)
      const paretoVentana = {};
      qProbs.forEach(qp => {
        paretoVentana[qp.id] = evaluarCatalogoProbabilidad(qp, dfAsig);
      });

      // ── 2. DESGLOSE DE PLANES VOTADOS (CON VOTOS DEL NÚCLEO Y PUNTOS/PROB) ──
      let planesEvaluados = [];
      let planGanadorKey  = null;
      let strOpcion       = 'Indeterminado';

      if (qOpts && Array.isArray(qOpts.opciones) && qOpts.opciones.length) {
        planesEvaluados = (qOpts.opciones || []).map(rawOp => {
          const key   = typeof optVal === 'function' ? optVal(qOpts, rawOp) : (rawOp && rawOp.nombre ? rawOp.nombre : String(rawOp));
          const label = (rawOp && typeof rawOp === 'object' && rawOp.nombre) ? rawOp.nombre : key;
          const detallesVotantes = [];
          let apoyosNucleo = 0, apoyosSat = 0, vetos = 0, scoreTotal = 0;

          dfAsig.forEach(v => {
            const det = detalleVotoViajeroEnPregunta(v, qOpts, key);
            if (!det) return;
            const esNuc = nucleoAsigSet.has(v.nombre);
            if (det.apoya) {
              if (esNuc) apoyosNucleo++; else apoyosSat++;
            }
            if (det.veto) vetos++;
            scoreTotal += det.val;
            detallesVotantes.push({
              nombre: v.nombre,
              esNucleo: esNuc,
              ...det,
            });
          });

          return {
            key,
            label,
            apoyosTotal: apoyosNucleo + apoyosSat,
            apoyosNucleo,
            apoyosSat,
            vetos,
            scoreTotal,
            detallesVotantes,
          };
        }).filter(p => p.detallesVotantes.length > 0)
          .sort((a, b) => (b.apoyosNucleo - a.apoyosNucleo) || (b.apoyosTotal - a.apoyosTotal) || (b.scoreTotal - a.scoreTotal));

        if (planesEvaluados.length) {
          planGanadorKey = planesEvaluados[0].key;
          const top = planesEvaluados[0];
          strOpcion = `${top.label} (${top.apoyosTotal}/${nTotal} apoyos · Núcleo ${top.apoyosNucleo}/${asistentesNucleo.length})`;
        }
      }

      // ── 3. COHERENCIA CONDICIONAL: ¿APLICA MOSTRAR CASAS EN ESTA VENTANA/PLAN? ──
      const casasSonCoherentes = qCasas
        ? preguntaEsCoherenteConPlan(qCasas, qOpts, planGanadorKey, esPlanExcursion)
        : false;

      // Función auxiliar para calcular las dos barras de presupuesto sobre cualquier coste por persona `costoPP`
      const evaluarBarrasPresupuesto = (costoPP) => {
        const conPresu = dfAsig.filter(v => v.precioIdealPP != null || v.precioMaxPP != null);
        const aceptanComodo = [];      // costoPP <= precioIdealPP
        const enEsfuerzoHardCap = [];  // precioIdealPP < costoPP <= precioMaxPP
        const noPuedenPermitirse = []; // costoPP > precioMaxPP

        let nucleoComodo = 0, nucleoPermitido = 0, nucleoConPresu = 0;

        conPresu.forEach(v => {
          const ideal = v.precioIdealPP ?? v.precioMaxPP;
          const cap   = v.precioMaxPP   ?? v.precioIdealPP;
          const esNuc = nucleoAsigSet.has(v.nombre);
          if (esNuc) nucleoConPresu++;

          if (costoPP <= ideal) {
            aceptanComodo.push({ nombre: v.nombre, esNucleo: esNuc, ideal, cap });
            if (esNuc) { nucleoComodo++; nucleoPermitido++; }
          } else if (costoPP <= cap) {
            enEsfuerzoHardCap.push({ nombre: v.nombre, esNucleo: esNuc, ideal, cap });
            if (esNuc) nucleoPermitido++;
          } else {
            noPuedenPermitirse.push({ nombre: v.nombre, esNucleo: esNuc, ideal, cap });
          }
        });

        const totalConPresu = conPresu.length;
        const nComodo       = aceptanComodo.length;
        const nPermitido    = aceptanComodo.length + enEsfuerzoHardCap.length;

        return {
          totalConPresu,
          nucleoConPresu,
          nComodo,
          nPermitido,
          nucleoComodo,
          nucleoPermitido,
          pctComodo: totalConPresu ? Math.round((nComodo / totalConPresu) * 100) : 100,
          pctPermitido: totalConPresu ? Math.round((nPermitido / totalConPresu) * 100) : 100,
          aceptanComodo,
          enEsfuerzoHardCap,
          noPuedenPermitirse,
          hayDobleBarra: hayDobleBarraPresupuesto,
        };
      };

      // ── 4. EVALUACIÓN DE CASAS (SOLO SI ES COHERENTE CON EL PLAN Y LA VENTANA) ──
      let casasEvaluadas = [];
      let motivoOcultarCasas = null;

      if (qCasas && !casasSonCoherentes) {
        motivoOcultarCasas = esPlanExcursion
          ? 'Excursión de 1 día (sin pernocta): no aplican alojamientos.'
          : `El plan principal en esta ventana es «${planGanadorKey}», por lo que no aplican opciones vinculadas a alojamiento rural.`;
      } else if (qCasas && casasSonCoherentes) {
        const paretoCasas = (qCasas.tipo === 'probabilidad-opcion') ? paretoVentana[qCasas.id] : null;

        (qCasas.opciones || []).forEach(rawOp => {
          const key   = typeof optVal === 'function' ? optVal(qCasas, rawOp) : (rawOp && rawOp.nombre ? rawOp.nombre : String(rawOp));
          const label = (rawOp && typeof rawOp === 'object' && rawOp.nombre) ? rawOp.nombre : key;
          const pNum  = parsePrecioNumerico(rawOp && typeof rawOp === 'object' ? rawOp.precio : null);
          if (!key || pNum == null || pNum <= 0) return;

          const detallesVotantes = [];
          let apoyosNucleo = 0, apoyosSat = 0, vetosNucleo = 0;

          dfAsig.forEach(v => {
            const det = detalleVotoViajeroEnPregunta(v, qCasas, key);
            if (!det) return;
            const esNuc = nucleoAsigSet.has(v.nombre);
            if (det.apoya) {
              if (esNuc) apoyosNucleo++; else apoyosSat++;
            }
            if (det.veto && esNuc) vetosNucleo++;
            detallesVotantes.push({ nombre: v.nombre, esNucleo: esNuc, ...det });
          });

          const apoyosTotal = apoyosNucleo + apoyosSat;
          const pItem       = paretoCasas ? paretoCasas.opciones.find(o => o.key === key) : null;
          if (apoyosTotal === 0 && (!pItem || pItem.nOpt === 0)) return;

          const pCoop      = pNum / Math.max(1, nTotal);
          const divisorCoal = pItem ? Math.max(1, pItem.E) : Math.max(1, apoyosTotal);
          const pCoal      = pNum / divisorCoal;
          const barras     = evaluarBarrasPresupuesto(pCoop);

          const viableGrupo  = pMaxGrupo == null ? true : (pCoop <= pMaxGrupo);
          const viableNucleo = pMaxNucleo == null ? true : (pCoop <= pMaxNucleo);
          const comodaGrupo  = pIdealGrupo == null ? true : (pCoop <= pIdealGrupo);

          casasEvaluadas.push({
            nombre: label,
            key,
            precio_total: pNum,
            votos: apoyosTotal,
            apoyosNucleo,
            apoyosSat,
            vetosNucleo,
            detallesVotantes,
            E: pItem ? pItem.E : null,
            P25: pItem ? pItem.P25 : null,
            enFronteraPareto: pItem ? (!pItem.dominadaPor && !pItem.inviableGrupoPequeno) : null,
            esPredilecta: !!(paretoCasas && paretoCasas.predilecta && paretoCasas.predilecta.key === key),
            cuadrante: pItem ? pItem.cuadrante : null,
            msgE: pItem ? pItem.msgE : null,
            msgP25: pItem ? pItem.msgP25 : null,
            alertas: pItem ? pItem.alertas : [],
            probPorViajero: pItem ? pItem.probPorViajero : null,
            p_coop: pCoop,
            p_coal: pCoal,
            barrasPresupuesto: barras,
            viable: viableGrupo && (!pItem || !pItem.inviableGrupoPequeno),
            viableNucleo,
            comoda: comodaGrupo,
          });
        });

        casasEvaluadas.sort((a, b) =>
          (Number(b.viable) - Number(a.viable)) ||
          (Number(b.viableNucleo) - Number(a.viableNucleo)) ||
          (b.apoyosNucleo - a.apoyosNucleo) ||
          ((b.E ?? b.votos) - (a.E ?? a.votos)) ||
          (a.p_coop - b.p_coop)
        );
      }

      const incluyeFinde = diasRango.some(isSatSunISO);

      candidatosBrutos.push({
        L,
        fIni,
        fFin,
        diasRango,
        incluyeFinde,
        cruceHorario: cruceHor.solape,
        excursion: esPlanExcursion,
        N: nTotal,
        N_full: asistentesNucleo.length,
        N_convoy: satelitesAsignados.length,
        asistentesNucleo,
        satelitesAsignados,
        excluidos: viajeros.map(v => v.nombre).filter(n => !(n in asig)),
        opcionVotada: strOpcion,
        planGanadorKey,
        planesEvaluados,
        pMaxGrupo,
        pIdealGrupo,
        pMaxNucleo,
        pIdealNucleo,
        autorMinNucleo: bMaxNucleo.autor,
        autorIdealNucleo: bIdealNucleo.autor,
        autorMinGrupo: bMaxGrupo.autor,
        hayDobleBarraPresupuesto,
        casasSonCoherentes,
        motivoOcultarCasas,
        casasEvaluadas,
        paretoVentana,
        flujo: sol.flujo,
        objetivo: sol.objetivo,
        asignacion: asig,
        viajerosAsignados: dfAsig,
      });
    }
  }

  candidatosBrutos.sort((a, b) =>
    (b.N - a.N) || (b.N_full - a.N_full) || (b.L - a.L) || (a.objetivo - b.objetivo)
  );

  const soluciones = [];
  for (const cand of candidatosBrutos) {
    const dominada = soluciones.some(s =>
      s.N >= cand.N &&
      ((cand.fIni >= s.fIni && cand.fFin <= s.fFin) ||
       (Math.abs(diffDaysISO(cand.fIni, s.fIni)) <= 1 && Math.abs(diffDaysISO(cand.fFin, s.fFin)) <= 1))
    );
    if (!dominada) {
      let probCondMap = null;
      const topCasaProb = cand.casasEvaluadas && cand.casasEvaluadas.find(c => c.viable && c.probPorViajero);
      if (topCasaProb) {
        probCondMap = topCasaProb.probPorViajero;
      } else if (cand.paretoVentana) {
        const firstPareto = Object.values(cand.paretoVentana).find(pv => pv && pv.frontera && pv.frontera.length);
        if (firstPareto) probCondMap = firstPareto.frontera[0].probPorViajero;
      }

      cand.fragilidad = simularFragilidad(cand.asignacion, cand.viajerosAsignados, 250, 0.12, 100, 23, probCondMap);
      soluciones.push(cand);
      if (soluciones.length >= 4) break;
    }
  }

  return { soluciones, diagnosticos };
}

// ── 8. TOPOLOGÍA (A^T * A) Y SENSIBILIDAD (Port de reporte.py) ──────────────
function computeTopologyAndSensitivity(model, soluciones) {
  const { viajeros, indiceFechas, matriz } = model;
  const nombres = viajeros.map(v => v.nombre);
  const n = nombres.length;
  const hayLog = viajeros.some(v => v.tieneLogistica);

  const compat = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let shared = 0;
      for (const f of indiceFechas) {
        if (matriz[f][nombres[i]] && matriz[f][nombres[j]]) shared++;
      }
      compat[i][j] = shared;
      compat[j][i] = shared;
    }
  }

  let nomAislado = 'Ninguno', valAislado = Infinity;
  for (let i = 0; i < n; i++) {
    let l1 = 0;
    for (let j = 0; j < n; j++) {
      if (i !== j) l1 += compat[i][j];
    }
    if (l1 < valAislado) { valAislado = l1; nomAislado = nombres[i]; }
  }
  if (valAislado === Infinity) valAislado = 0;

  let diaCritico = 'N/A', minHolgura = Infinity;
  const serieLogistica = indiceFechas.map(f => {
    let oferta = 0, demanda = 0;
    viajeros.forEach(v => {
      if (!matriz[f][v.nombre]) return;
      if (v.transporte === 'llevo-coche') oferta += v.plazasLibres;
      else if (v.transporte !== 'propio') demanda += 1;
    });
    const holgura = oferta - demanda;
    if (demanda > 0 && holgura < minHolgura) {
      minHolgura = holgura;
      diaCritico = fmtShortDate(f);
    }
    return { fecha: f, oferta, demanda, holgura };
  });
  if (minHolgura === Infinity) minHolgura = 0;

  const conPrecio = viajeros.filter(v => v.precioMaxPP != null).sort((a, b) => a.precioMaxPP - b.precioMaxPP);
  const nomEco = conPrecio.length ? conPrecio[0].nombre : 'Ninguno';
  const valEco = conPrecio.length ? conPrecio[0].precioMaxPP : 0;

  const porDisp = [...viajeros].sort((a, b) => a.conjuntoFechas.size - b.conjuntoFechas.size);
  const nomT = porDisp.length ? porDisp[0].nombre : 'Ninguno';
  const valT = porDisp.length ? porDisp[0].conjuntoFechas.size : 0;

  const acumIndis = {};
  let nSolsConFrag = 0;
  soluciones.forEach(s => {
    if (!s.fragilidad) return;
    nSolsConFrag++;
    Object.entries(s.fragilidad.impactoCadena).forEach(([p, v]) => {
      acumIndis[p] = (acumIndis[p] || 0) + v;
    });
    Object.entries(s.fragilidad.impactoIndividual).forEach(([p, v]) => {
      if (v === 1.0) acumIndis[p] = (acumIndis[p] || 0) + 0.3;
    });
  });

  const rankingIndispensables = Object.entries(acumIndis)
    .map(([nombre, sc]) => ({ nombre, score: Math.round((sc / Math.max(1, nSolsConFrag)) * 1000) / 10 }))
    .sort((a, b) => b.score - a.score);

  return {
    nombres,
    compat,
    serieLogistica,
    sensibilidad: { diaCritico, minHolgura, nomAislado, valAislado, nomEco, valEco, nomT, valT, logistica: hayLog },
    rankingIndispensables,
  };
}
root.EngineCore = {
  configure, buildModelData, ejecutarMotorFactibilidad, computeTopologyAndSensitivity,
  evaluarCatalogoProbabilidad, simularFragilidad, construirFlujoTransporte,
  resolverVentana, generarTrayectoriasOptimas,
};
})(typeof window !== 'undefined' ? window : globalThis);
