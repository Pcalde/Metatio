/* ══════════════════════════════════════════════════════════════════════════
   REGISTRO DE TIPOS DE PREGUNTA (Generalizado + Edición/Borrado de Opciones)
   + Slider Dual (Ideal/Hard-Cap) + Mini-Calendario + Matching Coche/Pasajero
   + Probabilidad por Opción (Solo captura de escala absoluta sin sesgo)
   ══════════════════════════════════════════════════════════════════════════ */

function div(cls, txt) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  if (txt != null) d.textContent = txt;
  return d;
}

// Inyección idempotente de estilos para las nuevas features (usa variables del tema actual)
(function injectTypesEnhancementsCSS() {
  if (typeof document === 'undefined' || document.getElementById('types-enhancements-css')) return;
  const st = document.createElement('style');
  st.id = 'types-enhancements-css';
  st.textContent = `
    /* Slider Dual (Presupuesto Ideal vs Tope Estricto) */
    .dual-slider-toggle { display:flex; align-items:center; gap:8px; margin-top:10px; font-size:0.8rem; color:var(--muted); cursor:pointer; user-select:none; }
    .dual-slider-box { margin-top:10px; padding:10px 12px; border:1px dashed var(--border); border-radius:8px; background:rgba(128,128,128,0.04); }
    .dual-slider-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px; font-size:0.82rem; }
    .dual-slider-head b { color:#f59e0b; font-size:0.95rem; }
    .price-display-sub { font-size:0.78rem; color:var(--muted); font-weight:400; margin-left:8px; }

    /* Mini-Calendario Interactivo (Disponibilidad) */
    .mini-cal-wrap { margin-bottom:14px; border:1px solid var(--border); border-radius:10px; padding:10px; background:rgba(128,128,128,0.03); user-select:none; }
    .mini-cal-bar { display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:8px; flex-wrap:wrap; }
    .mini-cal-nav { display:flex; align-items:center; gap:6px; font-weight:600; font-size:0.88rem; }
    .mini-cal-btn { background:transparent; border:1px solid var(--border); color:inherit; border-radius:6px; padding:2px 8px; cursor:pointer; font-size:0.78rem; transition:all 0.15s; }
    .mini-cal-btn:hover { border-color:var(--accent, #3b82f6); color:var(--accent, #3b82f6); }
    .mini-cal-presets { display:flex; gap:4px; flex-wrap:wrap; }
    .mini-cal-grid { display:grid; grid-template-columns:repeat(7, 1fr); gap:3px; text-align:center; }
    .mini-cal-dow { font-size:0.7rem; color:var(--muted); font-weight:600; padding:3px 0; }
    .mini-cal-day { font-size:0.8rem; padding:6px 2px; border-radius:6px; cursor:pointer; border:1px solid transparent; transition:background 0.1s, transform 0.08s; }
    .mini-cal-day:hover:not(.disabled):not(.empty) { border-color:var(--border); background:rgba(128,128,128,0.1); }
    .mini-cal-day.selected { background:var(--accent, #3b82f6); color:#fff; font-weight:600; }
    .mini-cal-day.weekend:not(.selected):not(.disabled) { color:var(--accent, #3b82f6); }
    .mini-cal-day.disabled { opacity:0.3; cursor:not-allowed; }
    .mini-cal-day.empty { pointer-events:none; }

    /* Matching Dinámico de Transporte (Coches <-> Pasajeros) */
    .trans-dynamic-wrap { margin-top:12px; padding-top:12px; border-top:1px dashed var(--border); display:flex; flex-direction:column; gap:10px; }
    .trans-balance-bar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:7px 10px; border-radius:8px; font-size:0.78rem; background:rgba(128,128,128,0.06); border:1px solid var(--border); }
    .trans-balance-badge { font-weight:600; padding:2px 7px; border-radius:99px; font-size:0.74rem; }
    .trans-balance-badge.ok { background:rgba(16,185,129,0.15); color:#10b981; }
    .trans-balance-badge.warn { background:rgba(245,158,11,0.15); color:#f59e0b; }
    .trans-balance-badge.err { background:rgba(239,68,68,0.15); color:#ef4444; }
    .trans-pref-box { display:flex; flex-direction:column; gap:6px; }
    .trans-pref-title { font-size:0.82rem; font-weight:600; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px; }
    .trans-pref-sub { font-size:0.74rem; color:var(--muted); }
    .trans-chips-list { display:flex; flex-wrap:wrap; gap:6px; margin-top:2px; }
    .trans-chip { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:99px; font-size:0.8rem; border:1px solid var(--border); background:transparent; color:inherit; cursor:pointer; transition:all 0.15s; user-select:none; }
    .trans-chip:hover { border-color:var(--muted); }
    .trans-chip small { font-size:0.7rem; opacity:0.75; }
    .trans-chip[data-pref="1"] { background:rgba(16,185,129,0.15); border-color:#10b981; color:#10b981; font-weight:600; }
    .trans-chip[data-pref="-1"] { background:rgba(239,68,68,0.14); border-color:#ef4444; color:#ef4444; text-decoration:line-through; }
    .trans-nota-row { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:2px; }
    .trans-nota-inp { flex:1; min-width:180px; font-size:0.82rem; padding:5px 8px; border-radius:6px; border:1px solid var(--border); background:transparent; color:inherit; }
    .trans-add-person { display:inline-flex; gap:4px; align-items:center; }
    .trans-add-person input { width:115px; font-size:0.76rem; padding:3px 7px; border-radius:6px; border:1px solid var(--border); background:transparent; color:inherit; }

    /* Probabilidad por Opción (Escala de entrada + Clases reutilizadas en Consenso) */
    .prob-item { display:flex; flex-direction:column; gap:6px; padding:8px 0; border-bottom:1px solid rgba(128,128,128,0.12); }
    .prob-top-row { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
    .prob-scale-row { display:flex; flex-wrap:wrap; gap:4px; margin-top:2px; }
    .btn-prob-cat { flex:1; min-width:74px; padding:5px 6px; border-radius:7px; border:1px solid var(--border); background:transparent; color:inherit; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:1px; font-size:0.75rem; transition:all 0.14s; user-select:none; }
    .btn-prob-cat small { font-size:0.66rem; color:var(--muted); font-variant-numeric:tabular-nums; }
    .btn-prob-cat:hover { border-color:var(--muted); background:rgba(128,128,128,0.05); }
    .btn-prob-cat.active[data-prob="0"]    { background:rgba(239,68,68,0.16); border-color:#ef4444; color:#ef4444; font-weight:600; }
    .btn-prob-cat.active[data-prob="0.2"]  { background:rgba(249,115,22,0.15); border-color:#f97316; color:#f97316; font-weight:600; }
    .btn-prob-cat.active[data-prob="0.5"]  { background:rgba(234,179,8,0.15);  border-color:#eab308; color:#ca8a04; font-weight:600; }
    .btn-prob-cat.active[data-prob="0.75"] { background:rgba(59,130,246,0.15); border-color:#3b82f6; color:#3b82f6; font-weight:600; }
    .btn-prob-cat.active[data-prob="0.9"],
    .btn-prob-cat.active[data-prob="0.95"] { background:rgba(16,185,129,0.16); border-color:#10b981; color:#10b981; font-weight:600; }
    .btn-prob-cat.active small { color:inherit; opacity:0.85; }

    /* Clases de soporte para consensusView.js */
    .prob-metrics-pills { display:flex; gap:6px; align-items:center; font-size:0.76rem; font-variant-numeric:tabular-nums; }
    .prob-metric-pill { padding:2px 8px; border-radius:6px; border:1px solid var(--border); background:rgba(128,128,128,0.08); }
    .prob-quad-badge { font-size:0.71rem; font-weight:600; padding:2px 8px; border-radius:99px; }
    .prob-quad-badge.ganador     { background:rgba(16,185,129,0.16); color:#10b981; }
    .prob-quad-badge.polarizante { background:rgba(245,158,11,0.16); color:#f59e0b; }
    .prob-quad-badge.tibio       { background:rgba(59,130,246,0.15); color:#3b82f6; }
    .prob-quad-badge.rechazar    { background:rgba(239,68,68,0.15);  color:#ef4444; }
    .prob-pred-badge { background:#10b981; color:#fff; font-size:0.7rem; font-weight:700; padding:2px 7px; border-radius:99px; }
    .prob-cand-msgs { font-size:0.79rem; line-height:1.42; display:flex; flex-direction:column; gap:3px; }
    .prob-cand-tradeoff { font-size:0.74rem; color:var(--muted); font-style:italic; }
    .prob-alert-box { padding:6px 9px; border-radius:6px; font-size:0.76rem; display:flex; flex-direction:column; gap:4px; }
    .prob-alert-box.sev-1 { background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.4); color:#ef4444; }
    .prob-alert-box.sev-2 { background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.4); color:#f59e0b; }
    .prob-alert-box.sev-3 { background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.4); color:#3b82f6; }
    .prob-alert-main { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
    .prob-alert-more-btn { background:transparent; border:1px solid currentColor; color:inherit; border-radius:99px; font-size:0.68rem; padding:1px 7px; cursor:pointer; opacity:0.85; }
    .prob-alert-extra { display:none; padding-top:4px; border-top:1px dashed rgba(128,128,128,0.3); font-size:0.73rem; color:var(--muted); }
    .prob-alert-extra.open { display:flex; flex-direction:column; gap:3px; }
    .prob-discarded-details { font-size:0.78rem; color:var(--muted); margin-top:4px; }
    .prob-discarded-details summary { cursor:pointer; font-weight:500; user-select:none; padding:4px 0; }
  `;
  document.head.appendChild(st);
})();

function genOptLabel(rawOp, q = null) {
  if (q) return normalizeOption(q, rawOp).label;
  if (rawOp && typeof rawOp === 'object') {
    const s = String(rawOp.nombre || '');
    return s.includes('|') ? s.split('|').slice(1).join('|') : s;
  }
  const s = String(rawOp ?? '');
  return s.includes('|') ? s.split('|').slice(1).join('|') : s;
}

function pcParts() {
  const badge = div('pc-badge'), panel = div('pc-panel');
  badge.addEventListener('click', () => panel.classList.toggle('open'));
  return [badge, panel];
}

function callApiAuth(payload) {
  if (typeof apiAuth === 'function') return apiAuth(payload);
  if (typeof apiPost === 'function') return apiPost(payload);
  return api(payload);
}

function renumberCasas(listEl) {
  if (!listEl) return;
  listEl.querySelectorAll('.casa-num').forEach((el, idx) => {
    el.textContent = idx + 1;
  });
}

function appendMetaBadges(targetEl, rawOp) {
  if (rawOp && typeof rawOp === 'object' && rawOp.precio) {
    const precio = document.createElement('span');
    precio.className = 'casa-precio';
    precio.textContent = rawOp.precio;
    targetEl.appendChild(precio);
  }
  const km = optKmFromSchema(rawOp);
  if (km != null) {
    const dist = document.createElement('span');
    dist.className = 'opt-dist';
    dist.title = 'Distancia al punto de partida común';
    dist.textContent = fmtKm(km);
    targetEl.appendChild(dist);
  }
}

// ── EDITOR VISUAL INLINE Y BORRADO DE OPCIONES (Sin prompt/confirm) ─────────
var lastHorariosRange = null;

