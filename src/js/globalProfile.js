// Cuenta global: Supabase Auth gestiona contraseña y sesión; v4 gestiona los viajes.
// No se sincronizan secretos locales ni se derivan tokens del nombre.
let _globalClient = null;
let _globalRefreshVersion = 0;
let _globalAccount = null;
let _globalBusy = false;
let _globalMode = 'login';
let _globalRecovery = false;
let _globalReturnToRecovery = false;
const GLOBAL_PASSWORD_MIN = 8;
const GLOBAL_INVITE_KEY = 'metatio-oauth-invite-v6';
let _globalInviteHandled = false;
function globalAuthReturning() {
  const q = new URLSearchParams(location.search), hash = new URLSearchParams(location.hash.slice(1));
  return q.has('code') || q.has('error') || hash.has('access_token') || hash.has('error');
}
function globalRedirect() { return location.origin + location.pathname; }
function globalMode(mode) {
  _globalMode=mode;
  const reg=mode==='register', reset=mode==='reset';
  $('global-name-field').hidden=!reg;
  $('global-password-field').hidden=reset;
  $('global-password-hint').hidden=!reg;
  $('global-reset-hint').hidden=!reset;
  $('global-password').autocomplete=reg?'new-password':'current-password';
  $('global-password').value='';
  for(const m of ['login','register','reset']) {
    const b=$('global-'+m); b.hidden=mode!==m; b.type=mode===m?'submit':'button';
  }
  for(const m of ['login','register']) {
    const b=$('global-mode-'+m); b.classList.toggle('active',mode===m); b.setAttribute('aria-pressed',String(mode===m));
  }
  $('global-mode-reset').textContent=reset?'Volver al inicio de sesión':'¿Has olvidado tu contraseña?';
  globalStatus('');
}
function afterLegacyUnlock() {
  if(!_globalReturnToRecovery) return;
  _globalReturnToRecovery=false;
  $('legacy-access').open=false;
  $('global-recover-details').open=true;
  renderGlobalLocalChoices();
  $('global-recover-details').scrollIntoView({block:'nearest'});
}
function globalClaimMode() {
  const mode=$('global-claim-mode').value;
  const labels={legacy:['PIN original','El PIN que usabas para este viaje antes de la migración.'],recovery:['Código de recuperación','Código de seguridad de 64 caracteres guardado anteriormente. Solo puede usarse una vez.'],deterministic:['Contraseña del perfil anterior','Solo para el parche multidispositivo previo a la cuenta con correo.']};
  $('global-claim-profile-field').hidden=mode!=='deterministic';
  $('global-claim-secret-label').textContent=labels[mode][0];
  $('global-claim-hint').textContent=labels[mode][1];
  $('global-claim-secret').value='';
}

