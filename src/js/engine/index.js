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

  // 1) Inyecta parámetros centralizados en config.js → variables libres del motor.
  window.Engine = {
    configure(overrides = {}) {
      UMBRAL_HORA_SOLAPE = overrides.umbralHoraSolape ?? ENGINE_PARAMS.UMBRAL_HORA_SOLAPE;
      weightByProb       = overrides.weightByProb     ?? weightByProb;
      mcUseEmpiricalProb = overrides.mcEmpirico       ?? mcUseEmpiricalProb;
    },

    // 2) Pipeline completo: estado global → modelo → soluciones → topología.
    run() {
      this.configure();
      const model     = buildModelData();                 // engine/optimizador.js
      const { soluciones, diagnosticos } = ejecutarMotorFactibilidad(model);
      const topo      = computeTopologyAndSensitivity(model, soluciones);
      return { model, soluciones, diagnosticos, topo };
    },

    // 3) Re-cálculo puntual tras cambiar un voto aislado (patchSingleAnswer).
    recomputeForQ(qid) { /* FASE 2: extraer aquí el branch por-pregunta */ }
  };

  // Arranque equivalente al actual: renderReformulario() llamará a Engine.run()
  // en la FASE 2. Mientras reformulario.js siga enlazado, este archivo es inerte.
})();
