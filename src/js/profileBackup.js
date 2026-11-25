// Traslado de accesos: contiene el monedero cifrado, nunca su clave de apertura.
function exportProfileBackup() {
  if (!perfilEstaActivo()) throw new Error('Desbloquea el perfil antes de descargar su copia.');
  return JSON.stringify({
    format: 'metatio-profile', version: 1, project: SUPABASE_URL,
    createdAt: new Date().toISOString(), profile: { ..._loadProfileStore(), viajes: viajesGuardados() }, vault: _loadVault(),
  }, null, 2);
}

async function importProfileBackup(raw, password) {
  if (hayPerfilLocal()) throw new Error('Ya hay un perfil aquí. Restaura la copia en otro navegador o dispositivo sin perfil para no sobrescribir tus accesos.');
  if (typeof raw !== 'string' || raw.length > 2000000) throw new Error('La copia es demasiado grande.');
  let b;
  try { b = JSON.parse(raw); } catch (e) { throw new Error('El archivo no es una copia JSON válida.'); }
  const p = b && b.profile;
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  if (!b || b.format !== 'metatio-profile' || b.version !== 1 || b.project !== SUPABASE_URL ||
      !object(p) || typeof p.nombre !== 'string' || !p.nombre.trim() || p.nombre.length > 40 ||
      typeof p.salt !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(p.salt) ||
      typeof p.ver !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(p.ver) || p.iter !== PBKDF2_ITER ||
      !object(p.viajes) || !object(b.vault) || Object.keys(p.viajes).length > 1000) {
    throw new Error('Copia incompatible o perteneciente a otro proyecto.');
  }
  const derived = await _derive(password, p.salt, p.iter);
  if (derived.ver !== p.ver) throw new Error('La contraseña de la copia no es correcta.');
  const viajes = Object.create(null), vault = Object.create(null);
  for (const [eid, meta] of Object.entries(p.viajes)) {
    if (!/^[a-z0-9-]{3,60}$/.test(eid) || !object(meta) ||
        typeof meta.nombre !== 'string' || !meta.nombre || meta.nombre.length > 40 ||
        typeof b.vault[eid] !== 'string' || typeof b.vault[eid + '|salt'] !== 'string') {
      throw new Error('La copia contiene un acceso inválido.');
    }
    let token;
    try { token = await aesDecrypt(derived.key, b.vault[eid], b.vault[eid + '|salt']); }
    catch (e) { throw new Error('La copia está dañada: no se ha importado ningún acceso.'); }
    if (!/^[0-9a-f]{64}$/.test(token)) throw new Error('La copia contiene una credencial inválida.');
    viajes[eid] = { nombre: meta.nombre, alias: typeof meta.alias === 'string' ? meta.alias.slice(0, 200) : '', ts: Date.now() };
    vault[eid] = b.vault[eid]; vault[eid + '|salt'] = b.vault[eid + '|salt'];
    const pending = b.vault[eid + '|pending'];
    if (pending) {
      if (!object(pending) || typeof pending.nombre !== 'string' || !pending.nombre || pending.nombre.length > 40 || typeof pending.ct !== 'string' || typeof pending.salt !== 'string') throw new Error('Cambio pendiente inválido en la copia.');
      let candidate;
      try { candidate = await aesDecrypt(derived.key, pending.ct, pending.salt); }
      catch (e) { throw new Error('Cambio pendiente dañado en la copia.'); }
      if (!/^[0-9a-f]{64}$/.test(candidate)) throw new Error('Credencial pendiente inválida.');
      vault[eid + '|pending'] = { nombre: pending.nombre, ct: pending.ct, salt: pending.salt };
      if (pending.retry) {
        try {
          const retry = JSON.parse(await aesDecrypt(derived.key, pending.retry, pending.salt));
          if (!['crear_encuesta','join_invited','update_profile','recover_access'].includes(retry.action) || retry.eid !== eid) throw new Error('Reintento inválido');
        } catch (e) { throw new Error('Reintento pendiente dañado en la copia.'); }
        vault[eid + '|pending'].retry = pending.retry;
      }
    }
  }
  // Revalidar después de las operaciones asíncronas (otra pestaña pudo crear un perfil).
  if (hayPerfilLocal()) throw new Error('Se ha creado otro perfil durante la importación. No se ha sustituido.');
  const previousVault = localStorage.getItem(LS_CRED_VAULT);
  try {
    _saveVault(vault);
    _saveProfileStore({ nombre: p.nombre, salt: p.salt, iter: p.iter, ver: p.ver, viajes });
  } catch (e) {
    try {
      if (previousVault === null) localStorage.removeItem(LS_CRED_VAULT);
      else localStorage.setItem(LS_CRED_VAULT, previousVault);
    } catch (ignored) { /* el error de persistencia original se comunica al usuario */ }
    throw e;
  }
  _fijarClave(p.nombre, derived.key);
}

function bindProfileBackup() {
  $('btn-profile-export')?.addEventListener('click', () => {
    try {
      const blob = new Blob([exportProfileBackup()], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'metatio-accesos-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      tripsErr('Copia preparada. Guárdala junto con tu contraseña en un lugar seguro; vuelve a descargarla si cambian tus accesos.');
    } catch (e) { tripsErr(e.message); }
  });
  $('btn-profile-import')?.addEventListener('click', e => _busy(e.currentTarget, 'Restaurando…', '', async () => {
    const file = $('profile-import-file').files[0], input = $('profile-import-password');
    try {
      if (!file || file.size > 2000000) throw new Error('Selecciona una copia de accesos de hasta 2 MB.');
      const raw = await file.text();
      await withAccessLock(() => importProfileBackup(raw, input.value));
      $('profile-import-file').value = '';
      showTripsScreen();
      tripsErr('Accesos restaurados. Abre un viaje para comprobar la conexión con el servidor.');
    } finally { input.value = ''; }
  }));
}
bindProfileBackup();
