// Diario cifrado: conservar ambos accesos hasta confirmar servidor y almacenamiento.
async function withAccessLock(fn) {
  if (!navigator.locks) throw new Error('Este navegador necesita HTTPS y soporte de bloqueo de almacenamiento para modificar accesos.');
  return navigator.locks.request('metatio-access-' + SUPABASE_URL, fn);
}
async function finalizeAccess(eid, pending) {
  const vault = _loadVault();
  _guardarMeta(eid, { nombre: pending.nombre });
  vault[eid] = pending.ct; vault[eid + '|salt'] = pending.salt;
  delete vault[eid + '|pending'];
  _saveVault(vault);
}
async function accessTransaction(eid, nombre, token, body) {
  return withAccessLock(async () => {
    if (!perfilEstaActivo()) throw new Error('Desbloquea tu perfil para guardar el acceso antes de modificarlo.');
    const vault = _loadVault();
    const previous = { ct: vault[eid], salt: vault[eid + '|salt'], meta: viajesGuardados()[eid] };
    if (vault[eid + '|pending']) throw new Error('Hay un cambio pendiente. Abre primero el viaje desde Mis viajes para comprobarlo.');
    const salt = eid + '|pending|' + randomHex(16);
    const pending = { nombre, ct: await aesEncrypt(_perfil.clave, token, salt), salt };
    pending.retry = await aesEncrypt(_perfil.clave, JSON.stringify(body), salt);
    vault[eid + '|pending'] = pending;
    // Para un alta nueva, conservar la credencial incluso si la respuesta de red se pierde.
    if (!vault[eid]) { vault[eid] = pending.ct; vault[eid + '|salt'] = salt; }
    _saveVault(vault);
    _guardarMeta(eid, { nombre: viajesGuardados()[eid]?.nombre || nombre });
    try {
      const res = await api(body);
      pending.nombre = res.nombre || nombre;
      // Persistir el nombre canónico antes de finalizar.
      const latest = _loadVault(); latest[eid + '|pending'] = pending; _saveVault(latest);
      await finalizeAccess(eid, pending);
      return res;
    } catch (e) {
      if (e.definitive) {
        const latest = _loadVault(); delete latest[eid + '|pending'];
        if (previous.ct) { latest[eid] = previous.ct; latest[eid + '|salt'] = previous.salt; }
        else { delete latest[eid]; delete latest[eid + '|salt']; }
        _saveVault(latest);
        const profile = _loadProfileStore();
        if (previous.meta) profile.viajes[eid] = previous.meta;
        else delete profile.viajes[eid];
        _saveProfileStore(profile);
        throw e;
      }
      throw new Error(e.message + ' El acceso anterior y el nuevo se conservan cifrados. Abre el viaje desde Mis viajes para comprobar el resultado.');
    }
  });
}
async function reconcileAccess(eid) {
  return withAccessLock(async () => {
    const vault = _loadVault(), pending = vault[eid + '|pending'];
    if (!pending) return;
    const candidate = await aesDecrypt(_perfil.clave, pending.ct, pending.salt);
    try {
      await api({ action: 'all', eid, nombre: pending.nombre, pinHash: candidate });
      await finalizeAccess(eid, pending);
    } catch (e) {
      // Una caída de red no demuestra que la operación haya fallado.
      if (!/PIN incorrecto|Usuario no registrado|Encuesta no encontrada/.test(e.message)) throw e;
      if (!pending.retry) throw new Error('Cambio pendiente antiguo: conserva una copia y comprueba el acceso anterior.');
      const body = JSON.parse(await aesDecrypt(_perfil.clave, pending.retry, pending.salt));
      try { await api(body); } catch (ignored) { /* comprobar el estado final incluso si el reintento informa de un duplicado */ }
      await api({ action: 'all', eid, nombre: pending.nombre, pinHash: candidate });
      await finalizeAccess(eid, pending);
    }
  });
}
function inviteFromText(text) {
  try { return new URL(text, location.href).searchParams.get('i') || ''; } catch (e) { return ''; }
}
async function changeProfilePassword(oldPassword, newPassword) {
  return withAccessLock(async () => {
    const profile = _loadProfileStore();
    if (!profile || newPassword.length < PIN_MIN || newPassword.length > 64) throw new Error('La contraseña nueva debe tener entre 6 y 64 caracteres.');
    const old = await _derive(oldPassword, profile.salt, profile.iter);
    if (old.ver !== profile.ver) throw new Error('La contraseña actual no es correcta.');
    const salt = _ab2b64url(crypto.getRandomValues(new Uint8Array(16)));
    const next = await _derive(newPassword, salt, PBKDF2_ITER);
    const vault = _loadVault();
    for (const eid of Object.keys(profile.viajes || {})) {
      if (!vault[eid]) throw new Error('Hay un acceso incompleto. Compruébalo antes de cambiar la contraseña.');
      vault[eid] = await aesEncrypt(next.key, await aesDecrypt(old.key, vault[eid], vault[eid+'|salt']), vault[eid+'|salt']);
      const pending = vault[eid+'|pending'];
      if (pending) {
        pending.ct = await aesEncrypt(next.key, await aesDecrypt(old.key,pending.ct,pending.salt),pending.salt);
        if (pending.retry) pending.retry = await aesEncrypt(next.key,await aesDecrypt(old.key,pending.retry,pending.salt),pending.salt);
      }
    }
    const updated = { ...profile, salt, ver: next.ver, iter: PBKDF2_ITER };
    // Una sola escritura confirma simultáneamente contraseña y monedero.
    localStorage.setItem(LS_PROFILE_ATOMIC, JSON.stringify({ profile: updated, vault }));
    _fijarClave(profile.nombre,next.key);
    localStorage.removeItem(LS_PROFILE); localStorage.removeItem(LS_CRED_VAULT);
  });
}
function downloadAccessText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function createInvite(eid, nombre, pinHash) {
  const res = await api({ action: 'manage_invites', eid, nombre, pinHash });
  return location.origin + location.pathname + '?e=' + encodeURIComponent(eid) + '&i=' + res.token;
}
function renderAccessControls() {
  const host = $('access-controls');
  if (!host || !user) return;
  const organizer = respondentes.find(r => r.nombre.toLowerCase() === user.nombre.toLowerCase())?.organizer === true;
  document.body.classList.toggle('participant-view', !organizer);
  host.hidden = false;
  $('organizer-controls').hidden = !organizer;
  const select=$('access-next-organizer');
  if(organizer && select?.tagName==='SELECT') {
    const previous=select.value; select.replaceChildren(new Option('Selecciona un participante',''));
    for(const r of respondentes.filter(r=>r.nombre.toLowerCase()!==user.nombre.toLowerCase())) select.add(new Option(r.nombre,r.nombre));
    select.value=previous; if(select.selectedIndex<0)select.selectedIndex=0;
  }
}
async function accessUi(action) {
  try { await action(); } catch (e) { showStatus(e.message, 'err', 10000); }
}
function bindAccessControls() {
  $('access-attendance-enabled')?.addEventListener('change',async e=>{
    const el=e.currentTarget; const desired=el.checked; el.disabled=true;
    try{await apiPost({action:'set_attendance',...user,enabled:desired});asistenciaActiva=desired;lastRaw='';invalidateReadStateCache();if(typeof renderAusencias==='function')renderAusencias();if(activeMode==='consensus')renderResultados();if(activeMode==='reformulario')renderReformularioInteractivo();await pollOnce();showStatus('Configuración de asistencia actualizada','ok');}
    catch(err){el.checked=asistenciaActiva;showStatus(err.message,'err');}
    finally{el.disabled=!ajustesModeloDisponibles;}
  });
  $('btn-change-profile-password')?.addEventListener('click', e => _busy(e.currentTarget,'Cambiando…','',async () => {
    const old = $('profile-old-password'), next = $('profile-new-password');
    try { await changeProfilePassword(old.value,next.value); tripsErr('Contraseña cambiada. Descarga una copia nueva de tus accesos.'); }
    finally { old.value=''; next.value=''; }
  }));
  $('access-copy-invite')?.addEventListener('click',()=>accessUi(async()=>{const url=$('access-invite-url').value;if(!url)throw new Error('Genera primero el enlace.');await navigator.clipboard.writeText(url);showStatus('Enlace copiado.','ok');}));
  $('access-invite')?.addEventListener('click', () => accessUi(async () => {
    const url = await createInvite(user.eid, user.nombre, user.pinHash);
    $('access-invite-url').value = url;
    showStatus('Enlace creado. Caduca en siete días; puedes copiarlo del campo.', 'ok');
  }));
  $('access-revoke-invites')?.addEventListener('click', () => accessUi(async () => {
    await apiPost({ action: 'manage_invites', ...user, revoke: true });
    $('access-invite-url').value = ''; showStatus('Invitaciones revocadas. Los participantes actuales conservan el acceso.', 'ok');
  }));
  $('access-recovery')?.addEventListener('click', () => accessUi(async () => {
    const code = randomHex(32);
    // Mostrar antes de enviar: si se corta la respuesta, el usuario conserva el candidato.
    $('access-recovery-code').value = code;
    await apiPost({ action: 'set_recovery', ...user, code });
    downloadAccessText('metatio-recuperacion-' + user.eid + '.txt', 'Proyecto: ' + SUPABASE_URL + '\nViaje: ' + user.eid + '\nNombre: ' + user.nombre + '\nCódigo de un solo uso: ' + code);
    showStatus('Guarda el código fuera de este dispositivo. Sustituye al anterior y permite recuperar este viaje sin tu contraseña.', 'ok', 10000);
  }));
  $('access-revoke-sessions')?.addEventListener('click', () => accessUi(async () => {
    await apiPost({ action: 'revoke_all_sessions', ...user }); logout();
  }));
  $('access-archived')?.addEventListener('click', () => accessUi(async () => {
    const result = await apiPost({ action: 'restore_question', ...user });
    const host = $('access-archived-list'); host.replaceChildren();
    for (const q of result.archived) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Restaurar: ' + q.label;
      b.addEventListener('click', () => accessUi(async () => {
        await apiPost({ action: 'restore_question', ...user, qid: q.id }); b.remove(); await pollOnce();
      })); host.appendChild(b);
    }
    if (!result.archived.length) host.textContent = 'No hay preguntas archivadas.';
  }));
  $('access-transfer')?.addEventListener('click', () => accessUi(async () => {
    const target = $('access-next-organizer').value.trim();
    if (!target || !window.confirm('¿Transferir la organización del viaje a ' + target + '?')) return;
    await apiPost({ action: 'transfer_organizer', ...user, target }); await pollOnce(); renderAccessControls();
  }));
  $('btn-recover-access')?.addEventListener('click', e => _busy(e.currentTarget, 'Recuperando…', '', async () => {
    const eid = normEid($('recover-eid').value.trim()), nombre = $('recover-name').value.trim();
    const code = $('recover-code').value.trim(), token = randomHex(32);
    if (!/^[0-9a-f]{64}$/.test(code)) throw new Error('Introduce el código de recuperación de 64 caracteres.');
    await accessTransaction(eid, nombre, token, { action: 'recover_access', eid, nombre, code, newPin: token });
    $('recover-code').value = ''; await entrarViaje(eid);
  }));
}
bindAccessControls();
