// ══════════════════════════════════════════════════════════════════════════
//  VISTA DE MAPA (Leaflet) — src/js/mapa.js
//  Muestra todos los destinos geolocalizados del cuestionario como marcadores
//  con popup enriquecido: foto(s), URL, precio, distancia al punto de partida
//  y nº de votos del grupo. Incluye editor del punto de partida común.
//  Requiere: leaflet CSS/JS (index.html), helpers de types.js (geoDeOp,
//  haversineKm, fmtKm, puntoPartida, setPuntoPartida, optKmFromSchema).
// ══════════════════════════════════════════════════════════════════════════

var LS_FOTO_EXTRA = 'viajes:fotoExtra';   // foto opcional por opción: {qid|nombre: url}
var _mapaInstance = null;
var _mapaLayer    = null;

function getFotosExtra() {
  try { return JSON.parse(localStorage.getItem(LS_FOTO_EXTRA) || '{}'); } catch (e) { return {}; }
}
function setFotoExtra(qid, nombre, url) {
  try {
    const m = getFotosExtra();
    const k = qid + '||' + nombre;
    if (url) m[k] = url; else delete m[k];
    localStorage.setItem(LS_FOTO_EXTRA, JSON.stringify(m));
  } catch (e) {}
}
function fotoExtraFor(qid, nombre) {
  return getFotosExtra()[qid + '||' + nombre] || '';
}

// Recoge todas las opciones geolocalizables del esquema (checkbox, casas, radio…)
// junto con los votos del grupo sobre cada una.
function collectGeoDestinations() {
  const out=[];
  for(const q of schema||[]){
    const cfg=q.config?.routeStudy;
    if(cfg?.destino){const d=cfg.destino;out.push({qid:q.id,pregunta:q.label,nombre:d.texto||'Destino del desplazamiento',geo:RouteStudy.point(d),address:d.texto||'',kind:'destination',fotos:[],enlaces:[],voters:[]});}
    for(const op of q.opciones||[]){
      if(!op||typeof op!=='object'||!op.geo)continue;
      const n=normalizeOption(q,op),geo=geoDeOp(op),address=typeof op.geo==='string'?op.geo:op.geo.texto||'';
      if(!geo&&!address)continue;
      const voters=[];for(const r of respuestas||[]){if(DecisionModel.applicability(q,r.answers||{},schema)!==1)continue;const v=extractAnswer(r.answers||{},q);if(v==null)continue;let yes;
        if(q.tipo==='voto-ponderado')yes=Number(v[n.key])>0;
        else if(q.tipo==='probabilidad-opcion')yes=Number(v[n.key]??0)>=.5;
        else if(Array.isArray(v))yes=v.some(x=>(typeof x==='object'?x?.nombre:x)===n.key);
        else yes=(typeof v==='object'?v.estado:v)===n.key;
        if(yes)voters.push(r.nombre);}
      out.push({qid:q.id,key:n.key,pregunta:q.label,nombre:n.label,geo,address,kind:'option',precio:optionPriceLabel(op),url:safeUrl(op.url),enlaces:optionLinks(op),fotos:[safeUrl(op.foto),safeUrl(fotoExtraFor(q.id,n.key))].filter(Boolean),km:optKmFromSchema(op),voters,raw:op});
    }
    if(cfg){const c=DecisionModel.cohorts(q,respuestas||[],schema);for(const r of c.answered){if(![getRadioStepperConfig(q)?.when,'necesito'].includes(r.value?.estado))continue;const a=r.value?.ruta,geo=RouteStudy.point(a?.origen);if(!geo)continue;out.push({qid:q.id,pregunta:q.label,nombre:r.nombre,geo,address:a.origen.texto||'',kind:'pickup',role:r.value.estado===getRadioStepperConfig(q)?.when?'Salida de conductor':'Punto de recogida',schedule:[a.desde,a.hasta].filter(Boolean).join('–'),fotos:[],enlaces:[],voters:[]});}}
  }
  return out;
}

