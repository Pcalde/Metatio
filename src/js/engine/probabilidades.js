// ── ENGINE / PROBABILIDADES ─────────────────────────────────────────────────
// Probabilidad efectiva de asistencia (mezcla autoevaluación + sospecha del
// grupo). Función pura: recibe respondentes y ausencias, no lee globals.
(function (root) {
  function efectiva(nombre, respondentes, ausencias) {
    const nLc = String(nombre).toLowerCase();
    const r   = (respondentes || []).find(x => x.nombre.toLowerCase() === nLc);
    const own = (r && r.prob_asistencia != null) ? r.prob_asistencia / 100 : 0.8;

    if (!ausencias || !ausencias.length) return own;
    let menciones = 0;
    ausencias.forEach(a => {
      if ((a.candidatos || []).some(c => String(c).toLowerCase() === nLc)) menciones++;
    });
    const ratioSospecha = menciones / Math.max(1, ausencias.length);
    const probGrupo = Math.max(0.1, 1 - ratioSospecha * 0.75);
    return Math.max(0.05, Math.min(1, 0.7 * own + 0.3 * probGrupo));
  }

  function peso(nombre, respondentes, ausencias, ponderar) {
    return ponderar ? efectiva(nombre, respondentes, ausencias) : 1.0;
  }

  root.EngineProb = { efectiva, peso };
})(typeof window !== 'undefined' ? window : globalThis);