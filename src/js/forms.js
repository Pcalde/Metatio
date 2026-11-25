// ── FORMULARIOS DE PROPUESTA ────────────────────────────────────────────────
const OPTION_TYPES = ['checkbox','radio','voto-ponderado','casas','probabilidad-opcion'];
const questionEditors = {};
function createAddOptForm(q) {
  const wrap = div('add-opt-form'), fields = div('add-opt-fields');
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'add-opt-trigger'; trigger.textContent = '+ Proponer opción';
  const editor = buildOptionEditor(q, '', {compact:true});
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn-propose'; btn.textContent = 'Proponer →';
  trigger.onclick = () => fields.classList.toggle('open');
  btn.onclick = async () => {
    let op; try { op = editor.read(); } catch(e) { showStatus(e.message,'err'); return; }
    if (!op) { editor.name.focus(); return; }
    btn.disabled = true;
    try {
      if (await submitNewOpcion(q, op)) { const fresh = createAddOptForm(q); wrap.replaceWith(fresh); }
    } finally { btn.disabled = false; }
  };
  fields.append(editor.el, btn); wrap.append(trigger,fields); return wrap;
}
function createAddCasaForm(q) { return createAddOptForm(q); }
async function submitNewOpcion(q, valor) {
  if (!valor || !user) return false;
  const card = cardFor(q.id), type = TIPOS[q.tipo];
  if (!card || !type || !type.addOption) return false;
  const key = optVal(q, valor);
  if (((schema.find(x=>x.id===q.id)||q).opciones || []).some(o => optVal(q,o) === key)) { showStatus('Ya existe una opción con ese nombre','err'); return false; }
  try {
    const result = await apiPost({action:'add_opcion',eid:user.eid,nombre:user.nombre,pinHash:user.pinHash,questionId:q.id,opcion:valor});
    if (result && result.duplicada) { showStatus('Ya existe esa opción','err'); return false; }
    const current = schema.find(x => x.id === q.id) || q;
    current.opciones = current.opciones || [];
    if (!current.opciones.some(o => optVal(current,o) === key)) current.opciones.push(valor);
    const currentCard = cardFor(q.id);
    if (currentCard && !findItem(currentCard,key)) type.addOption(currentCard,current,valor,true);
    refreshPC(q.id); triggerSave(); lastRaw = ''; await pollOnce(); return true;
  } catch(e) { showStatus('No se pudo añadir la opción: '+e.message,'err'); return false; }
}
function submitNewCasa(q, casa) { return submitNewOpcion(q,casa); }

// El mismo catálogo y los mismos campos para ambos formularios.
function bindQuestionFields(prefix) {
  const get = suffix => $(prefix + suffix);
  const select = get('-tipo'), container = get('-opts-container');
  const rows = [];
  const addRow = () => {
    const row = div('mt-initial-option');
    const editor = buildOptionEditor({tipo:select.value}, '', {compact:true});
    const remove = document.createElement('button'); remove.type='button'; remove.className='btn-pc'; remove.textContent='Quitar opción';
    const entry = {row, editor};
    remove.onclick = () => { row.remove(); rows.splice(rows.indexOf(entry),1); };
    row.append(editor.el,remove); container.append(row); rows.push(entry);
  };
  const sync = () => {
    const t=select.value;
    get('-opciones-wrap').style.display = OPTION_TYPES.includes(t) ? 'block':'none';
    get('-slider-wrap').style.display = t==='slider'?'block':'none';
    get('-horarios-wrap').style.display = t==='horarios'?'block':'none';
    get('-casas-mode').style.display = t==='probabilidad-opcion'?'block':'none';
  };
  let getFranjas;
  function reset() {
    rows.length=0; container.replaceChildren(); addRow();
    get('-min').value=0; get('-max').value=100; get('-step').value=10; get('-dur').value=3;
    get('-modo-casas').checked=false; get('-desc').value='';
    get('-franjas-host').replaceChildren(); getFranjas=buildFranjasEditor(get('-franjas-host'), FRANJAS_HORARIAS); sync();
  }
  function read() {
    const tipo=select.value; let opciones=[], config={};
    if (OPTION_TYPES.includes(tipo)) {
      opciones=rows.map(x=>x.editor.read(tipo)).filter(Boolean);
      if (new Set(opciones.map(o=>optVal({tipo},o))).size !== opciones.length) throw Error('Hay opciones con nombres duplicados.');
    }
    if (tipo==='slider') {
      config={min:Number(get('-min').value),max:Number(get('-max').value),step:Number(get('-step').value)};
      if (!Number.isFinite(config.min)||!Number.isFinite(config.max)||!(config.max>config.min)||!(config.step>0)) throw Error('Rango inválido: comprueba mínimo, máximo y paso.');
      config.default=(config.min+config.max)/2;
    } else if (tipo==='horarios') {
      const franjas=getFranjas(); if (!franjas.length) throw Error('Define al menos una franja válida.');
      config={duracionIdeal:Math.max(1,Math.min(12,+get('-dur').value||3)),franjas};
    } else if (tipo==='probabilidad-opcion') config.modoCasas=get('-modo-casas').checked;
    const desc=get('-desc').value.trim(); if(desc) config.descripcion=desc;
    return {tipo,opciones,config};
  }
  select.addEventListener('change',sync); get('-add-opt').onclick=addRow;
  reset(); return {read,reset};
}