function addGeoFieldsToDrawer(drawerOrHost, rawOp) {
  const g = rawOp && typeof rawOp === 'object' ? rawOp.geo : null;
  let geoTxt = '';
  let initialCoords = null;

  if (typeof g === 'string') {
    geoTxt = g;
    initialCoords = parseCoordStr(g);
  } else if (g && typeof g === 'object') {
    geoTxt = String(g.texto || '');
    const lat = Number(g.lat), lng = Number(g.lng);
    if (isFinite(lat) && isFinite(lng) && (lat !== 0 || lng !== 0)) {
      initialCoords = { lat, lng };
      if (!geoTxt) geoTxt = `${lat},${lng}`;
    }
  }

  const geoHost = div('opt-edit-field');
  geoHost.style.cssText = 'flex:2;min-width:200px';
  geoHost.innerHTML = `
    <label>📍 Destino para el mapa</label>
    <input type="text" class="inp-eo-geo" value="${esc(geoTxt)}" placeholder="Calle, ciudad o coordenadas «40.4168,-3.7038»">
    <div class="geo-preview" style="display:none"></div>
    <div style="display:flex;gap:6px;margin-top:6px">
      <button type="button" class="btn-pc btn-geo-search">🔎 Buscar en el mapa</button>
      <span class="geo-status" style="font-size:0.75rem;color:var(--muted);align-self:center"></span>
    </div>
  `;

  const gridTarget = (drawerOrHost && typeof drawerOrHost.querySelector === 'function' && drawerOrHost.querySelector('.opt-edit-grid'))
    || drawerOrHost;
  if (gridTarget && typeof gridTarget.appendChild === 'function') {
    gridTarget.appendChild(geoHost);
  }

  const inpGeo    = geoHost.querySelector('.inp-eo-geo');
  const prev      = geoHost.querySelector('.geo-preview');
  const status    = geoHost.querySelector('.geo-status');
  const btnSearch = geoHost.querySelector('.btn-geo-search');
  let lastCoords  = initialCoords;
  let searchAbort = null;
  let lastSearchTs = 0;

  const showPrev = c => {
    lastCoords = c;
    prev.style.display = 'block';
    const orig = puntoPartida();
    const distTxt = orig ? `<b>${fmtKm(haversineKm(orig, c))}</b> desde el punto de partida · ` : '';
    prev.innerHTML = distTxt +
      `<a href="https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=15/${c.lat}/${c.lng}" target="_blank" rel="noopener">${c.lat.toFixed(4)}, ${c.lng.toFixed(4)} ↗</a>`;
  };
  const hidePrev = () => { lastCoords = null; prev.style.display = 'none'; };

  if (initialCoords) showPrev(initialCoords);

  inpGeo.addEventListener('input', () => {
    const c = parseCoordStr(inpGeo.value);
    if (c) showPrev(c); else hidePrev();
  });

  const doSearch = async () => {
    const q = inpGeo.value.trim();
    if (!q) { status.textContent = 'Escribe algo que buscar'; return; }

    const direct = parseCoordStr(q);
    if (direct) {
      showPrev(direct);
      status.innerHTML = '<i class="fa-solid fa-check"></i> Coordenadas válidas';
      return;
    }

    const now = Date.now();
    if (now - lastSearchTs < 1000) {
      status.textContent = 'Espera un segundo…';
      return;
    }
    lastSearchTs = now;

    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();

    btnSearch.disabled = true;
    status.textContent = 'Buscando…';
    try {
      const res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), {
        headers: { 'Accept-Language': 'es' },
        signal: searchAbort.signal,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const arr = await res.json();
      if (arr && arr.length) {
        const c = { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
        inpGeo.value = arr[0].display_name;
        showPrev(c);
        status.innerHTML = '<i class="fa-solid fa-check"></i> Encontrado';
      } else {
        hidePrev();
        status.textContent = '✗ Sin resultados';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      status.textContent = '✗ Error de red';
    } finally {
      btnSearch.disabled = false;
    }
  };

  btnSearch.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    doSearch();
  });

  const getGeo = () => {
    if (lastCoords) return Object.assign({ texto: inpGeo.value.trim() }, lastCoords);
    const c = parseCoordStr(inpGeo.value);
    if (c) return Object.assign({ texto: inpGeo.value.trim() }, c);
    const t = inpGeo.value.trim();
    return t ? { texto: t } : null;
  };
  return { getGeo, hidePrev };
}

function createOptionCrudControls(item, q, rawOp) {
  const qid    = q.id;
  const norm   = normalizeOption(q, rawOp);
  const isCasa = q.tipo === 'casas' || (q.tipo === 'probabilidad-opcion' && (norm.url || norm.foto || (q.config && q.config.modoCasas)));
  const isRad  = q.tipo === 'radio';
  const optKey = norm.key;

  const hasPipe  = norm.hasPipe;
  const radKey   = hasPipe ? norm.key : '';
  const curLabel = norm.label;

  const wrap  = div('opt-crud-btns');
  const bEdit = document.createElement('button');
  bEdit.type = 'button'; bEdit.className = 'btn-opt-crud'; bEdit.title = 'Editar opción'; bEdit.textContent = '✎';
  const bDel  = document.createElement('button');
  bDel.type  = 'button'; bDel.className  = 'btn-opt-crud danger'; bDel.title = 'Eliminar opción'; bDel.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  wrap.append(bEdit, bDel);

  const drawer = div('opt-edit-drawer');
  drawer.style.display = 'none';

  const openEditView = () => {
    drawer.style.display = 'flex';
    drawer.className = 'opt-edit-drawer mode-edit';
    let geoCtl = null;
    if (isCasa) {
      drawer.innerHTML = `
        <div class="opt-edit-grid">
          <div class="opt-edit-field" style="flex:2;min-width:160px">
            <label>Nombre del alojamiento / opción</label>
            <input type="text" class="inp-eo-nombre" value="${esc(norm.label)}" placeholder="Ej. Casa Rural El Pinar">
          </div>
          <div class="opt-edit-field" style="flex:1;min-width:100px">
            <label>Precio</label>
            <input type="text" class="inp-eo-precio" value="${esc(norm.precio)}" placeholder="Ej. 450 €">
          </div>
          <div class="opt-edit-field" style="flex:2;min-width:180px">
            <label>Enlace (URL)</label>
            <input type="text" class="inp-eo-url" value="${esc(norm.url)}" placeholder="https://...">
          </div>
          <div class="opt-edit-field" style="flex:2;min-width:180px">
            <label>Foto (URL de imagen)</label>
            <input type="text" class="inp-eo-foto" value="${esc(norm.foto)}" placeholder="https://…/foto.jpg">
          </div>
        </div>
        <div class="opt-edit-actions">
          <button type="button" class="btn-pc btn-eo-cancel">Cancelar</button>
          <button type="button" class="btn-propose btn-eo-save">Guardar cambios</button>
        </div>
      `;
      geoCtl = addGeoFieldsToDrawer(drawer, rawOp);
    } else {
      drawer.innerHTML = `
        <div class="opt-edit-single">
          <input type="text" class="inp-eo-text" value="${esc(curLabel)}" placeholder="Texto de la opción…">
          <input type="text" class="inp-eo-precio-gen" value="${esc(norm.precio)}" placeholder="Precio opcional (Ej. 450 €)" style="max-width:170px">
          <button type="button" class="btn-pc btn-eo-cancel">Cancelar</button>
          <button type="button" class="btn-propose btn-eo-save">Guardar</button>
        </div>
        <div class="opt-edit-grid opt-edit-grid-gen"></div>
      `;
      geoCtl = addGeoFieldsToDrawer(drawer.querySelector('.opt-edit-grid-gen'), rawOp);
    }

    const firstInp = drawer.querySelector('input');
    if (firstInp) { firstInp.focus(); firstInp.select(); }

    const closeDrawer = () => { drawer.style.display = 'none'; drawer.innerHTML = ''; };
    drawer.querySelector('.btn-eo-cancel').addEventListener('click', closeDrawer);

    const saveBtn = drawer.querySelector('.btn-eo-save');
    saveBtn.addEventListener('click', async () => {
      if (!user) return;
      let nuevaOpcion, newKey;

      if (isCasa) {
        const nombre = drawer.querySelector('.inp-eo-nombre').value.trim();
        const precio = drawer.querySelector('.inp-eo-precio').value.trim();
        const url    = safeUrl(drawer.querySelector('.inp-eo-url').value);
        const foto   = safeUrl(drawer.querySelector('.inp-eo-foto').value);
        if (!nombre) { drawer.querySelector('.inp-eo-nombre').focus(); return; }
        nuevaOpcion = { nombre, precio, url, foto };
        const geo = geoCtl && geoCtl.getGeo();
        if (geo) nuevaOpcion.geo = geo;
        newKey = nombre;
      } else {
        const txt = drawer.querySelector('.inp-eo-text').value.trim();
        if (!txt) { drawer.querySelector('.inp-eo-text').focus(); return; }
        const precio = drawer.querySelector('.inp-eo-precio-gen').value.trim();
        const geo = geoCtl && geoCtl.getGeo();
        const fullNombre = hasPipe ? `${radKey}|${txt}` : txt;
        newKey = hasPipe ? radKey : txt;

        if (precio || geo) {
          nuevaOpcion = { nombre: fullNombre, precio };
          if (geo) nuevaOpcion.geo = geo;
        } else {
          nuevaOpcion = fullNombre;
        }
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';

      const card = cardFor(qid);
      const prevVal = (card && TIPOS[q.tipo]) ? TIPOS[q.tipo].read(card, q) : null;

      try {
        await callApiAuth({
          action: 'edit_opcion',
          eid: user.eid, nombre: user.nombre, pinHash: user.pinHash,
          questionId: qid, oldOptKey: optKey, nuevaOpcion,
        });

        const idx = (q.opciones || []).findIndex(o => optVal(q, o) === optKey);
        if (idx >= 0) q.opciones[idx] = nuevaOpcion;

        renderAllQuestions();
        restoreDraft();

        const newCard = cardFor(qid);
        if (newCard && prevVal != null && newKey !== optKey) {
          if (q.tipo === 'checkbox' && Array.isArray(prevVal)) {
            TIPOS.checkbox.write(newCard, q, prevVal.map(v => v === optKey ? newKey : v));
          } else if ((q.tipo === 'voto-ponderado' || q.tipo === 'probabilidad-opcion') && typeof prevVal === 'object') {
            if (optKey in prevVal) { prevVal[newKey] = prevVal[optKey]; delete prevVal[optKey]; }
            TIPOS[q.tipo].write(newCard, q, prevVal);
          } else if (q.tipo === 'casas' && Array.isArray(prevVal)) {
            TIPOS.casas.write(newCard, q, prevVal.map(c => (c.nombre === optKey ? { nombre: newKey, precio: nuevaOpcion.precio } : c)));
          } else if (q.tipo === 'radio') {
            if (typeof prevVal === 'object' && prevVal !== null) {
              if (prevVal.estado === optKey) prevVal.estado = newKey;
              TIPOS.radio.write(newCard, q, prevVal);
            } else if (prevVal === optKey) {
              TIPOS.radio.write(newCard, q, newKey);
            }
          }
          triggerSave();
        }

        showStatus('Opción actualizada', 'ok', 2000);
        pollOnce();
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = isCasa ? 'Guardar cambios' : 'Guardar';
        showStatus('No se pudo editar la opción: ' + err.message, 'err');
      }
    });

    drawer.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('keydown', ev => {
        if (ev.key === 'Enter')  { ev.preventDefault(); saveBtn.click(); }
        if (ev.key === 'Escape') { ev.preventDefault(); closeDrawer(); }
      });
    });
  };

  const openDeleteView = () => {
    drawer.style.display = 'flex';
    drawer.className = 'opt-edit-drawer mode-delete';
    drawer.innerHTML = `
      <div class="inline-confirm-bar">
        <span>¿Eliminar la opción <b>«${esc(curLabel)}»</b> para todo el grupo?</span>
        <div style="display:flex;gap:6px">
          <button type="button" class="btn-pc btn-del-cancel">Cancelar</button>
          <button type="button" class="btn-pc btn-pc-contra btn-del-confirm">Sí, eliminar</button>
        </div>
      </div>
    `;

    drawer.querySelector('.btn-del-cancel').addEventListener('click', () => {
      drawer.style.display = 'none';
      drawer.innerHTML = '';
    });

    const confirmBtn = drawer.querySelector('.btn-del-confirm');
    confirmBtn.addEventListener('click', async () => {
      if (!user) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Eliminando…';
      try {
        await callApiAuth({
          action: 'delete_opcion',
          eid: user.eid, nombre: user.nombre, pinHash: user.pinHash,
          questionId: qid, optKey,
        });
        if (Array.isArray(q.opciones)) {
          q.opciones = q.opciones.filter(o => optVal(q, o) !== optKey);
        }
        const parentList = item.parentElement;
        const card = item.closest('.card');
        item.remove();
        if (parentList) renumberCasas(parentList);
        if (q.tipo === 'voto-ponderado' && card) updatePondRulesBar(card);
        if (isRad && card) {
          const checked = card.querySelector('input[type=radio]:checked');
          toggleConditionalStepper(card, checked ? checked.value : null);
        }
        triggerSave();
        showStatus('Opción eliminada', 'ok', 2000);
        pollOnce();
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Sí, eliminar';
        showStatus('No se pudo eliminar: ' + err.message, 'err');
      }
    });
  };

  bEdit.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    if (drawer.style.display !== 'none' && drawer.classList.contains('mode-edit')) {
      drawer.style.display = 'none';
    } else {
      openEditView();
    }
  });

  bDel.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    if (drawer.style.display !== 'none' && drawer.classList.contains('mode-delete')) {
      drawer.style.display = 'none';
    } else {
      openDeleteView();
    }
  });

  return { buttons: wrap, drawer };
}

