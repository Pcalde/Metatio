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
// ══════════════════════════════════════════════════════════════════════════

var UMBRAL_HORA_SOLAPE = 1.5;   // θ (R7): horas mínimas de solape horario

function createSeededRNG(seed = 22) {
  let a = seed >>> 0;
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmtShortDate(iso) {
  if (!iso) return '';
  const [, m, d] = String(iso).split('-');
  return `${d}/${m}`;
}

function diffDaysISO(isoA, isoB) {
  const tA = Date.UTC(+isoA.slice(0, 4), +isoA.slice(5, 7) - 1, +isoA.slice(8, 10));
  const tB = Date.UTC(+isoB.slice(0, 4), +isoB.slice(5, 7) - 1, +isoB.slice(8, 10));
  return Math.round((tB - tA) / 86400000);
}

function isWeekendISO(iso) {
  const d = new Date(iso + 'T00:00:00Z').getUTCDay();
  return d === 5 || d === 6; // Viernes o Sábado (weekday 5, 6 en Python equivalen a Sáb/Dom; aquí Vie/Sáb/Dom)
}

function isSatSunISO(iso) {
  const d = new Date(iso + 'T00:00:00Z').getUTCDay();
  return d === 0 || d === 6; // Sábado o Domingo (exacto a d.weekday() in (5,6) de Python)
}

function parsePrecioNumerico(raw) {
  if (raw == null) return null;
  const m = String(raw).match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// ── 2b. CRUCE DE HORARIOS (capa B del modelo de dos capas) ──────────────────
// Solape horario mínimo exigido entre miembros del núcleo, en horas.
var UMBRAL_HORA_SOLAPE = 1.5;

// Normaliza la duración del plan: enteros [1..12] se interpretan como nº de
// franjas consecutivas; reales > 12 se interpretan como horas.
function duracionPlanHoras(qHor) {
  const raw = qHor && qHor.config ? Number(qHor.config.duracionHoras) : NaN;
  if (!isFinite(raw) || raw <= 0) return 3;
  if (raw <= 12) {
    const f = getFranjas(qHor);
    return Math.max(1, Math.round(raw)) * (f[0].end - f[0].start);
  }
  return raw;
}

// Conjunto de intervalos horarios [ini, fin) en los que el viajero está libre
// un día dado: union de sus franjas disponibles expandidas por la duración
// ideal del plan (deslizando la ventana hacia atrás para respetar la longitud).
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

// Intersección de listas de intervalos; devuelve [] si el cruce es vacío.
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

// Cruce de horarios entre dos viajeros para una ventana de días dada:
// mayor solape efectivo (horas) y franja resultante. null si no hay cruce.
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
  // Formato legible: "26/12 (18:00) → 27/12 (05:00)" (la fecha se repite solo si cambia de día)
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

function addDaysISO(iso, n) {
  const dt = new Date(iso + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// ── 2. NORMALIZACIÓN Y MATRIZ DE DISPONIBILIDAD (Port de datos.py) ──────────
function buildModelData() {
  const qDisp  = schema.find(q => q.tipo === 'disponibilidad');
  const qTrans = schema.find(q => getRadioStepperConfig(q));
  const qPrec  = schema.find(q => q.tipo === 'slider');
  const qCasas = schema.find(q => q.tipo === 'casas');
  const qOpts  = schema.find(q => q.tipo === 'checkbox' || q.tipo === 'voto-ponderado');
  const qHor = schema.find(q => q.tipo === 'horarios');

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
      const pResp = (respondentes.find(x => x.nombre.toLowerCase() === r.nombre.toLowerCase()) || {}).prob_asistencia;
      const p = (pAns != null ? pAns : (pResp != null ? pResp : 80)) / 100;
      if (p <= 0.5 || !fechasGlobal.size) return;   // "a nada": fuera del modelo
      forzarFechas = new Set(fechasGlobal);          // "a todo"
    }

    // ── CRUCE DE FUENTES: fechas de disponibilidad + franjas de horarios ──
    // Antes se usaban las fechas SOLO si existían; si alguien rellenaba horarios
    // pero no fechas, sus días quedaban fuera del modelo (y viceversa). Ahora se
    // unen ambas fuentes y se intersectan con el rango de fechas cuando ambos lo
    // rellenan y se solapan (intersección no vacía); si no se solapan, la unión.
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
      if (inter.size) conjuntoFechas = inter; // ambas fuentes rellenas y compatibles → cruce estricto
    }

    // Filtro "solo fines de semana" aplicado a la unión/cruce resultante
    if (soloFinde && conjuntoFechas.size) {
      conjuntoFechas = new Set([...conjuntoFechas].filter(isWeekendISO));
    }
    if (conjuntoFechas.size === 0) {
      // Fallback: sin fechas en ninguna de las dos fuentes, la última franja horaria
      // propia registrada en esta sesión da un día candidato (quedadas de un día).
      const fb = lastHorariosRange && (lastHorariosRange.desde || lastHorariosRange.fecha);
      if (fb) { conjuntoFechas.add(fb); allDatesSet.add(fb); }
      else return; // Descarta participantes sin fechas válidas (como datos.py)
    }

    // Capa B del modelo: mapa fecha → ids de franjas horarias declaradas.
    // Quien no rellena horarios queda con null (restricción laxa: compatible
    // con cualquiera), pero quien sí los rellenas exige cruce real (ver motor).
    const horFranjasPorDia = hor && Array.isArray(hor.disponibilidades) ? {} : null;
    if (horFranjasPorDia) {
      dispToMap(hor.disponibilidades).forEach((setIds, f) => {
        if (conjuntoFechas.has(f)) horFranjasPorDia[f] = [...setIds];
      });
    }

    conjuntoFechas.forEach(f => allDatesSet.add(f));

    const estadoTrans = trans ? (typeof trans === 'object' ? trans.estado : String(trans)) : '';
    const cs = qTrans ? getRadioStepperConfig(qTrans) : null;
    const keyPlazas = (cs && cs.key) ? cs.key : 'plazasLibres';
    const plazasLibres = (trans && typeof trans === 'object' && trans[keyPlazas] != null)
      ? Math.max(0, parseInt(trans[keyPlazas], 10) || 0)
      : 0;

    // Parseo de casas votadas con precio numérico (como parsear_casas_estricto en datos.py)
    const casasParsed = [];
    (Array.isArray(casasRaw) ? casasRaw : []).forEach(c => {
      const nombre = typeof c === 'string' ? c : c.nombre;
      let precioStr = (typeof c === 'object' && c.precio) ? c.precio : null;
      if (!precioStr && qCasas) {
        const schemaCasa = (qCasas.opciones || []).find(o => o.nombre === nombre);
        if (schemaCasa) precioStr = schemaCasa.precio;
      }
      const pNum = parsePrecioNumerico(precioStr);
      if (nombre && pNum != null && pNum > 0) {
        casasParsed.push({ nombre, precio_num: pNum });
      }
    });

    // Opciones de plan votadas
    let opcionesList = [];
    if (Array.isArray(optsRaw)) opcionesList = optsRaw;
    else if (optsRaw && typeof optsRaw === 'object') {
      opcionesList = Object.entries(optsRaw).filter(([, pts]) => Number(pts) > 0).map(([k]) => k);
    }

    viajeros.push({
      nombre: r.nombre,
      diasMax,
      precioMaxPP: (prec != null && !isNaN(prec) && Number(prec) >= 0) ? Number(prec) : null,
      transporte: String(estadoTrans || '').trim().toLowerCase(),
      plazasLibres,
      soloFinde,
      conjuntoFechas,
      casasParsed,
      opcionesList,
      irYVenir,
      meDaIgual,
      horFranjasPorDia,
      preferirPuente: prefPuente,
      probEfectiva: getEffectiveProb(r.nombre),
      tieneLogistica: !!String(estadoTrans || '').trim(),
    });
  });

    if (!viajeros.length || !allDatesSet.size) {
    return { viajeros: [], indiceFechas: [], matriz: {}, lMaxEval: 0, logistica: false, nLog: 0 };
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

  // Matriz binaria A[fecha][nombre] ∈ {0, 1}
  const matriz = {};
  indiceFechas.forEach(f => {
    matriz[f] = {};
    viajeros.forEach(v => {
      matriz[f][v.nombre] = v.conjuntoFechas.has(f) ? 1 : 0;
    });
  });

  // Dentro de buildModelData() en js/reformulario.js, reemplaza el final por:
  const hayPlanDia = viajeros.some(v => v.diasMax === 1 || v.irYVenir || v.conjuntoFechas.size === 1);
  const lMinEval = hayPlanDia ? 1 : 2;
  const lMaxEval = Math.min(12, Math.max(lMinEval, ...viajeros.map(v => v.diasMax)));
  const nLog = viajeros.filter(v => v.tieneLogistica).length;
  return { viajeros, indiceFechas, matriz, lMinEval, lMaxEval, logistica: nLog > 0, nLog };
}

// ── 3. GENERACIÓN DE TRAYECTORIAS ÓPTIMAS (Port de trayectorias.py) ─────────
function generarTrayectoriasOptimas(conjuntoFechas, dMax, diasRango) {
  const limite = parseInt(dMax, 10);
  if (!limite || limite < 1) return [];
  const diasOrdenados = [...conjuntoFechas].sort();
  if (!diasOrdenados.length) return [];

  // Particionar en bloques consecutivos sin huecos
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

// ── 4. FLUJO DE TRANSPORTE Y APARCAMIENTO (Port de transporte.py) ───────────
function construirFlujoTransporte(viajerosGrupo, dictAsignacion) {
  const idasCoches = {}, vueltasCoches = {};
  const idasPax = {}, vueltasPax = {};
  const conductoresObj = [];
  const fechasActivas = new Set();

  const mapViajeros = new Map(viajerosGrupo.map(v => [v.nombre, v]));
  // Nadie ha indicado transporte (o la pregunta no existe): la logística no condiciona la factibilidad
  if (!viajerosGrupo.some(v => v.tieneLogistica)) {
    return { viable: true, flujo: { idas: [], vueltas: [], rango_activo: null, sinLogistica: true } };
  }

  for (const [nombre, traj] of Object.entries(dictAsignacion)) {
    const row = mapViajeros.get(nombre);
    if (!row || !traj || !traj.length) continue;
    const dias = [...traj].sort();
    dias.forEach(d => fechasActivas.add(d));
    const tIn = dias[0], tOut = dias[dias.length - 1];
    const estado = row.transporte;
    const plazas = row.plazasLibres;

    // 'propio' o sin dato de transporte: no entra en el reparto de coches
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

  const flujo = { idas: [], vueltas: [], rango_activo: null };
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
        estadoCoches.sort((a, b) => b.plazas - a.plazas);
        const opt = estadoCoches[0];
        if (opt.plazas <= 0) {
          return { viable: false, flujo: { error: `Faltan plazas el ${fmtShortDate(dia)} (${pasajeros.length} pax sin asignar)` } };
        }
        opt.asignados.push(pasajeros.shift());
        opt.plazas -= 1;
      }

      for (const c of estadoCoches) {
        flujo[clave].push({ fecha: dia, conductor: c.nombre, pasajeros: c.asignados });
      }
    }
  }

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

  // Pesos por día (100 en ventana núcleo, 10 si >= mitad disponible, -50 resto)
  const mitad = viajerosCandidatos.length / 2;
  const pesosDias = {};
  indiceFechas.forEach(f => {
    if (rangoSet.has(f)) {
      pesosDias[f] = 100;
    } else {
      const disp = viajerosCandidatos.reduce((acc, v) => acc + (matriz[f]?.[v.nombre] || 0), 0);
      pesosDias[f] = disp >= mitad ? 10 : -50;
    }
  });

  const scoreTraj = traj => traj.reduce((s, d) => s + (pesosDias[d] ?? -50), 0);

  const baseAsignacion = {};
  let baseScore = 0;
  nombresNucleo.forEach(n => {
    baseAsignacion[n] = diasRango;
    baseScore += scoreTraj(diasRango);
  });

  // Espacio de estados para satélites (limitado a las 6 mejores trayectorias + opción de no asistir)
  const satelites = viajerosCandidatos.filter(v => !nucleoSet.has(v.nombre));
  const opcionesSat = satelites.map(sat => {
    const trajs = generarTrayectoriasOptimas(sat.conjuntoFechas, sat.diasMax, diasRango)
      .slice(0, 6)
      .map(t => ({ traj: t, score: scoreTraj(t) }))
      .filter(x => x.score > 0);
    return { nombre: sat.nombre, opciones: [...trajs, null] }; // null = no asignado
  });

  let bestSol = null;
  let bestScore = -Infinity;
  let nodesVisited = 0;
  const MAX_NODES = 1200;

  // Sufijo máximo posible para poda por cota superior (Branch & Bound)
  const maxRem = new Array(opcionesSat.length + 1).fill(0);
  for (let i = opcionesSat.length - 1; i >= 0; i--) {
    const bestOpt = opcionesSat[i].opciones.reduce((m, o) => Math.max(m, o ? o.score : 0), 0);
    maxRem[i] = maxRem[i + 1] + bestOpt;
  }

  function dfs(idx, curScore, curAsignacion) {
    if (nodesVisited > MAX_NODES) return;
    if (curScore + maxRem[idx] <= bestScore) return; // Poda por cota superior

    if (idx === opcionesSat.length) {
      nodesVisited++;
      const res = construirFlujoTransporte(viajerosCandidatos, curAsignacion);
      if (res.viable) {
        bestScore = curScore;
        bestSol = {
          asignacion: Object.assign({}, curAsignacion),
          flujo: res.flujo,
          objetivo: -curScore,
        };
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

// ── 6. SIMULACIÓN MONTE CARLO DE RESILIENCIA (Port de resiliencia.py) ───────
function simularFragilidad(dictAsignacion, viajerosAsignados, nSim = 250, pGlobal = 0.12, nCadena = 100, seed = 23) {
  const personas = Object.keys(dictAsignacion);
  if (!personas.length) return null;

  const rng = createSeededRNG(seed);
  const probFalta = {};
  viajerosAsignados.forEach(v => {
    probFalta[v.nombre] = mcUseEmpiricalProb
      ? Math.max(0.02, Math.min(0.95, 1 - v.probEfectiva))
      : pGlobal;
  });

  // 1. Impacto individual determinista (colapso inmediato si falta esa persona)
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
    nSim,
    pGlobal,
  };
}

// ── 7. BÚSQUEDA GLOBAL DE SOLUCIONES FACTIBLES (Port de buscar_resultados) ──
function ejecutarMotorFactibilidad(model) {
  const { viajeros, indiceFechas, matriz, lMaxEval } = model;
  if (!viajeros.length || indiceFechas.length < 2) return { soluciones: [], diagnosticos: [] };

  const qHor = schema.find(q => q.tipo === 'horarios');
  const durH = qHor ? duracionPlanHoras(qHor) : null;
  const franjas = qHor ? getFranjas(qHor) : null;

  // Cruce de la capa horaria B entre todos los miembros del núcleo que
  // declararon horarios: si dos incompatibles coinciden en la ventana,
  // el núcleo se descarta (resuelve el caso "fechas sí/horarios no" y viceversa).
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

  const lMin = model.lMinEval || 1; // Permite evaluar excursiones de 1 día (L = 1)

  // Núcleo con reglas de la capa A: pernocta exige L ≥ 2 y diaMax suficiente;
  // "ir y venir" solo participa en excursiones (L = 1) salvo "me da igual".
  function nucleoPernocta(L, diasRango) {
    return viajeros
      .filter(v => !(v.irYVenir && !v.meDaIgual && L > 1) &&
                   v.diasMax >= L && diasRango.every(d => matriz[d][v.nombre] === 1))
      .map(v => v.nombre);
  }

  // Relajación para L = 1: si nadie forma núcleo de fin de semana, se aceptan
  // núcleos de un día que incluyan excursionistas (quien vota "ir y venir").
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

      const presupuestos = dfAsig.map(v => v.precioMaxPP).filter(p => p != null);
      const pMaxGrupo = presupuestos.length ? Math.min(...presupuestos) : null;

      // Moda de opción de destino en el subgrupo asignado
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

      // Evaluación de casas (Precio Cooperativo vs Precio Coalición)
      const mapCasas = new Map();
      dfAsig.forEach(v => {
        (v.casasParsed || []).forEach(c => {
          const k = `${c.nombre}||${c.precio_num}`;
          const prev = mapCasas.get(k) || { nombre: c.nombre, precio_total: c.precio_num, votos: 0 };
          prev.votos += 1;
          mapCasas.set(k, prev);
        });
      });

      const casasEvaluadas = [...mapCasas.values()].map(c => {
        const pCoop = c.precio_total / Math.max(1, nTotal);
        const pCoal = c.precio_total / Math.max(1, c.votos);
        const viable = pMaxGrupo == null ? true : (pCoop <= pMaxGrupo);
        return { ...c, p_coop: pCoop, p_coal: pCoal, viable };
      }).sort((a, b) => (Number(b.viable) - Number(a.viable)) || (b.votos - a.votos) || (a.p_coop - b.p_coop));

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
        casasEvaluadas,
        flujo: sol.flujo,
        objetivo: sol.objetivo,
        asignacion: asig,
        viajerosAsignados: dfAsig,
      });
    }
  }

  // Ordenar priorizando mayor asistencia total N, mayor núcleo N_full, mayor duración L y mejor objetivo
  candidatosBrutos.sort((a, b) =>
    (b.N - a.N) || (b.N_full - a.N_full) || (b.L - a.L) || (a.objetivo - b.objetivo)
  );

  // Filtrar soluciones redundantes (subventanas dominadas en el mismo rango con igual o menor gente)
  const soluciones = [];
  for (const cand of candidatosBrutos) {
    const dominada = soluciones.some(s =>
      s.N >= cand.N &&
      ((cand.fIni >= s.fIni && cand.fFin <= s.fFin) ||
       (Math.abs(diffDaysISO(cand.fIni, s.fIni)) <= 1 && Math.abs(diffDaysISO(cand.fFin, s.fFin)) <= 1))
    );
    if (!dominada) {
      cand.fragilidad = simularFragilidad(cand.asignacion, cand.viajerosAsignados);
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
  // Matriz C = A^T * A (días compartidos entre pares de participantes)
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

  // Aislamiento topológico: norma L1 de la fila excluyendo la diagonal
  let nomAislado = 'Ninguno', valAislado = Infinity;
  for (let i = 0; i < n; i++) {
    let l1 = 0;
    for (let j = 0; j < n; j++) {
      if (i !== j) l1 += compat[i][j];
    }
    if (l1 < valAislado) { valAislado = l1; nomAislado = nombres[i]; }
  }
  if (valAislado === Infinity) valAislado = 0;

  // Cuello de botella logístico diario
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

  // Restricción económica activa
  const conPrecio = viajeros.filter(v => v.precioMaxPP != null).sort((a, b) => a.precioMaxPP - b.precioMaxPP);
  const nomEco = conPrecio.length ? conPrecio[0].nombre : 'Ninguno';
  const valEco = conPrecio.length ? conPrecio[0].precioMaxPP : 0;

  // Menor disponibilidad temporal
  const porDisp = [...viajeros].sort((a, b) => a.conjuntoFechas.size - b.conjuntoFechas.size);
  const nomT = porDisp.length ? porDisp[0].nombre : 'Ninguno';
  const valT = porDisp.length ? porDisp[0].conjuntoFechas.size : 0;

  // Índice de Imprescindibilidad agregado entre soluciones óptimas (como render_indispensables en reporte.py)
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