// ── NUEVA PREGUNTA ──────────────────────────────────────────────────────────
// Desplegable «Sección» del formulario de pregunta nueva. Las opciones son las
// secciones existentes (marcas + nombres usados por preguntas sueltas); la
// última entrada permite crear una sección nueva escribiendo su nombre.
const AQ_SEC_NUEVA = '__nueva__';
function rebindAddQSeccion() {
  const sel = $('add-q-seccion');
  if (!sel) return;
  const nombres = (typeof nombresDeSecciones === 'function') ? nombresDeSecciones() : [];
  sel.innerHTML = '<option value="">Sin sección (aparece suelta en el raíl)</option>' +
    nombres.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') +
    `<option value="${AQ_SEC_NUEVA}">+ Crear sección nueva…</option>`;
  const inp = $('add-q-seccion-nombre');
  if (inp) inp.value = '';
  syncAddQSeccionField();
}

function syncAddQSeccionField() {
  const sel = $('add-q-seccion'), inp = $('add-q-seccion-nombre');
  if (!sel || !inp) return;
  inp.style.display = sel.value === AQ_SEC_NUEVA ? '' : 'none';
  if (sel.value !== AQ_SEC_NUEVA) inp.value = '';
}

// Nombre de sección elegido en el formulario ('' = sin sección).
function aqSeccionElegida() {
  const sel = $('add-q-seccion');
  if (!sel) return '';
  if (sel.value === AQ_SEC_NUEVA) return ($('add-q-seccion-nombre').value || '').trim();
  return sel.value;
}

// Desplegable «Posición en el cuestionario»: permite insertar la pregunta
// nueva ANTES de cualquiera de las existentes (o al final, predeterminado).
function rebindAddQPosition() {
  const sel = $('add-q-pos');
  if (!sel) return;
  const qs = schema.filter(q => !(q.config && q.config.esEncabezado));
  const cur = sel.value;
  sel.innerHTML = '<option value="">Al final (predeterminado)</option>' +
    qs.map(q => `<option value="${esc(q.id)}">Antes de: ${esc(q.label)}</option>`).join('');
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
}

// Desplegable «Posición de la sección» del formulario de secciones: la marca
// y su primera pregunta se mueven justo antes de la sección elegida.
function rebindAddSecPosition() {
  const sel = $('add-sec-pos');
  if (!sel) return;
  const secs = (typeof seccionesDelEsquema === 'function') ? seccionesDelEsquema() : [];
  const cur = sel.value;
  sel.innerHTML = '<option value="">Al final (predeterminado)</option>' +
    secs.map(s => `<option value="${esc(s.nombre || s.titulo)}">Antes de la sección: ${esc(s.titulo)}</option>`).join('');
  if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
}

function resetAddQuestionForm() {
  $('add-q-label').value = '';
  questionEditors['add-q'].reset();
  rebindAddQSeccion(); // desplegable de secciones al día
  rebindAddQPosition(); // desplegable de posición al día
  rebindAddQCond(); // editor de condición limpio (sobre el esquema actual)
}