// ── CONSTRUCTORES DE ÍTEMS CON DRAWER VISUAL INTEGRADO ──────────────────────
function _rawOptPara(q, op) {
  if (op && typeof op === 'object') return op;
  const list = q.opciones || [];
  const targetKey = optVal(q, op);
  const found = list.find(o => o && typeof o === 'object' && optVal(q, o) === targetKey);
  return found || op;
}

function createOptItem(q, rawOp) {
  const qObj = typeof q === 'object' ? q : (schema.find(x => x.id === q) || { id: q, tipo: 'checkbox' });
  const norm = normalizeOption(qObj, rawOp);
  const item = div('opt-item');
  item.dataset.qid = qObj.id;
  item.dataset.val = norm.key;

  const row = div('opt-row-with-crud');
  const lbl = document.createElement('label'); lbl.className = 'opt-label'; lbl.style.flex = '1';
  const inp = document.createElement('input'); inp.type = 'checkbox'; inp.value = norm.key;
  const chk = document.createElement('span');  chk.className = 'check';
  const txt = document.createElement('span');  txt.style.flex = '1'; txt.textContent = norm.label;
  lbl.append(inp, chk, txt);

  appendMetaBadges(lbl, rawOp);
  inp.addEventListener('change', triggerSave);

  const crud = createOptionCrudControls(item, qObj, rawOp);
  row.append(lbl, crud.buttons);

  const [badge, panel] = pcParts();
  item.append(row, crud.drawer, badge, panel);
  return item;
}

function createPondItem(q, rawOp) {
  const qObj = typeof q === 'object' ? q : (schema.find(x => x.id === q) || { id: q, tipo: 'voto-ponderado' });
  const norm = normalizeOption(qObj, rawOp);
  const item = div('opt-item pond-item');
  item.dataset.qid = qObj.id;
  item.dataset.val = norm.key;

  const row  = div('pond-row');
  const nameWrap = div();
  nameWrap.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;flex-wrap:wrap';
  const name = document.createElement('span');
  name.style.cssText = 'font-size:0.9rem;font-weight:500;flex:1';
  name.textContent = norm.label;
  nameWrap.appendChild(name);
  appendMetaBadges(nameWrap, rawOp);

  const grp  = div('btn-group-pond');
  const btns = [-1, 1, 3].map(s => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn-pond';
    b.dataset.score = s; b.textContent = s > 0 ? '+' + s : String(s);
    return b;
  });
  grp.append(...btns);

  const crud = createOptionCrudControls(item, qObj, rawOp);
  row.append(nameWrap, grp, crud.buttons);

  btns.forEach(btn => btn.addEventListener('click', () => {
    const score = btn.dataset.score, wasActive = btn.classList.contains('active');
    btns.forEach(b => b.classList.remove('active'));
    if (!wasActive) {
      if (score === '3' || score === '-1') {
        const list = item.closest('.options-list');
        const conflicto = list && list.querySelector(`.btn-pond.active[data-score="${score}"]`);
        if (conflicto) conflicto.classList.remove('active');
      }
      btn.classList.add('active');
    }
    const card = item.closest('.card');
    if (card) updatePondRulesBar(card);
    triggerSave();
  }));

  const [badge, panel] = pcParts();
  item.append(row, crud.drawer, badge, panel);
  return item;
}

function createCasaItem(q, op, n) {
  const qObj = typeof q === 'object' ? q : (schema.find(x => x.id === q) || { id: q, tipo: 'casas' });
  const norm = normalizeOption(qObj, op);
  const item = div('opt-item');
  item.dataset.qid = qObj.id;
  item.dataset.val = norm.key;

  const row = div('casa-row');
  const url = safeUrl(norm.url);
  const anchor = url ? document.createElement('a') : document.createElement('span');
  anchor.className = 'casa-num' + (url ? '' : ' no-link');
  if (url) {
    anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    anchor.title = 'Abrir enlace del alojamiento';
    anchor.addEventListener('click', e => e.stopPropagation());
  }
  anchor.textContent = n;

  const lbl = document.createElement('label'); lbl.className = 'casa-label';
  const inp = document.createElement('input'); inp.type = 'checkbox'; inp.value = norm.key;
  const chk = document.createElement('span');  chk.className = 'check';
  const txt = document.createElement('span');  txt.style.flex = '1'; txt.textContent = norm.label;
  lbl.append(inp, chk, txt);
  inp.addEventListener('change', triggerSave);

  const precio = document.createElement('span');
  precio.className = 'casa-precio'; precio.textContent = norm.precio;
  const kmCasa = optKmFromSchema(op);
  if (kmCasa != null) {
    const dist = document.createElement('span');
    dist.className = 'opt-dist'; dist.title = 'Distancia al punto de partida común';
    dist.textContent = fmtKm(kmCasa);
    row.appendChild(dist);
  }
  const foto = safeUrl(norm.foto);
  let thumb = null;
  if (foto) {
    thumb = document.createElement('img');
    thumb.className = 'casa-foto'; thumb.src = foto; thumb.alt = norm.label;
    thumb.loading = 'lazy'; thumb.referrerPolicy = 'no-referrer';
    thumb.addEventListener('error', () => thumb.remove());
    thumb.addEventListener('click', () => window.open(foto, '_blank', 'noopener'));
  }
  const crud = createOptionCrudControls(item, qObj, op);
  row.append(anchor, ...(thumb ? [thumb] : []), lbl, precio, crud.buttons);

  const [badge, panel] = pcParts();
  item.append(row, crud.drawer, badge, panel);
  return item;
}

function createRadioItem(card, q, rawOp) {
  const norm = normalizeOption(q, rawOp);
  const item = div('opt-item');
  item.dataset.qid = q.id;
  item.dataset.val = norm.key;

  const row = div('opt-row-with-crud');
  const lbl = document.createElement('label'); lbl.className = 'opt-label'; lbl.style.flex = '1';
  const inp = document.createElement('input'); inp.type = 'radio'; inp.name = 'radio-' + q.id; inp.value = norm.key;
  const chk = document.createElement('span');  chk.className = 'check check-radio';
  const txt = document.createElement('span');  txt.style.flex = '1'; txt.textContent = ' ' + norm.label;
  lbl.append(inp, chk, txt);

  appendMetaBadges(lbl, rawOp);

  inp.addEventListener('change', () => {
    toggleConditionalStepper(card, inp.value);
    triggerSave();
  });

  const crud = createOptionCrudControls(item, q, rawOp);
  row.append(lbl, crud.buttons);
  item.append(row, crud.drawer);
  return item;
}

// ══════════════════════════════════════════════════════════════════════════
// TIPO: `probabilidad-opcion` (Solo captura individual; cálculo en optimizador.js)
// ══════════════════════════════════════════════════════════════════════════

const ESCALA_PROB_6 = [
  { id: 'nunca',       label: 'No voy',                 val: 0.00, pct: '0%',   desc: 'Veto: no iría bajo ningún concepto' },
  { id: 'poco_prob',   label: 'Poco probable',          val: 0.20, pct: '20%',  desc: 'Preferencia fuerte en contra' },
  { id: 'quizas',      label: 'Quizás / ns',            val: 0.40, pct: '40%',  desc: 'Indecisión genuina a la baja' },
  { id: 'probable',    label: 'Probable',               val: 0.6, pct: '60%',  desc: 'Indecisión genuina a la alta' },
  { id: 'casi_seguro', label: 'Bastante seguro',        val: 0.80, pct: '80%',  desc: 'Aprobación fuerte' },
  { id: 'seguro',      label: 'Seguro',                 val: 0.98, pct: '98%*', desc: 'Compromiso total (truncado internamente a 0.98)' },
];

const ESCALA_PROB_5 = [
  { id: 'nunca',       label: 'No voy',             val: 0.00, pct: '0%',   desc: 'Veto: no iría bajo ningún concepto' },
  { id: 'poco_prob',   label: 'Poco probable',      val: 0.25, pct: '25%',  desc: 'Preferencia fuerte en contra' },
  { id: 'quizas',      label: 'Quizás / ns',        val: 0.50, pct: '50%',  desc: 'Indecisión genuina' },
  { id: 'probable',    label: 'Probable',           val: 0.75, pct: '75%',  desc: 'Aprobación clara' },
  { id: 'casi_seguro', label: 'Casi seguro',        val: 0.98, pct: '98%',  desc: 'Compromiso firme (máximo operativo 0.98)' },
];

// Garantiza que ningún valor almacenado supere 0.98 ni sea negativo (§3)
function clipProbabilidad(p) {
  const n = Number(p);
  if (!isFinite(n) || n <= 0) return 0.00;
  return Math.min(0.98, Math.round(n * 100) / 100);
}

function getEscalaProbabilidad(q) {
  const cfg = (q && q.config) || {};
  if (Array.isArray(cfg.escala) && cfg.escala.length) {
    return cfg.escala.map(c => ({
      id:    c.id || String(c.val),
      label: c.label || String(c.val),
      val:   clipProbabilidad(c.val),
      pct:   c.pct || (Math.round(clipProbabilidad(c.val) * 100) + '%'),
      desc:  c.desc || '',
    }));
  }
  if (cfg.escala === 5 || cfg.categorias === 5) return ESCALA_PROB_5;
  return ESCALA_PROB_6;
}

function normProbOpcion(v) {
  if (!v) return {};
  if (Array.isArray(v)) {
    const o = {};
    v.forEach(k => { o[k] = 0.75; });
    return o;
  }
  if (typeof v !== 'object') return {};
  const out = {};
  Object.entries(v).forEach(([k, rawVal]) => {
    const num = Number(rawVal);
    if (!isFinite(num)) return;
    if (num === -1)     out[k] = 0.20;
    else if (num === 3) out[k] = 0.95;
    else if (num > 1 && num <= 100) out[k] = clipProbabilidad(num / 100);
    else out[k] = clipProbabilidad(num);
  });
  return out;
}

