// ══════════════════════════════════════════════════════════════════════════
//  PERFIL LOCAL Y «MIS VIAJES» (js/perfil.js) — v2
//
//  Modelo:
//   · El PIN del perfil es el ÚNICO PIN del usuario. Nunca viaja al servidor.
//   · De PIN + salt se derivan 512 bits con PBKDF2-SHA256 (600k it.):
//       mitad 1 = VERIFICADOR (se guarda en localStorage)
//       mitad 2 = CLAVE AES   (solo en memoria / sessionStorage de la pestaña)
//     (en v1 se guardaba la propia clave: quien leyera localStorage descifraba todo)
//   · Cada viaje usa una credencial ALEATORIA de 32 bytes (64 hex) como «pinHash»
//     ante el servidor. Va cifrada en el monedero con la clave AES. El servidor
//     no cambia: sigue haciendo bcrypt(token) como antes.
//   · Viajes antiguos: se entra una vez con el PIN antiguo (sha256(PIN|eid)),
//     y se rota en el servidor a un token aleatorio (update_profile).
//     Orden: guardar en monedero → rotar → si falla, restaurar monedero.
//
//  Expone: initPerfil, showTripsScreen, hideTripsScreen, hayPerfilLocal,
//  perfilEstaActivo, perfilSetPendingEid, perfilActualizarNombre,
//  salirDelPerfil, volverATrips, getCredViaje, viajesGuardados, tripsErr.
//  Requiere: config, crypto, api, state, sesion, auth (normEid), types (div).
// ══════════════════════════════════════════════════════════════════════════

var LS_PROFILE    = 'viaje_perfil_v2';    // { nombre, salt, iter, ver, viajes:{eid:{alias,nombre,ts}} }
var LS_CRED_VAULT = 'viaje_credvault_v2'; // { eid: "iv.ct", "eid|salt": "…" }
var SS_PK         = 'viaje_pk';           // clave AES, solo mientras viva la pestaña
var PBKDF2_ITER   = 600000;
var PIN_MIN       = 6;

var _perfil     = { activo: false, nombre: '', clave: null };
var _pendingEid = '';

// ── derivación ──────────────────────────────────────────────────────────────
async function _derive(password, saltB64, iter) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: _b64url2ab(saltB64), iterations: iter, hash: 'SHA-256' }, base, 512);
  return { ver: _ab2b64url(bits.slice(0, 32)), key: _ab2b64url(bits.slice(32)) };
}

// ── almacenamiento ──────────────────────────────────────────────────────────
function _loadProfileStore() {
  try {
    const p = JSON.parse(localStorage.getItem(LS_PROFILE) || 'null');
    return (p && p.nombre && p.salt && p.ver) ? p : null;
  } catch (e) { return null; }
}
function _saveProfileStore(p) { try { localStorage.setItem(LS_PROFILE, JSON.stringify(p)); } catch (e) {} }
function _loadVault() {
  try { return JSON.parse(localStorage.getItem(LS_CRED_VAULT) || '{}') || {}; } catch (e) { return {}; }
}
function _saveVault(v) { try { localStorage.setItem(LS_CRED_VAULT, JSON.stringify(v)); } catch (e) {} }

function _fijarClave(nombre, key) {
  _perfil.activo = true; _perfil.nombre = nombre; _perfil.clave = key;
  try { sessionStorage.setItem(SS_PK, key); } catch (e) {}
}

function hayPerfilLocal()   { return !!_loadProfileStore(); }
function perfilEstaActivo() { return !!(_perfil.activo && _perfil.clave); }
function viajesGuardados()  { const p = _loadProfileStore(); return (p && p.viajes) ? p.viajes : {}; }
function perfilSetPendingEid(eid) { _pendingEid = eid || ''; }

function _guardarMeta(eid, meta) {
  const p = _loadProfileStore(); if (!p) return;
  p.viajes = p.viajes || {};
  p.viajes[eid] = Object.assign({}, p.viajes[eid], meta, { ts: Date.now() });
  _saveProfileStore(p);
}
function perfilActualizarNombre(eid, nombre) { _guardarMeta(eid, { nombre }); }

