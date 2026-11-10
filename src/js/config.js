// ── PARÁMETROS DEL MOTOR PLE (engine/optimizador.js) ───────────────────────
// Centralizados aquí para que el motor no dependa de valores mágicos sueltos.
// Deben mantenerse sincronizados con analizador_viaje.py (port por lotes).

const ENGINE_PARAMS = {
  UMBRAL_HORA_SOLAPE: 1.5,   // θ (R7): horas mínimas de solape horario en el núcleo
  MC_P_GLOBAL:        0.12,  // p (Monte Carlo) probabilidad global de baja por viajero
  MC_N_SIM:           250,   // S escenarios de resiliencia §7
  MC_N_CADENA:        100,   // escenarios para el impacto en cadena Δ_v
  MC_SEED:            23,    // semilla fija → resultados reproducibles
  MAX_SOLUCIONES:     4,     // nº máximo de soluciones factibles reportadas
  W_NUCLEO:           100,   // peso w_t en quórum
  W_EXPANSION:        10,    // peso w_t adyacentes de expansión
  W_MINORIA:         -50,    // penalización de fragmentación (días en minoría)
};

// ── CONFIGURACIÓN ───────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://tnkviacmerwtevabqctm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ruqVLDiQfHcc5tj9kvllkA_2wAJtdg6';

const POLL_INTERVAL      = 15000; // ms entre sondeos en vista de cuestionario
const POLL_FAST_INTERVAL = 4000;  // ms entre sondeos en Consenso / Debate en vivo
const POLL_MAX_BACKOFF   = 4;     // ante errores: intervalo × 2^n, con n ≤ 4
const SAVE_DEBOUNCE      = 800;   // ms para guardar el borrador local

const LS_USER  = 'viaje_v2_user';
const LS_DRAFT = eid => `viaje_v3_draft_${eid}`;