function createProbItem(q, rawOp, n) {
  const qObj   = typeof q === 'object' ? q : (schema.find(x => x.id === q) || { id: q, tipo: 'probabilidad-opcion' });
  const norm   = normalizeOption(qObj, rawOp);
  const escala = getEscalaProbabilidad(qObj);
  const isCasaLike = !!(norm.url || norm.foto || (qObj.config && qObj.config.modoCasas));

  const item = div('opt-item prob-item');
  item.dataset.qid = qObj.id;
  item.dataset.val = norm.key;

  const topRow = div('prob-top-row');
  const leftWrap = div();
  leftWrap.style.cssText = 'display:flex;align-items:center;gap:8px;flex:1;flex-wrap:wrap';

  if (isCasaLike) {
    const url = safeUrl(norm.url);
    const anchor = url ? document.createElement('a') : document.createElement('span');
    anchor.className = 'casa-num' + (url ? '' : ' no-link');
    if (url) {
      anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
      anchor.title = 'Abrir enlace del alojamiento';
      anchor.addEventListener('click', e => e.stopPropagation());
    }
    anchor.textContent = n;
    leftWrap.appendChild(anchor);

    const foto = safeUrl(norm.foto);
    if (foto) {
      const thumb = document.createElement('img');
      thumb.className = 'casa-foto'; thumb.src = foto; thumb.alt = norm.label;
      thumb.loading = 'lazy'; thumb.referrerPolicy = 'no-referrer';
      thumb.addEventListener('error', () => thumb.remove());
      thumb.addEventListener('click', () => window.open(foto, '_blank', 'noopener'));
      leftWrap.appendChild(thumb);
    }
  }

  const name = document.createElement('span');
  name.style.cssText = 'font-size:0.9rem;font-weight:500;flex:1';
  name.textContent = norm.label;
  leftWrap.appendChild(name);
  appendMetaBadges(leftWrap, rawOp);

  const crud = createOptionCrudControls(item, qObj, rawOp);
  topRow.append(leftWrap, crud.buttons);

  // Botonera de categorías verbales absolutas (§3)
  const scaleRow = div('prob-scale-row');
  const btns = escala.map(cat => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-prob-cat';
    b.dataset.prob = String(cat.val);
    b.title = cat.desc || `${cat.label} (${cat.val})`;
    b.innerHTML = `<span>${esc(cat.label)}</span><small>${esc(cat.pct)}</small>`;
    return b;
  });
  scaleRow.append(...btns);

  btns.forEach(btn => btn.addEventListener('click', () => {
    const wasActive = btn.classList.contains('active');
    btns.forEach(b => b.classList.remove('active'));
    if (!wasActive) btn.classList.add('active');
    triggerSave();
  }));

  const [badge, panel] = pcParts();
  item.append(topRow, scaleRow, crud.drawer, badge, panel);
  return item;
}

function checkedValues(card) {
  return [...card.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value);
}

function createStepper(min, max, initial, onChange) {
  let v = initial;
  const wrap = div('stepper');
  const m  = document.createElement('button'); m.type = 'button'; m.textContent = '−';
  const sp = document.createElement('span');   sp.textContent = v;
  const p  = document.createElement('button'); p.type = 'button'; p.textContent = '+';
  const set = n => {
    const num = Number(n);
    if (!isFinite(num)) return;
    v = Math.max(min, Math.min(max, num));
    sp.textContent = v;
  };
  m.addEventListener('click', () => { set(v - 1); if (onChange) onChange(v); });
  p.addEventListener('click', () => { set(v + 1); if (onChange) onChange(v); });
  wrap.append(m, sp, p);
  return { el: wrap, get: () => v, set };
}

function updatePondRulesBar(card) {
  const bar = card.querySelector('.pond-rules-bar');
  if (!bar) return;
  const has3   = !!card.querySelector('.btn-pond.active[data-score="3"]');
  const hasM1  = !!card.querySelector('.btn-pond.active[data-score="-1"]');
  const count1 = card.querySelectorAll('.btn-pond.active[data-score="1"]').length;

  const p3  = bar.querySelector('[data-rule="3"]');
  const p1  = bar.querySelector('[data-rule="1"]');
  const pm1 = bar.querySelector('[data-rule="-1"]');

  if (p3)  { p3.classList.toggle('used', has3);       p3.innerHTML  = `<i class="fa-solid fa-star"></i> Favorito (+3): <b>${has3 ? 'Asignado' : '1 disp.'}</b>`; }
  if (p1)  { p1.classList.toggle('used', count1 > 0); p1.innerHTML  = `<i class="fa-solid fa-check"></i> Me vale (+1): <b>${count1}</b>`; }
  if (pm1) { pm1.classList.toggle('used', hasM1);      pm1.innerHTML = `<i class="fa-solid fa-xmark"></i> Veto (-1): <b>${hasM1 ? 'Asignado' : '1 disp.'}</b>`; }
}

// ── FEATURE 5: EMPAREJAMIENTO DINÁMICO COCHES <-> PASAJEROS Y BALANCE ────────
var LS_EXTRA_PARTICIPANTS = 'viajes:extra_parts';

function getExtraParticipants() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_EXTRA_PARTICIPANTS) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function addExtraParticipant(name) {
  const clean = String(name || '').trim();
  if (!clean) return;
  const cur = new Set(getExtraParticipants());
  cur.add(clean);
  try { localStorage.setItem(LS_EXTRA_PARTICIPANTS, JSON.stringify([...cur])); } catch (e) {}
}

function getGroupTransportSnapshot(q, card) {
  const qid = q.id;
  const cs  = (card && card.state && card.state.stepperCfg) || getRadioStepperConfig(q);
  const driverVal = cs ? cs.when : 'coche';
  const capKey    = (cs && cs.key) || 'valor';
  const myName    = (typeof user !== 'undefined' && user && user.nombre) ? String(user.nombre).trim() : '';

  const byUser = new Map();

  const registerUserAnswer = (nombreRaw, ans) => {
    const nombre = String(nombreRaw || '').trim();
    if (!nombre) return;
    const uAns = (ans && typeof ans === 'object' && qid in ans) ? ans[qid] : ans;
    if (uAns == null) {
      if (!byUser.has(nombre)) byUser.set(nombre, { nombre, isDriver: false, isPassenger: false, plazas: 0, notaRuta: '' });
      return;
    }
    const estado = (typeof uAns === 'object') ? uAns.estado : String(uAns);
    const isDriver = estado === driverVal;
    const isPassenger = !!estado && estado !== driverVal;
    const plazas = isDriver ? (Number(uAns && uAns[capKey]) || (cs && cs.default) || 3) : 0;
    const notaRuta = (uAns && typeof uAns === 'object' && uAns.notaRuta) ? String(uAns.notaRuta) : '';
    byUser.set(nombre, { nombre, isDriver, isPassenger, plazas, notaRuta, raw: uAns });
  };

  const candidates = [
    typeof respuestas !== 'undefined' ? respuestas : null,
    typeof allRespuestas !== 'undefined' ? allRespuestas : null,
    window.respuestas, window.allRespuestas, window.surveyResponses,
    window.pollData && window.pollData.respuestas,
    window.estadoGrupo && window.estadoGrupo.respuestas,
    window.data && window.data.respuestas,
  ].filter(Boolean);

  candidates.forEach(src => {
    if (Array.isArray(src)) {
      src.forEach(entry => {
        if (!entry || typeof entry !== 'object') return;
        const name = entry.nombre || entry.user || entry.usuario || entry.name;
        const ansObj = entry.respuestas || entry.datos || entry.answers || entry;
        if (name) registerUserAnswer(name, ansObj);
      });
    } else if (typeof src === 'object') {
      Object.entries(src).forEach(([k, val]) => {
        if (val && typeof val === 'object' && (val.respuestas || val.datos)) {
          registerUserAnswer(val.nombre || k, val.respuestas || val.datos);
        } else {
          registerUserAnswer(k, val);
        }
      });
    }
  });

  const partLists = [
    typeof participantes !== 'undefined' ? participantes : null,
    window.participantes, window.usuarios, window.usersList,
    getExtraParticipants(),
  ].filter(Boolean);

  partLists.forEach(list => {
    if (Array.isArray(list)) {
      list.forEach(p => {
        const n = (p && typeof p === 'object') ? (p.nombre || p.name) : p;
        if (n && !byUser.has(String(n).trim())) registerUserAnswer(String(n).trim(), null);
      });
    }
  });

  if (card && myName) {
    const checked = card.querySelector('input[type=radio]:checked');
    const curVal  = checked ? checked.value : null;
    const curPlazas = (curVal === driverVal && card.state && card.state.stepper) ? card.state.stepper.get() : 0;
    const curNota = (card.state && card.state.notaRutaInp) ? card.state.notaRutaInp.value.trim() : '';
    byUser.set(myName, {
      nombre: myName,
      isDriver: curVal === driverVal,
      isPassenger: !!curVal && curVal !== driverVal,
      plazas: curPlazas,
      notaRuta: curNota,
    });
  }

  const all = [...byUser.values()];
  const others = all.filter(u => u.nombre.toLowerCase() !== myName.toLowerCase());
  const drivers = all.filter(u => u.isDriver);
  const passengers = all.filter(u => u.isPassenger);
  const totalSeats = drivers.reduce((acc, d) => acc + (Number(d.plazas) || 0), 0);

  return { all, others, drivers, passengers, totalSeats, myName, driverVal };
}

