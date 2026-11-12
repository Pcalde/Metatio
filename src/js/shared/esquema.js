// ── SHARED / ESQUEMA ────────────────────────────────────────────────────────
// Helpers PUROS sobre el esquema y las respuestas (opciones, franjas, radio
// condicional, extracción de respuestas). Sin DOM ni estado: los consumen
// engine/ y ui/. Cargar tras shared/format.js y antes de engine/optimizador.js.

const FRANJAS_HORARIAS = [
  { id: 'manana', label: 'Mañana', start: 10.0, end: 14.0 },
  { id: 'comida', label: 'Comida', start: 14.0, end: 17.0 },
  { id: 'tarde',  label: 'Tarde',  start: 17.0, end: 20.5 },
  { id: 'cena',   label: 'Cena',   start: 20.5, end: 24.0 },
  { id: 'noche',  label: 'Noche',  start: 24.0, end: 26.5 },
];

/**
 * Normaliza cualquier representación de opción (string plano, string "clave|etiqueta"
 * o objeto enriquecido {nombre, precio, url, foto, geo}) a un objeto canónico.
 */
function normalizeOption(q, rawOp) {
  const isRad  = q && q.tipo === 'radio';
  const isObj  = rawOp !== null && typeof rawOp === 'object';
  const rawStr = isObj ? String(rawOp.nombre || '') : String(rawOp ?? '');
  const hasPipe = isRad && rawStr.includes('|');

  const key   = hasPipe ? rawStr.split('|')[0] : rawStr;
  const label = hasPipe ? rawStr.split('|').slice(1).join('|') : rawStr;

  return {
    key,
    label,
    hasPipe,
    precio: isObj && rawOp.precio ? String(rawOp.precio) : '',
    url:    isObj && rawOp.url    ? String(rawOp.url)    : '',
    foto:   isObj && rawOp.foto   ? String(rawOp.foto)   : '',
    geo:    isObj && rawOp.geo    ? rawOp.geo            : null,
    raw:    rawOp,
  };
}

function optVal(q, op) {
  return normalizeOption(q, op).key;
}

function getRadioStepperConfig(q) {
  if (q.config && q.config.conditionalStepper) return q.config.conditionalStepper;
  return null;
}

function getFranjas(q) {
  const f = q && q.config && Array.isArray(q.config.franjas) && q.config.franjas.length ? q.config.franjas : null;
  return f || FRANJAS_HORARIAS;
}

function dispToMap(list) {
  const m = new Map();
  (list || []).forEach(d => {
    const a = d.desde || d.fecha, b = d.hasta || d.fecha || a;
    if (!a || !Array.isArray(d.franjas) || !d.franjas.length || b < a) return;
    const cur = new Date(a + 'T00:00:00Z'), end = new Date(b + 'T00:00:00Z');
    for (let g = 0; cur <= end && g < 366; g++, cur.setUTCDate(cur.getUTCDate() + 1)) {
      const iso = cur.toISOString().slice(0, 10);
      const s = m.get(iso) || new Set();
      d.franjas.forEach(f => s.add(f));
      m.set(iso, s);
    }
  });
  return m;
}

// Garantiza: un valor por opción, a lo sumo un +3 y un −1. Convierte respuestas antiguas de checkbox (array) en +1.
function normPond(v) {
  if (Array.isArray(v)) { const o = {}; v.forEach(k => { o[k] = 1; }); return o; }
  const out = {}; let fav = false, veto = false;
  Object.entries(v || {}).forEach(([k, s]) => {
    s = Number(s);
    if (![-1, 1, 3].includes(s)) return;
    if (s === 3  && fav)  return; if (s === 3)  fav = true;
    if (s === -1 && veto) return; if (s === -1) veto = true;
    out[k] = s;
  });
  return out;
}

function _extractRaw(ansObj, q) {
  if (!ansObj) return null;
  if (ansObj.values && q.id in ansObj.values) {
    return ansObj.values[q.id];
  }
  switch (q.id) {
    case 'opciones-destino': return ansObj.opciones ?? null;
    case 'casas':            return ansObj.casas ?? null;
    case 'precio':           return ansObj.precioMaxPP ?? null;
    case 'transporte':       return ansObj.transporte ?? null;
    case 'disponibilidad':
      if (!ansObj.disponibilidad && !ansObj.rangosFechas && !ansObj.diasMax) return null;
      return {
        diasMax: ansObj.diasMax ?? 5,
        soloFinde: !!(ansObj.disponibilidad && ansObj.disponibilidad.soloFinde),
        meDaIgual: !!(ansObj.disponibilidad && ansObj.disponibilidad.meDaIgual),
        preferirPuente: !!(ansObj.disponibilidad && ansObj.disponibilidad.preferirPuente),
        rangos: ansObj.rangosFechas || [],
      };
    default:
      return (ansObj.extras && q.id in ansObj.extras) ? ansObj.extras[q.id] : null;
  }
}
function extractAnswer(ansObj, q) {
  const v = _extractRaw(ansObj, q);
  return q.tipo === 'voto-ponderado' ? normPond(v) : v;
}

(function (root) {
  root.Esquema = { FRANJAS_HORARIAS, normalizeOption, optVal, getRadioStepperConfig,
                   getFranjas, dispToMap, normPond, extractAnswer };
})(typeof window !== 'undefined' ? window : globalThis);