function renderMapPopup(d, enSolucion) {
  const parts = [];
  parts.push(`<b style="font-size:0.95rem">${esc(d.nombre)}</b>`);
  parts.push(`<div style="font-size:0.72rem;color:#666;margin-bottom:4px">${esc(d.pregunta)}</div>`);
  if (d.fotos.length) {
    parts.push(`<img src="${esc(d.fotos[0])}" alt="" style="width:180px;max-height:110px;object-fit:cover;border-radius:6px;display:block;margin-bottom:6px" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`);
  }
  const meta = [];
  if (d.precio) meta.push(`Precio: ${esc(d.precio)}`);
  if (d.km != null) meta.push(`${fmtKm(d.km)} en línea recta desde tu salida`);
  if(d.address)meta.push(esc(d.address));if(d.role)meta.push(esc(d.role));if(d.schedule)meta.push(esc(d.schedule));
  if (meta.length) parts.push(`<div style="font-size:0.8rem;margin-bottom:4px">${meta.join(' · ')}</div>`);
  for (const [i,link] of (d.enlaces || []).entries()) { const u=safeUrl(link.url); if(u) parts.push(`<div style="margin-bottom:4px"><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(link.titulo || `Enlace ${i+1}`)}</a></div>`); }
  if(d.kind==='option')parts.push(`<div style="font-size:0.78rem">${d.voters.length ? 'Votado por: ' + d.voters.map(esc).join(', ') : 'Sin votos aún'}</div>`);else if(d.kind==='destination')parts.push('<b>Destino del estudio de transporte</b>');
  if (enSolucion) {
    parts.push(`<div style="font-size:0.75rem;color:#2f855a;margin-top:4px">Incluido en una solución factible del grupo</div>`);
  }
  return parts.join('');
}