function renderTransportDynamicPanel(card, q) {
  if (!card || !card.state || !card.state.stepperCfg) return;
  const cs = card.state.stepperCfg;
  const wrap = card.querySelector('.trans-dynamic-wrap');
  if (!wrap) return;

  const checked = card.querySelector('input[type=radio]:checked');
  const curVal  = checked ? checked.value : null;
  const snap    = getGroupTransportSnapshot(q, card);

  const balBar = wrap.querySelector('.trans-balance-bar');
  if (balBar) {
    const net = snap.totalSeats - snap.passengers.length;
    let badgeCls = 'ok', badgeTxt = `<i class="fa-solid fa-check"></i> Cubierto (${net >= 0 ? '+' + net : net} plazas)`;
    if (snap.drivers.length === 0 && snap.passengers.length > 0) {
      badgeCls = 'err'; badgeTxt = `⚠️ Faltan ${snap.passengers.length} plazas (0 coches)`;
    } else if (net < 0) {
      badgeCls = 'err'; badgeTxt = `⚠️ Faltan ${Math.abs(net)} plazas`;
    } else if (net === 0 && snap.totalSeats > 0) {
      badgeCls = 'warn'; badgeTxt = '⚡ Plazas exactas (0 libres)';
    }
    const css = getComputedStyle(document.documentElement);
    const colorOK     = css.getPropertyValue('--ok').trim();
    const colorWarn   = css.getPropertyValue('--warn').trim();
    const colorErr    = css.getPropertyValue('--err').trim();
    const colorStar   = css.getPropertyValue('--star').trim();
    const driversColor    = snap.drivers.length > 0                  ? colorOK : colorWarn;
    const seatsColor      = snap.totalSeats > snap.passengers.length ? colorOK : colorErr;
    const passengersColor = snap.passengers.length > snap.totalSeats ? colorWarn : colorStar;

    balBar.innerHTML = `
      <span>
        <i class="fa-solid fa-car-side fa-lg" style="color:#5b95b3; margin-right:6px;"></i>
        <b style="color:${driversColor};">${snap.drivers.length}</b> ${snap.drivers.length === 1 ? 'coche' : 'coches'} con
        <b style="color:${seatsColor};">${snap.totalSeats}</b> plazas libres
        <span style="margin:0 10px; color:#aaa;">|</span>
        <i class="fa-solid fa-person fa-lg" style="color:#5b95b3; margin-right:6px;"></i>
        <b style="color:${passengersColor};">${snap.passengers.length}</b> ${snap.passengers.length === 1 ? 'pasajero' : 'pasajeros'}
      </span>
      <span class="trans-balance-badge ${badgeCls}">${badgeTxt}</span>
    `;
  }

  const matchHost = wrap.querySelector('.trans-match-host');
  const notaRow   = wrap.querySelector('.trans-nota-row');
  if (!matchHost) return;

  if (!curVal) {
    matchHost.innerHTML = '';
    if (notaRow) notaRow.style.display = 'none';
    return;
  }

  if (notaRow) {
    notaRow.style.display = 'flex';
    const notaInp = notaRow.querySelector('.trans-nota-inp');
    if (notaInp) {
      notaInp.placeholder = curVal === cs.when
        ? '📍 Salida / ruta de tu coche (ej. Salgo de Ciudad Real viernes 16:30)…'
        : '📍 Tu punto de recogida / horario (ej. Estoy en Tarancón a partir de las 17h)…';
    }
  }

  const isDriver = curVal === cs.when;
  const prefStore = isDriver
    ? (card.state.prefPasajeros || (card.state.prefPasajeros = {}))
    : (card.state.prefCoches    || (card.state.prefCoches = {}));

  const savedNames = Object.keys(prefStore);
  const poolMap = new Map();
  snap.others.forEach(u => poolMap.set(u.nombre, u));
  savedNames.forEach(n => {
    if (n.toLowerCase() !== snap.myName.toLowerCase() && !poolMap.has(n)) {
      poolMap.set(n, { nombre: n, isDriver: false, isPassenger: false, plazas: 0, notaRuta: '' });
    }
  });

  const candidates = [...poolMap.values()].sort((a, b) => {
    if (isDriver) return (b.isPassenger ? 1 : 0) - (a.isPassenger ? 1 : 0);
    return (b.isDriver ? 1 : 0) - (a.isDriver ? 1 : 0);
  });

  const titleTxt = isDriver
    ? '<i class="fa-solid fa-taxi" style="color: rgb(252, 255, 47); margin-right:6px;"></i> ¿A quién llevas en tu coche?'
    : '<i class="fa-solid fa-car" style="color: rgb(252, 255, 47); margin-right:6px;"></i> ¿En qué coche prefieres ir?';
  const subTxt = isDriver
    ? 'Pulsa para marcar a quién te viene de paso llevar (<i class="fa-solid fa-star"></i> Preferido) o evitar (<i class="fa-solid fa-xmark"></i>).'
    : 'Pulsa sobre un conductor para pedir ir en su coche (<i class="fa-solid fa-star"></i> Preferido) o evitar (<i class="fa-solid fa-xmark"></i>).';

  matchHost.innerHTML = `
    <div class="trans-pref-box">
      <div class="trans-pref-title">
        <span>${titleTxt}</span>
        <div class="trans-add-person">
          <input type="text" class="inp-add-trans-part" placeholder="+ Añadir persona…" maxlength="28">
          <button type="button" class="mini-cal-btn btn-add-trans-part" title="Añadir a la lista">+</button>
        </div>
      </div>
      <div class="trans-pref-sub">${subTxt}</div>
      <div class="trans-chips-list"></div>
    </div>
  `;

  const chipsList = matchHost.querySelector('.trans-chips-list');
  if (!candidates.length) {
    const emptyMsg = div();
    emptyMsg.style.cssText = 'font-size:0.76rem;color:var(--muted);padding:4px 0';
    emptyMsg.textContent = isDriver
      ? 'Aún no hay otros participantes registrados. Puedes añadir su nombre arriba (+).'
      : 'Aún nadie ha marcado que lleva coche. Puedes añadir el nombre de quien creas que conducirá (+).';
    chipsList.appendChild(emptyMsg);
  } else {
    candidates.forEach(cand => {
      const score = Number(prefStore[cand.nombre] || 0);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'trans-chip';
      if (score === 1 || score === -1) chip.dataset.pref = String(score);

      const paintChip = s => {
        const prefix = s === 1
          ? '<i class="fa-solid fa-star chip-star"></i> '
          : s === -1
            ? '<i class="fa-solid fa-xmark chip-x"></i> '
            : '';

        let meta = '';
        let metaIcon = '';

        if (!isDriver && cand.isDriver) {
          metaIcon = 'fa-car';
          meta = `${cand.plazas} pl.` + (cand.notaRuta ? ` · ${cand.notaRuta}` : '');
        } else if (isDriver && cand.isPassenger) {
          metaIcon = 'fa-person-walking';
          meta = 'Busca plaza' + (cand.notaRuta ? ` · ${cand.notaRuta}` : '');
        } else if (cand.isDriver) {
          metaIcon = 'fa-car';
          meta = 'Lleva coche';
        }

        const metaHtml = meta
          ? `<small>${metaIcon ? `<i class="fa-solid ${metaIcon} chip-ico fa-lg"></i> ` : ''}(${esc(meta)})</small>`
          : '';

        chip.innerHTML = `<span>${prefix}${esc(cand.nombre)}</span>` + metaHtml;
      };

      paintChip(score);

      chip.addEventListener('click', () => {
        const cur = Number(prefStore[cand.nombre] || 0);
        const next = cur === 0 ? 1 : (cur === 1 ? -1 : 0);
        if (next === 0) {
          delete prefStore[cand.nombre];
          delete chip.dataset.pref;
        } else {
          prefStore[cand.nombre] = next;
          chip.dataset.pref = String(next);
        }
        paintChip(next);
        triggerSave();
      });

      chipsList.appendChild(chip);
    });
  }

  const inpAdd = matchHost.querySelector('.inp-add-trans-part');
  const btnAdd = matchHost.querySelector('.btn-add-trans-part');
  const doAddPart = () => {
    const name = inpAdd.value.trim();
    if (!name) return;
    addExtraParticipant(name);
    prefStore[name] = 1;
    inpAdd.value = '';
    renderTransportDynamicPanel(card, q);
    triggerSave();
  };
  btnAdd.addEventListener('click', doAddPart);
  inpAdd.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); doAddPart(); }
  });
}

function toggleConditionalStepper(card, val) {
  const pw = card.querySelector('.plazas-wrap');
  const cs = card.state && card.state.stepperCfg;
  if (pw && cs) pw.style.display = val === cs.when ? 'flex' : 'none';
  if (cs && card.state && card.state.question) {
    renderTransportDynamicPanel(card, card.state.question);
  }
}

window.refreshTransportCards = function () {
  if (typeof schema === 'undefined' || !Array.isArray(schema)) return;
  schema.forEach(q => {
    if (q.tipo !== 'radio' || !getRadioStepperConfig(q)) return;
    const c = typeof cardFor === 'function' ? cardFor(q.id) : null;
    if (c) renderTransportDynamicPanel(c, q);
  });
};

// ── FEATURE 3: UTILIDADES DE MINI-CALENDARIO Y COMPACTACIÓN DE RANGOS ───────
const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOW_ES   = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function rangesToDateSet(rangos) {
  const set = new Set();
  (rangos || []).forEach(r => {
    const a = r.desde, b = r.hasta || r.desde;
    if (!a || !b || b < a) return;
    const cur = new Date(a + 'T00:00:00Z'), end = new Date(b + 'T00:00:00Z');
    for (let g = 0; cur <= end && g < 366; g++, cur.setUTCDate(cur.getUTCDate() + 1)) {
      set.add(cur.toISOString().slice(0, 10));
    }
  });
  return set;
}

function dateSetToRanges(set) {
  const sorted = [...set].filter(Boolean).sort();
  const out = [];
  let cur = null;
  sorted.forEach(iso => {
    if (cur && diffDaysISO(cur.hasta, iso) === 1) {
      cur.hasta = iso;
    } else {
      cur = { desde: iso, hasta: iso };
      out.push(cur);
    }
  });
  return out;
}

function getMonthDatesISO(year, month0) {
  const out = [];
  const d = new Date(Date.UTC(year, month0, 1));
  while (d.getUTCMonth() === month0) {
    const iso = d.toISOString().slice(0, 10);
    const dow = (d.getUTCDay() + 6) % 7;
    out.push({ iso, day: d.getUTCDate(), dow });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function addDateRange(card, desde = null, hasta = null, skipCalSync = false) {
  const list = card.querySelector('.ranges-list');
  if (!list) return;
  const row = div('date-range-row');
  const minAttr = (desde || hasta) ? '' : `min="${hoyLocal()}"`;
  row.innerHTML = `<label>Desde</label><input type="date" class="range-from" ${minAttr}><span class="sep">→</span><label>Hasta</label><input type="date" class="range-to" ${minAttr}><button type="button" class="btn-remove" title="Quitar"><i class="fa-solid fa-xmark"></i></button>`;
  const from = row.querySelector('.range-from');
  const to   = row.querySelector('.range-to');
  if (desde) from.value = desde;
  if (hasta) to.value   = hasta;

  const onInputChange = () => {
    if (card.state && card.state.syncCalFromInputs) card.state.syncCalFromInputs();
    triggerSave();
  };

  from.addEventListener('change', () => {
    if (from.value && (!to.value || to.value < from.value)) to.value = from.value;
    onInputChange();
  });
  to.addEventListener('change', () => {
    if (to.value && (!from.value || to.value < from.value)) from.value = to.value;
    onInputChange();
  });
  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
    onInputChange();
  });
  list.appendChild(row);
  if (!skipCalSync && card.state && card.state.syncCalFromInputs) {
    card.state.syncCalFromInputs();
  }
}

function buildDisponibilidadMiniCalendar(card) {
  const todayISO = hoyLocal();
  const initDate = new Date(todayISO + 'T00:00:00Z');
  let viewYear   = initDate.getUTCFullYear();
  let viewMonth  = initDate.getUTCMonth();
  let selectedDates = new Set();
  let isDragging = false;
  let dragMode   = true;

  const wrap = div('mini-cal-wrap');
  wrap.innerHTML = `
    <div class="mini-cal-bar">
      <div class="mini-cal-nav">
        <button type="button" class="mini-cal-btn cal-prev" title="Mes anterior">‹</button>
        <span class="cal-title" style="min-width:125px;text-align:center"></span>
        <button type="button" class="mini-cal-btn cal-next" title="Mes siguiente">›</button>
      </div>
      <div class="mini-cal-presets">
        <button type="button" class="mini-cal-btn cal-wknd-3" title="Marcar todos los Viernes, Sábados y Domingos del mes">+ Fines de semana (V–D)</button>
        <button type="button" class="mini-cal-btn cal-wknd-2" title="Marcar todos los Sábados y Domingos del mes">+ Sáb–Dom</button>
        <button type="button" class="mini-cal-btn cal-clear" title="Limpiar selección de este mes">Limpiar mes</button>
      </div>
    </div>
    <div class="mini-cal-grid"></div>
  `;

  const titleEl = wrap.querySelector('.cal-title');
  const gridEl  = wrap.querySelector('.mini-cal-grid');

  const syncInputsFromCal = () => {
    const list = card.querySelector('.ranges-list');
    if (!list) return;
    const compacted = dateSetToRanges(selectedDates);
    list.innerHTML = '';
    if (compacted.length) {
      compacted.forEach(r => addDateRange(card, r.desde, r.hasta, true));
    } else {
      addDateRange(card, null, null, true);
    }
    triggerSave();
  };

  const renderGrid = () => {
    titleEl.textContent = `${MESES_ES[viewMonth]} ${viewYear}`;
    gridEl.innerHTML = '';
    DOW_ES.forEach(d => {
      const h = div('mini-cal-dow', d);
      gridEl.appendChild(h);
    });

    const days = getMonthDatesISO(viewYear, viewMonth);
    const firstDow = days.length ? days[0].dow : 0;
    for (let i = 0; i < firstDow; i++) {
      gridEl.appendChild(div('mini-cal-day empty'));
    }

    days.forEach(({ iso, day, dow }) => {
      const cell = div('mini-cal-day', String(day));
      const isPast = iso < todayISO;
      if (dow >= 4) cell.classList.add('weekend');
      if (isPast) cell.classList.add('disabled');
      if (selectedDates.has(iso)) cell.classList.add('selected');

      if (!isPast) {
        const applyDay = (select) => {
          if (select) selectedDates.add(iso);
          else selectedDates.delete(iso);
          cell.classList.toggle('selected', select);
        };

        cell.addEventListener('pointerdown', e => {
          e.preventDefault();
          isDragging = true;
          dragMode = !selectedDates.has(iso);
          applyDay(dragMode);
        });
        cell.addEventListener('pointerenter', () => {
          if (isDragging) applyDay(dragMode);
        });
      }
      gridEl.appendChild(cell);
    });
  };

  window.addEventListener('pointerup', () => {
    if (isDragging) {
      isDragging = false;
      syncInputsFromCal();
    }
  });

  const syncCalFromInputs = () => {
    const rows = [...card.querySelectorAll('.date-range-row')].map(r => {
      const d = r.querySelector('.range-from').value || null;
      const h = r.querySelector('.range-to').value   || null;
      return { desde: d || h, hasta: h || d };
    }).filter(r => r.desde && r.hasta);
    selectedDates = rangesToDateSet(rows);
    renderGrid();
  };

  wrap.querySelector('.cal-prev').addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderGrid();
  });
  wrap.querySelector('.cal-next').addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderGrid();
  });

  const addWeekendsOfMonth = (includeFriday) => {
    const minDow = includeFriday ? 4 : 5;
    getMonthDatesISO(viewYear, viewMonth).forEach(({ iso, dow }) => {
      if (iso >= todayISO && dow >= minDow) selectedDates.add(iso);
    });
    renderGrid();
    syncInputsFromCal();
  };

  wrap.querySelector('.cal-wknd-3').addEventListener('click', () => addWeekendsOfMonth(true));
  wrap.querySelector('.cal-wknd-2').addEventListener('click', () => addWeekendsOfMonth(false));
  wrap.querySelector('.cal-clear').addEventListener('click', () => {
    getMonthDatesISO(viewYear, viewMonth).forEach(({ iso }) => selectedDates.delete(iso));
    renderGrid();
    syncInputsFromCal();
  });

  card.state.syncCalFromInputs = syncCalFromInputs;
  renderGrid();
  return wrap;
}

