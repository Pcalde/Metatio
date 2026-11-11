// ══════════════════════════════════════════════════════════════════════════
//  GRAFO DE FLUJO DEL CUESTIONARIO (Ruta Base + Ramas + Pan/Zoom) — arbol.js
//  · Las preguntas sin condición forman la Ruta Base secuencial (A1 → A2 → A3…).
//  · De cada Ai salen sus ramas condicionales (B1, B2, B3 → C1, C2…).
//  · Al terminar las subramas de Ai, todas las hojas reconvergen en A(i+1).
//  · Lienzo interactivo: arrastrar con ratón (pan) y zoom con rueda.
// ══════════════════════════════════════════════════════════════════════════
(function () {
  var TIPOS_TXT = {
    'checkbox': 'Múltiple',
    'voto-ponderado': 'Puntos',
    'probabilidad-opcion': 'Prob.',
    'radio': 'Única',
    'casas': 'Alojamientos',
    'slider': 'Rango',
    'disponibilidad': 'Fechas',
    'horarios': 'Horarios',
    'textarea': 'Texto',
  };

  const esMarca = q => !!(q.config && q.config.esEncabezado);
  const valoresDe = c => (Array.isArray(c.valor) ? c.valor : (c.valor != null ? [c.valor] : [])).map(String);

  function reglasEfectivas(q) {
    let raw = q.config && q.config.mostrarSi;
    if (!raw || (!raw.qid && !Array.isArray(raw) && !Array.isArray(raw.rules))) {
      const h = typeof _condDeSeccion === 'function' ? _condDeSeccion(q) : null;
      raw = h && h.config ? h.config.mostrarSi : null;
    }
    if (!raw) return { logic: 'OR', rules: [] };
    if (Array.isArray(raw)) return { logic: 'OR', rules: raw.filter(r => r && r.qid) };
    if (Array.isArray(raw.rules)) return { logic: raw.logic === 'AND' ? 'AND' : 'OR', rules: raw.rules.filter(r => r && r.qid) };
    if (raw.qid) return { logic: 'OR', rules: [raw] };
    return { logic: 'OR', rules: [] };
  }

  function textoCond(c) {
    const vals = valoresDe(c).map(v => '«' + v + '»').join(' o ');
    const verbo = c.op === 'igual' ? 'es' : c.op === 'alguno' ? 'elige' : 'marca';
    return (c.no ? 'NO ' : '') + verbo + ' ' + vals;
  }

  // Umbral > 0.5 (o q.config.umbralElige):
  // - En `voto-ponderado` filtra +1 y +3 (excluyendo -1).
  // - En `probabilidad-opcion` filtra >= 0.75 (Probable, Casi seguro, Seguro),
  //   excluyendo 0.00 (Nunca), 0.20 (Poco probable) y 0.50 (Quizás).
  function elige(raw, key, q = null) {
    if (raw == null) return false;
    if (Array.isArray(raw)) return raw.some(c => (typeof c === 'string' ? c : (c && c.nombre)) === key);
    if (typeof raw === 'object') {
      if ('estado' in raw) return raw.estado === key;
      const umbral = (q && q.config && q.config.umbralElige != null) ? Number(q.config.umbralElige) : 0.5;
      return Number(raw[key]) > umbral;
    }
    return String(raw) === key;
  }

  function cumpleRegla(raw, c, qPadre = null) {
    let ok = false;
    try {
      if (qPadre && qPadre.tipo === 'probabilidad-opcion') {
        const vals = valoresDe(c);
        const op = c.op || 'incluye';
        if (raw && typeof raw === 'object') {
          if (op === 'alguno') ok = vals.some(v => elige(raw, v, qPadre));
          else ok = vals.length > 0 && vals.every(v => elige(raw, v, qPadre));
        }
      } else {
        ok = _condMatch(raw, c.op || 'incluye', c.valor);
      }
    } catch (e) {}
    return c.no ? !ok : ok;
  }

  function respondio(v) {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return String(v) !== '';
  }

  // Construye la topología Serie-Paralelo:
  // Ruta Base (A1, A2, ...) + subárboles condicionales (B, C, D...) que reconvergen en el siguiente A
  function construirTopologia(preguntas, gente) {
    const byId = new Map(preguntas.map(q => [q.id, q]));
    const childrenMap = new Map(preguntas.map(q => [q.id, []]));
    const parentsMap = new Map(preguntas.map(q => [q.id, []]));
    const abre = new Map();
    const branchEdges = [];
    const roots = [];

    preguntas.forEach(q => {
      const { logic, rules } = reglasEfectivas(q);
      const validRules = rules.filter(r => byId.has(r.qid) && r.qid !== q.id);

      if (!validRules.length) {
        roots.push(q);
        return;
      }

      const primaryParentId = validRules[0].qid;
      childrenMap.get(primaryParentId).push(q);

      validRules.forEach(r => {
        const vals = valoresDe(r);
        const portOpt = (!r.no && vals.length === 1) ? vals[0] : null;
        if (!r.no) {
          vals.forEach(v => {
            const k = r.qid + '\u0000' + v;
            abre.set(k, (abre.get(k) || 0) + 1);
          });
        }
        parentsMap.get(q.id).push({ fromId: r.qid, rule: r, logic });
        branchEdges.push({ type: 'branch', fromId: r.qid, toId: q.id, rule: r, portOpt, viajeros: [] });
      });
    });

    const visitados = new Set();
    function marcar(q) {
      if (visitados.has(q.id)) return;
      visitados.add(q.id);
      (childrenMap.get(q.id) || []).forEach(marcar);
    }
    roots.forEach(marcar);
    preguntas.forEach(q => { if (!visitados.has(q.id)) { roots.push(q); marcar(q); } });

    // Propagación de alcance (quién llega a cada pregunta)
    const alcance = new Map();
    function calcAlcance(q) {
      if (alcance.has(q.id)) return alcance.get(q.id);
      const padres = parentsMap.get(q.id) || [];
      if (!padres.length) {
        alcance.set(q.id, gente);
        return gente;
      }
      const { logic } = reglasEfectivas(q);
      const filtrados = gente.filter(resp => {
        const evals = padres.map(p => {
          const qPadre = byId.get(p.fromId);
          const base = calcAlcance(qPadre);
          if (!base.includes(resp)) return false;
          return cumpleRegla(extractAnswer(resp.answers || {}, qPadre), p.rule, qPadre);
        });
        return logic === 'AND' ? evals.every(Boolean) : evals.some(Boolean);
      });
      alcance.set(q.id, filtrados);
      return filtrados;
    }
    preguntas.forEach(calcAlcance);

    branchEdges.forEach(e => {
      const base = alcance.get(e.fromId) || gente;
      const qPadre = byId.get(e.fromId);
      e.viajeros = base.filter(r => cumpleRegla(extractAnswer(r.answers || {}, qPadre), e.rule, qPadre));
    });

    const returnEdges = [];
    const stages = [];
    const codeMap = new Map();

    roots.forEach((rootQ, rIdx) => {
      const aCode = `A${rIdx + 1}`;
      codeMap.set(rootQ.id, { code: aCode, isTrunk: true, depth: 0 });

      const leaves = [];
      const depthCounters = new Map();
      const seenInStage = new Set([rootQ.id]);

      function walkSubtree(u, depth) {
        const hijos = (childrenMap.get(u.id) || []).filter(h => !seenInStage.has(h.id));
        if (!hijos.length) {
          if (depth > 0) leaves.push(u);
          return;
        }
        hijos.forEach(h => {
          seenInStage.add(h.id);
          const d = depth + 1;
          const letra = String.fromCharCode(65 + Math.min(25, d));
          const cnt = (depthCounters.get(d) || 0) + 1;
          depthCounters.set(d, cnt);
          codeMap.set(h.id, { code: `${letra}${cnt}`, isTrunk: false, depth: d });
          walkSubtree(h, d);
        });
      }
      walkSubtree(rootQ, 0);

      const nextTargetId = (rIdx + 1 < roots.length) ? roots[rIdx + 1].id : '__FIN__';

      if (!leaves.length) {
        if (nextTargetId !== '__FIN__') {
          returnEdges.push({
            type: 'trunk',
            fromId: rootQ.id,
            toId: nextTargetId,
            viajeros: alcance.get(rootQ.id) || gente
          });
        }
      } else {
        leaves.forEach(leaf => {
          returnEdges.push({
            type: 'return',
            fromId: leaf.id,
            toId: nextTargetId,
            viajeros: alcance.get(leaf.id) || []
          });
        });

        const optsSinRama = (rootQ.opciones || []).filter(op => {
          const key = optVal(rootQ, op);
          return !abre.has(rootQ.id + '\u0000' + key);
        });
        if (optsSinRama.length > 0 && (rootQ.opciones || []).length > 0) {
          returnEdges.push({
            type: 'bypass',
            fromId: rootQ.id,
            toId: nextTargetId,
            viajeros: alcance.get(rootQ.id) || []
          });
        }
      }

      stages.push({ rootQ, leaves, hasBranches: leaves.length > 0 });
    });

    const needsEndNode = stages.length > 0 && stages[stages.length - 1].hasBranches;

    return {
      byId, childrenMap, alcance, abre, codeMap, stages,
      edges: [...branchEdges, ...returnEdges],
      needsEndNode
    };
  }

  function renderCard(q, topo) {
    const idx = schema.indexOf(q);
    const meta = topo.codeMap.get(q.id) || { code: 'A', isTrunk: true, depth: 0 };
    const genteNodo = topo.alcance.get(q.id) || [];
    const raws = genteNodo.map(r => extractAnswer(r.answers || {}, q));
    const nResp = raws.filter(respondio).length;

    const optsHtml = (q.opciones || []).map(op => {
      const key = optVal(q, op);
      const n = raws.filter(v => elige(v, key, q)).length;
      const nRamas = topo.abre.get(q.id + '\u0000' + key) || 0;
      return `<div class="grafo-opt${n ? ' has' : ''}${nRamas ? ' is-branch' : ''}" data-port="${esc(q.id + ':::' + key)}">` +
        `<span class="grafo-opt-txt">${esc(key)}</span>` +
        `<strong class="grafo-opt-cnt">${n}</strong>` +
        `<button type="button" class="grafo-opt-link" data-idx="${idx}" data-opt="${esc(key)}" title="Conectar «${esc(key)}» a una pregunta ya existente"><i class="fa-solid fa-link" aria-hidden="true"></i></button>` +
        `<button type="button" class="grafo-opt-add" data-idx="${idx}" data-opt="${esc(key)}" title="Crear pregunta nueva si eligen «${esc(key)}»">+</button>` +
      `</div>`;
    }).join('');

    return `<article class="grafo-node${meta.isTrunk ? ' is-trunk' : ' is-branch-node'}" data-qid="${esc(q.id)}">` +
      `<header class="grafo-node-head">` +
        `<span class="grafo-node-code${meta.isTrunk ? ' trunk-code' : ''}">${esc(meta.code)}</span>` +
        (meta.isTrunk ? `<span class="grafo-trunk-pill">Ruta base</span>` : '') +
        `<span class="grafo-tipo">${esc(TIPOS_TXT[q.tipo] || q.tipo)}</span>` +
        (q.tipo !== 'textarea' ? `<span class="grafo-n" title="Respondieron / Llegan a esta pregunta">${nResp}/${genteNodo.length} <i class="fa-solid fa-user" aria-hidden="true"></i></span>` : '') +
        `<div class="grafo-node-actions">` +
          `<button type="button" class="sec-rail-tool arbol-go" data-idx="${idx}" title="Ir a esta pregunta"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>` +
          `<button type="button" class="sec-rail-tool arbol-branch" data-idx="${idx}" title="Crear pregunta condicionada a esta"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>` +
        `</div>` +
      `</header>` +
      `<div class="grafo-node-title">${esc(q.label)}</div>` +
      (optsHtml ? `<div class="grafo-opts">${optsHtml}</div>` : '') +
    `</article>`;
  }

  function renderSubtreeHtml(q, topo, visitedDom) {
    if (visitedDom.has(q.id)) return '';
    visitedDom.add(q.id);

    const hijos = (topo.childrenMap.get(q.id) || []).filter(h => !visitedDom.has(h.id));
    const cardHtml = renderCard(q, topo);

    if (!hijos.length) {
      return `<div class="grafo-subtree is-leaf"><div class="grafo-subtree-root">${cardHtml}</div></div>`;
    }

    const childrenHtml = hijos.map(h => renderSubtreeHtml(h, topo, visitedDom)).join('');
    return `<div class="grafo-subtree has-children">` +
      `<div class="grafo-subtree-root">${cardHtml}</div>` +
      `<div class="grafo-subtree-children">${childrenHtml}</div>` +
    `</div>`;
  }

  // ── Estado de navegación del mapa (Pan & Zoom) ──────────────────────────
  let _zoom = 1;
  let _panX = 0;
  let _panY = 0;
  let _ultimoTopo = null;

  function aplicarTransform() {
    const stage = document.getElementById('grafo-stage');
    const zoomLbl = document.getElementById('grafo-zoom-lbl');
    if (stage) {
      stage.style.transform = `translate3d(${_panX}px, ${_panY}px, 0) scale(${_zoom})`;
    }
    if (zoomLbl) {
      zoomLbl.textContent = `${Math.round(_zoom * 100)}%`;
    }
  }

  function centrarMapa(encajar = false) {
    const vp = document.getElementById('grafo-viewport');
    const stage = document.getElementById('grafo-stage');
    if (!vp || !stage) return;

    const vw = vp.clientWidth || 800;
    const vh = vp.clientHeight || 500;
    const sw = stage.offsetWidth || 600;
    const sh = stage.offsetHeight || 400;

    if (encajar) {
      const zx = (vw - 48) / Math.max(1, sw);
      const zy = (vh - 48) / Math.max(1, sh);
      _zoom = Math.max(0.4, Math.min(1, Math.min(zx, zy)));
    } else {
      _zoom = sw > vw - 40 ? Math.max(0.55, (vw - 48) / sw) : 1;
    }

    _panX = Math.round((vw - sw * _zoom) / 2);
    _panY = 24;
    aplicarTransform();
  }

  function bindPanZoom(vp) {
    let isDown = false;
    let isDragging = false;
    let startX = 0, startY = 0;
    let downX = 0, downY = 0;

    vp.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.target.closest('button, a, input, select, .grafo-hud')) return;
      isDown = true;
      isDragging = false;
      downX = e.clientX;
      downY = e.clientY;
      startX = e.clientX - _panX;
      startY = e.clientY - _panY;
    });

    vp.addEventListener('pointermove', e => {
      if (!isDown) return;
      if (!isDragging && Math.hypot(e.clientX - downX, e.clientY - downY) > 4) {
        isDragging = true;
        vp.classList.add('is-panning');
        try { vp.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (isDragging) {
        _panX = e.clientX - startX;
        _panY = e.clientY - startY;
        aplicarTransform();
      }
    });

    const endDrag = e => {
      if (!isDown) return;
      isDown = false;
      if (isDragging) {
        isDragging = false;
        vp.classList.remove('is-panning');
        try { vp.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    vp.addEventListener('pointerup', endDrag);
    vp.addEventListener('pointercancel', endDrag);

    vp.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const sx = (mx - _panX) / _zoom;
      const sy = (my - _panY) / _zoom;

      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      _zoom = Math.max(0.35, Math.min(2.2, _zoom * factor));

      _panX = mx - sx * _zoom;
      _panY = my - sy * _zoom;
      aplicarTransform();
    }, { passive: false });
  }

  function eliminarReglaDeNodo(toId, fromId, ruleToRemove) {
    const qHija = (schema || []).find(q => q.id === toId);
    if (!qHija) return;
    const actual = reglasEfectivas(qHija);
    const restantes = actual.rules.filter(r => !(r.qid === fromId && JSON.stringify(r.valor) === JSON.stringify(ruleToRemove.valor)));
    if (!restantes.length) {
      actualizarCondicionPregunta(qHija, null);
    } else if (restantes.length === 1) {
      actualizarCondicionPregunta(qHija, restantes[0]);
    } else {
      actualizarCondicionPregunta(qHija, { logic: actual.logic, rules: restantes });
    }
  }

  function cerrarPopoverArista() {
    document.querySelectorAll('.grafo-edge-popover').forEach(el => el.remove());
  }

  function abrirPopoverArista(edge, anchorEl) {
    cerrarPopoverArista();
    const preguntas = (schema || []).filter(q => !esMarca(q));
    const qPadre = preguntas.find(q => q.id === edge.fromId);
    const qHija  = preguntas.find(q => q.id === edge.toId);
    if (!qPadre || !qHija) return;

    const valsActuales = new Set(valoresDe(edge.rule));
    const opcionesPadre = (qPadre.opciones || []).map(op => optVal(qPadre, op));

    const pop = document.createElement('div');
    pop.className = 'grafo-edge-popover';
    pop.innerHTML =
      `<div class="gep-head">` +
        `<strong>Condición hacia «${esc(qHija.label.slice(0, 28))}»</strong>` +
        `<button type="button" class="gep-close">✕</button>` +
      `</div>` +
      `<div class="gep-row">` +
        `<label class="gep-neg-toggle">` +
          `<input type="checkbox" id="gep-no" ${edge.rule.no ? 'checked' : ''}> ` +
          `<span>Invertir (entrar si <b>NO</b> se cumple)</span>` +
        `</label>` +
      `</div>` +
      (opcionesPadre.length ? (
        `<div class="gep-opts-lbl">Opciones de «${esc(qPadre.label.slice(0, 25))}» que activan esta rama:</div>` +
        `<div class="gep-opts-list">` +
          opcionesPadre.map(k =>
            `<label class="gep-opt-chip">` +
              `<input type="checkbox" value="${esc(k)}" ${valsActuales.has(String(k)) ? 'checked' : ''}>` +
              `<span>${esc(k)}</span>` +
            `</label>`
          ).join('') +
        `</div>`
      ) : `<input type="text" id="gep-free-val" value="${esc([...valsActuales].join(', '))}" placeholder="Valor requerido">`) +
      `<div class="gep-actions">` +
        `<button type="button" class="btn-pc btn-pc-contra" id="gep-btn-unlink"><i class="fa-solid fa-link-slash"></i> Quitar condición</button>` +
        `<button type="button" class="btn-pc btn-pc-pro" id="gep-btn-save">Guardar</button>` +
      `</div>`;

    const vp = document.getElementById('grafo-viewport');
    vp.appendChild(pop);

    const vpRect = vp.getBoundingClientRect();
    const bRect = anchorEl.getBoundingClientRect();
    pop.style.left = `${Math.max(12, Math.min(vpRect.width - 290, bRect.left - vpRect.left - 80))}px`;
    pop.style.top  = `${Math.max(12, Math.min(vpRect.height - 220, bRect.bottom - vpRect.top + 8))}px`;

    pop.querySelector('.gep-close').addEventListener('click', cerrarPopoverArista);
    pop.querySelector('#gep-btn-unlink').addEventListener('click', () => {
      cerrarPopoverArista();
      eliminarReglaDeNodo(edge.toId, edge.fromId, edge.rule);
    });

    pop.querySelector('#gep-btn-save').addEventListener('click', () => {
      const isNo = pop.querySelector('#gep-no').checked;
      let nuevosValores = [];
      if (opcionesPadre.length) {
        nuevosValores = Array.from(pop.querySelectorAll('.gep-opt-chip input:checked')).map(i => i.value);
        if (!nuevosValores.length) return;
      } else {
        const raw = (pop.querySelector('#gep-free-val')?.value || '').trim();
        if (raw) nuevosValores = [raw];
      }

      const nuevaRegla = {
        qid: edge.fromId,
        op: nuevosValores.length > 1 ? 'alguno' : (edge.rule.op || 'incluye'),
        valor: nuevosValores.length === 1 ? nuevosValores[0] : nuevosValores,
        no: isNo
      };

      const actual = reglasEfectivas(qHija);
      const nuevasRules = actual.rules.map(r =>
        (r.qid === edge.fromId && JSON.stringify(r.valor) === JSON.stringify(edge.rule.valor)) ? nuevaRegla : r
      );

      cerrarPopoverArista();
      actualizarCondicionPregunta(qHija, nuevasRules.length === 1 ? nuevasRules[0] : { logic: actual.logic, rules: nuevasRules });
    });
  }

  let _linkingSource = null;

  function iniciarModoEnlace(qPadre, optKey) {
    cerrarPopoverArista();
    _linkingSource = { qPadre, optKey };
    const vp = document.getElementById('grafo-viewport');
    if (vp) vp.classList.add('is-linking');

    let banner = document.getElementById('grafo-link-banner');
    if (!banner && vp) {
      banner = document.createElement('div');
      banner.id = 'grafo-link-banner';
      banner.className = 'grafo-link-banner';
      vp.appendChild(banner);
    }
    if (banner) {
      banner.innerHTML =
        `<span><i class="fa-solid fa-wand-magic-sparkles"></i> Haz clic en la pregunta destino que quieras activar cuando elijan <b>«${esc(optKey)}»</b> en <b>${esc(qPadre.label.slice(0, 24))}</b></span>` +
        `<button type="button" class="btn-pc" id="grafo-cancel-link">Cancelar (Esc)</button>`;
      banner.querySelector('#grafo-cancel-link').addEventListener('click', cancelarModoEnlace);
    }
  }

  function cancelarModoEnlace() {
    _linkingSource = null;
    document.getElementById('grafo-viewport')?.classList.remove('is-linking');
    document.getElementById('grafo-link-banner')?.remove();
  }

  function completarEnlaceEnNodo(qDestino) {
    if (!_linkingSource) return;
    const { qPadre, optKey } = _linkingSource;
    const preguntas = (schema || []).filter(q => !esMarca(q));

    if (creariaCiclo(qPadre.id, qDestino.id, preguntas)) {
      alert('No se puede conectar: crearía un bucle circular entre preguntas.');
      cancelarModoEnlace();
      return;
    }

    const nuevaRegla = { qid: qPadre.id, op: 'incluye', valor: optKey, no: false };
    const actual = reglasEfectivas(qDestino);

    const yaExiste = actual.rules.some(r => r.qid === qPadre.id && valoresDe(r).includes(String(optKey)));
    if (!yaExiste) {
      const combinadas = [...actual.rules, nuevaRegla];
      actualizarCondicionPregunta(
        qDestino,
        combinadas.length === 1 ? combinadas[0] : { logic: 'OR', rules: combinadas }
      );
    }
    cancelarModoEnlace();
  }

  function trazarFlechas(stage, topo, totalGente) {
    const svg = stage.querySelector('.grafo-svg-edges');
    const labelsHost = stage.querySelector('.grafo-labels-layer');
    if (!svg || !labelsHost) return;

    const stageRect = stage.getBoundingClientRect();
    const z = _zoom || 1;
    svg.innerHTML = '';
    labelsHost.innerHTML = '';

    topo.edges.forEach(e => {
      const fromNode = stage.querySelector(`.grafo-node[data-qid="${CSS.escape(e.fromId)}"]`);
      const toNode = stage.querySelector(`.grafo-node[data-qid="${CSS.escape(e.toId)}"]`);
      if (!fromNode || !toNode) return;

      let sourceEl = fromNode;
      if (e.type === 'branch' && e.portOpt) {
        const portKey = e.fromId + ':::' + e.portOpt;
        const optEl = fromNode.querySelector(`[data-port="${CSS.escape(portKey)}"]`);
        if (optEl) sourceEl = optEl;
      }

      const r1 = sourceEl.getBoundingClientRect();
      const rParentCard = fromNode.getBoundingClientRect();
      const r2 = toNode.getBoundingClientRect();

      const x1 = (r1.left + r1.width / 2 - stageRect.left) / z;
      const y1 = (r1.bottom - stageRect.top) / z;
      const yCardBottom = (rParentCard.bottom - stageRect.top) / z;
      const x2 = (r2.left + r2.width / 2 - stageRect.left) / z;
      const y2 = (r2.top - stageRect.top) / z;

      let d = '';
      const n = e.viajeros ? e.viajeros.length : 0;

      if (e.type === 'return') {
        const yBand = y2 - 68;
        if (y1 < yBand - 12) {
          d = `M ${x1} ${y1} L ${x1} ${yBand} C ${x1} ${yBand + 38}, ${x2} ${y2 - 38}, ${x2} ${y2}`;
        } else {
          const dy = Math.max(36, (y2 - y1) * 0.5);
          d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
        }
      } else if (e.type === 'bypass') {
        const yBand = y2 - 68;
        d = `M ${x1} ${y1} L ${x1} ${yBand} C ${x1} ${yBand + 34}, ${x2} ${y2 - 34}, ${x2} ${y2}`;
      } else if (e.type === 'branch') {
        const yExit = Math.max(y1, yCardBottom + 6);
        const dy = Math.max(38, (y2 - yExit) * 0.55);
        d = `M ${x1} ${y1} L ${x1} ${yExit} C ${x1} ${yExit + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
      } else {
        const dy = Math.max(40, Math.abs(y2 - y1) * 0.5);
        d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
      }

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);

      if (e.type === 'branch') {
        const active = n > 0;
        const strokeW = active ? Math.min(3.4, 1.7 + (n / Math.max(1, totalGente)) * 1.8) : 1.3;
        path.setAttribute('class', 'grafo-edge-path' + (active ? ' is-active' : ' is-empty'));
        path.setAttribute('stroke-width', strokeW.toFixed(2));
        path.setAttribute('marker-end', active ? 'url(#grafo-arrow-active)' : 'url(#grafo-arrow-muted)');
        svg.appendChild(path);

        const yExit = Math.max(y1, yCardBottom + 6);
        const t = 0.68;
        const mt = 1 - t;
        const dy = Math.max(38, (y2 - yExit) * 0.55);

        const bx = (mt * mt * mt) * x1 + 3 * (mt * mt) * t * x1 + 3 * mt * (t * t) * x2 + (t * t * t) * x2;
        const by = (mt * mt * mt) * yExit + 3 * (mt * mt) * t * (yExit + dy) + 3 * mt * (t * t) * (y2 - dy) + (t * t * t) * y2;

        const badge = document.createElement('div');
        badge.className = 'grafo-edge-badge is-interactive' + (active ? ' is-active' : ' is-empty');
        badge.style.left = `${bx}px`;
        badge.style.top = `${by}px`;
        badge.title = 'Clic para editar esta condición';
        badge.innerHTML =
          `<span class="grafo-edge-cond">${esc(textoCond(e.rule))}</span>` +
          `<span class="grafo-edge-count">${n}p</span>` +
          `<button type="button" class="grafo-edge-del" title="Eliminar condición (devolver a Ruta Base)">✕</button>`;

        badge.querySelector('.grafo-edge-del').addEventListener('click', ev => {
          ev.stopPropagation();
          eliminarReglaDeNodo(e.toId, e.fromId, e.rule);
        });

        badge.addEventListener('click', ev => {
          ev.stopPropagation();
          abrirPopoverArista(e, badge);
        });

        labelsHost.appendChild(badge);
      } else if (e.type === 'trunk') {
        path.setAttribute('class', 'grafo-edge-path is-trunk-edge');
        path.setAttribute('stroke-width', '2.4');
        path.setAttribute('marker-end', 'url(#grafo-arrow-trunk)');
        svg.appendChild(path);
      } else if (e.type === 'return') {
        const active = n > 0;
        path.setAttribute('class', 'grafo-edge-path is-return-edge' + (active ? ' is-active' : ' is-empty'));
        path.setAttribute('stroke-width', active ? '2' : '1.3');
        path.setAttribute('marker-end', active ? 'url(#grafo-arrow-return)' : 'url(#grafo-arrow-muted)');
        svg.appendChild(path);
      } else if (e.type === 'bypass') {
        path.setAttribute('class', 'grafo-edge-path is-bypass-edge');
        path.setAttribute('stroke-width', '1.4');
        path.setAttribute('marker-end', 'url(#grafo-arrow-return)');
        svg.appendChild(path);
      }
    });
  }

  function creariaCiclo(sourceId, targetId, preguntas) {
    if (sourceId === targetId) return true;
    const visitados = new Set([targetId]);
    const cola = [targetId];
    while (cola.length) {
      const curr = cola.shift();
      for (const q of preguntas) {
        const { rules } = reglasEfectivas(q);
        if (rules.some(r => r.qid === curr)) {
          if (q.id === sourceId) return true;
          if (!visitados.has(q.id)) {
            visitados.add(q.id);
            cola.push(q.id);
          }
        }
      }
    }
    return false;
  }

  async function actualizarCondicionPregunta(q, nuevoMostrarSi) {
    if (!q.config) q.config = {};
    if (!nuevoMostrarSi || (Array.isArray(nuevoMostrarSi.rules) && !nuevoMostrarSi.rules.length)) {
      delete q.config.mostrarSi;
    } else {
      q.config.mostrarSi = nuevoMostrarSi;
    }

    const prevZoom = _zoom, prevPanX = _panX, prevPanY = _panY;
    render(true);
    _zoom = prevZoom; _panX = prevPanX; _panY = prevPanY;
    aplicarTransform();

    if (typeof renderAllQuestions === 'function') renderAllQuestions();
    if (typeof restoreDraft === 'function') restoreDraft();
    if (typeof renderRail === 'function') renderRail();

    try {
      if (typeof saveQuestionCondition === 'function') {
        await saveQuestionCondition(q.id, q.config.mostrarSi || null);
      } else if (typeof apiPost === 'function' && typeof user !== 'undefined' && user) {
        await apiPost({
          action: 'update_question_config',
          eid: user.eid,
          nombre: user.nombre,
          pinHash: user.pinHash,
          qid: q.id,
          config: q.config
        });
      }
    } catch (err) {
      console.warn('Cambio aplicado localmente; avisa si el backend requiere otra acción:', err);
    }
  }

  function render() {
    const host = document.getElementById('arbol-body');
    if (!host) return;
    const preguntas = (schema || []).filter(q => !esMarca(q));
    if (!preguntas.length) {
      host.innerHTML = '<p class="arbol-vacio">Aún no hay preguntas.</p>';
      return;
    }

    const gente = respuestas || [];
    const topo = construirTopologia(preguntas, gente);
    _ultimoTopo = { topo, totalGente: gente.length };

    const visitedDom = new Set();
    let stagesHtml = topo.stages.map(st => {
      return `<section class="grafo-stage-block">` +
        renderSubtreeHtml(st.rootQ, topo, visitedDom) +
      `</section>`;
    }).join('');

    if (topo.needsEndNode) {
      stagesHtml += `<section class="grafo-stage-block">` +
        `<article class="grafo-node is-trunk is-end-node" data-qid="__FIN__">` +
          `<span class="grafo-node-code trunk-code"><i class="fa-solid fa-flag-checkered" aria-hidden="true"></i></span>` +
          `<span class="grafo-end-txt">Ruta base · Fin del cuestionario (${gente.length}p)</span>` +
        `</article>` +
      `</section>`;
    }

    host.innerHTML =
      `<div class="grafo-toolbar-top">` +
        `<p class="arbol-nota"><i class="fa-solid fa-route" aria-hidden="true"></i> ` +
        `<b>Ruta base (A1 → A2…)</b> en el eje central: las preguntas condicionales abren subramas (<b>B, C…</b>) y al terminar reconvergen de nuevo a la ruta base. ` +
        `Arrastra con el ratón para moverte por el mapa y usa la rueda para hacer zoom.</p>` +
      `</div>` +
      `<div class="grafo-viewport" id="grafo-viewport">` +
        `<div class="grafo-hud">` +
          `<button type="button" class="grafo-hud-btn" id="grafo-z-in" title="Acercar">+</button>` +
          `<span class="grafo-hud-lbl" id="grafo-zoom-lbl">100%</span>` +
          `<button type="button" class="grafo-hud-btn" id="grafo-z-out" title="Alejar">−</button>` +
          `<button type="button" class="grafo-hud-btn" id="grafo-z-fit" title="Centrar y encajar mapa"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>` +
        `</div>` +
        `<div class="grafo-stage" id="grafo-stage">` +
          `<svg class="grafo-svg" aria-hidden="true">` +
            `<defs>` +
              `<marker id="grafo-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
                `<path d="M 0 1 L 9 5 L 0 9 z" fill="var(--accent2)"/>` +
              `</marker>` +
              `<marker id="grafo-arrow-trunk" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
                `<path d="M 0 1 L 9 5 L 0 9 z" fill="var(--accent)"/>` +
              `</marker>` +
              `<marker id="grafo-arrow-return" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
                `<path d="M 0 1 L 9 5 L 0 9 z" fill="var(--accent3)"/>` +
              `</marker>` +
              `<marker id="grafo-arrow-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
                `<path d="M 0 1 L 9 5 L 0 9 z" fill="var(--border)"/>` +
              `</marker>` +
            `</defs>` +
            `<g class="grafo-svg-edges"></g>` +
          `</svg>` +
          `<div class="grafo-labels-layer" aria-hidden="true"></div>` +
          `<div class="grafo-spine-wrap">${stagesHtml}</div>` +
        `</div>` +
      `</div>`;

    const vp = document.getElementById('grafo-viewport');
    if (vp) bindPanZoom(vp);

    document.getElementById('grafo-z-in')?.addEventListener('click', () => {
      _zoom = Math.min(2.2, _zoom * 1.2);
      aplicarTransform();
    });
    document.getElementById('grafo-z-out')?.addEventListener('click', () => {
      _zoom = Math.max(0.35, _zoom / 1.2);
      aplicarTransform();
    });
    document.getElementById('grafo-z-fit')?.addEventListener('click', () => {
      centrarMapa(true);
    });

    host.querySelectorAll('.grafo-opt-link').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const q = schema[parseInt(b.dataset.idx, 10)];
      if (q && b.dataset.opt) iniciarModoEnlace(q, b.dataset.opt);
    }));

    host.querySelectorAll('.grafo-node:not(.is-end-node)').forEach(card => {
      card.addEventListener('click', e => {
        if (!_linkingSource) return;
        e.preventDefault(); e.stopPropagation();
        const qDest = (schema || []).find(q => q.id === card.dataset.qid);
        if (qDest) completarEnlaceEnNodo(qDest);
      });
    });

    host.querySelectorAll('.arbol-go').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      cerrar();
      if (typeof switchMode === 'function') switchMode('survey');
      if (typeof goToSection === 'function') goToSection(parseInt(b.dataset.idx, 10));
    }));

    host.querySelectorAll('.arbol-branch, .grafo-opt-add').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const q = schema[parseInt(b.dataset.idx, 10)];
      const optPre = b.dataset.opt || null;
      if (!q) return;
      cerrar();
      if (typeof switchMode === 'function') switchMode('survey');
      if (typeof abrirAddPreguntaCondicionado === 'function') {
        abrirAddPreguntaCondicionado(q, optPre);
        if (optPre) {
          setTimeout(() => {
            const valSel = document.querySelector('#add-q-cond-host select[multiple], #add-q-cond-host select:nth-of-type(3)');
            if (valSel) {
              Array.from(valSel.options).forEach(o => { o.selected = (o.value === optPre); });
              valSel.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, 60);
        }
      }
    }));

    requestAnimationFrame(() => {
      const stage = document.getElementById('grafo-stage');
      if (stage) {
        _zoom = 1; _panX = 0; _panY = 0;
        stage.style.transform = 'none';
        trazarFlechas(stage, topo, gente.length);
        centrarMapa(false);
      }
    });
  }

  function redibujarFlechas() {
    const stage = document.getElementById('grafo-stage');
    if (stage && _ultimoTopo) {
      trazarFlechas(stage, _ultimoTopo.topo, _ultimoTopo.totalGente);
    }
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
    if (bd) { bd.hidden = true; }
    document.body.classList.remove('map-modal-open');
  }

  window.renderArbol = render;
  window.renderArbolSiAbierto = function () {
    const bd = document.getElementById('arbol-modal-backdrop');
    if (bd && !bd.hidden) render();
  };

  window.addEventListener('resize', redibujarFlechas);

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