function ensureMap(mapHost) {
  if (_mapaInstance) return;
  _mapaInstance = L.map(mapHost, { scrollWheelZoom: true }).setView([40.4168, -3.7038], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(_mapaInstance);
  _mapaLayer = L.layerGroup().addTo(_mapaInstance);
}

function refreshMapMarkers() {
  if(_mapaLayer)_mapaLayer.clearLayers();const all=collectGeoDestinations(),filter=document.getElementById('mt-map-filter'),legend=document.getElementById('mt-map-list');
  if(filter){const old=filter.value;const qs=[...new Map(all.map(x=>[x.qid,x.pregunta]))];filter.replaceChildren(new Option('Todas las preguntas',''),...qs.map(([id,n])=>new Option(n,id)));filter.value=qs.some(([id])=>id===old)?old:'';}
  const dests=all.filter(d=>!filter?.value||d.qid===filter.value),pts=[];
  if(legend)legend.replaceChildren();
  const colors={destination:'#299b6c',option:'#468bc1',pickup:'#b88941'};
  for(const d of dests){
    let marker=null;if(d.geo&&_mapaLayer){pts.push([d.geo.lat,d.geo.lng]);marker=L.circleMarker([d.geo.lat,d.geo.lng],{radius:d.kind==='destination'?11:8,color:colors[d.kind],fillColor:colors[d.kind],fillOpacity:.85,weight:3}).addTo(_mapaLayer).bindPopup(renderMapPopup(d,false));}
    if(!legend)continue;
    const row=div('mt-map-place');const title=div();title.innerHTML=`<i class="fa-solid ${d.kind==='destination'?'fa-flag-checkered':d.kind==='pickup'?'fa-person':'fa-location-dot'}" style="color:${colors[d.kind]}"></i> <b>${esc(d.nombre)}</b><small>${esc(d.pregunta)}${d.role?' · '+esc(d.role):''}${!d.geo?' · Sin punto confirmado':''}</small>`;row.append(title);
    if(marker){const b=document.createElement('button');b.type='button';b.className='btn-pc';b.textContent='Ver';b.onclick=()=>{_mapaInstance.setView([d.geo.lat,d.geo.lng],14);marker.openPopup();};row.append(b);}else if(!d.geo&&d.kind==='option'&&d.address&&respondentes.some(r=>r.nombre.toLowerCase()===user?.nombre?.toLowerCase()&&r.organizer===true)){const b=document.createElement('button');b.type='button';b.className='btn-pc';b.textContent='Localizar';b.onclick=()=>{b.disabled=true;const box=div('mt-map-fix');row.append(box);const picker=locationPicker(box);picker.writeText(d.address);const save=document.createElement('button');save.type='button';save.className='btn-pc';save.textContent='Guardar ubicación';save.onclick=async()=>{const geo=picker.read();if(!geo){showStatus('Selecciona el punto correcto primero.','err');return;}try{save.disabled=true;await apiAuth({action:'edit_opcion',...user,questionId:d.qid,oldOptKey:d.key,nuevaOpcion:{...d.raw,geo}});const data=await apiAuth({action:'all',...user});applyPollUpdate(data);refreshMapMarkers();}catch(e){showStatus(e.message,'err');save.disabled=false;}};box.append(save);};row.append(b);}
    legend.append(row);
  }
  if(legend&&!dests.length)legend.textContent='Todavía no hay opciones o puntos de transporte con ubicación guardada.';
  const origin=puntoPartida();if(origin&&_mapaLayer){pts.push([origin.lat,origin.lng]);L.circleMarker([origin.lat,origin.lng],{radius:8,color:'#b7791f',fillColor:'#f6e05e',fillOpacity:.9}).addTo(_mapaLayer).bindPopup('<b>Tu punto de partida</b>'+ (origin.texto?'<div>'+esc(origin.texto)+'</div>':''));}
  if(!_mapaInstance)return;
  if(pts.length===1)_mapaInstance.setView(pts[0],12);else if(pts.length>1)_mapaInstance.fitBounds(L.latLngBounds(pts).pad(.2),{maxZoom:15});
}

// ── Editor del punto de partida (propio y común del grupo) ─────────────────
function buildOriginEditor(host) {
  host.replaceChildren();const title=div('', 'Tu punto de partida (opcional)');host.append(title);const pickerHost=div();host.append(pickerHost);const picker=locationPicker(pickerHost);picker.write(puntoPartida());
  const actions=div('mt-geo-actions');const save=document.createElement('button');save.type='button';save.className='btn-pc';save.textContent='Fijar mi salida';save.onclick=()=>{const p=picker.read();if(!p){showStatus('Selecciona un punto de salida.','err');return;}setPuntoPartida(p);refreshMapMarkers();};const clear=document.createElement('button');clear.type='button';clear.className='btn-pc';clear.textContent='Borrar mi salida';clear.onclick=()=>{setPuntoPartida(null);picker.reset();refreshMapMarkers();};actions.append(save,clear);host.append(actions);
}

// ── Construcción de la vista completa ───────────────────────────────────────
function buildMapView(container) {
  container.innerHTML = '';

  const card = div('card');
  card.innerHTML = `
    <div class="card-title"><span class="num">M</span> Mapa de destinos</div>
    <p style="font-size:0.82rem;color:var(--muted);margin-bottom:10px">
      Opciones, destinos de transporte y puntos de salida o recogida. Azul: opción · verde: destino · ocre: salida/recogida. Las direcciones sin confirmar se enumeran debajo; no se inventan ubicaciones.
    </p>`;
  const originHost = div('mp-origin-editor');
  originHost.style.marginBottom = '10px';
  card.appendChild(originHost);

  const mapHost = div('map-view');
  mapHost.style.cssText = 'height:420px;border-radius:10px;border:1px solid var(--border);z-index:0';
  const filter=document.createElement('select');filter.id='mt-map-filter';filter.setAttribute('aria-label','Filtrar mapa por pregunta');filter.onchange=refreshMapMarkers;card.append(filter,mapHost);
  const list=div('mt-map-list');list.id='mt-map-list';card.append(list);
  container.appendChild(card);

  if (typeof L === 'undefined') {
    mapHost.style.height='auto';mapHost.innerHTML = '<p style="padding:16px;color:var(--accent)">Leaflet no está cargado (comprueba tu conexión CDN). Las ubicaciones guardadas se listan abajo.</p>';
    buildOriginEditor(originHost);refreshMapMarkers();return;
  }

  ensureMap(mapHost);
  setTimeout(() => _mapaInstance.invalidateSize(), 60);
  buildOriginEditor(originHost);
  refreshMapMarkers();
}