// ── RAMIFICACIÓN DESDE EL ÁRBOL ─────────────────────────────────────────────
// Abre el formulario de pregunta nueva PRE-RELLENADO para crear una rama:
// hereda la sección del padre, deja la condición «mostrar si…» apuntando a
// la pregunta origen (todas sus opciones) y sugiere la posición inmediata
// posterior al padre. Lo invoca arbol.js desde el botón «+» de cada nodo.
function abrirAddPreguntaCondicionado(parentQ) {
  const f = $('add-q-form'), t = $('btn-toggle-add-q');
  if (!t || !f || !parentQ) return;
  if (!f.classList.contains('open')) t.click();

  // Sección heredada del padre
  if (parentQ.config && parentQ.config.seccion) {
    const sel = $('add-q-seccion');
    if (sel) {
      const key = _secNormNombre(parentQ.config.seccion);
      const op = [...sel.options].find(o => _secNormNombre(o.value) === key);
      if (op) { sel.value = op.value; if (typeof syncAddQSeccionField === 'function') syncAddQSeccionField(); }
    }
  }

  // Condición pre-rellenada: «mostrar si el padre incluye alguna de sus opciones»
  const condHost = $('add-q-cond-host');
  if (condHost && typeof buildCondEditor === 'function') {
    const allVals = (parentQ.opciones || []).map(o => optVal(parentQ, o));
    const init = {
      qid: parentQ.id,
      op: allVals.length > 1 ? 'alguno' : 'incluye',
      valor: allVals.length > 1 ? allVals : (allVals[0] || ''),
    };
    const ed = buildCondEditor(condHost, schema, null, init);
    condHost._getCond = ed.read;
  }

  // Posición: por defecto justo después del padre (= antes de la siguiente)
  const posSel = $('add-q-pos');
  if (posSel) {
    const pIdx = schema.indexOf(parentQ);
    const nextQ = (pIdx >= 0 && pIdx + 1 < schema.length) ? schema[pIdx + 1] : null;
    if (nextQ && [...posSel.options].some(o => o.value === nextQ.id)) posSel.value = nextQ.id;
  }

  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => $('add-q-label')?.focus(), 250);
  showStatus(`Creando ramificación de «${parentQ.label}»`, 'info', 4000);
}
window.abrirAddPreguntaCondicionado = abrirAddPreguntaCondicionado;

// Reconstruye el editor «mostrar solo si…» del formulario de pregunta nueva.
// Sin `currentQid`: la pregunta se añadirá al final, así que puede depender
// de cualquier pregunta existente con opciones. Se expone en host._getCond().
function rebindAddQCond() {
  const host = $('add-q-cond-host');
  if (!host || typeof buildCondEditor !== 'function') return;
  host._getCond = buildCondEditor(host, schema, null, null).read;
}

async function submitNewQuestion() {
  if (!user) return;
  const label = $('add-q-label').value.trim();
  if (!label) { $('add-q-label').focus(); return; }
  const slug = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,30);
  const id = slug+'_'+Date.now().toString(36);
  let fields; try { fields=questionEditors['add-q'].read(); } catch(e) {showStatus(e.message,'err');return;}
  const {tipo,opciones,config}=fields;

  // ── Posición elegida: '' = al final (comportamiento histórico); si no,
  // la pregunta se inserta ANTES de esa pregunta del esquema. ──────────────
  const beforeQid = ($('add-q-pos')?.value) || '';
  // Sección elegida en el desplegable (o nombre nuevo escrito a mano). La
  // tarjeta «marca» de una sección nueva se crea aquí mismo si no existe.
  const secElegida = aqSeccionElegida();
  if (secElegida) {
    config.seccion = secElegida;
    if (typeof secHeaderPara === 'function' && !secHeaderPara(secElegida) &&
        typeof crearSeccion === 'function') {
      crearSeccion(secElegida);   // fire-and-forget: pollOnce traerá la marca
    }
  }

  // Índice de inserción: antes de `beforeQid`; si no se eligió posición pero
  // sí una sección existente, justo tras la última pregunta de esa sección;
  // en cualquier otro caso, al final del esquema.
  function _calcInsertAt(arr) {
    if (beforeQid) {
      const j = arr.findIndex(q => q.id === beforeQid);
      if (j >= 0) return j;
    }
    if (secElegida) {
      for (let j = arr.length - 1; j >= 0; j--) {
        const x = arr[j];
        if (x.config && x.config.esEncabezado) continue;
        if (String(x.config?.seccion || '').trim().toLowerCase() === secElegida.trim().toLowerCase()) return j + 1;
      }
    }
    return arr.length;
  }

  const pregunta = { id, tipo, label, opciones, config };

  // Condición «mostrar solo si…» del editor de #add-q-cond-host. Se valida
  // sobre el esquema «virtual» con la pregunta ya colocada en su posición:
  // así la regla anti-ciclos («la fuente debe ir antes») se respeta también
  // cuando la pregunta nueva se inserta en medio del cuestionario.
  const condHost = $('add-q-cond-host');
  if (condHost && typeof condHost._getCond === 'function') {
    const cond = condHost._getCond();
    if (cond) {
      const insertAtV = _calcInsertAt(schema);
      const virtual = [...schema.slice(0, insertAtV), pregunta, ...schema.slice(insertAtV)];
      const errCond = typeof validarMostrarSi === 'function'
        ? validarMostrarSi(cond, virtual, pregunta.id) : null;
      if (errCond) { showStatus(errCond, 'err', 6000); return; }
      config.mostrarSi = cond;
    }
  }

  // Optimista, con rollback. Insertar en la posición calculada para que DOM
  // y esquema coincidan hasta que llegue el orden definitivo del servidor.
  const insertAt = _calcInsertAt(schema);
  schema.splice(insertAt, 0, pregunta);
  const card = buildQuestionCard(pregunta, insertAt);
  const contQ = $('questions-container');
  if (card && contQ) {
    const refCard = beforeQid ? cardFor(beforeQid) : null;
    if (refCard && refCard.parentElement === contQ) refCard.before(card);
    else contQ.appendChild(card);
    renumberCards();
  }
  $('add-q-form').classList.remove('open');
  resetAddQuestionForm();
  // La sección nueva entra en el raíl/barra (y si es condicional, visible ya).
  if (typeof refreshSecciones === 'function') setTimeout(refreshSecciones, 0);

  try {
    await apiPost({ action: 'add_pregunta', eid: user.eid, nombre: user.nombre, pinHash: user.pinHash, pregunta });
    // El servidor asigna siempre la posición final; si el usuario eligió otra
    // (o una sección intermedia), persistimos el orden completo del esquema.
    let reorderErr = null;
    if (beforeQid || secElegida) {
      try {
        await apiPost({ action: 'reordenar_preguntas', eid: user.eid, nombre: user.nombre,
                        pinHash: user.pinHash, ids: schema.map(q => q.id) });
      } catch (eReord) {
        // La pregunta ya existe en el servidor (al final); solo falla la
        // posición. No hacemos rollback de la creación: avisamos y alineamos
        // el DOM con el orden real tras el sondeo.
        reorderErr = eReord;
      }
    }
    // Refresca el snapshot (incluida la posición inicial asignada por SQL).
    lastRaw = '';
    await pollOnce();
    if (reorderErr) showStatus('La pregunta se creó al final del cuestionario; no se pudo colocar en la posición elegida: ' + reorderErr.message, 'err', 7000);
  } catch (e) {
    if (card) card.remove();
    const i = schema.indexOf(pregunta);
    if (i >= 0) schema.splice(i, 1);
    showStatus('No se pudo crear la pregunta: ' + e.message, 'err');
    if (typeof refreshSecciones === 'function') setTimeout(refreshSecciones, 0);
  }
}