// ── alta de perfil / desbloqueo ─────────────────────────────────────────────
async function crearPerfilLocal(nombre, pin) {
  const salt = _ab2b64url(crypto.getRandomValues(new Uint8Array(16)));
  const d = await _derive(pin, salt, PBKDF2_ITER);
  ['viaje_perfil_v1', 'viaje_credvault_v1'].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  _saveProfileStore({ nombre, salt, iter: PBKDF2_ITER, ver: d.ver, viajes: {} });
  _saveVault({});
  _fijarClave(nombre, d.key);
}

async function unlockPerfil(pin) {
  const p = _loadProfileStore(); if (!p) return false;
  const d = await _derive(pin || '', p.salt, p.iter || PBKDF2_ITER);
  if (d.ver !== p.ver) return false;
  _fijarClave(p.nombre, d.key);
  return true;
}

// ── monedero de credenciales ────────────────────────────────────────────────
async function _guardarCred(eid, token) {
  const vault = _loadVault();
  const prev = { ct: vault[eid], salt: vault[eid + '|salt'] };
  const salt = eid + '|' + Date.now();
  vault[eid] = await aesEncrypt(_perfil.clave, token, salt);
  vault[eid + '|salt'] = salt;
  _saveVault(vault);
  return prev;
}
function _restaurarCred(eid, prev) {
  const vault = _loadVault();
  if (prev.ct) { vault[eid] = prev.ct; vault[eid + '|salt'] = prev.salt; }
  else { delete vault[eid]; delete vault[eid + '|salt']; }
  _saveVault(vault);
}
async function getCredViaje(eid) {
  const vault = _loadVault();
  if (!vault[eid] || !_perfil.clave) return null;
  try {
    const hex = await aesDecrypt(_perfil.clave, vault[eid], vault[eid + '|salt'] || eid);
    return /^[0-9a-f]{64}$/.test(hex) ? hex : null;
  } catch (e) { return null; }
}

// ── operaciones sobre viajes ────────────────────────────────────────────────
// Entra a un viaje ya registrado en el perfil (un clic desde la tarjeta).
async function entrarViaje(eid) {
  const meta   = viajesGuardados()[eid] || {};
  const nombre = meta.nombre || _perfil.nombre;
  const token  = await getCredViaje(eid);
  if (!token) throw new Error('No se pudo descifrar la credencial de este viaje.');
  const datos = await api({ action: 'all', eid, nombre, pinHash: token });
  user = { nombre, pinHash: token, eid };
  await beginSession(nombre, eid, token, { persist: true });
  lastRaw = JSON.stringify(datos);
  applyData(datos);
  if (datos.titulo) _guardarMeta(eid, { alias: datos.titulo });
  hideTripsScreen();
  enterSurvey();
}

// Viaje antiguo: PIN antiguo → verificar SIN crear usuario → rotar a token.
async function agregarViajeAntiguo(eid, nombre, pinAntiguo) {
  eid = normEid(eid);
  const pinHash = await sha256(pinAntiguo + '|' + eid);
  const datos = await api({ action: 'all', eid, nombre, pinHash });   // get_all: no crea usuarios
  const token = randomHex(32);
  const prev  = await _guardarCred(eid, token);
  try {
    await api({ action: 'update_profile', eid, nombre, pinHash, nuevoPinHash: token });
  } catch (e) { _restaurarCred(eid, prev); throw e; }
  const res = await api({ action: 'entrar', eid, nombre, pinHash: token });  // nombre canónico
  _guardarMeta(eid, { alias: datos.titulo || res.titulo || '', nombre: res.nombre });
  return eid;
}

// Viaje nuevo para este usuario (existente en el servidor): credencial aleatoria.
async function unirseAViaje(eid, nombre) {
  eid = normEid(eid);
  const token = randomHex(32);
  const prev  = await _guardarCred(eid, token);
  try {
    const res = await api({ action: 'entrar', eid, nombre, pinHash: token });
    _guardarMeta(eid, { alias: (res.datos && res.datos.titulo) || '', nombre: res.nombre });
  } catch (e) { _restaurarCred(eid, prev); throw e; }
  return eid;
}

