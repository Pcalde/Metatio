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
//  README y de analizador_viaje.py. Variables libres inyectadas por el
//  envoltorio: UMBRAL_HORA_SOLAPE, weightByProb, mcUseEmpiricalProb,
//  respondentes, ausencias, schema, getFranjas.
//
//  ⚠ FASE 1 DE LA REESTRUCTURACIÓN: este archivo aún NO está enlazado por
//    ningún <script>; reformulario.js sigue siendo la fuente canónica hasta
//    que el envoltorio sustituya al monolito. Ver docs/arquitectura.md.
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

// ── 2c. EVALUADOR PARETO DE PROBABILIDAD POR OPCIÓN (§4, §5, §6 y §7) ──────
function evaluarCatalogoProbabilidad(q, viajerosSubgrupo) {
  if (!q || !Array.isArray(q.opciones) || !q.opciones.length) return null;
  const qid = q.id;

  // Votantes del subgrupo que han respondido a esta pregunta
  const votantesActivos = viajerosSubgrupo.filter(v =>
    v.probRespuestas && v.probRespuestas[qid] && Object.keys(v.probRespuestas[qid]).length > 0
  );
  const nVotantes = votantesActivos.length;
  const eBase = votantesActivos.reduce((acc, v) => acc + clipProbMotor(v.probEfectiva ?? 0.80), 0);

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
      const dict = v.probRespuestas[qid];
      if (dict && key in dict) {
        const p = clipProbMotor(dict[key]);
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

    const eBaseOpt  = nVotantes > 0 ? eBase * (nOpt / nVotantes) : 0;
    const deltaBase = E - eBaseOpt;

    // §5.5 Regla para grupos pequeños (n <= 4): un 0.00 marca la opción como inviable
    const inviableGrupoPequeno = (nOpt > 0 && nOpt <= 4 && nVetos > 0);

    // §5.3 Mensajes operativos en pareja (E[X] y P25[X])
    const diffAbs = Math.abs(deltaBase).toFixed(1);
    let diffPhrase = `igual a lo que se esperaba a priori (${eBaseOpt.toFixed(1)})`;
    if (deltaBase <= -0.05) diffPhrase = `lo cual es ${diffAbs} menos de lo que se esperaba a priori (${eBaseOpt.toFixed(1)})`;
    else if (deltaBase >= 0.05) diffPhrase = `lo cual es ${diffAbs} más de lo que se esperaba a priori (${eBaseOpt.toFixed(1)})`;

    const msgE   = `Se espera que a este viaje asistáis ${E.toFixed(1)} personas, ${diffPhrase}.`;
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

    // §6 Alertas priorizadas (1. Colapso de cola, 2. Caída respecto al plan base)
    const alertas = [];
    if (nOpt > 0 && (P25 === 0 || P25 < 0.15)) {
      const det = nVetos > 0
        ? `${nVetos} ${nVetos === 1 ? 'persona declara' : 'personas declaran'} «Nunca» (0.00)`
        : `${nBajos} ${nBajos === 1 ? 'persona tiene' : 'personas tienen'} probabilidad ≤ 0.20`;
      alertas.push({
        tipo: 'colapso_cola',
        prioridad: 1,
        mensaje: `Colapso de cola (P25 = ${P25.toFixed(2)}): ${det}. Riesgo real de bajas si se elige esta opción.`,
      });
    }
    if (nOpt > 0 && deltaBase < -1.5) {
      alertas.push({
        tipo: 'caida_base',
        prioridad: 2,
        mensaje: `Caída respecto al plan base: se pierden ${Math.abs(deltaBase).toFixed(1)} asistentes esperados respecto a la expectativa a priori (${eBaseOpt.toFixed(1)}).`,
      });
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
      msgE,
      msgP25,
      cuadrante,
      alertas,
      dominadaPor: null,
    };
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

// ── 2. NORMALIZACIÓN Y MATRIZ DE DISPONIBILIDAD (Port de datos.py) ──────────
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
      : 0;
    const prefPasajeros = (trans && typeof trans === 'object' && trans.prefPasajeros) ? trans.prefPasajeros : {};
    const prefCoches    = (trans && typeof trans === 'object' && trans.prefCoches)    ? trans.prefCoches    : {};
    const notaRuta      = (trans && typeof trans === 'object' && trans.notaRuta)      ? String(trans.notaRuta) : '';

    // Soporte de Slider Dual ({ ideal, max, value } o escalar numérico)
    let precioIdealPP = null, precioMaxPP = null;
    if (prec != null && typeof prec === 'object') {
      const idVal = Number(prec.ideal ?? prec.value);
      const mxVal = Number(prec.max ?? prec.ideal ?? prec.value);
      if (isFinite(idVal) && idVal >= 0) precioIdealPP = idVal;
      if (isFinite(mxVal) && mxVal >= 0) precioMaxPP   = mxVal;
    } else if (prec != null && isFinite(Number(prec)) && Number(prec) >= 0) {
      precioIdealPP = Number(prec);
      precioMaxPP   = Number(prec);
    }

    // Respuestas a todas las preguntas de tipo `probabilidad-opcion`
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

    // Parseo de casas (compatible tanto con `casas` checkbox como con `probabilidad-opcion`)
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
          casasParsed.push({ nombre, precio_num: pNum, prob: 0.90 });
        }
      });
    } else if (casasRaw && typeof casasRaw === 'object' && qCasas) {
      Object.entries(casasRaw).forEach(([nombre, rawProb]) => {
        const prob = clipProbMotor(rawProb);
        const schemaCasa = (qCasas.opciones || []).find(o => {
          const k = typeof optVal === 'function' ? optVal(qCasas, o) : (o && o.nombre ? o.nombre : String(o));
          return k === nombre;
        });
        const precioStr = schemaCasa && typeof schemaCasa === 'object' ? schemaCasa.precio : null;
        const pNum = parsePrecioNumerico(precioStr);
        // En probabilidad-opcion guardamos todas las valoradas y marcamos como "votada positivamente" si prob > 0.5
        if (nombre && pNum != null && pNum > 0 && prob > 0.5) {
          casasParsed.push({ nombre, precio_num: pNum, prob });
        }
      });
    }

    // Opciones de plan votadas (> 0.5 unifica voto-ponderado {1,3} y probabilidad-opcion {0.75, 0.90, 0.95})
    let opcionesList = [];
    if (Array.isArray(optsRaw)) {
      opcionesList = optsRaw;
    } else if (optsRaw && typeof optsRaw === 'object') {
      const umbral = (qOpts && qOpts.tipo === 'probabilidad-opcion') ? 0.5 : 0;
      opcionesList = Object.entries(optsRaw).filter(([, pts]) => Number(pts) > umbral).map(([k]) => k);
    }

    viajeros.push({
      nombre: r.nombre,
      diasMax,
      precioMaxPP,
      precioIdealPP,
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

  // Evaluación global de Pareto para todas las preguntas `probabilidad-opcion`
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

  // Heurística de aparcamiento: aparcar coche si la holgura en t_in y t_out >= plazas + 1
  conductoresObj.sort((a, b) => a.plazas - b.plazas);
  for (const coche of conductoresObj) {
    const tIn = coche.t_in, tOut = coche.t_out;
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
      const estadoCoches = activos.map(c => ({ nombre: c.nombre, plazas: c.plazas, asignados: [] }));

      while (pasajeros.length > 0) {
        if (estadoCoches.length === 0) {
          return { viable: false, flujo: { error: `Sin coches el ${fmtShortDate(dia)} (${pasajeros.length} pax sin plaza)` } };
        }
        const conHueco = estadoCoches.filter(c => c.plazas > 0);
        if (conHueco.length === 0) {
          return { viable: false, flujo: { error: `Faltan plazas el ${fmtShortDate(dia)} (${pasajeros.length} pax sin asignar)` } };
        }

        // Selección greedy por máxima afinidad bilateral (prefPasajeros + prefCoches), desempatando por plazas libres
        let bestCar = null, bestPaxIdx = 0, bestScore = -Infinity;
        for (let pIdx = 0; pIdx < pasajeros.length; pIdx++) {
          const paxName = pasajeros[pIdx];
          for (const car of conHueco) {
            const af = afinidadCochePasajero(mapViajeros, car.nombre, paxName);
            const composite = af * 100 + car.plazas;
            if (composite > bestScore) {
              bestScore  = composite;
              bestCar    = car;
              bestPaxIdx = pIdx;
            }
          }
        }

        const chosenPax = pasajeros.splice(bestPaxIdx, 1)[0];
        afinidadTotal += afinidadCochePasajero(mapViajeros, bestCar.nombre, chosenPax);
        bestCar.asignados.push(chosenPax);
        bestCar.plazas -= 1;
      }

      for (const c of estadoCoches) {
        flujo[clave].push({ fecha: dia, conductor: c.nombre, pasajeros: c.asignados });
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

// ── 7. BÚSQUEDA GLOBAL DE SOLUCIONES FACTIBLES (Port de buscar_resultados) ──
function ejecutarMotorFactibilidad(model) {
  const { viajeros, indiceFechas, matriz, lMaxEval } = model;
  if (!viajeros.length || indiceFechas.length < 2) return { soluciones: [], diagnosticos: [] };

  const qHor   = schema.find(q => q.tipo === 'horarios');
  const qCasas = schema.find(q => q.tipo === 'casas') || schema.find(esCatalogoCasasProb);
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
      const satelitesAsignados = dfAsig.map(v => v.nombre).filter(n => !(n in nucleoSet) && !nucleoSet.has(n));
      const nTotal = dfAsig.length;

      // Presupuesto: cota dura (Hard Cap) y cota cómoda (Ideal)
      const presupuestosMax   = dfAsig.map(v => v.precioMaxPP).filter(p => p != null);
      const presupuestosIdeal = dfAsig.map(v => v.precioIdealPP ?? v.precioMaxPP).filter(p => p != null);
      const pMaxGrupo   = presupuestosMax.length   ? Math.min(...presupuestosMax)   : null;
      const pIdealGrupo = presupuestosIdeal.length ? Math.min(...presupuestosIdeal) : null;

      // Evaluación de Pareto condicional al subgrupo asignado a esta ventana (`dfAsig`)
      const paretoVentana = {};
      qProbs.forEach(qp => {
        paretoVentana[qp.id] = evaluarCatalogoProbabilidad(qp, dfAsig);
      });

      // Moda de opción de destino (o frontera de Pareto si la pregunta es `probabilidad-opcion`)
      const freqOpts = {};
      dfAsig.forEach(v => {
        (v.opcionesList || []).forEach(op => { freqOpts[op] = (freqOpts[op] || 0) + 1; });
      });
      let strOpcion = 'Indeterminado';
      const optEntries = Object.entries(freqOpts);
      if (optEntries.length) {
        const maxV = Math.max(...optEntries.map(([, c]) => c));
        const modas = optEntries.filter(([, c]) => c === maxV).map(([k]) => k);
        strOpcion = `${modas.join(' / ')} (${maxV} votos)`;
      }

      // Si hay una pregunta `probabilidad-opcion` de destino/plan, enriquecer `strOpcion` con la frontera de Pareto
      const qProbPlan = qProbs.find(qp => qp !== qCasas) || qProbs[0];
      const analisisPlan = qProbPlan ? paretoVentana[qProbPlan.id] : null;
      if (analisisPlan && analisisPlan.frontera.length) {
        if (analisisPlan.predilecta) {
          const p = analisisPlan.predilecta;
          strOpcion = `★ ${p.label} (E=${p.E.toFixed(1)}, P25=${p.P25.toFixed(2)})`;
        } else {
          strOpcion = analisisPlan.frontera
            .map(o => `${o.label} (E=${o.E.toFixed(1)}, P25=${o.P25.toFixed(2)})`)
            .join(' · ');
        }
      }

      // Evaluación de casas (compatible con `casas` clásico y con `probabilidad-opcion`)
      let casasEvaluadas = [];
      if (qCasas && qCasas.tipo === 'probabilidad-opcion' && paretoVentana[qCasas.id]) {
        const paretoCasas = paretoVentana[qCasas.id];
        casasEvaluadas = paretoCasas.opciones
          .filter(c => c.precio_num != null && c.precio_num > 0 && c.nOpt > 0)
          .map(c => {
            const pCoop    = c.precio_num / Math.max(1, nTotal);
            const pCoopEsp = c.precio_num / Math.max(1, c.E);
            const viable   = (pMaxGrupo == null ? true : (pCoop <= pMaxGrupo)) && !c.inviableGrupoPequeno;
            const comoda   = pIdealGrupo == null ? true : (pCoop <= pIdealGrupo);
            return {
              nombre: c.label,
              precio_total: c.precio_num,
              votos: Math.round(c.E * 10) / 10,
              E: c.E,
              P25: c.P25,
              enFronteraPareto: !c.dominadaPor && !c.inviableGrupoPequeno,
              esPredilecta: !!(paretoCasas.predilecta && paretoCasas.predilecta.key === c.key),
              cuadrante: c.cuadrante,
              msgE: c.msgE,
              msgP25: c.msgP25,
              alertas: c.alertas,
              probPorViajero: c.probPorViajero,
              p_coop: pCoop,
              p_coal: pCoopEsp,
              viable,
              comoda,
            };
          })
          .sort((a, b) =>
            (Number(b.viable) - Number(a.viable)) ||
            (Number(b.enFronteraPareto) - Number(a.enFronteraPareto)) ||
            (b.E - a.E) ||
            (b.P25 - a.P25) ||
            (a.p_coop - b.p_coop)
          );
      } else {
        const mapCasas = new Map();
        dfAsig.forEach(v => {
          (v.casasParsed || []).forEach(c => {
            const k = `${c.nombre}||${c.precio_num}`;
            const prev = mapCasas.get(k) || { nombre: c.nombre, precio_total: c.precio_num, votos: 0 };
            prev.votos += 1;
            mapCasas.set(k, prev);
          });
        });

        casasEvaluadas = [...mapCasas.values()].map(c => {
          const pCoop  = c.precio_total / Math.max(1, nTotal);
          const pCoal  = c.precio_total / Math.max(1, c.votos);
          const viable = pMaxGrupo == null ? true : (pCoop <= pMaxGrupo);
          const comoda = pIdealGrupo == null ? true : (pCoop <= pIdealGrupo);
          return { ...c, p_coop: pCoop, p_coal: pCoal, viable, comoda };
        }).sort((a, b) => (Number(b.viable) - Number(a.viable)) || (b.votos - a.votos) || (a.p_coop - b.p_coop));
      }

      const incluyeFinde = diasRango.some(isSatSunISO);

      candidatosBrutos.push({
        L,
        fIni,
        fFin,
        diasRango,
        incluyeFinde,
        cruceHorario: cruceHor.solape,
        excursion: esExcursion || (L === 1 && viajeros.some(v => v.irYVenir && nucleoSet.has(v.nombre))),
        N: nTotal,
        N_full: asistentesNucleo.length,
        N_convoy: satelitesAsignados.length,
        asistentesNucleo,
        satelitesAsignados,
        excluidos: viajeros.map(v => v.nombre).filter(n => !(n in asig)),
        opcionVotada: strOpcion,
        pMaxGrupo,
        pIdealGrupo,
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
      // Si hay una opción líder en la frontera de Pareto (casa o plan), inyectar sus probabilidades condicionales en Monte Carlo
      let probCondMap = null;
      const topCasaProb = cand.casasEvaluadas && cand.casasEvaluadas.find(c => c.viable && c.probPorViajero);
      if (topCasaProb) {
        probCondMap = topCasaProb.probPorViajero;
      } else if (cand.paretoVentana) {
        const firstPareto = Object.values(cand.paretoVentana).find(pv => pv && pv.frontera && pv.frontera.length);
        if (firstPareto) probCondMap = firstPareto.frontera[0].probPorViajero;
      }

      cand.fragilidad = simularFragilidad(cand.asignacion, cand.viajerosAsignados, par('MC_N_SIM', 250), par('MC_P_GLOBAL', 0.12), par('MC_N_CADENA', 100), par('MC_SEED', 23), probCondMap);
      soluciones.push(cand);
      if (soluciones.length >= par('MAX_SOLUCIONES', 4)) break;
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