// ── NUEVA SECCIÓN (tarjeta #add-section-card + lista #sec-manage-list) ──────
// Crea la marca de la sección (crearSeccion, ahora awaited) y, si se
// cumplimentó el bloque opcional, una primera pregunta dentro de ella en
// secuencia (primero la marca: así la pregunta llega a un grupo ya existente).
async function submitNewSection() {
  if (!user) return;
  const nombre = ($('add-sec-nombre').value || '').trim();
  if (!nombre) { $('add-sec-nombre').focus(); showStatus('Escribe el nombre de la sección', 'err'); return; }
  const btn = $('btn-submit-new-sec');
  btn.disabled = true; btn.textContent = 'Creando…';

  // Primera pregunta opcional (se construye ANTES de crear la marca para que
  // los fallos de validación no dejen una sección huérfana a medias).
  let primera = null;
  const qLabel = ($('add-sec-q-label').value || '').trim();
  if (qLabel) {
    const slug = qLabel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,30);
    let fields; try { fields=questionEditors['add-sec-q'].read(); } catch(e) { showStatus(e.message,'err'); btn.disabled=false; btn.textContent='Crear sección →'; return; }
    fields.config.seccion=nombre;
    primera={id:slug+'_'+Date.now().toString(36),label:qLabel,...fields};
  }

  // Posición elegida: mover la marca (y su primera pregunta) delante de la
  // sección seleccionada en vez de dejarlas al final del cuestionario.
  const beforeSec = ($('add-sec-pos')?.value) || '';

  try {
    await crearSeccion(nombre);            // crea la marca (optimista + add_pregunta)
    if (primera) {
      schema.push(primera);
      const card = buildQuestionCard(primera, schema.length - 1);
      insertCardTras(card, null);
      try {
        await apiPost({ action: 'add_pregunta', eid: user.eid, nombre: user.nombre,
                        pinHash: user.pinHash, pregunta: primera });
        lastRaw = '';
      } catch (e2) {
        if (card) card.remove();
        const i = schema.indexOf(primera);
        if (i >= 0) schema.splice(i, 1);
        showStatus('La sección se creó, pero la primera pregunta no: ' + e2.message, 'err', 7000);
      }
    } else {
      showStatus(`Sección «${nombre}» creada`, 'ok', 3000);
    }

    // ── Colocar la sección en la posición pedida («antes de X») ───────────
    if (beforeSec && typeof seccionesDelEsquema === 'function') {
      const secs = seccionesDelEsquema();
      const targetSec = secs.find(s => _secNormNombre(s.nombre || s.titulo) === _secNormNombre(beforeSec));
      const marca = secHeaderPara(nombre);
      if (targetSec && marca) {
        const anchorIdx = targetSec.encabezadoIdx >= 0
          ? targetSec.encabezadoIdx
          : (targetSec.items[0]?.i ?? schema.length);
        schema.splice(schema.indexOf(marca), 1);
        schema.splice(Math.min(anchorIdx, schema.length), 0, marca);
        if (primera && schema.includes(primera)) {
          schema.splice(schema.indexOf(primera), 1);
          schema.splice(schema.indexOf(marca) + 1, 0, primera);
        }
        // Reubica las tarjetas DOM en el nuevo orden del esquema (el sondeo
        // nunca reordena; solo añade/quitan tarjetas).
        const contQ = $('questions-container');
        if (contQ) {
          let ref = null;
          for (let j = schema.indexOf(marca) + 1; j < schema.length; j++) {
            const c = cardFor(schema[j].id);
            if (c && c.parentElement === contQ) { ref = c; break; }
          }
          const marcaCard = cardFor(marca.id);
          if (marcaCard && marcaCard.parentElement === contQ) {
            if (ref) ref.before(marcaCard); else contQ.appendChild(marcaCard);
          }
          if (primera) {
            const pCard = cardFor(primera.id);
            const mCard = cardFor(marca.id);
            if (pCard && pCard.parentElement === contQ && mCard) {
              if (ref) ref.before(pCard); else mCard.after(pCard);
            }
          }
          renumberCards();
        }
        try {
          await apiPost({ action: 'reordenar_preguntas', eid: user.eid, nombre: user.nombre,
                          pinHash: user.pinHash, ids: schema.map(q => q.id) });
        } catch (e3) { console.warn('reordenar secciones:', e3); }
      }
    }

    // Limpiar el formulario y cerrar la tarjeta de creación.
    $('add-sec-nombre').value = '';
    $('add-sec-q-label').value = '';
    questionEditors['add-sec-q'].reset();
    $('add-sec-form').classList.remove('open');
    goToSectionDeNombre(nombre);
    await pollOnce();
    if (typeof refreshSecciones === 'function') refreshSecciones();
  } catch (e) {
    showStatus('No se pudo crear la sección: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Crear sección →';
  }
}