async function crearViajeNuevo(eid, titulo, plantilla) {
  const token = randomHex(32);
  const prev  = await _guardarCred(eid, token);
  try {
    await api({ action: 'crear_encuesta', eid, nombre: _perfil.nombre, pinHash: token,
                plantilla: plantilla || 'vacia', titulo });
    _guardarMeta(eid, { alias: titulo, nombre: _perfil.nombre });
  } catch (e) { _restaurarCred(eid, prev); throw e; }
  return eid;
}

// ── UI ──────────────────────────────────────────────────────────────────────
function tripsErr(msg) {
  const el = $('trips-error'); if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function _tripsMsg(e, ctx) {
  const m = String((e && e.message) || e || '');
  if (/PIN incorrecto/i.test(m))
    return ctx === 'join' ? 'Ese nombre ya existe en el viaje con otra credencial. Si ya estabas, usa «Viaje antiguo».'
                          : 'El PIN antiguo no es correcto.';
  if (/Usuario no registrado/i.test(m)) return 'No hay ningún usuario con ese nombre en ese viaje.';
  if (/Encuesta no encontrada|ID de encuesta/i.test(m)) return 'Ese viaje no existe.';
  return m;
}

function _extraerEid(txt) {
  txt = String(txt || '').trim();
  const m = txt.match(/[?&]e=([^&#\s]+)/);
  return normEid(m ? decodeURIComponent(m[1]) : txt);
}

function setTripsPanel(name) {
  document.querySelectorAll('.trips-panel').forEach(p =>
    p.classList.toggle('open', p.dataset.panel === name));
  document.querySelectorAll('.trips-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.panel === name));
}

async function _busy(btn, txt, ctx, fn) {
  const orig = btn.innerHTML;
  btn.disabled = true; btn.textContent = txt; tripsErr('');
  try { await fn(); }
  catch (e) { tripsErr(_tripsMsg(e, ctx)); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
}

function renderTripsList() {
  const host = $('trips-list'); if (!host) return;
  host.innerHTML = '';
  const viajes = viajesGuardados();
  const eids = Object.keys(viajes);
  if (!eids.length) {
    host.innerHTML = '<div class="trips-empty">Aún no tienes viajes. Crea uno, únete con un código o añade uno antiguo.</div>';
    return;
  }
  eids.sort((a, b) => (viajes[b].ts || 0) - (viajes[a].ts || 0));
  eids.forEach(eid => {
    const v = viajes[eid];
    const row = div('trips-item');
    const nom = document.createElement('span');
    nom.className = 'trips-item-nombre';
    nom.innerHTML = `<strong>${esc(v.alias || eid)}</strong>` + (v.alias ? `<em>#${esc(eid)}</em>` : '');
    const tools = div('trips-item-tools');

    const bEntrar = document.createElement('button');
    bEntrar.type = 'button'; bEntrar.className = 'btn-propose trips-btn-entrar';
    bEntrar.innerHTML = 'Entrar <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    bEntrar.addEventListener('click', async () => {
      const orig = bEntrar.innerHTML;
      bEntrar.disabled = true; bEntrar.textContent = 'Entrando…'; tripsErr('');
      try { await entrarViaje(eid); }
      catch (e) {
        bEntrar.disabled = false; bEntrar.innerHTML = orig;
        const m = String(e.message || '');
        if (/no existe|no encontrada|no registrado/i.test(m)) {
          row.classList.add('trips-dead');
          tripsErr(`El viaje «${eid}» ya no existe en el servidor. Puedes quitarlo con la papelera.`);
        } else if (/PIN incorrecto|descifrar/i.test(m)) {
          tripsErr('La credencial guardada ya no vale (¿recuperación?). Quita el viaje y añádelo de nuevo en «Viaje antiguo».');
        } else tripsErr(m);
      }
    });

    const bCopy = document.createElement('button');
    bCopy.type = 'button'; bCopy.className = 'btn-pc';
    bCopy.title = 'Copiar enlace de invitación';
    bCopy.innerHTML = '<i class="fa-solid fa-link" aria-hidden="true"></i>';
    bCopy.addEventListener('click', async () => {
      const url = location.origin + location.pathname + '?e=' + encodeURIComponent(eid);
      let ok = false;
      try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
        try {
          const ta = document.createElement('textarea');
          ta.value = url; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
        } catch (e2) {}
      }
      bCopy.innerHTML = ok ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : esc(url);
      setTimeout(() => { bCopy.innerHTML = '<i class="fa-solid fa-link" aria-hidden="true"></i>'; }, 2000);
    });

    const bDel = document.createElement('button');
    bDel.type = 'button'; bDel.className = 'sec-rail-tool sec-rail-delete';
    bDel.title = 'Quitar de la lista (no borra el viaje del servidor)';
    bDel.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
    bDel.addEventListener('click', () => {
      const p = _loadProfileStore(); if (!p) return;
      delete p.viajes[eid]; _saveProfileStore(p);
      const vault = _loadVault(); delete vault[eid]; delete vault[eid + '|salt']; _saveVault(vault);
      renderTripsList();
    });

    tools.append(bEntrar, bCopy, bDel);
    row.append(nom, tools);
    host.appendChild(row);
  });
}

function showTripsScreen() {
  const scr = $('trips-screen'); if (!scr) return;
  ['login-screen', 'survey-screen'].forEach(id => { const e = $(id); if (e) e.style.display = 'none'; });
  stopPolling(); clearTimeout(saveTimer);
  scr.style.display = 'flex';

  const hay = hayPerfilLocal(), abierto = hay && !!_perfil.clave;
  $('trips-new-card').style.display   = hay ? 'none' : '';
  $('trips-check-card').style.display = (hay && !abierto) ? '' : 'none';
  $('trips-main-card').style.display  = abierto ? '' : 'none';

  if (hay && !abierto) {
    const cn = $('trips-check-nombre'); if (cn) cn.textContent = _perfil.nombre ? '· ' + _perfil.nombre : '';
    setTimeout(() => { const p = $('trips-pass'); if (p) p.focus(); }, 60);
  } else if (!hay) {
    setTimeout(() => { const n = $('tp-new-nombre'); if (n) n.focus(); }, 60);
  }
  if (abierto) {
    $('trips-nombre').textContent = _perfil.nombre || '—';
    ['tp-join-nombre', 'tp-old-nombre'].forEach(id => { const i = $(id); if (i && !i.value) i.value = _perfil.nombre || ''; });
    renderTripsList();
    if (_pendingEid) {
      $('tp-join-eid').value = _pendingEid; $('tp-old-eid').value = _pendingEid;
      setTripsPanel('unir'); _pendingEid = '';
    }
  }
  tripsErr('');
}
function hideTripsScreen() { const s = $('trips-screen'); if (s) s.style.display = 'none'; }

function _limpiarEstadoApp() {
  stopPolling(); clearTimeout(saveTimer);
  clearSession();
  user = null;
  schema = []; proscontras = []; respondentes = []; respuestas = []; ausencias = []; debate = []; lastRaw = '';
  resetAusencias();
  const qc = $('questions-container'); if (qc) qc.innerHTML = '';
  const ac = $('ausencias-card'); if (ac) ac.style.display = 'none';
}

// «Logout suave»: cierra el viaje, conserva el perfil.
function volverATrips() { _limpiarEstadoApp(); showTripsScreen(); }

// Borra perfil, monedero y borradores de este dispositivo.
function salirDelPerfil() {
  const eids = Object.keys(viajesGuardados());
  _limpiarEstadoApp();
  eids.forEach(eid => { try { localStorage.removeItem(LS_DRAFT(eid)); } catch (e) {} });
  [LS_PROFILE, LS_CRED_VAULT, LS_USER].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  try { sessionStorage.removeItem(SS_PK); } catch (e) {}
  _perfil.activo = false; _perfil.nombre = ''; _perfil.clave = null;
  showTripsScreen();
}

function initPerfil() {
  const p = _loadProfileStore();
  if (p) {
    _perfil.activo = true; _perfil.nombre = p.nombre; _perfil.clave = null;
    try { const k = sessionStorage.getItem(SS_PK); if (k) _perfil.clave = k; } catch (e) {}
  }
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
  const enter = (ids, btnId) => ids.forEach(id => on(id, 'keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const b = $(btnId); if (b) b.click(); }
  }));
  const val = id => ($(id) ? $(id).value : '').trim();

  // Crear perfil
  on('btn-tp-create', 'click', e => _busy(e.currentTarget, 'Creando…', '', async () => {
    const nombre = val('tp-new-nombre'), pin = $('tp-new-pin').value, pin2 = $('tp-new-pin2').value;
    if (!nombre) throw new Error('Escribe tu nombre.');
    if (nombre.length > 40) throw new Error('El nombre admite hasta 40 caracteres.');
    if (pin.length < PIN_MIN) throw new Error(`El PIN debe tener al menos ${PIN_MIN} caracteres.`);
    if (pin !== pin2) throw new Error('Los PIN no coinciden.');
    await crearPerfilLocal(nombre, pin);
    $('tp-new-pin').value = ''; $('tp-new-pin2').value = '';
    showTripsScreen();
  }));
  enter(['tp-new-nombre', 'tp-new-pin', 'tp-new-pin2'], 'btn-tp-create');

  // Desbloquear
  on('btn-trips-unlock', 'click', e => _busy(e.currentTarget, 'Comprobando…', '', async () => {
    const pass = $('trips-pass');
    if (!(await unlockPerfil(pass.value))) { pass.select(); throw new Error('PIN incorrecto.'); }
    pass.value = '';
    showTripsScreen();
  }));
  enter(['trips-pass'], 'btn-trips-unlock');

  on('btn-trips-forgot', 'click', () => {
    if (window.confirm('Esto borra el perfil y los accesos guardados SOLO en este dispositivo (los viajes siguen en el servidor). Para recuperarlos necesitarás un PIN temporal del administrador. ¿Continuar?'))
      salirDelPerfil();
  });
  on('btn-trips-logout', 'click', () => {
    if (window.confirm('¿Salir del perfil en este dispositivo? Se borrarán tus accesos guardados aquí.')) salirDelPerfil();
  });

  // Pestañas
  document.querySelectorAll('.trips-tab').forEach(t => t.addEventListener('click', () => {
    setTripsPanel(t.classList.contains('active') ? '' : t.dataset.panel); tripsErr('');
  }));

  // Crear viaje
  on('btn-tp-newtrip', 'click', e => _busy(e.currentTarget, 'Creando…', '', async () => {
    const eid = normEid(val('tp-new-eid')), titulo = val('tp-new-titulo') || 'Cuestionario de viaje';
    if (!/^[a-z0-9-]{3,60}$/.test(eid)) throw new Error('El código debe tener 3–60 caracteres (a-z, 0-9 y guiones).');
    await crearViajeNuevo(eid, titulo, $('tp-new-plantilla').value);
    await entrarViaje(eid);
  }));

  // Unirse (viaje nuevo para mí)
  on('btn-tp-join', 'click', e => _busy(e.currentTarget, 'Uniéndome…', 'join', async () => {
    const eid = _extraerEid(val('tp-join-eid')), nombre = val('tp-join-nombre') || _perfil.nombre;
    if (!eid) throw new Error('Introduce un código o enlace válido.');
    await unirseAViaje(eid, nombre);
    await entrarViaje(eid);
  }));
  enter(['tp-join-eid', 'tp-join-nombre'], 'btn-tp-join');

  // Viaje antiguo (migración y recuperación)
  on('btn-tp-old', 'click', e => _busy(e.currentTarget, 'Migrando…', 'old', async () => {
    const eid = _extraerEid(val('tp-old-eid')), nombre = val('tp-old-nombre') || _perfil.nombre;
    const pin = $('tp-old-pin').value;
    if (!eid || !pin) throw new Error('Indica el código del viaje y tu PIN antiguo.');
    await agregarViajeAntiguo(eid, nombre, pin);
    $('tp-old-pin').value = '';
    await entrarViaje(eid);
  }));
  enter(['tp-old-eid', 'tp-old-nombre', 'tp-old-pin'], 'btn-tp-old');
}