// El almacenamiento local contiene un token revocable, nunca la credencial permanente.
const LS_SESSION = 'metatio_session_v4';
const LS_REVOKED = 'metatio_revoke_v4';
let sessionSecretB64 = null;
let currentSession = null;
let _revokedElsewhere = false;
function getSavedSessionRaw() {
  try {
    const s = currentSession || JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
    return s && s.project === SUPABASE_URL && s.token && s.eid && s.nombre ? s : null;
  } catch (e) { return null; }
}
function getSavedSession() {
  const s = getSavedSessionRaw();
  return s && s.exp > Date.now() ? s : null;
}
async function beginSession(nombre, eid, pinHash, { persist = true } = {}) {
  const s = await api({ action: 'open_session', eid, nombre, pinHash });
  adoptTripSession(eid,s,{persist});
}
function adoptTripSession(eid,s,{persist=true,global=false}={}) {
  currentSession = { project: SUPABASE_URL, eid, nombre: s.nombre, token: s.token, global,
    participantId: s.participant_id, organizer: s.organizer, exp: Date.parse(s.expires_at) };
  localStorage.removeItem('viaje_v3_session');
  try {
    if (persist) localStorage.setItem(LS_SESSION, JSON.stringify(currentSession));
    else localStorage.removeItem(LS_SESSION);
  } catch (e) { showStatus('Sesión abierta solo en esta pestaña: no se pudo recordarla.', 'info'); }
  if (user && user.eid === eid) {
    user.nombre = s.nombre; user.pinHash = s.token;
    user.participantId = s.participant_id; user.organizer = s.organizer; user.global = global;
  }
  void flushSessionRevocations();
}
async function getSessionPinHash(eid, nombre) {
  const s = getSavedSession();
  return s && s.eid === eid && s.nombre.toLowerCase() === nombre.toLowerCase() ? s.token : null;
}
async function storePinHash(eid, credential) {
  if (user && user.eid === eid) await beginSession(user.nombre, eid, credential);
}
async function renameSavedSession(nombre) {
  const s = getSavedSessionRaw(); if (!s) return;
  s.nombre = nombre; currentSession = s;
  if (localStorage.getItem(LS_SESSION)) localStorage.setItem(LS_SESSION, JSON.stringify(s));
}
function setSessionSecret() {}
async function flushSessionRevocations() {
  let queue;
  try { queue = JSON.parse(localStorage.getItem(LS_REVOKED) || '[]'); } catch (e) { return; }
  for (const s of queue) {
    if (s.project !== SUPABASE_URL) continue;
    try {
      await api({ action: 'revoke_session', token: s.token });
      const latest = JSON.parse(localStorage.getItem(LS_REVOKED) || '[]');
      localStorage.setItem(LS_REVOKED, JSON.stringify(latest.filter(x => x.token !== s.token)));
    } catch (e) { return; }
  }
}
function clearSession() {
  const s = getSavedSessionRaw();
  if (s) {
    try {
      const queue = JSON.parse(localStorage.getItem(LS_REVOKED) || '[]').filter(x => x.exp > Date.now());
      if (!queue.some(x => x.token === s.token)) queue.push(s);
      localStorage.setItem(LS_REVOKED, JSON.stringify(queue));
    } catch (e) { showStatus('Cierre local: no se pudo registrar la revocación pendiente.', 'err'); }
    void api({ action: 'revoke_session', token: s.token }).then(flushSessionRevocations).catch(() => {
      showStatus('Sesión cerrada aquí. Sin conexión, la revocación remota se reintentará al volver.', 'info');
    });
  }
  currentSession = null;
  localStorage.removeItem(LS_SESSION);
  localStorage.removeItem('viaje_v3_session');
}
window.addEventListener('storage', e => {
  if (e.key === LS_REVOKED && e.newValue && currentSession) {
    try { if (JSON.parse(e.newValue).some(s => s.token === currentSession.token)) _revokedElsewhere = true; } catch (ignored) {}
  }
});
function consumeRevokedElsewhere() {
  const result = _revokedElsewhere; _revokedElsewhere = false; return result;
}
async function apiAuthenticated(makeCall) {
  const owner = user;
  try { return await makeCall(owner && owner.pinHash); }
  catch (e) {
    if (owner && user === owner && /Sesión caducada|Sesión de otra identidad/i.test(e.message)) forcedLogout('Vuelve a abrir el viaje: la sesión ha caducado o se ha revocado.');
    throw e;
  }
}