// ── PUNTO DE PARTIDA COMÚN Y DISTANCIAS ─────────────────────────────────────
var LS_PARTIDA = 'viajes:partida';

function parseCoordStr(s) {
  const m = String(s || '').trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)[\s,]+(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.'));
  const lng = parseFloat(m[2].replace(',', '.'));
  if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function geoDeOp(op) {
  if (!op || typeof op !== 'object' || !op.geo) return null;
  const g = op.geo;
  if (typeof g === 'string') return parseCoordStr(g);
  const lat = Number(g.lat), lng = Number(g.lng);
  if (isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
    return { lat, lng };
  }
  return null;
}

function haversineKm(a, b) {
  if (!a || !b) return null;
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function fmtKm(km) {
  if (km == null || !isFinite(km)) return '';
  return km >= 100 ? Math.round(km) + ' km' : (Math.round(km * 10) / 10) + ' km';
}

function puntoPartida() {
  try {
    const raw = localStorage.getItem(LS_PARTIDA);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && isFinite(p.lat) && isFinite(p.lng)) return p;
    }
  } catch (e) {}
  return null;
}

function setPuntoPartida(p) {
  try {
    if (p) localStorage.setItem(LS_PARTIDA, JSON.stringify(p));
    else localStorage.removeItem(LS_PARTIDA);
  } catch (e) {}
}

function optKmFromSchema(op) {
  const origin = puntoPartida();
  const dest   = geoDeOp(op);
  if (!origin || !dest) return null;
  return haversineKm(origin, dest);
}

const TOGGLES_DISP = [
  ['noSe',           'No sé mi disponibilidad (cuenta según tu probabilidad de asistir)'],
  ['irYVenir',       'Plan de ir y venir en el día (sin dormir fuera)'],
  ['soloFinde',      'Solo puedo fines de semana'],
  ['meDaIgual',      'Me da igual entre semana o fin de semana'],
  ['preferirPuente', 'Mejor si hay puente / festivo'],
];

