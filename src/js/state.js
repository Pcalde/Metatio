// ── ESTADO ──────────────────────────────────────────────────────────────────
// `user.pinHash` vive SOLO en memoria (nunca en localStorage): si el hash
// circulara por disco, cualquiera con acceso al navegador podría reenviarlo
// y autenticarse sin conocer el PIN (el hash funciona como contraseña).
// NOTA: se usa `var` a propósito. Cada archivo .js es un <script> clásico
// independiente; con `const/let` estas variables quedarían en el "script
// scope" de ESTE archivo y serían invisibles para los demás (ReferenceError).
// Con `var` se cuelgan en window y son compartidas por toda la app.
var user            = null;  // { nombre, eid, pinHash? }
var encuestaTitulo  = 'Cuestionario de viaje';
var schema          = [];
var proscontras     = [];
var respondentes    = [];
var respuestas      = [];
var ausencias       = [];
var debate          = [];
var asistenciaActiva = true;
var ajustesModeloDisponibles = false;
var serverHasV2     = true;  // Detecta si _snapshot devuelve el campo `respuestas`
var activeMode      = 'survey';
var draftDirty      = false;
var weightByProb    = true;
var mcUseEmpiricalProb = true;  // true = Monte Carlo con ausencias votadas
var lastRaw         = '';
var saveTimer       = null;
var statusTimer     = null;

// ── UTILIDADES ──────────────────────────────────────────────────────────────
var $ = id => document.getElementById(id);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Icono Font Awesome de uso general en toda la app (sustituye a emojis).
const faIcon = (cls, extraStyle = '') =>
  `<i class="fa-solid ${cls}" aria-hidden="true"${extraStyle ? ` style="${extraStyle}"` : ''}></i>`;

function safeUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
  try {
    const x = new URL(u);
    return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : '';
  } catch (e) { return ''; }
}

function hoyLocal() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function showStatus(msg, kind = 'info', ms = 5000) {
  const el = $('gas-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'status-' + kind;
  el.style.display = 'block';
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { el.style.display = 'none'; }, ms);
}

function applyData(data) {
  if (!data) return;
  serverHasV2    = ('respuestas' in data);
  ajustesModeloDisponibles=typeof data.asistencia_activa==='boolean';
  asistenciaActiva=data.asistencia_activa!==false;
  const mtToggle=$('access-attendance-enabled');
  if(mtToggle){mtToggle.checked=asistenciaActiva;mtToggle.disabled=!ajustesModeloDisponibles;}
  encuestaTitulo = data.titulo       || 'Cuestionario de viaje';
  schema         = data.schema       || [];
  proscontras    = data.proscontras  || [];
  respondentes   = data.respondentes || [];
  respuestas     = data.respuestas   || [];
  ausencias      = data.ausencias    || [];
  debate         = data.debate       || [];

  // Garantiza que el usuario actual figure siempre en `respondentes` para poder votarse en ausencias
  if (user && user.nombre) {
    const exists = respondentes.some(r => r.nombre.toLowerCase() === user.nombre.toLowerCase());
    if (!exists) {
      respondentes.push({ nombre: user.nombre, ha_respondido: false, prob_asistencia: 80 });
    }
  }

  const h1Title = $('survey-main-title');
  if (h1Title) h1Title.textContent = encuestaTitulo;
  const titleInput = $('access-trip-title');
  if (titleInput && (titleInput.dataset.eid !== user?.eid || titleInput.value === titleInput.dataset.saved || !titleInput.dataset.saved)) titleInput.value = encuestaTitulo;
  if (titleInput) { titleInput.dataset.eid = user?.eid || ''; titleInput.dataset.saved = encuestaTitulo; }

  const cResp = $('count-resp');
  if (cResp) cResp.textContent = respuestas.length || respondentes.filter(r => r.ha_respondido !== false).length;
  const cDeb = $('count-debate');
  if (cDeb) cDeb.textContent = debate.length + proscontras.length;

  if(typeof refreshDecisiones==='function')void refreshDecisiones();
  if(typeof refreshCensus==='function')void refreshCensus();
  if (typeof renderParticipants === 'function') renderParticipants();
  if (typeof renderCensus === 'function') renderCensus();
  if (typeof refreshQuorumControl === 'function') refreshQuorumControl();

  // Si estamos viendo Consenso o Debate, repintar inmediatamente
  
  if (activeMode === 'consensus'    && typeof renderResultados === 'function')             renderResultados();
  if (activeMode === 'reformulario' && typeof renderReformularioInteractivo === 'function') renderReformularioInteractivo();
  if (activeMode === 'debate'       && typeof renderDebate === 'function')                  renderDebate();
}