function globalClient() {
  if (!_globalClient) {
    if (!window.supabase?.createClient) throw new Error('No se pudo cargar Supabase Auth. Comprueba la conexión.');
    _globalClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storage: sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
        storageKey: 'metatio-global-auth-v5' }
    });
    _globalClient.auth.onAuthStateChange((event) => {
      // No ejecutar otras llamadas Auth dentro del callback del SDK.
      if (event === 'PASSWORD_RECOVERY') {
        _globalRecovery=true;
        setTimeout(() => {
          void refreshGlobalProfile();
          globalStatus('Establece una nueva contraseña para continuar.');
          $('global-password-details').open = true;
        }, 0);
      }
      if (event === 'SIGNED_OUT') { _globalRecovery=false; setTimeout(() => { void refreshGlobalProfile(); }, 0); }
    });
  }
  return _globalClient;
}
function globalStatus(message) { const el=$('global-status'); if(el) el.textContent=message || ''; }
function globalVal(id) { return $(id).value.trim(); }
async function globalRpc(name, args={}) {
  const { data, error } = await globalClient().rpc(name,args);
  if (error) {
    // No imprimir argumentos RPC: pueden contener credenciales o invitaciones.
    const code = error.code || 'RPC';
    const message = error.message || 'Error del servidor';
    console.error('[Metatio] ' + name + ' [' + code + ']: ' + message);
    throw new Error(name + ' [' + code + ']: ' + message);
  }
  return unwrap(data);
}
// Solo para recuperar credenciales del parche determinista anterior. Nunca se usa en altas nuevas.
async function legacyDeterministicToken(password, profileName, eid) {
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode('metatio-master|'+profileName.trim().toLowerCase()),iterations:600000,hash:'SHA-256'},key,256);
  return sha256(_ab2hex(bits)+'|'+eid);
}
async function globalTask(btn, fn) {
  if (_globalBusy) return;
  _globalBusy=true; btn.disabled=true; globalStatus('');
  try { await fn(); } catch (e) { globalStatus(e.message || String(e)); }
  finally { btn.disabled=false; _globalBusy=false; }
}
async function refreshGlobalProfile() {
  if (!$('global-profile-card')) return;
  const version=++_globalRefreshVersion;
  try {
    const { data, error }=await globalClient().auth.getSession();
    if (error) throw new Error(error.message);
    if(version!==_globalRefreshVersion) return;
    const previousOwner=_globalAccount?.id;
    _globalAccount=data.session?.user || null;
    if(previousOwner && previousOwner!==_globalAccount?.id){mtReset();for(const id of ['global-join-name','global-new-name','global-claim-name','global-claim-secret','mt-request-note','mt-friend-code'])$(id).value='';}
    $('global-auth-form').hidden=!!_globalAccount;
    $('global-account-panel').hidden=!_globalAccount;
    $('trips-screen').classList.toggle('mt-signed-in',!!_globalAccount);
    $('mt-right').hidden=_globalRecovery;
    $('mt-profile-edit').hidden=_globalRecovery;
    document.querySelector('.mt-nav').hidden=_globalRecovery;
    if(!_globalAccount) { mtReset(); $('global-trips-list').replaceChildren(); return; }
    $('global-travel-panel').hidden=_globalRecovery;
    if(_globalRecovery) { $('global-password-details').open=true; }
    $('global-email-label').textContent=_globalAccount.email || 'Cuenta global';
    const name=String(_globalAccount.user_metadata?.nombre || _globalAccount.user_metadata?.full_name || _globalAccount.user_metadata?.name || _perfil.nombre || '').slice(0,40);
    $('global-display-name').textContent=name || 'Mi cuenta';
    if(_globalRecovery) return;
    const dashboard=await mtLoad(version);
    if(version!==_globalRefreshVersion) return;
    const displayName=dashboard?.profile?.name||name;
    for(const id of ['global-join-name','global-new-name']) if(!$(id).value) $(id).value=displayName;
    const eid=eidDeLaUrl();
    const savedInvite=sessionStorage.getItem(GLOBAL_INVITE_KEY);
    const pending=savedInvite || (eid ? (inviteFromText(location.href)?location.href:eid) : '');
    const trips=await globalRpc('global_trips');
    if(version!==_globalRefreshVersion) return;
    if(pending && !_globalInviteHandled) {
      _globalInviteHandled=true;
      const destination=_extraerEid(pending);
      if(trips.some(t=>t.eid===destination)) {
        try { await entrarViajeGlobal(destination); mtConsumeLink(); return; }
        catch(e) { globalStatus(e.message); }
      } else {
        $('global-join-eid').value=pending;
        $('global-claim-eid').value=destination;
        $('global-join-details').open=true;
        globalStatus('Si ya participabas, recupera tu acceso anterior. Si es un viaje nuevo para ti, puedes entrar con invitación o solicitar acceso.');
      }
    }
    const host=$('global-trips-list'); host.replaceChildren();
    if(!trips.length) host.textContent='Todavía no hay viajes vinculados a esta cuenta.';
    for(const trip of trips) {
      const row=document.createElement('div'); row.className='trips-item';
      const text=document.createElement('span'); text.className='trips-item-nombre';
      const title=document.createElement('strong'); title.textContent=trip.titulo||trip.eid;
      const meta=document.createElement('em'); meta.textContent='#'+trip.eid+' · '+trip.nombre+(trip.organizer?' · Organizador':'');
      text.append(title,meta);
      const b=document.createElement('button'); b.type='button'; b.className='btn-propose'; b.textContent='Entrar';
      b.addEventListener('click',()=>globalTask(b,()=>entrarViajeGlobal(trip.eid)));
      row.append(text,b); mtDecorateTrip(row,trip); host.append(row);
    }
    renderGlobalLocalChoices();
  } catch(e) { if(version===_globalRefreshVersion) globalStatus(e.message); }
}
function renderGlobalLocalChoices() {
  const host=$('global-local-list'); if(!host) return;
  host.replaceChildren();
  $('global-open-local').hidden=perfilEstaActivo() || !hayPerfilLocal();
  $('global-local-route').hidden=!hayPerfilLocal();
  if(!perfilEstaActivo()) { host.textContent=''; return; }
  const entries=Object.entries(viajesGuardados());
  if(!entries.length) host.textContent='No hay accesos guardados en este navegador.';
  for(const [eid,meta] of entries) {
    const b=document.createElement('button'); b.type='button'; b.className='btn-propose'; b.textContent='Vincular '+(meta.alias||eid)+' · '+(meta.nombre||_perfil.nombre);
    b.addEventListener('click',()=>globalTask(b,async()=>{
      await reconcileAccess(eid);
      const name=viajesGuardados()[eid]?.nombre||_perfil.nombre;
      const token=await getCredViaje(eid);
      if(!token) throw new Error('No hay credencial descifrable. Usa el dispositivo original, PIN antiguo o código de recuperación.');
      await globalRpc('global_claim',{p_eid:eid,p_nombre:name,p_pin:token,p_rotate:false});
      await refreshGlobalProfile(); globalStatus('Viaje vinculado. El acceso local se conserva.');
    })); host.append(b);
  }
}
async function entrarViajeGlobal(eid) {
  const s=await globalRpc('global_open',{p_eid:eid});
  // No guardar tokens de viaje globales en localStorage; se puede reabrir desde la cuenta.
  try {
    const datos=await api({action:'all',eid,nombre:s.nombre,pinHash:s.token});
    clearSession();
    user={eid,nombre:s.nombre,pinHash:s.token,global:true};
    adoptTripSession(eid,s,{persist:false,global:true});
    lastRaw=JSON.stringify(datos); applyData(datos); hideTripsScreen(); enterSurvey();
    if(typeof renderAccessControls==='function') renderAccessControls();
  } catch(e) {
    try { await api({action:'revoke_session',token:s.token}); } catch(ignored) {}
    if(user?.pinHash===s.token) { clearSession(); user=null; showTripsScreen(); }
    throw e;
  }
}
function mtConsumeLink(){
  sessionStorage.removeItem(GLOBAL_INVITE_KEY);
  const url=new URL(location.href);url.searchParams.delete('e');url.searchParams.delete('i');
  history.replaceState(null,'',url.pathname+url.search+url.hash);
}
function bindGlobalProfile() {
  bindMetatioDashboard();
  const on=(id,fn)=>$(id)?.addEventListener('click',e=>{e.preventDefault(); void globalTask(e.currentTarget,fn);});
  globalMode('login');
  const authError=new URLSearchParams(location.search).get('error') || new URLSearchParams(location.hash.slice(1)).get('error');
  if(authError) globalStatus('No se completó el inicio de sesión. Puedes volver a intentarlo.');
  $('global-mode-login').addEventListener('click',()=>globalMode('login'));
  $('global-mode-register').addEventListener('click',()=>globalMode('register'));
  $('global-mode-reset').addEventListener('click',()=>globalMode(_globalMode==='reset'?'login':'reset'));
  $('global-email-form').addEventListener('submit',e=>{e.preventDefault(); $('global-'+_globalMode).click();});
  on('global-google',async()=>{
    if(eidDeLaUrl()) sessionStorage.setItem(GLOBAL_INVITE_KEY,inviteFromText(location.href)?location.href:eidDeLaUrl());
    else sessionStorage.removeItem(GLOBAL_INVITE_KEY);
    const {error}=await globalClient().auth.signInWithOAuth({provider:'google',options:{redirectTo:globalRedirect(),scopes:'openid email profile',queryParams:{prompt:'select_account'}}});
    if(error) { sessionStorage.removeItem(GLOBAL_INVITE_KEY); throw error; }
  });
  $('global-open-local').addEventListener('click',()=>{
    _globalReturnToRecovery=true;
    $('legacy-access').open=true;
    $('legacy-access').scrollIntoView({block:'start'});
    $('trips-pass')?.focus();
  });
  for(const el of document.querySelectorAll('.ma-actions > details')) el.addEventListener('toggle',()=>{
    if(el.open) for(const other of document.querySelectorAll('.ma-actions > details')) if(other!==el) other.open=false;
  });
  on('global-login',async()=>{
    const email=globalVal('global-email'),password=$('global-password').value;
    if(!$('global-email').checkValidity() || !password) throw new Error('Introduce un correo válido y tu contraseña.');
    try { const {error}=await globalClient().auth.signInWithPassword({email,password}); if(error) throw error; }
    finally { $('global-password').value=''; }
    await refreshGlobalProfile();
  });
  on('global-register',async()=>{
    const email=globalVal('global-email'),password=$('global-password').value,nombre=globalVal('global-name');
    if(!nombre) throw new Error('Indica tu nombre visible.');
    if(!$('global-email').checkValidity()) throw new Error('Introduce un correo válido.');
    if(password.length<GLOBAL_PASSWORD_MIN) throw new Error('Utiliza una contraseña de al menos '+GLOBAL_PASSWORD_MIN+' caracteres.');
    try {
      if(eidDeLaUrl()) sessionStorage.setItem(GLOBAL_INVITE_KEY,inviteFromText(location.href)?location.href:eidDeLaUrl());
      const {data,error}=await globalClient().auth.signUp({email,password,options:{data:{nombre},emailRedirectTo:globalRedirect()}});
      if(error) throw error;
      await refreshGlobalProfile(); if(!data.session) globalStatus('Si el registro es válido, recibirás un correo de confirmación.');
    } finally { $('global-password').value=''; }
  });
  on('global-reset',async()=>{
    const email=globalVal('global-email'); if(!$('global-email').checkValidity()) throw new Error('Introduce tu correo.');
    const {error}=await globalClient().auth.resetPasswordForEmail(email,{redirectTo:globalRedirect()});
    if(error) throw error; globalStatus('Si existe la cuenta, recibirás instrucciones por correo.');
  });
  on('global-change-password',async()=>{
    const input=$('global-next-password'), password=input.value;
    if(password.length<GLOBAL_PASSWORD_MIN) throw new Error('Utiliza al menos '+GLOBAL_PASSWORD_MIN+' caracteres.');
    try { const {error}=await globalClient().auth.updateUser({password}); if(error) throw error; _globalRecovery=false; await refreshGlobalProfile(); $('global-password-details').open=false; globalStatus('Contraseña de la cuenta guardada.'); }
    finally { input.value=''; }
  });
  on('global-logout',async()=>{
    const {error}=await globalClient().auth.signOut({scope:'local'}); if(error) throw error;
    _globalAccount=null; mtReset(); _globalRecovery=false; _globalReturnToRecovery=false; _globalInviteHandled=false; mtConsumeLink(); if(typeof salirDelPerfil==='function' && perfilEstaActivo()) salirDelPerfil(); globalMode('login'); $('legacy-access').open=false; for(const id of ['global-join-eid','global-join-name','global-new-name','global-claim-name','global-claim-eid','global-claim-secret','global-claim-profile-name','global-new-title','global-new-eid','global-next-password']) $(id).value=''; await refreshGlobalProfile(); globalStatus('Cuenta global cerrada en este navegador.');
  });
  on('global-refresh',refreshGlobalProfile);
  $('global-claim-mode').addEventListener('change',globalClaimMode);
  on('global-claim',async()=>{
    const eid=_extraerEid(globalVal('global-claim-eid')), nombre=globalVal('global-claim-name'), input=$('global-claim-secret');
    const mode=$('global-claim-mode').value;
    if(!eid||!nombre||!input.value) throw new Error('Indica viaje, nombre y credencial.');
    try {
      if(mode==='recovery') {
        const code=input.value.trim(); if(!/^[0-9a-f]{64}$/.test(code)) throw new Error('Código de recuperación inválido.');
        await globalRpc('global_recover',{p_eid:eid,p_nombre:nombre,p_code:code});
      } else {
        const profileName=globalVal('global-claim-profile-name');
        if(mode==='deterministic' && !profileName) throw new Error('Indica el nombre del perfil local anterior, no necesariamente el nombre del viaje.');
        const pin=mode==='deterministic' ? await legacyDeterministicToken(input.value,profileName,eid) : await sha256(input.value.trim()+'|'+eid);
        await globalRpc('global_claim',{p_eid:eid,p_nombre:nombre,p_pin:pin,p_rotate:true});
      }
      await refreshGlobalProfile(); $('global-recover-details').open=false; globalStatus('Viaje recuperado. Ya aparece en Mis viajes.');
    } finally { input.value=''; }
  });
  on('global-join',async()=>{
    const raw=globalVal('global-join-eid'),eid=_extraerEid(raw),invite=inviteFromText(raw),nombre=globalVal('global-join-name');
    if(!eid||!nombre) throw new Error('Introduce el código del viaje y tu nombre.');
    const trips=await globalRpc('global_trips');
    if(trips.some(t=>t.eid===eid)){await entrarViajeGlobal(eid);mtConsumeLink();return;}
    if(!confirm('Si ya participabas con una versión anterior, usa Recuperar viaje para conservar tus respuestas. ¿Quieres crear una participación nueva?'))return;
    if(invite){
      await globalRpc('global_join',{p_eid:eid,p_nombre:nombre,p_invite:invite});
      mtConsumeLink(); $('global-join-eid').value=''; $('global-join-details').open=false; await entrarViajeGlobal(eid);
    }else{
      await mtRpc('trip_request',{eid,alias:nombre,note:globalVal('mt-request-note')});
      mtConsumeLink(); $('global-join-eid').value=''; $('mt-request-note').value=''; $('global-join-details').open=false;
      await refreshGlobalProfile(); globalStatus('Solicitud enviada. El organizador debe aprobarla.');
    }
  });
  on('global-create',async()=>{
    const eid=normEid(globalVal('global-new-eid')),nombre=globalVal('global-new-name');
    if(!/^[a-z0-9-]{3,60}$/.test(eid)||!nombre) throw new Error('Indica un código válido y tu nombre.');
    await globalRpc('global_create',{p_eid:eid,p_nombre:nombre,p_titulo:globalVal('global-new-title')||'Cuestionario de viaje',p_plantilla:$('global-new-template').value});
    $('global-new-eid').value=''; $('global-new-title').value=''; $('global-create-details').open=false; await refreshGlobalProfile(); globalStatus('Viaje creado. Ya aparece en Mis viajes.');
  });
}
