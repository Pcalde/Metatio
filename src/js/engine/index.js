// ══════════════════════════════════════════════════════════════════════════
//  FAÇADE DEL MOTOR — src/js/engine/index.js   (FASE 2: ENLAZADO)
//
//  ÚNICO archivo de engine/ que lee estado global (state.js, types.js,
//  config.js). Cada llamada construye un `ctx` plano y se lo inyecta a
//  EngineCore (optimizador.js, encapsulado en IIFE: sus `schema`,
//  `respuestas`, `mcUseEmpiricalProb`… son variables privadas del motor).
//
//  Orden de carga: config → shared/format → … → engine/probabilidades →
//  engine/optimizador → engine/index → ui/consensusView.
// ══════════════════════════════════════════════════════════════════════════
(function (root) {
  const Core = root.EngineCore, Prob = root.EngineProb;
  const overrides = {};

  // Lectura única del mundo exterior → objeto plano.
  function snapshot() {
    return {
      schema, respuestas, respondentes, ausencias,
      lastHorariosRange: (typeof lastHorariosRange !== 'undefined') ? lastHorariosRange : null,
      weightByProb: overrides.weightByProb ?? weightByProb,
      mcEmpirico:   overrides.mcEmpirico   ?? mcUseEmpiricalProb,
      params: Object.assign({}, ENGINE_PARAMS,
        overrides.umbralHoraSolape != null ? { UMBRAL_HORA_SOLAPE: overrides.umbralHoraSolape } : {}),
    };
  }
  const withCtx = fn => { Core.configure(snapshot()); return fn(); };

  const Engine = {
    configure(o = {}) { Object.assign(overrides, o); },

    run() {
      return withCtx(() => {
        const model = Core.buildModelData();
        const { soluciones, diagnosticos } = Core.ejecutarMotorFactibilidad(model);
        const topo = Core.computeTopologyAndSensitivity(model, soluciones);
        return { model, soluciones, diagnosticos, topo, probabilidades: model.probGlobal || {} };
      });
    },

    evaluarProbabilidad(qOrId, filtroNombres = null) {
      return withCtx(() => {
        const q = typeof qOrId === 'object' ? qOrId : (schema || []).find(x => x.id === qOrId);
        if (!q) return null;
        const model = Core.buildModelData();
        const sub = Array.isArray(filtroNombres)
          ? model.viajeros.filter(v => filtroNombres.includes(v.nombre)) : model.viajeros;
        return Core.evaluarCatalogoProbabilidad(q, sub);
      });
    },

    recomputeForQ(qid) {
      const q = (schema || []).find(x => x.id === qid);
      if (q && q.tipo === 'probabilidad-opcion') {
        if (typeof root.refreshProbabilidadCards === 'function') root.refreshProbabilidadCards();
        return this.evaluarProbabilidad(q);
      }
      if (q && q.tipo === 'radio' && typeof root.refreshTransportCards === 'function') root.refreshTransportCards();
      return this.run();
    },
  };
  root.Engine = Engine;

  // ── Nombres globales heredados (los usan ui/, mapa.js, secciones.js) ─────
  root.buildModelData              = () => withCtx(() => Core.buildModelData());
  root.ejecutarMotorFactibilidad   = m => withCtx(() => Core.ejecutarMotorFactibilidad(m));
  root.computeTopologyAndSensitivity = (m, s) => Core.computeTopologyAndSensitivity(m, s);
  root.evaluarCatalogoProbabilidad = (q, v) => withCtx(() => Core.evaluarCatalogoProbabilidad(q, v));
  root.getEffectiveProb = n => Prob.efectiva(n, respondentes, ausencias);
  root.userWeight       = n => Prob.peso(n, respondentes, ausencias, weightByProb);
})(typeof window !== 'undefined' ? window : globalThis);