function bindForms() {
  $('btn-toggle-add-q').addEventListener('click', () => {
    const f = $('add-q-form');
    const opening = !f.classList.contains('open');
    f.classList.toggle('open');
    // Al abrir, los desplegables de secciones/posición y el editor de
    // condición se pintan con el esquema actual.
    if (opening) { rebindAddQSeccion(); rebindAddQPosition(); rebindAddQCond(); }
  });
  $('btn-submit-new-q').addEventListener('click', submitNewQuestion);

  // ── Tarjeta «Secciones del cuestionario» (#add-section-card) ──
  const btnToggleSec = $('btn-toggle-add-sec');
  if (btnToggleSec) {
    btnToggleSec.addEventListener('click', () => {
      const f = $('add-sec-form');
      const opening = !f.classList.contains('open');
      f.classList.toggle('open');
      if (opening) rebindAddSecPosition(); // desplegable de posición al día
    });
  }
  const btnSubmitSec = $('btn-submit-new-sec');
  if (btnSubmitSec) btnSubmitSec.addEventListener('click', submitNewSection);
  const inpSecNom = $('add-sec-nombre');
  if (inpSecNom) inpSecNom.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitNewSection(); }
  });
  // Lista de gestión de secciones (render definido en secciones.js; el primer
  // pintado tras cargar el esquema — refreshSecciones la repinta después).
  if (typeof renderSecManageList === 'function') renderSecManageList();

  const aqSecSel = $('add-q-seccion');
  if (aqSecSel) aqSecSel.addEventListener('change', syncAddQSeccionField);

  $('add-sec-q-tipo').replaceChildren(...[...$('add-q-tipo').options].map(o=>o.cloneNode(true)));
  questionEditors['add-q']=bindQuestionFields('add-q');
  questionEditors['add-sec-q']=bindQuestionFields('add-sec-q');
}
