# Arquitectura propuesta — separación de responsabilidades (vanilla JS)

> Documento vivo de la reestructuración. Fase 0/1 ya aplicada en este branch:
> se han **extraído** `engine/optimizador.js` y `ui/consensusView.js` del
> monolito `reformulario.js`, se han **centralizado los parámetros del motor**
> en `config.js` (`ENGINE_PARAMS`) y se ha **eliminado el duplicado**
> `session.js` (la fuente canónica es `sesion.js`). Los archivos nuevos aún
> **no están enlazados** en `index.html`: la app sigue funcionando igual y la
> conmutación se hace en la Fase 2, cuando los tests de paridad pasen.

## 1. Diagnóstico del estado actual

| Problema | Evidencia |
|---|---|
| Un archivo mezcla matemáticas + DOM | `reformulario.js` (2016 líneas): R1–R8 del PLE *y* `buildOptionsConsensus`, sliders, innerHTML |
| Estado global mutable compartido por guiones bajos | `state.js` usa `var` a propósito (scripts clásicos); cualquier capa lee/escribe `schema`, `respuestas`, `respondentes`… |
| Helpers utilitarios repartidos | `$`, `esc`, `faIcon`, `safeUrl` viven en `state.js`; `div()`, `haversineKm`, `fmtHM` en `types.js` (que no define tipos, sino widgets) |
| Duplicación real | `sesion.js` / `session.js` eran el mismo archivo (resuelto: eliminado `session.js`) |
| Constantes mágicas del solver dispersas | `UMBRAL_HORA_SOLAPE`, pesos 100/10/−50, p=0.12, S=250 dentro de `reformulario.js` (ahora en `ENGINE_PARAMS`) |
| UI sin frontera con los datos | `renderReformulario()` a la vez ejecuta el motor y repinta; un voto dispara recálculo + repaint acoplados |

## 2. Capas objetivo (regla de dependencia: solo hacia abajo)

```
┌────────────────────────────────────────────────────────────┐
│ ui/            Vistas: construyen DOM, escuchan eventos.   │
│                NUNCA calculan factibilidad ni estadística.  │
├────────────────────────────────────────────────────────────┤
│ core/          Orquestación: casos de uso ("votar",        │
│                "entrar a viaje", "refrescar consenso"),     │
│                control de secciones/paginación, polling.    │
├────────────────────────────────────────────────────────────┤
│ engine/        MATEMÁTICA PURA: modelo A, trayectorias,     │
│                flujo de coches, resolver de ventana, Monte  │
│                Carlo, topología. Sin document.*, sin fetch. │
│                ← portable a Web Worker / Node / tests.      │
├────────────────────────────────────────────────────────────┤
│ data/          Persistencia y sincronía: api (Supabase RPC),│
│                state (store), answers/draft, session, auth. │
├────────────────────────────────────────────────────────────┤
│ shared/        Primitivas sin política: dom helpers ($, esc,│
│                div, faIcon), formato (fechas, horas, km),    │
│                geo (haversine), config.                     │
└────────────────────────────────────────────────────────────┘
```

Restricciones que hacen sostenible la separación **sin build tools**:

1. `engine/*` no puede referenciar `document`, `window.$`, `schema`, `user`…
   Solo recibe argumentos y devuelve POJOs serializables (JSON).
2. `shared/format.js` y `shared/dom.js` no dependen de otras capas.
3. Todo lo que hoy son variables globales mutables pasa por **funciones de
   acceso** (`getState()`, `setSchema()`, `subscribe()`), aunque sigan
   respaldadas por `var` en `state.js`. Eso permite migrar después a módulos
   ES o a un store con eventos sin reescribir consumidores.
4. Cada capa expone su API bajo un namespace único (`Engine`, `Data`, `UI`,
   `App`) para que la carga por `<script>` clásico siga funcionando.

## 3. Mapa de migración propuesto (archivo actual → destino)

