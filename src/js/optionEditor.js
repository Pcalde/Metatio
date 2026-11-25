// Editor único de opciones. Cargar después de types.js y antes de forms.js.
function buildOptionEditor(q, raw = '', { compact = false } = {}) {
  const norm = normalizeOption(q, raw);
  const el = div('mt-option-editor');
  el.innerHTML = `<label class="mt-option-field">Nombre de la opción<input class="mt-option-name" type="text" maxlength="200" placeholder="Nombre de la opción" value="${esc(norm.label)}"></label>
    <details class="mt-option-extra" ${!compact ? 'open' : ''}><summary>Precio, descripción, enlaces, foto y ubicación</summary>
    <div class="opt-edit-grid mt-option-grid">
      <label class="mt-option-field">Precio en euros<input class="mt-option-price" type="text" maxlength="80" placeholder="Ej. 25 €" value="${esc(norm.precio)}"></label>
      <label class="mt-option-field">Unidad del precio<select class="mt-option-unit"><option value="">Sin especificar (precio antiguo)</option>${Object.entries(OPTION_PRICE_UNITS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <label class="mt-option-field mt-option-full">Descripción<textarea class="mt-option-desc" maxlength="500" rows="2">${esc(norm.descripcion)}</textarea></label>
      <div class="mt-option-field mt-option-full"><label>Enlaces externos (Google Sites, Maps, reservas…)</label><div class="mt-option-links"></div><button type="button" class="btn-pc mt-add-link">+ Añadir enlace</button></div>
      <label class="mt-option-field mt-option-full">Foto (URL directa)<input class="mt-option-photo" type="url" maxlength="400" placeholder="https://…/foto.jpg" value="${esc(norm.foto)}"></label>
    </div></details>`;
  const get = sel => el.querySelector(sel);
  get('.mt-option-unit').value = norm.unidadPrecio || '';
  const links = get('.mt-option-links'), add = get('.mt-add-link');
  function addLink(link = {}) {
    if (links.children.length >= 3) return;
    const row = div('mt-option-link-row');
    row.innerHTML = `<input type="text" class="mt-link-title" aria-label="Título del enlace" maxlength="80" placeholder="Título opcional" value="${esc(link.titulo || '')}"><input type="url" class="mt-link-url" aria-label="URL del enlace" maxlength="400" placeholder="https://…" value="${esc(link.url || '')}"><button type="button" class="btn-pc" aria-label="Quitar enlace">×</button>`;
    row.querySelector('button').onclick = () => { row.remove(); add.disabled = false; };
    links.append(row); add.disabled = links.children.length >= 3;
  }
  norm.enlaces.forEach(addLink); if (!links.children.length) addLink();
  add.onclick = () => addLink();
  const geo = addGeoFieldsToDrawer(get('.mt-option-grid'), raw);
  function read(tipo = q.tipo) {
    let nombre = get('.mt-option-name').value.trim();
    if (!nombre) return null;
    if (tipo === 'radio') nombre = norm.hasPipe ? `${norm.key}|${nombre}` : nombre.replace(/\|/g, '/');
    if (nombre.length > 200) throw Error('El nombre completo supera 200 caracteres.');
    const precio = get('.mt-option-price').value.trim();
    const unidadPrecio = get('.mt-option-unit').value;
    if (precio && !unidadPrecio && (!norm.precio || precio !== norm.precio)) throw Error('Selecciona la unidad del precio.');
    if (precio && unidadPrecio && !/^\d+(?:[.,]\d{1,2})?\s*€?$/.test(precio)) throw Error('Introduce un importe en euros (ej. 25,50), sin añadir la unidad al texto.');
    const out = { nombre, precio: precio && unidadPrecio ? precio.replace(/\s*€$/, '').trim() + ' €' : precio };
    if (precio && unidadPrecio) out.unidadPrecio = unidadPrecio;
    const descripcion = get('.mt-option-desc').value.trim(); if (descripcion) out.descripcion = descripcion;
    const urlChecked = (value) => { const u = safeUrl(value); if (value && (!u || u.length > 400)) throw Error('Introduce una URL HTTP(S) válida de hasta 400 caracteres.'); return u; };
    const enlaces = [...links.children].map(row => ({ titulo: row.querySelector('.mt-link-title').value.trim(), url: urlChecked(row.querySelector('.mt-link-url').value.trim()) })).filter(x => x.url);
    if (enlaces.length) { out.enlaces = enlaces; out.url = enlaces[0].url; }
    const foto = urlChecked(get('.mt-option-photo').value.trim()); if (foto) out.foto = foto;
    const g = geo.getGeo(); if (g) out.geo = g;
    return out;
  }
  return { el, read, name: get('.mt-option-name') };
}
function appendOptionDetails(item, raw) {
  if (!raw || typeof raw !== 'object') return;
  const el = div('mt-option-details');
  const foto = safeUrl(raw.foto);
  if (foto) {
    const a = document.createElement('a'); a.href = foto; a.target = '_blank'; a.rel = 'noopener noreferrer';
    const img = document.createElement('img'); img.src = foto; img.alt = 'Foto de la opción'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.className = 'mt-option-photo'; img.onerror = () => a.remove(); a.append(img); el.append(a);
  }
  const info = div('mt-option-info');
  if (raw.descripcion) info.append(div('mt-option-description', raw.descripcion));
  const links = div('mt-option-public-links');
  optionLinks(raw).forEach((link,i) => { const u = safeUrl(link.url); if (!u) return; const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = link.titulo || `Enlace ${i+1}`; links.append(a); });
  if (raw.geo) { const g = raw.geo; const loc = typeof g === 'string' ? g : g.texto || (g.lat != null && g.lng != null ? `${g.lat},${g.lng}` : ''); if (loc) info.append(div('mt-option-location', loc)); }
  if (links.children.length) info.append(links);
  if (info.children.length) el.append(info);
  if (el.children.length) item.append(el);
}