var TIPOS = {

  checkbox: {
    build(card, q) {
      const list = div('options-list'); list.dataset.qid = q.id;
      (q.opciones || []).forEach(op => list.appendChild(createOptItem(q, _rawOptPara(q, op))));
      card.append(list, createAddOptForm(q));
    },
    read: card => checkedValues(card),
    write(card, q, vals) {
      const set = new Set(vals || []);
      card.querySelectorAll('input[type=checkbox]').forEach(i => { i.checked = set.has(i.value); });
    },
    addOption(card, q, op, select) {
      const list = card.querySelector('.options-list');
      if (!list) return null;
      const item = createOptItem(q, _rawOptPara(q, op));
      if (select) item.querySelector('input').checked = true;
      list.appendChild(item);
      return item;
    },
  },

  'voto-ponderado': {
    build(card, q) {
      const rulesBar = div('pond-rules-bar');
      rulesBar.innerHTML = `
        <span class="rule-pill" data-rule="3"><i class="fa-solid fa-star"></i> Favorito (+3): <b>1 disp.</b></span>
        <span class="rule-pill" data-rule="1"><i class="fa-solid fa-check"></i> Me vale (+1): <b>0</b></span>
        <span class="rule-pill" data-rule="-1"><i class="fa-solid fa-xmark"></i> Veto (-1): <b>1 disp.</b></span>
      `;
      const list = div('options-list'); list.dataset.qid = q.id;
      (q.opciones || []).forEach(op => list.appendChild(createPondItem(q, _rawOptPara(q, op))));
      card.append(rulesBar, list, createAddOptForm(q));
    },
    read(card) {
      const dict = {};
      card.querySelectorAll('.pond-item').forEach(item => {
        const b = item.querySelector('.btn-pond.active');
        if (b) dict[item.dataset.val] = parseInt(b.dataset.score, 10);
      });
      return dict;
    },
    write(card, q, dict) {
      card.querySelectorAll('.btn-pond.active').forEach(b => b.classList.remove('active'));
      Object.entries(normPond(dict) || {}).forEach(([val, score]) => {
        const item = findItem(card, val);
        const b = item && item.querySelector(`.btn-pond[data-score="${score}"]`);
        if (b) b.classList.add('active');
      });
      updatePondRulesBar(card);
    },
    addOption(card, q, op) {
      const list = card.querySelector('.options-list');
      if (!list) return null;
      const item = createPondItem(q, _rawOptPara(q, op));
      list.appendChild(item);
      return item;
    },
  },

  // ── `probabilidad-opcion`: Solo captura individual sin mostrar el consenso del grupo ──
  'probabilidad-opcion': {
    build(card, q) {
      card.state.question = q;
      const hint = div();
      hint.style.cssText = 'font-size:0.79rem;color:var(--muted);margin-bottom:8px';
      hint.innerHTML = 'Declara tu probabilidad absoluta de asistir al viaje si sale elegida cada opción (<b>Nunca</b> = veto duro; <b>Seguro</b> se acota a 0.95 para simulación):';

      const list = div('options-list');
      list.dataset.qid = q.id;
      (q.opciones || []).forEach((op, i) => {
        list.appendChild(createProbItem(q, _rawOptPara(q, op), i + 1));
      });

      const useCasaForm = (q.config && q.config.modoCasas) ||
        (q.opciones || []).some(o => o && typeof o === 'object' && (o.url || o.foto));
      const addForm = (useCasaForm && typeof createAddCasaForm === 'function')
        ? createAddCasaForm(q)
        : createAddOptForm(q);

      card.append(hint, list, addForm);
    },
    read(card) {
      const dict = {};
      card.querySelectorAll('.prob-item').forEach(item => {
        const b = item.querySelector('.btn-prob-cat.active');
        if (b) dict[item.dataset.val] = clipProbabilidad(b.dataset.prob);
      });
      return dict;
    },
    write(card, q, dict) {
      card.querySelectorAll('.btn-prob-cat.active').forEach(b => b.classList.remove('active'));
      const normDict = normProbOpcion(dict);
      const escala   = getEscalaProbabilidad(q);

      Object.entries(normDict).forEach(([val, prob]) => {
        const item = findItem(card, val);
        if (!item) return;
        let bestBtn = item.querySelector(`.btn-prob-cat[data-prob="${prob}"]`);
        if (!bestBtn && escala.length) {
          let bestCat = escala[0];
          let minDiff = Math.abs(prob - bestCat.val);
          escala.forEach(c => {
            const d = Math.abs(prob - c.val);
            if (d < minDiff) { minDiff = d; bestCat = c; }
          });
          bestBtn = item.querySelector(`.btn-prob-cat[data-prob="${bestCat.val}"]`);
        }
        if (bestBtn) bestBtn.classList.add('active');
      });
    },
    addOption(card, q, op, select) {
      const list = card.querySelector('.options-list');
      if (!list) return null;
      const n = list.children.length + 1;
      const item = createProbItem(q, _rawOptPara(q, op), n);
      if (select) {
        const defaultBtn = item.querySelector('.btn-prob-cat[data-prob="0.9"]') ||
                           item.querySelector('.btn-prob-cat[data-prob="0.75"]');
        if (defaultBtn) defaultBtn.classList.add('active');
      }
      list.appendChild(item);
      renumberCasas(list);
      return item;
    },
  },

  casas: {
    build(card, q) {
      const list = div('options-list'); list.dataset.qid = q.id;
      (q.opciones || []).forEach((op, i) => list.appendChild(createCasaItem(q, op, i + 1)));
      card.append(list, createAddCasaForm(q));
    },
    read(card, q) {
      return [...card.querySelectorAll('.opt-item')]
        .filter(it => it.querySelector('input[type=checkbox]').checked)
        .map(it => {
          const op = (q.opciones || []).find(o => optVal(q, o) === it.dataset.val);
          return { nombre: it.dataset.val, precio: (op && op.precio) || null };
        });
    },
    write(card, q, casas) {
      const nombres = new Set((casas || []).map(c => typeof c === 'string' ? c : c.nombre));
      card.querySelectorAll('input[type=checkbox]').forEach(i => { i.checked = nombres.has(i.value); });
    },
    addOption(card, q, op, select) {
      const list = card.querySelector('.options-list');
      if (!list) return null;
      const n = list.querySelectorAll('.casa-row').length + 1;
      const item = createCasaItem(q, op, n);
      if (select) item.querySelector('input').checked = true;
      list.appendChild(item);
      renumberCasas(list);
      return item;
    },
  },

  horarios: {
    build(card, q) {
      const cfg = q.config || {};
      card.state.franjas  = getFranjas(q);
      card.state.duracion = createStepper(1, 12, cfg.duracionIdeal ?? 3, triggerSave);

      const wrap = div('horarios-builder');
      wrap.innerHTML = `
        <div class="hor-section">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <div style="font-size:0.88rem;font-weight:600">1. ¿Qué días (o intervalos de días) y franjas puedes?</div>
            <button type="button" class="mini-cal-btn btn-hor-wknd" title="Añadir los próximos 4 fines de semana">+ Fines de semana del mes</button>
          </div>
          <div style="font-size:0.78rem;color:var(--muted)">Cada bloque es un intervalo de fechas (puede ser un solo día) con las franjas en las que estás libre.</div>
          <div class="day-slots-list"></div>
          <button type="button" class="btn-add btn-add-slot" style="margin-top:8px">+ Añadir intervalo de días y franjas</button>
        </div>

        <div class="hor-section" style="margin-top:20px;padding-top:16px;border-top:1px dashed var(--border)">
          <div style="font-size:0.88rem;font-weight:600">2. Restricciones horarias (clases, trabajo, exámenes…)</div>
          <div style="font-size:0.78rem;color:var(--muted)">Indica cuándo estás ocupado (en un intervalo de fechas o todos los días) para calcular si cuadramos o te unes al salir.</div>
          <div class="restricciones-list"></div>
          <button type="button" class="btn-add btn-add-rest" style="margin-top:8px">+ Añadir restricción horaria</button>
        </div>

        <div class="dias-row" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border)">
          <span style="font-size:0.88rem;color:var(--muted)">Duración que te apetece para el plan (horas):</span>
          <div class="dur-stepper-slot"></div>
        </div>`;

      wrap.querySelector('.dur-stepper-slot').appendChild(card.state.duracion.el);
      wrap.querySelector('.btn-add-slot').addEventListener('click', () => { addDaySlotRow(card); triggerSave(); });
      wrap.querySelector('.btn-add-rest').addEventListener('click', () => { addRestriccionRow(card); triggerSave(); });

      wrap.querySelector('.btn-hor-wknd').addEventListener('click', () => {
        const list = card.querySelector('.day-slots-list');
        const existing = [...list.querySelectorAll('.day-slot-row')];
        if (existing.length === 1 && existing[0].querySelector('.slot-from').value === hoyLocal()) {
          list.innerHTML = '';
        }
        const cur = new Date(hoyLocal() + 'T00:00:00Z');
        let added = 0;
        for (let g = 0; g < 35 && added < 4; g++, cur.setUTCDate(cur.getUTCDate() + 1)) {
          if (cur.getUTCDay() === 5) {
            const fri = cur.toISOString().slice(0, 10);
            const sunD = new Date(cur); sunD.setUTCDate(sunD.getUTCDate() + 2);
            const sun = sunD.toISOString().slice(0, 10);
            addDaySlotRow(card, { desde: fri, hasta: sun });
            added++;
          }
        }
        triggerSave();
      });

      card.appendChild(wrap);
      addDaySlotRow(card);
    },
    read(card) {
      const disponibilidades = [...card.querySelectorAll('.day-slot-row')].map(r => {
        const desde = r.querySelector('.slot-from').value || null;
        const hasta = r.querySelector('.slot-to').value || desde;
        return { desde, hasta, franjas: [...r.querySelectorAll('.franja-pill.active')].map(b => b.dataset.fid) };
      }).filter(d => d.desde && d.franjas.length);
      if (disponibilidades.length) lastHorariosRange = disponibilidades[0];

      const restricciones = [...card.querySelectorAll('.restriccion-row')].map(r => {
        const fd = r.querySelector('.rest-fd').value || null;
        const fh = r.querySelector('.rest-fh').value || fd;
        return {
          motivo: r.querySelector('.rest-motivo').value,
          fechaDesde: fd,
          fechaHasta: fh,
          desde: r.querySelector('.rest-desde').value || null,
          hasta: r.querySelector('.rest-hasta').value || null,
          meUnoAlSalir: r.querySelector('.rest-join-after').checked,
        };
      }).filter(r => r.desde && r.hasta);

      return { disponibilidades, restricciones, duracionHoras: card.state.duracion.get() };
    },
    write(card, q, v) {
      if (!v) return;
      if (v.duracionHoras != null && card.state.duracion) card.state.duracion.set(v.duracionHoras);
      if (Array.isArray(v.disponibilidades)) {
        card.querySelector('.day-slots-list').innerHTML = '';
        if (v.disponibilidades.length) v.disponibilidades.forEach(d => addDaySlotRow(card, d));
        else addDaySlotRow(card);
      }
      if (Array.isArray(v.restricciones)) {
        card.querySelector('.restricciones-list').innerHTML = '';
        v.restricciones.forEach(r => addRestriccionRow(card, r));
      }
    },
  },

  slider: {
    build(card, q) {
      const cfg  = q.config || {};
      const min  = cfg.min ?? 10, max = cfg.max ?? 500, step = cfg.step ?? 10;
      const def  = cfg.default ?? Math.round((min + max) / 2);
      const unit = cfg.unit ?? (q.id === 'precio' ? ' €' : '');
      const supportsDual = cfg.dual !== false && (cfg.dual === true || q.id === 'precio' || String(unit).includes('€'));

      const display = div('price-display');
      const slider  = document.createElement('input');
      slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step; slider.value = def;

      let hardCapToggle = null;
      let sliderMax     = null;
      let maxValLabel   = null;
      let dualBox       = null;

      const paint = () => {
        const idealVal = +slider.value;
        const pctIdeal = max > min ? ((idealVal - min) / (max - min)) * 100 : 0;
        slider.style.setProperty('--pct', pctIdeal + '%');

        if (supportsDual && hardCapToggle && hardCapToggle.checked && sliderMax) {
          if (+sliderMax.value < idealVal) sliderMax.value = idealVal;
          const capVal = +sliderMax.value;
          const pctCap = max > min ? ((capVal - min) / (max - min)) * 100 : 0;
          sliderMax.style.setProperty('--pct', pctCap + '%');
          if (maxValLabel) maxValLabel.textContent = capVal + unit;
          display.innerHTML = `${esc(idealVal + unit)} <span class="price-display-sub">(Tope máx: ${esc(capVal + unit)})</span>`;
        } else {
          display.textContent = idealVal + unit;
        }
      };

      slider.addEventListener('input', () => {
        if (sliderMax && +sliderMax.value < +slider.value) sliderMax.value = slider.value;
        paint();
        triggerSave();
      });

      const labels = div('price-labels');
      labels.innerHTML = `<span>${esc(min + unit)}</span><span>${esc(max + unit)}</span>`;
      card.append(display, slider, labels);

      if (supportsDual) {
        const defaultCap = Math.min(max, Math.round((def + step * 3) / step) * step);
        const toggleLbl = document.createElement('label');
        toggleLbl.className = 'dual-slider-toggle';
        hardCapToggle = document.createElement('input');
        hardCapToggle.type = 'checkbox';
        toggleLbl.append(hardCapToggle);

        const txt = document.createElement('span');
        txt.innerHTML = ' <i class="fa-solid fa-arrow-up-right-dots" aria-hidden="true" style="margin-right:0.25em;"></i> Fijar también un límite máximo estricto';
        toggleLbl.appendChild(txt);

        dualBox = div('dual-slider-box');
        dualBox.style.display = 'none';
        dualBox.innerHTML = `
          <div class="dual-slider-head">
            <span>Límite máximo innegociable (Hard Cap):</span>
            <b class="dual-max-val"></b>
          </div>
          <input type="range" class="slider-hard-cap" min="${min}" max="${max}" step="${step}" value="${defaultCap}">
          <div style="font-size:0.73rem;color:var(--muted);margin-top:4px">El grupo intentará ajustarse a tu presupuesto cómodo, sin superar nunca este tope.</div>
        `;
        sliderMax   = dualBox.querySelector('.slider-hard-cap');
        maxValLabel = dualBox.querySelector('.dual-max-val');

        hardCapToggle.addEventListener('change', () => {
          dualBox.style.display = hardCapToggle.checked ? 'block' : 'none';
          if (hardCapToggle.checked && +sliderMax.value < +slider.value) {
            sliderMax.value = Math.min(max, +slider.value + step * 2);
          }
          paint();
          triggerSave();
        });

        sliderMax.addEventListener('input', () => {
          if (+sliderMax.value < +slider.value) slider.value = sliderMax.value;
          paint();
          triggerSave();
        });

        card.append(toggleLbl, dualBox);
      }

      paint();
      card.state.slider        = slider;
      card.state.sliderMax     = sliderMax;
      card.state.hardCapToggle = hardCapToggle;
      card.state.dualBox       = dualBox;
      card.state.paint         = paint;
    },
    read(card) {
      const ideal = +card.state.slider.value;
      if (card.state.hardCapToggle && card.state.hardCapToggle.checked && card.state.sliderMax) {
        const max = Math.max(ideal, +card.state.sliderMax.value);
        return { ideal, max, value: ideal };
      }
      return ideal;
    },
    write(card, q, v) {
      if (v == null || !card.state || !card.state.slider) return;
      if (typeof v === 'object') {
        const ideal = v.ideal ?? v.value ?? v.min;
        const max   = v.max ?? ideal;
        if (ideal != null) card.state.slider.value = ideal;
        if (card.state.hardCapToggle && card.state.sliderMax && max != null && max > ideal) {
          card.state.hardCapToggle.checked = true;
          card.state.sliderMax.value = max;
          if (card.state.dualBox) card.state.dualBox.style.display = 'block';
        } else if (card.state.hardCapToggle) {
          card.state.hardCapToggle.checked = false;
          if (card.state.dualBox) card.state.dualBox.style.display = 'none';
        }
      } else {
        card.state.slider.value = v;
        if (card.state.hardCapToggle) {
          card.state.hardCapToggle.checked = false;
          if (card.state.dualBox) card.state.dualBox.style.display = 'none';
        }
      }
      card.state.paint();
    },
  },

  radio: {
    build(card, q) {
      const wrap = div('transport-opts'); wrap.dataset.qid = q.id;
      const cs   = getRadioStepperConfig(q);
      card.state.question = q;
      if (cs) {
        card.state.stepperCfg    = cs;
        card.state.prefPasajeros = {};
        card.state.prefCoches    = {};
      }

      (q.opciones || []).forEach(op => wrap.appendChild(createRadioItem(card, q, _rawOptPara(q, op))));
      card.appendChild(wrap);

      if (cs) {
        card.state.stepper = createStepper(cs.min ?? 1, cs.max ?? 10, cs.default ?? 3, () => {
          renderTransportDynamicPanel(card, q);
          triggerSave();
        });
        const pw  = div('plazas-wrap');
        pw.style.display = 'none';
        const lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:0.9rem;color:var(--muted)';
        lbl.textContent = cs.label || 'Valor adicional:';
        pw.append(lbl, card.state.stepper.el);
        card.appendChild(pw);

        const dynWrap = div('trans-dynamic-wrap');
        dynWrap.innerHTML = `
          <div class="trans-balance-bar"></div>
          <div class="trans-match-host"></div>
          <div class="trans-nota-row" style="display:none">
            <input type="text" class="trans-nota-inp" maxlength="90" placeholder="📍 Punto de salida o nota de horario…">
          </div>
        `;
        const notaInp = dynWrap.querySelector('.trans-nota-inp');
        notaInp.addEventListener('change', () => {
          renderTransportDynamicPanel(card, q);
          triggerSave();
        });
        card.state.notaRutaInp = notaInp;
        card.appendChild(dynWrap);
        renderTransportDynamicPanel(card, q);
      }
      card.appendChild(createAddOptForm(q));
    },
    read(card, q) {
      const checked = card.querySelector('input[type=radio]:checked');
      if (!checked) return null;
      const cs = card.state.stepperCfg;
      if (cs) {
        const isDriver = checked.value === cs.when;
        const out = { estado: checked.value };
        if (isDriver && card.state.stepper) {
          out[cs.key || 'valor'] = card.state.stepper.get();
        }
        if (isDriver && card.state.prefPasajeros && Object.keys(card.state.prefPasajeros).length) {
          out.prefPasajeros = Object.assign({}, card.state.prefPasajeros);
        } else if (!isDriver && card.state.prefCoches && Object.keys(card.state.prefCoches).length) {
          out.prefCoches = Object.assign({}, card.state.prefCoches);
        }
        const nota = card.state.notaRutaInp ? card.state.notaRutaInp.value.trim() : '';
        if (nota) out.notaRuta = nota;
        return out;
      }
      return checked.value;
    },
    write(card, q, v) {
      if (v == null) return;
      const cs = card.state.stepperCfg;
      const estado = typeof v === 'object' ? v.estado : v;

      if (cs && typeof v === 'object') {
        card.state.prefPasajeros = (v.prefPasajeros && typeof v.prefPasajeros === 'object')
          ? Object.assign({}, v.prefPasajeros) : {};
        card.state.prefCoches = (v.prefCoches && typeof v.prefCoches === 'object')
          ? Object.assign({}, v.prefCoches) : {};
        if (card.state.notaRutaInp) {
          card.state.notaRutaInp.value = v.notaRuta ? String(v.notaRuta) : '';
        }
      }

      const key = cs && (cs.key || 'valor');
      if (typeof v === 'object' && key && v[key] != null && card.state.stepper) {
        card.state.stepper.set(v[key]);
      }

      const rad = [...card.querySelectorAll('input[type=radio]')].find(r => r.value === estado);
      if (rad) {
        rad.checked = true;
        if (cs) toggleConditionalStepper(card, estado);
      } else if (cs) {
        toggleConditionalStepper(card, null);
      }
    },
    addOption(card, q, op, select) {
      const wrap = card.querySelector('.transport-opts');
      if (!wrap) return null;
      const item = createRadioItem(card, q, _rawOptPara(q, op));
      wrap.appendChild(item);
      if (select) {
        const inp = item.querySelector('input');
        inp.checked = true;
        toggleConditionalStepper(card, inp.value);
      }
      return item;
    },
  },

  textarea: {
    build(card, q) {
      const content = div('textarea-comment md-content');
      content.innerHTML = q.config?.descripcion ? renderMarkdown(q.config.descripcion) : '';
      if (content.innerHTML) card.appendChild(content);
    },
    read: () => null,
    write: () => {},
  },

  disponibilidad: {
    build(card) {
      card.state.dias = createStepper(1, 30, 5, triggerSave);

      const sec = div();
      const lab = div();
      lab.style.cssText = 'font-size:0.85rem;color:var(--muted);margin-bottom:8px';
      lab.textContent = 'Selecciona tus días libres en el calendario (puedes arrastrar) o edita los rangos debajo:';

      const calEl = buildDisponibilidadMiniCalendar(card);
      const rl    = div('ranges-list');
      const add   = document.createElement('button');
      add.type = 'button'; add.className = 'btn-add'; add.textContent = '+ Añadir rango de fechas manualmente';
      add.addEventListener('click', () => { addDateRange(card); triggerSave(); });

      sec.append(lab, calEl, rl, add);
      card.appendChild(sec);
      addDateRange(card, null, null, true);

      const diasRow = div('dias-row');
      const dl = document.createElement('span');
      dl.style.cssText = 'font-size:0.9rem;color:var(--muted)';
      dl.textContent = 'Días máximos de viaje:';
      diasRow.append(dl, card.state.dias.el);
      card.appendChild(diasRow);

      const tw = div('toggle-wrap');
      TOGGLES_DISP.forEach(([k, text]) => {
        const lbl  = document.createElement('label'); lbl.className = 'toggle-label';
        const inp  = document.createElement('input'); inp.type = 'checkbox'; inp.dataset.k = k;
        const pill = document.createElement('span');  pill.className = 'toggle-pill';
        lbl.append(inp, pill, document.createTextNode(' ' + text));
        inp.addEventListener('change', triggerSave);
        tw.appendChild(lbl);
      });
      card.appendChild(tw);
    },
    read(card) {
      const rangos = [...card.querySelectorAll('.date-range-row')].map(r => {
        const d = r.querySelector('.range-from').value || null;
        const h = r.querySelector('.range-to').value   || null;
        return { desde: d || h, hasta: h || d };
      }).filter(r => r.desde && r.hasta);
      const out = { rangos, diasMax: card.state.dias.get() };
      TOGGLES_DISP.forEach(([k]) => { out[k] = card.querySelector(`input[data-k="${k}"]`).checked; });
      return out;
    },
    write(card, q, v) {
      if (!v) return;
      if (v.diasMax != null && card.state.dias) card.state.dias.set(v.diasMax);
      TOGGLES_DISP.forEach(([k]) => {
        const el = card.querySelector(`input[data-k="${k}"]`);
        if (el) el.checked = !!v[k];
      });
      if (Array.isArray(v.rangos) && v.rangos.length) {
        card.querySelector('.ranges-list').innerHTML = '';
        v.rangos.forEach(r => addDateRange(card, r.desde, r.hasta, true));
        if (card.state && card.state.syncCalFromInputs) card.state.syncCalFromInputs();
      }
    },
  },
};

