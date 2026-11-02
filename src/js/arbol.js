// ══════════════════════════════════════════════════════════════════════════
//  ÁRBOL DEL CUESTIONARIO (solo lectura) — src/js/arbol.js
//  Dibuja las ramas definidas por config.mostrarSi: las preguntas sin
//  condición son raíces y cada pregunta condicional cuelga de la que la
//  activa, con la etiqueta de la rama y cuánta gente llegaría a ella.
//  Cada opción muestra sus votos entre quienes llegan a esa pregunta.
//  No contiene ningún control de respuesta.
//  Requiere: schema, respuestas, extractAnswer, optVal, esc (state/types) y
//  _condMatch (secciones.js).
// ══════════════════════════════════════════════════════════════════════════
(function () {
  var TIPOS_TXT = {
    'checkbox': 'Selección múltiple', 'voto-ponderado': 'Votación con puntos',
    'radio': 'Selección única', 'casas': 'Alojamientos', 'slider': 'Rango',
    'disponibilidad': 'Fechas', 'horarios': 'Horarios', 'textarea': 'Texto',
  };

  const esMarca = q => !!(q.config && q.config.esEncabezado);
  const valoresDe = c => (Array.isArray(c.valor) ? c.valor : [c.valor]).map(String);

  function textoCond(c) {
    const vals = valoresDe(c).map(v => '«' + v + '»').join(' o ');
    const verbo = c.op === 'igual' ? 'es' : c.op === 'alguno' ? 'elige alguna de' : 'elige';
    return (c.no ? 'Si NO ' : 'Si ') + verbo + ' ' + vals;
  }

  // ¿Esta respuesta cumple la condición? (misma semántica que esVisible)
  function cumple(raw, c) {
    let ok = false;
    try { ok = _condMatch(raw, c.op || 'incluye', c.valor); } catch (e) {}
    return c.no ? !ok : ok;
  }

  function elige(raw, key) {
    if (raw == null) return false;
    if (Array.isArray(raw)) return raw.some(c => (typeof c === 'string' ? c : (c && c.nombre)) === key);
    if (typeof raw === 'object') return 'estado' in raw ? raw.estado === key : Number(raw[key]) > 0;
    return String(raw) === key;
  }

  function respondio(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return String(v) !== '';
  }

  function construir() {
    const preguntas = schema.filter(q => !esMarca(q));
    const ids = new Set(preguntas.map(q => q.id));
    const hijos = new Map(), raices = new Set();
    preguntas.forEach(q => {
      const c = condEfectiva(q);
      if (c && c.qid && c.qid !== q.id && ids.has(c.qid)) {
        if (!hijos.has(c.qid)) hijos.set(c.qid, []);
        hijos.get(c.qid).push(q);
      } else raices.add(q.id);
    });
    // opciones que abren ramas (para marcarlas con un icono)
    const abre = new Map();
    preguntas.forEach(q => {
      const c = condEfectiva(q);
      if (!c || !c.qid || c.no) return;
      valoresDe(c).forEach(v => {
        const k = c.qid + '\u0000' + v;
        abre.set(k, (abre.get(k) || 0) + 1);
      });
    });
    return { preguntas, hijos, raices, abre };
  }

  function nodoHtml(q, gente, ctx, depth) {
    if (ctx.visited.has(q.id) || depth > 12) return '';
    ctx.visited.add(q.id);
    const idx = schema.indexOf(q);
    const raws = gente.map(r => extractAnswer(r.answers || {}, q));
    const nResp = raws.filter(respondio).length;

    const opts = (q.opciones || []).map(op => {
      const key = optVal(q, op);
      const n = raws.filter(v => elige(v, key)).length;
      const nRamas = ctx.abre.get(q.id + '\u0000' + key) || 0;
      return `<span class="arbol-opt${n ? ' has' : ''}">${esc(key)} <b>${n}</b>` +
        (nRamas ? ` <i class="fa-solid fa-code-branch" title="Abre ${nRamas} pregunta(s)" aria-hidden="true"></i>` : '') +
        `</span>`;
    }).join('');

    const ramas = (ctx.hijos.get(q.id) || []).map(k => {
      const c = condEfectiva(k)
      const sub = gente.filter(r => cumple(extractAnswer(r.answers || {}, q), c));
      return `<li class="arbol-rama">` +
        `<div class="arbol-rama-label"><i class="fa-solid fa-code-branch" aria-hidden="true"></i> ${esc(textoCond(c))}` +
        ` <span class="arbol-n">${sub.length} persona${sub.length === 1 ? '' : 's'}</span></div>` +
        `<ul class="arbol-hijos">${nodoHtml(k, sub, ctx, depth + 1)}</ul></li>`;
    }).join('');

    return `<li class="arbol-nodo"><details open>` +
      `<summary><span class="arbol-q">${esc(q.label)}</span>` +
      `<span class="arbol-tipo">${esc(TIPOS_TXT[q.tipo] || q.tipo)}</span>` +
      (q.tipo !== 'textarea' ? `<span class="arbol-n">${nResp}/${gente.length} responden</span>` : '') +
      `<button type="button" class="sec-rail-tool arbol-go" data-idx="${idx}" title="Ir a esta pregunta"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>` +
      `<button type="button" class="sec-rail-tool arbol-branch" data-idx="${idx}" title="Crear una pregunta condicionada a esta"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>` +
      `</summary>` +
      (opts ? `<div class="arbol-opts">${opts}</div>` : '') +
      (ramas ? `<ul class="arbol-hijos">${ramas}</ul>` : '') +
      `</details></li>`;
  }

  function render() {
    const host = document.getElementById('arbol-body');
    if (!host) return;
    if (!schema.length) { host.innerHTML = '<p class="arbol-vacio">Aún no hay preguntas.</p>'; return; }

    const ctx = construir();
    ctx.visited = new Set();
    const gente = respuestas || [];

    // Raíces agrupadas por sección, en el orden en que aparecen en el esquema
    const grupos = new Map();
    const asegurar = n => { if (!grupos.has(n)) grupos.set(n, []); return grupos.get(n); };
    schema.forEach(q => {
      const sec = String((q.config && q.config.seccion) || '').trim();
      if (esMarca(q)) asegurar(sec || q.label);
      else if (ctx.raices.has(q.id)) asegurar(sec).push(q);
    });

    let html = `<p class="arbol-nota"><i class="fa-solid fa-eye" aria-hidden="true"></i> Vista de solo lectura. ` +
      `Cada rama muestra a quién le saldría esa parte según lo que ha enviado (${gente.length} respuesta${gente.length === 1 ? '' : 's'}). ` +
      `Las opciones con <i class="fa-solid fa-code-branch" aria-hidden="true"></i> abren preguntas nuevas.</p>`;

    grupos.forEach((qs, nombre) => {
      html += `<h4 class="arbol-sec">${esc(nombre || 'Sin sección')}</h4>`;
      html += qs.length
        ? `<ul class="arbol-lista">${qs.map(q => nodoHtml(q, gente, ctx, 0)).join('')}</ul>`
        : `<p class="arbol-vacio">Sin preguntas todavía.</p>`;
    });

    // Preguntas con condiciones cíclicas o rotas: se muestran aparte
    const huerfanas = ctx.preguntas.filter(q => !ctx.visited.has(q.id));
    if (huerfanas.length) {
      html += `<h4 class="arbol-sec">Con condición rota o circular</h4><ul class="arbol-lista">` +
        huerfanas.map(q => nodoHtml(q, gente, { ...ctx, hijos: new Map() }, 0)).join('') + `</ul>`;
    }

    host.innerHTML = html;
    host.querySelectorAll('.arbol-go').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      cerrar();
      if (typeof switchMode === 'function') switchMode('survey');
      if (typeof goToSection === 'function') goToSection(parseInt(b.dataset.idx, 10));
    }));
    // Botón «+» de cada nodo: crear una rama (pregunta condicionada a esta)
    // desde el propio árbol. Delega en forms.js, que abre el formulario de
    // pregunta nueva pre-rellenado (sección, condición y posición heredadas).
    host.querySelectorAll('.arbol-branch').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const q = schema[parseInt(b.dataset.idx, 10)];
      if (!q) return;
      cerrar();
      if (typeof switchMode === 'function') switchMode('survey');
      if (typeof abrirAddPreguntaCondicionado === 'function') {
        abrirAddPreguntaCondicionado(q);
      } else if (typeof goToSection === 'function') {
        goToSection(parseInt(b.dataset.idx, 10));
      }
    }));
  }

  function abrir() {
    const bd = document.getElementById('arbol-modal-backdrop');
    if (!bd) return;
    bd.hidden = false;
    bd.style.removeProperty('display');
    document.body.classList.add('map-modal-open');
    render();
  }
  function cerrar() {
    const bd = document.getElementById('arbol-modal-backdrop');
    if (bd) { bd.hidden = true; bd.style.setProperty('display', 'none', 'important'); }
    document.body.classList.remove('map-modal-open');
  }

  window.renderArbol = render;
  window.renderArbolSiAbierto = function () {
    const bd = document.getElementById('arbol-modal-backdrop');
    if (bd && !bd.hidden) render();
  };

  document.addEventListener('DOMContentLoaded', () => {
    const bd = document.getElementById('arbol-modal-backdrop');
    if (!bd) return;
    bd.addEventListener('click', e => { if (e.target === bd) cerrar(); });
    const x = document.getElementById('arbol-modal-close');
    if (x) x.addEventListener('click', cerrar);
    const btn = document.getElementById('btn-arbol-modal');
    if (btn) btn.addEventListener('click', () => { if (typeof closeSideNav === 'function') closeSideNav(); abrir(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
  });
})();

function condEfectiva(q) {
  const own = q.config && q.config.mostrarSi;
  if (own && own.qid) return own;
  const h = typeof _condDeSeccion === 'function' ? _condDeSeccion(q) : null;
  return h ? h.config.mostrarSi : null;
}