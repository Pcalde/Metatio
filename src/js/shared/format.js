// ── SHARED / FORMAT ─────────────────────────────────────────────────────────
// Primitivas puras de fechas, horas y precios. Sin DOM, sin estado, sin
// dependencias: las usan engine/, ui/ y types.js. Cargar justo tras config.js.

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

function addDaysISO(iso, n) {
  const dt = new Date(iso + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function isWeekendISO(iso) {            // Vie/Sáb (criterio histórico del motor)
  const d = new Date(iso + 'T00:00:00Z').getUTCDay();
  return d === 5 || d === 6;
}

function isSatSunISO(iso) {             // Sáb/Dom
  const d = new Date(iso + 'T00:00:00Z').getUTCDay();
  return d === 0 || d === 6;
}

function parsePrecioNumerico(raw) {
  if (raw == null) return null;
  const m = String(raw).match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

function parseHHMM(str) {
  if (!str) return null;
  const [h, m] = String(str).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h + m / 60;
}