// ── FRANJAS, MOTIVOS Y UTILIDADES DE HORARIOS ───────────────────────────────
const MOTIVOS_RESTRICCION = [
  { id: 'clase',   label: '📚 Clase / Prácticas' },
  { id: 'trabajo', label: '💼 Trabajo / Turno' },
  { id: 'examen',  label: '📝 Examen / Entrega' },
  { id: 'otro',    label: '⏳ Otro compromiso' },
];

function fmtHM(h) {
  const n = ((h % 24) + 24) % 24;
  let hh = Math.floor(n), mm = Math.round((n - hh) * 60);
  if (mm === 60) { hh = (hh + 1) % 24; mm = 0; }
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
const franjaSub = f => fmtHM(f.start) + '–' + fmtHM(f.end);

function mapToDisp(m) {
  const dias = [...m.keys()].filter(k => m.get(k).size).sort();
  const out = []; let cur = null;
  dias.forEach(f => {
    const key = [...m.get(f)].sort().join(',');
    if (cur && cur.key === key && diffDaysISO(cur.hasta, f) === 1) cur.hasta = f;
    else { cur = { key, desde: f, hasta: f, franjas: [...m.get(f)] }; out.push(cur); }
  });
  return out.map(({ desde, hasta, franjas }) => ({ desde, hasta, franjas }));
}

function restAplica(r, fecha) {
  const a = r.fechaDesde || r.fecha || '';
  const b = r.fechaHasta || r.fecha || r.fechaDesde || '';
  if (!a && !b) return true;
  return (!a || fecha >= a) && (!b || fecha <= b);
}

function buildFranjasEditor(host, franjas) {
  host.innerHTML = '';
  const list = div('franjas-editor');
  const addRow = f => {
    const row = div('franja-edit-row');
    row.dataset.fid = f.id || '';
    row.innerHTML = `
      <input type="text" class="fe-label" value="${esc(f.label)}" placeholder="Nombre (p.ej. 🍽️ Comida)" maxlength="24">
      <input type="time" class="fe-start" value="${fmtHM(f.start)}">
      <span>→</span>
      <input type="time" class="fe-end" value="${fmtHM(f.end)}">
      <button type="button" class="btn-remove" title="Quitar franja"><i class="fa-solid fa-xmark"></i></button>`;
    row.querySelector('.btn-remove').addEventListener('click', () => row.remove());
    list.appendChild(row);
  };
  franjas.forEach(addRow);
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'btn-add'; add.style.marginTop = '8px';
  add.textContent = '+ Añadir franja';
  add.addEventListener('click', () => addRow({ label: '', start: 18, end: 20 }));
  host.append(list, add);

  return () => [...list.querySelectorAll('.franja-edit-row')].map((r, i) => {
    const label = r.querySelector('.fe-label').value.trim();
    let s = parseHHMM(r.querySelector('.fe-start').value);
    let e = parseHHMM(r.querySelector('.fe-end').value);
    if (!label || s == null || e == null) return null;
    if (s < 6) s += 24;
    if (e <= s) e += 24;
    return { id: r.dataset.fid || ('f' + Date.now().toString(36) + i), label, start: s, end: e };
  }).filter(Boolean);
}

function addDaySlotRow(card, data = null) {
  const list = card.querySelector('.day-slots-list');
  if (!list) return;
  const franjas = card.state.franjas || FRANJAS_HORARIAS;
  const row = div('day-slot-row');
  const desde = (data && (data.desde || data.fecha)) || hoyLocal();
  const hasta = (data && (data.hasta || data.fecha)) || desde;
  let def = franjas.filter(f => ['comida', 'tarde', 'cena'].includes(f.id)).map(f => f.id);
  if (!def.length) def = franjas.map(f => f.id);
  const activas = new Set(data && Array.isArray(data.franjas) ? data.franjas : def);

  row.innerHTML = `
    <div class="day-slot-header">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label style="font-size:0.8rem;color:var(--muted)">Del</label>
        <input type="date" class="slot-from" value="${esc(desde)}">
        <label style="font-size:0.8rem;color:var(--muted)">al</label>
        <input type="date" class="slot-to" value="${esc(hasta)}">
      </div>
      <button type="button" class="btn-remove" title="Quitar intervalo"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="franjas-pills-row">
      ${franjas.map(f => `
        <button type="button" class="franja-pill ${activas.has(f.id) ? 'active' : ''}" data-fid="${esc(f.id)}">
          <span>${esc(f.label)}</span><small>${franjaSub(f)}</small>
        </button>`).join('')}
    </div>`;

  const from = row.querySelector('.slot-from'), to = row.querySelector('.slot-to');
  from.addEventListener('change', () => { if (from.value && (!to.value || to.value < from.value)) to.value = from.value; triggerSave(); });
  to.addEventListener('change',   () => { if (to.value && (!from.value || to.value < from.value)) from.value = to.value; triggerSave(); });
  row.querySelector('.btn-remove').addEventListener('click', () => { row.remove(); triggerSave(); });
  row.querySelectorAll('.franja-pill').forEach(btn =>
    btn.addEventListener('click', () => { btn.classList.toggle('active'); triggerSave(); }));
  list.appendChild(row);
}

function addRestriccionRow(card, data = null) {
  const list = card.querySelector('.restricciones-list');
  if (!list) return;
  const row = div('restriccion-row');
  const motivo = (data && data.motivo) || 'clase';
  const fd    = (data && (data.fechaDesde || data.fecha)) || '';
  const fh    = (data && (data.fechaHasta || data.fecha)) || '';
  const desde = (data && data.desde) || '16:00';
  const hasta = (data && data.hasta) || '20:00';
  const meUno = data && data.meUnoAlSalir !== undefined ? !!data.meUnoAlSalir : true;

  row.innerHTML = `
    <div class="rest-grid">
      <select class="rest-motivo">
        ${MOTIVOS_RESTRICCION.map(m => `<option value="${m.id}" ${m.id === motivo ? 'selected' : ''}>${m.label}</option>`).join('')}
      </select>
      <div class="rest-time-pair">
        <input type="date" class="rest-fd" value="${esc(fd)}" title="Desde (vacío = todos los días)">
        <span>→</span>
        <input type="date" class="rest-fh" value="${esc(fh)}" title="Hasta">
      </div>
      <div class="rest-time-pair">
        <input type="time" class="rest-desde" value="${esc(desde)}">
        <span>→</span>
        <input type="time" class="rest-hasta" value="${esc(hasta)}">
      </div>
      <button type="button" class="btn-remove" title="Eliminar restricción"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="rest-sub-opts">
      <label class="toggle-label" style="font-size:0.78rem;color:var(--muted)">
        <input type="checkbox" class="rest-join-after" ${meUno ? 'checked' : ''}>
        <span class="toggle-pill" style="transform:scale(0.8)"></span>
        <span>⚡ Puedo incorporarme en cuanto salga de esta obligación</span>
      </label>
      <span style="font-size:0.73rem;color:var(--muted)">* Sin fechas = todos los días. Si cruza medianoche (22:00→02:00) también vale.</span>
    </div>`;

  const fdI = row.querySelector('.rest-fd'), fhI = row.querySelector('.rest-fh');
  fdI.addEventListener('change', () => {
    if (fdI.value && (!fhI.value || fhI.value < fdI.value)) fhI.value = fdI.value;
    triggerSave();
  });
  fhI.addEventListener('change', () => {
    if (fhI.value && (!fdI.value || fhI.value < fdI.value)) fdI.value = fhI.value;
    triggerSave();
  });
  row.querySelector('.btn-remove').addEventListener('click', () => { row.remove(); triggerSave(); });
  row.querySelectorAll('select, input:not(.rest-fd):not(.rest-fh)').forEach(el => el.addEventListener('change', triggerSave));
  list.appendChild(row);
}