```
src/js/
├── config.js              → shared/config.js          (+ ENGINE_PARAMS ✔ añadido)
├── state.js               → data/store.js             (solo estado + accesores)
│                            ↳ $, esc, faIcon, safeUrl → shared/dom.js / shared/format.js
├── crypto.js              → data/crypto.js            (primitivas WebCrypto, OK tal cual)
├── api.js                 → data/api.js               (RPC Supabase; ya es fina ✔)
├── sesion.js              → data/session.js           (✔ duplicado session.js eliminado)
├── auth.js                → data/auth.js              (login/logout, modo crear/entrar)
├── perfil.js              → data/tripsStore.js        (localStorage cifrado) + ui/tripsScreen.js
├── polling.js             → core/polling.js           (caso de uso: sincronizar snapshot)
├── answers.js             → data/answers.js           (draft/collect/patch = datos)
│                            ↳ updateSubmitBtnLabel, syncFabClone → ui/submitBar.js
├── questions.js           → ui/questionCard.js        (render de tarjetas)
├── types.js               → ui/widgets.js             (steppers, franjas, casa…)
│                            ↳ haversineKm, fmtKm, parseCoordStr, dispToMap,
│                              mapToDisp, normPond, fmtHM → shared/format.js / shared/geo.js
├── forms.js               → ui/forms.js
├── secciones.js           → core/sections.js          (visibilidad/condiciones = reglas)
│                            ↳ renderRail, renderBottomBar → ui/rail.js
│                            ↳ _condMatch, esVisible, validarMostrarSi → core/rules.js (puro)
├── proscontras.js         → core/prosContras.js       (pcCred, pcAjuste = aritmética ligera)
│                            ↳ buildPCRow, votePC, refreshPC → ui/prosContras.js
├── ausencias.js           → core/ausencias.js + ui/ausencias.js
├── reformulario.js ───────┬→ engine/optimizador.js    (líneas 40–912 ✔ EXTRAÍDO)
│                          ├→ engine/index.js          (envoltorio estado↔motor ✔ creado)
│                          └→ ui/consensusView.js      (líneas 915–fin ✔ EXTRAÍDO)
│                            ↳ getEffectiveProb/userWeight → engine/probabilidades.js
├── debate.js              → ui/debate.js (+ core/debate.js para filtros/orden)
├── mapa.js                → ui/mapa.js                (Leaflet = vista pura)
├── arbol.js               → ui/arbol.js               (ya es IIFE autocontenida ✔ buen patrón)
├── cuenta.js              → ui/cuentaModal.js
└── main.js                → core/app.js               (arranque, switchMode, composición)
```

## 4. Contrato sugerido entre `engine` y `ui`

El motor deja de leer globals y recibe un **Model** plano; devuelve un
**Result** plano. Esto es exactamente lo que ya hace la pareja
`buildModelData() → ejecutarMotorFactibilidad(model)` del código extraído —
solo hay que cortar los últimos hilos globales (`schema`, `getFranjas`,
`respondentes`, `ausencias`, `weightByProb`), que hoy entran por closures:

```js
// data → engine (entrada única, serializable):
Engine.run({
  viajeros: [ { nombre, disponibilidad: ['2026-07-03', …], diasMax, preferencia,
                capacidad, presupuesto, franjas: [{start,end}], probEfectiva } ],
  respuestasPorPregunta: { qid: valor },
  params: ENGINE_PARAMS,          // θ, pesos, S, seed…
});

// engine → ui (salida única, serializable):
{
  model:       { matriz A, indiceFechas, lMaxEval, … },
  soluciones:  [ { fIni, fFin, L, N, N_full, asignacion, fragilidad, cruceHorario } ],
  diagnosticos:[ 'Ventana 03/07–06/07 (4d): horarios incompatibles…' ],
  topo:        { compat, sensibilidad, rankingIndispensables }
}
```

Ventajas concretas:

- **Testable**: `node --test engine/*.test.js` con fixtures JSON exportados
  desde la propia app (botón "exportar modelo" en dev). Paridad garantizada
  contra `analizador_viaje.py` (mismos fixtures para ambos ports).
- **No bloquea la UI**: al ser funciones puras y serializables, el pipeline
  cabe en un `Worker` casi sin cambios (`postMessage(input)` →
  `postMessage(result)`), eliminando el jank del Monte Carlo (S=250×100) en
  dispositivos lentos.
- **Render reactivo simple**: `core/app.js` suscribe `UI.consensus.render`
  al evento `snapshot_changed`; la vista nunca invoca al motor directamente.

## 5. Plan incremental (cada paso es reversible y verificable)

| Fase | Acción | Criterio de aceptación |
|---|---|---|
| **0** ✔ | Higiene: borrar `session.js` duplicado, centralizar constantes en `ENGINE_PARAMS` | App funciona igual sirviendo `python3 -m http.server` |
| **1** ✔ | Extraer `engine/optimizador.js` y `ui/consensusView.js` **sin enlazarlos** (paridad verificada con `diff` funcional y `node --check`) | Los extractos compilan; ningún `<script>` nuevo activo todavía |
| **2** | Sustituir `reformulario.js` en `index.html` por `engine/*` + `ui/consensusView.js`; eliminar las lecturas globales restantes pasándolas por `Engine.configure/run` | Consenso idéntico solución a solución con el mismo dataset; smoke test manual de las 4 vistas |
| **3** | Dividir los demás ficheros mixtos (`proscontras`, `secciones`, `answers`, `perfil`) en núcleo/vista como en §3 | Ningún archivo >400 líneas; grep `document.` vacío en `core/` y `engine/` |
| **4** *(opcional)* | Migrar a `<script type="module">` con `import/export` reales; el orden de carga desaparece como fuente de bugs | Solo cuando `engine` sea puro: los módulos ES rompen el patrón `var`-global actual |

## 6. Qué NO cambiar (deliberadamente)

- **Seguir sin framework ni bundler**: la estructura de carpetas + namespaces
  (`Engine`, `Data`, `UI`, `App`) da las fronteras sin webpack/vite. La fase 4
  usa módulos ES nativos del navegador, también sin build.
- **El contrato con Supabase (`api.js` + RPC)** está bien delimitado ya; no
  merece refactor, solo renombrar de carpeta.
- **`arbol.js`** ya aplica el patrón objetivo (IIFE autocontenida, pintado a
  demanda): usarlo como referencia de estilo para las vistas.
