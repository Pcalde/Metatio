// ══════════════════════════════════════════════════════════════════════════
//  ENVOLTORIO DEL MOTOR — src/js/engine/index.js  (FASE 2, aún NO enlazado)
//
//  Único punto donde la capa matemática (engine/optimizador.js, pura) toca
//  el estado global de la app (state.js) y la config (config.js). Con este
//  patrón, el optimizador podrá migrar a un ES module o a un Web Worker sin
//  tocar una sola línea de matemáticas.
//
//  Cableado propuesto en index.html (orden):
//    <script src="src/js/config.js"></script>
//    <script src="src/js/state.js"></script>          // globals + $ + esc
//    <script src="src/js/types.js"></script>          // getFranjas, div…
//    <script src="src/js/proscontras.js"></script>    // pcParts (pcIndex lo mueve engine→ui)
//    <script src="src/js/engine/optimizador.js"></script>
//    <script src="src/js/engine/index.js"></script>   // ← este archivo
//    <script src="src/js/ui/consensusView.js"></script>
//  …y se elimina src/js/reformulario.js del HTML.
// ══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  window.Engine = {
    configure(overrides = {}) {
      UMBRAL_HORA_SOLAPE = overrides.umbralHoraSolape ?? ENGINE_PARAMS.UMBRAL_HORA_SOLAPE;
      weightByProb       = overrides.weightByProb     ?? weightByProb;
      mcUseEmpiricalProb = overrides.mcEmpirico       ?? mcUseEmpiricalProb;
    },

    // Pipeline completo: estado global → modelo (incluyendo Pareto global) → soluciones → topología.
    run() {
      this.configure();
      const model     = buildModelData();
      const { soluciones, diagnosticos } = ejecutarMotorFactibilidad(model);
      const topo      = computeTopologyAndSensitivity(model, soluciones);
      return {
        model,
        soluciones,
        diagnosticos,
        topo,
        probabilidades: model.probGlobal || {},
      };
    },

    // Evalúa bajo demanda una pregunta `probabilidad-opcion` para todo el grupo o para un subconjunto de nombres
    evaluarProbabilidad(qOrId, filtroNombres = null) {
      const q = typeof qOrId === 'object' ? qOrId : (schema || []).find(x => x.id === qOrId);
      if (!q) return null;
      const model = buildModelData();
      const subgrupo = Array.isArray(filtroNombres)
        ? model.viajeros.filter(v => filtroNombres.includes(v.nombre))
        : model.viajeros;
      return evaluarCatalogoProbabilidad(q, subgrupo);
    },

    // Re-cálculo puntual tras cambiar un voto aislado
    recomputeForQ(qid) {
      const q = (schema || []).find(x => x.id === qid);
      if (q && q.tipo === 'probabilidad-opcion') {
        if (typeof window.refreshProbabilidadCards === 'function') window.refreshProbabilidadCards();
        return this.evaluarProbabilidad(q);
      }
      if (q && q.tipo === 'radio' && typeof window.refreshTransportCards === 'function') {
        window.refreshTransportCards();
      }
      return this.run();
    }
  };
})();