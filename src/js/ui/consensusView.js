// ══════════════════════════════════════════════════════════════════════════
//  VISTA «CONSENSO / REFORMULARIO» — src/js/ui/consensusView.js
//
//  Extraído de reformulario.js (líneas 915–fin). Capa SOLO de presentación:
//  consume el `model` y las `soluciones` que produce el motor puro
//  (engine/optimizador.js) y pinta tarjetas en #consensus-container.
//  Dependencias asumidas (por ahora globales clásicas): $, esc, faIcon,
//  renderMarkdown, div, getFranjas, proscontras (pcParts), patchSingleAnswer…
//
//  ⚠ FASE 1 DE LA REESTRUCTURACIÓN: aún NO enlazado; ver docs/arquitectura.md
// ══════════════════════════════════════════════════════════════════════════

function renderMarkdown(texto) {
    if (!texto) return '';
    const htmlCrudo = marked.parse(String(texto), { breaks: true, gfm: true });
    return DOMPurify.sanitize(htmlCrudo, { USE_PROFILES: { html: true } });
}

function renderReformulario() {
  const container = $('consensus-container');
  if (!container) return;
  if (container.querySelector('input[type=range]:active')) return;

  container.innerHTML = '';

  if (!serverHasV2) {
    const warn = div('card');
    warn.style.borderColor = 'var(--accent)';
    warn.innerHTML = `
      <div class="card-title"><span class="num" style="background:var(--accent)">!</span> Falta actualizar <code>schema.sql</code> en Supabase</div>
      <p style="color:var(--ink);font-size:0.9rem;line-height:1.5">
        Hay <b>${respondentes.length}</b> participante(s) en la encuesta, pero el servidor de Supabase sigue ejecutando la función <code>_snapshot</code> antigua (que no enviaba el campo <code>respuestas</code> ni tenía la tabla <code>debate</code>).<br><br>
        👉 Abre <b>Supabase → SQL Editor</b>, pega el nuevo <code>schema.sql</code> completo y pulsa <b>Run</b>. Al recargar la página verás inmediatamente las respuestas y funcionará el debate.
      </p>
    `;
    container.appendChild(warn);
    return;
  }

  if (!respuestas.length) {
    const empty = div('card');
    empty.innerHTML = `
      <div class="card-title"><span class="num">📊</span> Sin respuestas enviadas aún</div>
      <p style="color:var(--muted);font-size:0.9rem">
        Hay ${respondentes.length} persona(s) registrada(s) en el viaje, pero nadie ha pulsado <b>«Enviar mi respuesta →»</b> todavía.
      </p>
    `;
    container.appendChild(empty);
    return;
  }

  const model = buildModelData();
  const { soluciones, diagnosticos } = ejecutarMotorFactibilidad(model);
  const topo = computeTopologyAndSensitivity(model, soluciones);

  container.appendChild(buildExecutiveSummaryCard(model, soluciones, topo));
  container.appendChild(buildPreferenciasBooleanasCard(model));
  container.appendChild(buildFeasibleSolutionsSection(soluciones, diagnosticos, topo));

  if (model.viajeros.length >= 2) {
    container.appendChild(buildTopologyAndSensitivityCard(model, topo));
  }

  const myAns = getMySubmittedAnswers();
  const secHeader = div('ref-section-divider');
  secHeader.innerHTML = `<span>Reformulario Interactivo por Pregunta (haz clic para cambiar tu voto en vivo)</span>`;
  container.appendChild(secHeader);

  schema.forEach((q, idx) => {
    // En modo "sección" (wizard.js) solo se pinta la pregunta solicitada.
    if (typeof _refQidOverride !== 'undefined' && _refQidOverride && q.id !== _refQidOverride) return;
    const card = buildAnalyticalCard(q, idx, myAns);
    if (card) container.appendChild(card);
  });
}

function buildExecutiveSummaryCard(model, soluciones, topo) {
  const card = div('card ref-summary-card');
  const nombres = respondentes.map(r => r.nombre);
  let expected = 0, variance = 0;
  const probs = nombres.map(nombre => {
    const p = getEffectiveProb(nombre);
    expected += p;
    variance += p * (1 - p);
    return { nombre, p };
  }).sort((a, b) => b.p - a.p);

  const nMax = soluciones.length ? Math.max(...soluciones.map(s => s.N)) : 0;
  const lMax = soluciones.length ? Math.max(...soluciones.map(s => s.L)) : 0;

  card.innerHTML = `
    <div class="ref-summary-header">
      <div>
        <div class="card-title" style="margin-bottom:4px"><span class="num">Σ</span> Síntesis de Factibilidad y Reformulario</div>
        <p style="font-size:0.82rem;color:var(--muted)">
          ${soluciones.length} solución(es) factible(s) encontrada(s) · Máx. N=${nMax} asistentes · L=${lMax} días
          · Logística: ${model.logistica ? `considerada (${model.nLog}/${model.viajeros.length} con dato de transporte)` : 'no considerada'}
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <label class="toggle-label" style="font-size:0.78rem;background:var(--bg);padding:5px 10px;border-radius:8px;border:1px solid var(--border)">
          <input type="checkbox" id="toggle-weight-prob" ${weightByProb ? 'checked' : ''}>
          <span class="toggle-pill"></span>
          <span>Ponderar rankings por pᵢ</span>
        </label>
        <label class="toggle-label" style="font-size:0.78rem;background:var(--bg);padding:5px 10px;border-radius:8px;border:1px solid var(--border)">
          <input type="checkbox" id="toggle-mc-empirical" ${mcUseEmpiricalProb ? 'checked' : ''}>
          <span class="toggle-pill"></span>
          <span>Monte Carlo con ausencias votadas</span>
        </label>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box">
        <span class="kpi-label">Participantes (con fechas)</span>
        <span class="kpi-val">${model.viajeros.length} <small>/ ${respondentes.length} resp.</small></span>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Esperanza asistencia E[N]</span>
        <span class="kpi-val">${expected.toFixed(1)} <small>± ${Math.sqrt(variance).toFixed(1)}</small></span>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Probabilidad efectiva por miembro</span>
        <div class="kpi-pills">
          ${probs.map(u => `<span class="user-prob-pill">${esc(u.nombre)} <b>${Math.round(u.p * 100)}%</b></span>`).join('')}
        </div>
      </div>
    </div>
  `;

  card.querySelector('#toggle-weight-prob').addEventListener('change', e => {
    weightByProb = e.target.checked;
    renderReformulario();
  });
  card.querySelector('#toggle-mc-empirical').addEventListener('change', e => {
    mcUseEmpiricalProb = e.target.checked;
    renderReformulario();
  });

  return card;
}

// ── TABLA DE PREFERENCIAS BOOLEANAS POR VIAJERO ─────────────────────────────
// Muestra de un vistazo quién votó ir y venir, quién prefiere solo finde,
// quién no tiene preferencia de día y quién prefiere puente. Sin emojis:
// celdas con check/cruz y color según el caso.
function buildPreferenciasBooleanasCard(model) {
  const card = div('card pref-bool-card');

  if (!model.viajeros.length) {
    card.innerHTML = `
      <div class="card-title"><span class="num">P</span> Preferencias booleanas</div>
      <p style="color:var(--muted);font-size:0.85rem">Sin viajeros con fechas válidas todavía.</p>`;
    return card;
  }

  const cols = [
    { key: 'diasMax',      label: 'Días máx.',   type: 'num' },
    { key: 'irYVenir',     label: 'Ir y venir',  type: 'bool' },
    { key: 'soloFinde',    label: 'Solo finde',  type: 'bool' },
    { key: 'meDaIgual',    label: 'Me da igual', type: 'bool' },
    { key: 'preferirPuente', label: 'Preferir puente', type: 'bool' },
    { key: '_horarios',    label: 'Horarios',    type: 'tri' },
    { key: '_fechas',      label: 'Fechas',      type: 'tri' },
  ];

  const cellHtml = (v, col) => {
    if (col.type === 'num') return `<td><b>${v.diasMax}</b></td>`;
    if (col.type === 'bool') {
      const on = !!v[col.key];
      return `<td class="${on ? 'pb-yes' : 'pb-no'}">${on ? 'Sí' : 'No'}</td>`;
    }
    // tri: horarios/fechas rellenos o no (relevante para el cruce del motor)
    let val;
    if (col.key === '_horarios') val = v.horFranjasPorDia && Object.keys(v.horFranjasPorDia).length;
    else val = v.conjuntoFechas && v.conjuntoFechas.size;
    return `<td class="${val ? 'pb-yes' : 'pb-miss'}">${val ? 'Relleno' : 'Sin dato'}</td>`;
  };

  card.innerHTML = `
    <div class="card-title"><span class="num">P</span> Preferencias booleanas por viajero</div>
    <p style="font-size:0.82rem;color:var(--muted);margin-bottom:10px">
      Estado declarado por cada participante. Las columnas "Horarios" y "Fechas" indican
      qué fuentes alimentan el cruce de soluciones del motor: un viajero sin una de ellas
      se trata con restricción laxa (compatible con quien sí la rellena).
    </p>
    <div style="overflow-x:auto">
      <table class="compat-matrix-table pb-table">
        <thead>
          <tr>
            <th style="text-align:left">Viajero</th>
            ${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${model.viajeros.map(v => `
            <tr>
              <th style="text-align:left">${esc(v.nombre)}</th>
              ${cols.map(c => cellHtml(v, c)).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  return card;
}

// ── RENDER DE SOLUCIONES ÓPTIMAS (Port visual de reporte.py) ────────────────
function buildFeasibleSolutionsSection(soluciones, diagnosticos, topo) {
  const wrap = div('ref-solutions-wrap');

  if (!soluciones.length) {
    const diagHtml = diagnosticos.slice(0, 6).map(d => `<li>${esc(d)}</li>`).join('');
    wrap.innerHTML = `
      <div class="card" style="border-color:var(--accent)">
        <div class="card-title"><span class="num" style="background:var(--accent)">!</span> Sin soluciones simultáneamente factibles en fechas y transporte</div>
        <p style="font-size:0.86rem;color:var(--muted);margin-bottom:10px">
          El optimizador evaluó todas las ventanas con al menos 2 miembros de núcleo, pero ninguna superó las restricciones de capacidad de vehículos, solapamiento de fechas o cruce de horarios:
        </p>
        ${diagHtml ? `<ul style="font-size:0.8rem;color:var(--muted);padding-left:18px;margin-bottom:10px">${diagHtml}</ul>` : ''}
        <p style="font-size:0.84rem;color:var(--ink)">
          <b>Usa el Reformulario más abajo</b> para ampliar tus fechas, indicar franjas horarias compatibles o cambiar tu opción de transporte a <em>"Llevo coche"</em> y desbloquear soluciones.
        </p>
      </div>
    `;
    return wrap;
  }

  soluciones.forEach((sol, idx) => {
    const card = div('card sol-card');
    const tagFinde = sol.incluyeFinde ? 'Incluye Fin de Semana' : 'Solo entre semana';
    const tagExcursion = (sol.excursion || sol.L === 1) ? ' · Excursión (ir y venir)' : '';
    const cruceStr = sol.cruceHorario
      ? ` · Cruce horario: ${sol.cruceHorario.texto} (${sol.cruceHorario.solape.toFixed(1).replace(/\.0$/, '')} h)`
      : '';
    const pStr = sol.pMaxGrupo != null ? `${sol.pMaxGrupo} €` : 'N/A';
    const logOn = !(sol.flujo && sol.flujo.sinLogistica);
    const sinDato = logOn ? sol.viajerosAsignados.filter(v => !v.tieneLogistica).map(v => v.nombre) : [];

    // Tablas de logística (Idas y Vueltas)
    const renderTablaViajes = (viajes, titulo, badgeCls) => {
      if (!viajes || !viajes.length) return `<div class="muted-note">Sin desplazamientos en coche requeridos.</div>`;
      return `
        <div class="sol-log-box">
          <div class="sol-log-title ${badgeCls}">${titulo}</div>
          <table class="sol-log-table">
            <thead><tr><th>Fecha</th><th>Conductor</th><th>Pasajeros asignados</th></tr></thead>
            <tbody>
              ${viajes.map(v => `
                <tr>
                  <td class="mono-cell">${fmtShortDate(v.fecha)}</td>
                  <td><b>${esc(v.conductor)}</b></td>
                  <td>${v.pasajeros.length ? v.pasajeros.map(esc).join(', ') : '<em style="color:var(--muted)">solo</em>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    };

    // Evaluación de casas (Precio Cooperativo vs Coalición)
    const casasHtml = sol.casasEvaluadas.length
      ? sol.casasEvaluadas.map(c => `
          <div class="sol-casa-item ${c.viable ? 'viable' : 'inviable'}">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
              <strong>${esc(c.nombre)}</strong>
              <span class="sol-badge ${c.viable ? 'ok' : 'err'}">${c.viable ? '✓ Viable en presupuesto' : '✗ Excede presupuesto mín.'}</span>
            </div>
            <div class="sol-casa-meta">
              <span>Total: <b>${c.precio_total.toFixed(0)}€</b></span>
              <span>Cooperativo (entre ${sol.N}): <b>${c.p_coop.toFixed(1)}€/pers</b></span>
              <span>Coalición (${c.votos} votantes): <b>${c.p_coal.toFixed(1)}€/pers</b></span>
            </div>
          </div>
        `).join('')
      : `<div class="muted-note">No hay casas con precio numérico votadas por este subgrupo.</div>`;

    // Resiliencia Monte Carlo
    const frag = sol.fragilidad;
    let fragHtml = '';
    if (frag) {
      const viaPct = Math.round(frag.viabilidadGlobal * 100);
      const criticos = Object.entries(frag.impactoIndividual).filter(([, v]) => v === 1.0).map(([k]) => k);
      const cadenaArr = Object.entries(frag.impactoCadena)
        .map(([k, v]) => ({ nombre: k, drop: Math.round(v * 1000) / 10, crit: frag.impactoIndividual[k] === 1.0 }))
        .sort((a, b) => b.drop - a.drop);

      fragHtml = `
        <div class="sol-frag-box">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:10px">
            <div>
              <span class="kpi-label">Resiliencia Logística (Monte Carlo, ${frag.nSim} sims)</span>
              <div style="font-size:1.35rem;font-weight:700;color:${viaPct >= 80 ? 'var(--accent2)' : viaPct >= 50 ? '#b7791f' : 'var(--accent)'}">
                ${viaPct}% viabilidad ante bajas
              </div>
            </div>
            <div>
              <span class="kpi-label">Imprescindibles (colapso inmediato si faltan)</span>
              <div style="margin-top:4px">
                ${criticos.length ? criticos.map(c => `<span class="voter-chip veto">${esc(c)}</span>`).join(' ') : `<span style="color:var(--accent2);font-size:0.8rem">✓ Ninguno crítico ${logOn ? '(hay holgura de coches)' : '(sin restricción logística)'}</span>`}
              </div>
            </div>
          </div>
          <div class="ref-dist-list">
            ${cadenaArr.slice(0, 5).map(item => `
              <div class="ref-dist-row">
                <span class="ref-dist-name">${esc(item.nombre)}${item.crit ? '⚠️' : ''}</span>
                <div class="ref-bar-track" style="flex:1">
                  <div class="ref-bar-fill ${item.crit ? 'negative' : ''}" style="width:${Math.min(100, Math.max(3, item.drop))}%"></div>
                </div>
                <span class="ref-dist-val" style="width:70px;text-align:right">-${item.drop}% viab.</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="sol-card-head">
        <div>
          <span class="sol-tag">Solución Óptima #${idx + 1} · ${tagFinde}${esc(tagExcursion)}</span>
          <h3 class="sol-interval">${fmtShortDate(sol.fIni)} → ${fmtShortDate(sol.fFin)} (${sol.L} día${sol.L === 1 ? '' : 's'})${esc(cruceStr)}</h3>
        </div>
        <div class="sol-pills">
          <span class="sol-pill">Total <b>${sol.N}</b></span>
          <span class="sol-pill">Núcleo <b>${sol.N_full}</b></span>
          <span class="sol-pill">Satélites <b>${sol.N_convoy}</b></span>
          <span class="sol-pill">Tope Coop. <b>${pStr}</b></span>
        </div>
      </div>

      <div class="sol-group-chips">
        <div><small>Núcleo (${sol.N_full}):</small> ${sol.asistentesNucleo.map(n => `<span class="voter-chip star">${esc(n)}</span>`).join(' ')}</div>
        ${sol.satelitesAsignados.length ? `<div><small>Satélites (${sol.N_convoy}):</small>${sol.satelitesAsignados.map(n => `<span class="voter-chip">${esc(n)} (${fmtShortDate(sol.asignacion[n][0])}→${fmtShortDate(sol.asignacion[n][sol.asignacion[n].length - 1])})</span>`).join(' ')}</div>` : ''}
        ${sol.excluidos.length ? `<div><small>Ausentes (${sol.excluidos.length}):</small>${sol.excluidos.map(n => `<span class="voter-chip veto">${esc(n)}</span>`).join(' ')}</div>` : `<div><span style="color:var(--accent2);font-size:0.8rem">✓ ¡Asistencia perfecta del grupo!</span></div>`}
      </div>

      ${logOn ? `
        <div class="sol-log-grid">
          ${renderTablaViajes(sol.flujo.idas, '↗ Viajes de Ida', 'ida')}
          ${renderTablaViajes(sol.flujo.vueltas, '↙ Viajes de Vuelta', 'vuelta')}
        </div>
        ${sinDato.length ? `<div class="muted-note">Sin dato de transporte (no entran en el reparto de coches): <b>${sinDato.map(esc).join(', ')}</b></div>` : ''}
      ` : `<div class="muted-note">🚫 Logística no considerada: nadie ha indicado transporte, así que la factibilidad solo depende de fechas.</div>`}

      <div style="margin-top:14px">
        <div style="font-size:0.82rem;color:var(--muted);margin-bottom:6px">
          Plan preferido por los asistentes: <strong style="color:var(--ink)">${esc(sol.opcionVotada)}</strong>
        </div>
        ${casasHtml}
      </div>

      ${fragHtml}

      <div style="margin-top:12px;display:flex;justify-content:flex-end">
        <button type="button" class="btn-propose btn-propose-sol" style="padding:6px 12px;font-size:0.8rem">
          📌 Llevar esta solución como Propuesta a la Sala de Debate →
        </button>
      </div>
    `;

    card.querySelector('.btn-propose-sol').addEventListener('click', () => {
      const textoPropuesta = `Propongo cerrar la Solución #${idx + 1}: del ${fmtShortDate(sol.fIni)} al ${fmtShortDate(sol.fFin)} (${sol.L} día${sol.L === 1 ? '' : 's'}, ${sol.N} asistentes: ${[...sol.asistentesNucleo, ...sol.satelitesAsignados].join(', ')}). Plan: ${sol.opcionVotada}.`;
      if (typeof createProposalFromConsensus === 'function') {
        createProposalFromConsensus(textoPropuesta);
      }
    });

    wrap.appendChild(card);
  });

  return wrap;
}

// ── TARJETA DE SENSIBILIDAD, TOPOLOGÍA (A^T A) E IMPRESCINDIBLES ────────────
function buildTopologyAndSensitivityCard(model, topo) {
  const card = div('card');
  const s = topo.sensibilidad;
  const n = topo.nombres.length;
  let maxShared = 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) if (topo.compat[i][j] > maxShared) maxShared = topo.compat[i][j];
  }

  card.innerHTML = `
    <div class="card-title"><span class="num">🕸️</span> Sensibilidad y cuellos de botella</div>

    <div class="sens-grid-4">
      <div class="kpi-box">
        <span class="kpi-label">Cuello de botella logístico</span>
        <span class="kpi-val" style="color:var(--accent)">${esc(s.diaCritico)}</span>
                <small>${s.logistica ? `Holgura mínima: ${s.minHolgura} plaza(s)` : 'Nadie ha indicado transporte'}</small>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Aislamiento Topológico (L₁)</span>
        <span class="kpi-val">${esc(s.nomAislado)}</span>
        <small>${s.valAislado} intersecciones con el grupo</small>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Restricción Económica</span>
        <span class="kpi-val" style="color:var(--accent)">${esc(s.nomEco)}</span>
        <small>Fija el techo coop. en ${s.valEco} €/pers</small>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Menor Disponibilidad</span>
        <span class="kpi-val">${esc(s.nomT)}</span>
        <small>${s.valT} días totales marcados</small>
      </div>
    </div>

    ${topo.rankingIndispensables.length ? `
      <div style="margin-top:16px">
        <div style="font-size:0.82rem;font-weight:600;color:var(--muted);margin-bottom:8px">ÍNDICE DE IMPRESCINDIBILIDAD (Agregado Monte Carlo)</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${topo.rankingIndispensables.slice(0, 4).map((r, i) => `
            <span class="user-prob-pill" style="padding:5px 10px">
              ${['🥇','🥈','🥉','•'][i]} <b>${esc(r.nombre)}</b>: índice ${r.score}
            </span>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <details style="margin-top:16px">
      <summary style="cursor:pointer;font-size:0.84rem;font-weight:500;color:var(--accent3)">
        Ver Matriz de Compatibilidad Temporal Cruzada (días en común)
      </summary>
      <div style="overflow-x:auto;margin-top:10px">
        <table class="compat-matrix-table">
          <thead>
            <tr>
              <th></th>
              ${topo.nombres.map(nom => `<th>${esc(nom.slice(0, 8))}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${topo.nombres.map((nomI, i) => `
              <tr>
                <th style="text-align:left">${esc(nomI)}</th>${topo.nombres.map((_, j) => {
                  const v = topo.compat[i][j];
                  const alpha = (v / maxShared) * 0.45;
                  return `<td style="background:rgba(58,107,74,${alpha.toFixed(2)})">${v}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </details>
  `;
  return card;
}

// ── 10. TARJETAS INTERACTIVAS DE REFORMULARIO POR PREGUNTA ──────────────────
function buildAnalyticalCard(q, idx, myAns) {
  const card = div('card ref-card');
  const title = div('card-title');
  title.innerHTML = `<span class="num">${idx + 1}</span> ${esc(q.label)}`;
  card.appendChild(title);

  const myVal = extractAnswer(myAns, q);

  switch (q.tipo) {
    case 'checkbox':
    case 'voto-ponderado':
    case 'casas':
      buildOptionsConsensus(card, q, myVal);
      break;
    case 'slider':
      buildSliderConsensus(card, q, myVal);
      break;
    case 'disponibilidad':
      buildDisponibilidadConsensus(card, q);
      break;
    case 'radio':
      buildRadioConsensus(card, q, myVal);
      break;
    case 'textarea':
      buildTextareaConsensus(card, q);
      break;
    case 'horarios':
      buildHorariosConsensus(card, q, myVal);
      break;
  }
  return card;
}

function buildOptionsConsensus(card, q, myVal) {
  const pcIdx = pcIndex();
  const opts  = (q.opciones || []).map(op => {
    const key    = optVal(q, op);
    const precio = (op && typeof op === 'object' && op.precio) ? op.precio : null;
    const url    = (op && typeof op === 'object' && op.url) ? safeUrl(op.url) : '';
    const foto = (op && typeof op === 'object' && op.foto) ? safeUrl(op.foto) : '';
    return { key, precio, url, foto, score: 0, rawScore: 0, voters: [], vetoes: [] };
  });

  const map = new Map(opts.map(o => [o.key, o]));

  respuestas.forEach(r => {
    const v = extractAnswer(r.answers, q);
    if (!v) return;
    const w = userWeight(r.nombre);

    if (q.tipo === 'checkbox') {
      (Array.isArray(v) ? v : []).forEach(k => {
        const item = map.get(k);
        if (item) { item.score += w; item.rawScore += 1; item.voters.push({ nombre: r.nombre, pts: 1 }); }
      });
    } else if (q.tipo === 'casas') {
      (Array.isArray(v) ? v : []).forEach(c => {
        const k = typeof c === 'string' ? c : c.nombre;
        const item = map.get(k);
        if (item) { item.score += w; item.rawScore += 1; item.voters.push({ nombre: r.nombre, pts: 1 }); }
      });
    } else if (q.tipo === 'voto-ponderado') {
      Object.entries(v || {}).forEach(([k, pts]) => {
        const item = map.get(k);
        const pNum = Number(pts);
        if (!item || !pNum) return;
        item.score += pNum * w;
        item.rawScore += pNum;
        if (pNum < 0) item.vetoes.push(r.nombre);
        else item.voters.push({ nombre: r.nombre, pts: pNum });
      });
    }
  });
  opts.forEach(o => {
    o.pcAdj = pcAjuste(pcIdx.get(q.id + '\u0000' + o.key) || []);
    o.score += o.pcAdj; o.rawScore += o.pcAdj;
  });
  opts.sort((a, b) => b.score - a.score || b.voters.length - a.voters.length);
  const maxScore = Math.max(1, ...opts.map(o => Math.abs(o.score)));

  const list = div('ref-opt-list');

  opts.forEach((o, rank) => {
    const row = div('ref-opt-row' + (rank === 0 && o.score > 0 ? ' is-leader' : ''));
    const pct = Math.max(0, Math.min(100, (o.score / maxScore) * 100));
    const entriesPC = pcIdx.get(q.id + '\u0000' + o.key) || [];
    const pros = entriesPC.filter(e => e.tipo === 'pro').length;
    const cons = entriesPC.filter(e => e.tipo === 'contra').length;
    const controversial = (o.vetoes.length > 0 && o.voters.length >= 2) || (pros > 0 && cons >= 2);

    let controlsHtml = '';
    if (q.tipo === 'voto-ponderado') {
      const myScore = (myVal && myVal[o.key]) ? Number(myVal[o.key]) : 0;
      controlsHtml = `
        <div class="btn-group-pond ref-inline-pond">
          <button type="button" class="btn-pond ${myScore === -1 ? 'active' : ''}" data-score="-1">-1</button>
          <button type="button" class="btn-pond ${myScore === 1 ? 'active' : ''}" data-score="1">+1</button>
          <button type="button" class="btn-pond ${myScore === 3 ? 'active' : ''}" data-score="3">+3</button>
        </div>
      `;
    } else {
      const isChecked = q.tipo === 'casas'
        ? (Array.isArray(myVal) && myVal.some(c => (typeof c === 'string' ? c : c.nombre) === o.key))
        : (Array.isArray(myVal) && myVal.includes(o.key));
      controlsHtml = `
        <button type="button" class="btn-ref-toggle ${isChecked ? 'active' : ''}">
          ${isChecked ? '✓ Votado' : '+ Votar'}
        </button>
      `;
    }

    row.innerHTML = `
      <div class="ref-opt-main">
        <div class="ref-opt-info">
          <span class="ref-rank">#${rank + 1}</span>
          ${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener" class="ref-link">${esc(o.key)} ↗</a>` : `<span class="ref-opt-title">${esc(o.key)}</span>`}
          ${o.precio ? `<span class="casa-precio">${esc(o.precio)}</span>` : ''}
          ${o.foto ? `<img class="ref-foto" src="${esc(o.foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
          ${controversial ? `<span class="badge-controversy"><i class="fa-solid fa-volcano"></i> Polarizada</span>` : ''}
        </div>
        <div class="ref-opt-actions">
          <span class="ref-score-badge">${weightByProb ? o.score.toFixed(1) : o.rawScore} pts</span>
          ${controlsHtml}
        </div>
      </div>
      <div class="ref-bar-track">
        <div class="ref-bar-fill ${o.score < 0 ? 'negative' : ''}" style="width:${pct}%"></div>
      </div>
      <div class="ref-opt-meta">
        <div class="ref-voters">
          ${o.voters.map(v => `<span class="voter-chip ${v.pts === 3 ? 'star' : ''}">${esc(v.nombre)}${v.pts === 3 ? ' ★' : ''}</span>`).join('')}
          ${o.vetoes.map(nombre => `<span class="voter-chip veto">${esc(nombre)} ✕</span>`).join('')}
          ${!o.voters.length && !o.vetoes.length ? `<span style="color:var(--muted);font-size:0.75rem">Sin votos aún</span>` : ''}
        </div>
        <button type="button" class="btn-JumpDebate">
          💬 ${pros + cons > 0 ? `▲${pros} ▼${cons} · Debatir` : 'Debatir opción'}
        </button>
      </div>
    `;

    if (q.tipo === 'voto-ponderado') {
      row.querySelectorAll('.btn-pond').forEach(btn => {
        btn.addEventListener('click', () => {
          const s = parseInt(btn.dataset.score, 10);
          const next = Object.assign({}, myVal || {});
          if (next[o.key] === s) delete next[o.key];
          else {
            if (s === 3 || s === -1) Object.keys(next).forEach(k => { if (next[k] === s) delete next[k]; });
            next[o.key] = s;
          }
          patchSingleAnswer(q.id, next);
        });
      });
    } else {
      row.querySelector('.btn-ref-toggle').addEventListener('click', () => {
        if (q.tipo === 'casas') {
          const cur = Array.isArray(myVal) ? [...myVal] : [];
          const exists = cur.some(c => (typeof c === 'string' ? c : c.nombre) === o.key);
          const next = exists
            ? cur.filter(c => (typeof c === 'string' ? c : c.nombre) !== o.key)
            : [...cur, { nombre: o.key, precio: o.precio }];
          patchSingleAnswer(q.id, next);
        } else {
          const cur = new Set(Array.isArray(myVal) ? myVal : []);
          if (cur.has(o.key)) cur.delete(o.key); else cur.add(o.key);
          patchSingleAnswer(q.id, [...cur]);
        }
      });
    }

    row.querySelector('.btn-JumpDebate').addEventListener('click', () => {
      if (typeof openDebateFor === 'function') openDebateFor(q.id, o.key);
    });

    list.appendChild(row);
  });

  card.appendChild(list);
}

function buildSliderConsensus(card, q, myVal) {
  const cfg  = q.config || {};
  const min  = cfg.min ?? 10, max = cfg.max ?? 500, step = cfg.step ?? 10;
  const unit = cfg.unit ?? (/^(precio|presu)_/.test(q.id) ? ' €' : '');

  const entries = [];
  respuestas.forEach(r => {
    const v = extractAnswer(r.answers, q);
    if (v != null && !isNaN(v)) entries.push({ nombre: r.nombre, val: Number(v) });
  });

  if (!entries.length) {
    card.innerHTML += `<p style="color:var(--muted);font-size:0.85rem">Sin datos numéricos aún.</p>`;
    return;
  }

  entries.sort((a, b) => a.val - b.val);
  const vals = entries.map(e => e.val);
  const vMin = vals[0];
  const q1   = vals[Math.floor((vals.length - 1) * 0.25)];
  const med  = vals[Math.floor((vals.length - 1) * 0.50)];
  const mean = vals.reduce((acc, x) => acc + x, 0) / vals.length;
  const curMyVal = (myVal != null && !isNaN(myVal)) ? Number(myVal) : (cfg.default ?? med);

  const wrap = div('ref-slider-analysis');
  wrap.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:14px">
      <div class="kpi-box">
        <span class="kpi-label">Restricción Activa (Mín)</span>
        <span class="kpi-val" style="color:var(--accent)">${vMin}${esc(unit)}</span>
        <small>Por ${esc(entries[0].nombre)}</small>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Percentil 25 (Q₁)</span>
        <span class="kpi-val">${q1}${esc(unit)}</span>
        <small>75% del grupo lo acepta</small>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Mediana / Media</span>
        <span class="kpi-val">${med}${esc(unit)} <small>/ ${Math.round(mean)}${esc(unit)}</small></span>
      </div>
    </div>

    <div class="ref-dist-list">
      ${entries.map(e => {
        const pct = max > min ? ((e.val - min) / (max - min)) * 100 : 50;
        return `
          <div class="ref-dist-row">
            <span class="ref-dist-name">${esc(e.nombre)}</span>
            <div class="ref-bar-track" style="flex:1">
              <div class="ref-bar-fill" style="width:${Math.max(4, Math.min(100, pct))}%"></div>
            </div>
            <span class="ref-dist-val">${e.val}${esc(unit)}</span>
          </div>
        `;
      }).join('')}
    </div>

    <div class="ref-reformulario-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:0.85rem;font-weight:500">Ajustar mi límite en caliente:</span>
        <strong class="ref-live-val" style="color:var(--accent2);font-size:1.1rem">${curMyVal}${esc(unit)}</strong>
      </div>
      <input type="range" class="ref-live-slider" min="${min}" max="${max}" step="${step}" value="${curMyVal}">
    </div>
  `;

  const sl  = wrap.querySelector('.ref-live-slider');
  const lbl = wrap.querySelector('.ref-live-val');
  const updatePct = () => {
    const pct = max > min ? ((+sl.value - min) / (max - min)) * 100 : 0;
    sl.style.setProperty('--pct', pct + '%');
    lbl.textContent = sl.value + unit;
  };
  updatePct();
  sl.addEventListener('input', updatePct);
  sl.addEventListener('change', () => patchSingleAnswer(q.id, +sl.value));

  card.appendChild(wrap);
}

function buildDisponibilidadConsensus(card) {
  const model = buildModelData();
  if (!model.indiceFechas.length) {
    card.innerHTML += `<p style="color:var(--muted);font-size:0.85rem">Sin fechas registradas.</p>`;
    return;
  }

  // Heatmap compacto de disponibilidad por persona y fecha
  const wrap = div();
  const datesSlice = model.indiceFechas.slice(0, 45); // Primeros 45 días activos para legibilidad
  wrap.innerHTML = `
    <div style="font-size:0.82rem;color:var(--muted);margin-bottom:8px">
      Mapa de calor diario (${model.indiceFechas.length} días en el horizonte; las ventanas óptimas combinadas se muestran arriba):
    </div>
    <div style="overflow-x:auto">
      <table class="compat-matrix-table">
        <thead>
          <tr>
            <th style="text-align:left">Viajero (${model.viajeros.length})</th>
            <th>díasMax</th>
            ${datesSlice.map(f => `<th class="${isSatSunISO(f) ? 'wknd-col' : ''}">${fmtShortDate(f)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${model.viajeros.map(v => `
            <tr>
              <th style="text-align:left">${esc(v.nombre)}</th>
              <td><b>${v.diasMax}d</b></td>${datesSlice.map(f => {
                const avail = model.matriz[f][v.nombre];
                return `<td style="background:${avail ? 'rgba(58,107,74,0.65);color:#fff' : 'transparent'}">${avail ? '✓' : '·'}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  card.appendChild(wrap);
}

function buildRadioConsensus(card, q, myVal) {
  const cs = getRadioStepperConfig(q);
  const counts = new Map();
  (q.opciones || []).forEach(op => {
    const s = String(op);
    const [val, label] = s.includes('|') ? s.split('|') : [s, s];
    counts.set(val, { val, label, users: [], extraSum: 0 });
  });

  respuestas.forEach(r => {
    const v = extractAnswer(r.answers, q);
    if (!v) return;
    const est = typeof v === 'object' ? v.estado : v;
    const entry = counts.get(est);
    if (entry) {
      const extra = (cs && typeof v === 'object' && v[cs.key || 'plazasLibres']) ? Number(v[cs.key || 'plazasLibres']) : 0;
      entry.users.push({ nombre: r.nombre, extra });
      entry.extraSum += extra;
    }
  });

  const myEstado = myVal ? (typeof myVal === 'object' ? myVal.estado : myVal) : null;
  const myExtra  = (cs && myVal && typeof myVal === 'object' && myVal[cs.key || 'plazasLibres']) ? Number(myVal[cs.key || 'plazasLibres']) : (cs ? cs.default : 3);

  const list = div('ref-opt-list');
  counts.forEach(item => {
    const isMine = myEstado === item.val;
    const row = div('ref-opt-row');
    row.innerHTML = `
      <div class="ref-opt-main">
        <div class="ref-opt-info">
          <span class="ref-opt-title">${esc(item.label)}</span>
          ${cs && item.val === cs.when ? `<span class="casa-precio">Oferta total: ${item.extraSum} plazas libres</span>` : ''}
        </div>
        <div class="ref-opt-actions">
          <button type="button" class="btn-ref-toggle ${isMine ? 'active' : ''}">${isMine ? '✓ Mi elección' : 'Cambiar aquí'}</button>
        </div>
      </div>
      <div class="ref-voters" style="margin-top:6px">
        ${item.users.map(u => `<span class="voter-chip">${esc(u.nombre)}${u.extra ? ` (+${u.extra} pl.)` : ''}</span>`).join('') || `<span style="color:var(--muted);font-size:0.75rem">Nadie aún</span>`}
      </div>
    `;

    row.querySelector('.btn-ref-toggle').addEventListener('click', () => {
      if (cs) {
        const payload = { estado: item.val };
        if (item.val === cs.when) payload[cs.key || 'plazasLibres'] = myExtra;
        patchSingleAnswer(q.id, payload);
      } else {
        patchSingleAnswer(q.id, item.val);
      }
    });

    list.appendChild(row);
  });

  card.appendChild(list);
}

function buildTextareaConsensus(card, q) {
    if (q.config?.descripcion) {
        card.innerHTML += `<div class="md-content">${renderMarkdown(q.config.descripcion)}</div>`;
        return;
    }
    const notes = [];
    respuestas.forEach(r => {
        const v = extractAnswer(r.answers, q);
        if (v && String(v).trim()) notes.push({ nombre: r.nombre, texto: String(v).trim() });
    });
    
    if (!notes.length) {
        card.innerHTML += `<p style="color:var(--muted);font-size:0.85rem">Sin comentarios adicionales.</p>`;
        return;
    }
    
    const wrap = div('ref-notes-list');
    notes.forEach(n => {
        const item = div('ref-note-item');
        // Se mantiene esc() para el nombre del usuario por seguridad, 
        // pero se usa renderMarkdown() para el contenido del texto.
        item.innerHTML = `<strong>${esc(n.nombre)}:</strong> <div class="md-content">${renderMarkdown(n.texto)}</div>`;
        wrap.appendChild(item);
    });
    card.appendChild(wrap);
}
// ── OPTIMIZADOR DE VENTANAS HORARIAS Y RESTRICCIONES (Comidas, Cine, Clases…) ──

function parseHHMM(str) {
  if (!str) return null;
  const [h, m] = String(str).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h + m / 60;
}

function fmtHourFloat(h) {
  const norm = h >= 24 ? h - 24 : h;
  const hh = String(Math.floor(norm)).padStart(2, '0');
  const mm = Math.round((norm - Math.floor(norm)) * 60) === 30 ? '30' : '00';
  return `${hh}:${mm}`;
}

const ICONO_MOTIVO = {
  clase:   '📚 Clase',
  trabajo: '💼 Trabajo',
  examen:  '📝 Examen',
  otro:    '⏳ Compromiso',
};

function buildHorariosConsensus(card, q, myVal) {
  const FR = getFranjas(q).slice().sort((a, b) => a.start - b.start);
  const base = (myVal && typeof myVal === 'object')
    ? myVal : { disponibilidades: [], restricciones: [], duracionHoras: q.config?.duracionIdeal || 3 };

  // Aplica un cambio a MI respuesta y sincroniza
  const commit = mut => {
    const nv = JSON.parse(JSON.stringify(base));
    nv.disponibilidades = nv.disponibilidades || [];
    nv.restricciones    = nv.restricciones || [];
    mut(nv);
    patchSingleAnswer(q.id, nv);
  };

  const participantes = [], fechasSet = new Set(), duraciones = [];
  respuestas.forEach(r => {
    const v = extractAnswer(r.answers, q);
    if (!v || !Array.isArray(v.disponibilidades)) return;
    if (v.duracionHoras) duraciones.push(Number(v.duracionHoras));
    const dispPorFecha = dispToMap(v.disponibilidades);
    dispPorFecha.forEach((_, f) => fechasSet.add(f));
    if (dispPorFecha.size) {
      participantes.push({
        nombre: r.nombre, p: getEffectiveProb(r.nombre), dispPorFecha,
        restricciones: Array.isArray(v.restricciones) ? v.restricciones : [],
      });
    }
  });

  const wrap = div('ref-horarios-wrap');
  card.appendChild(wrap);

  if (participantes.length && fechasSet.size) {
    duraciones.sort((a, b) => a - b);
    const durIdeal = duraciones.length ? duraciones[Math.floor(duraciones.length / 2)] : (q.config?.duracionIdeal || 3);
    const fechasOrdenadas = [...fechasSet].sort();

    // Malla de 30 min adaptada a las franjas definidas
    const tMin = Math.floor(Math.min(...FR.map(f => f.start)) * 2) / 2;
    const tMax = Math.ceil(Math.max(...FR.map(f => f.end)) * 2) / 2;
    const SLOTS = [];
    for (let t = tMin; t < tMax; t += 0.5) SLOTS.push(t);
    const reqSlots = Math.max(2, Math.round(durIdeal * 2));
    const mejoresVentanas = [];

    fechasOrdenadas.forEach(fecha => {
      const estadoUsuarioDia = participantes.map(u => {
        const franjasHoy = u.dispPorFecha.get(fecha);
        if (!franjasHoy) return { ...u, freeSlots: new Set(), restHoy: [] };
        const restHoy = u.restricciones.filter(r => restAplica(r, fecha));
        const freeSlots = new Set();
        SLOTS.forEach(t => {
          if (!FR.some(f => franjasHoy.has(f.id) && t >= f.start && t < f.end)) return;
          const choca = restHoy.some(r => {
            const rIni = parseHHMM(r.desde);
            let rFin   = parseHHMM(r.hasta);
            if (rIni == null || rFin == null) return false;
            if (rFin <= rIni) rFin += 24;
            return (t >= rIni && t < rFin) || (t - 24 >= rIni && t - 24 < rFin);
          });
          if (!choca) freeSlots.add(t);
        });
        return { ...u, freeSlots, restHoy };
      });

      for (let i = 0; i <= SLOTS.length - reqSlots; i++) {
        const winSlots = SLOTS.slice(i, i + reqSlots);
        const tStart = winSlots[0], tEnd = winSlots[winSlots.length - 1] + 0.5;
        const nucleo = [], satelites = [], bloqueados = [];

        estadoUsuarioDia.forEach(u => {
          const libres = winSlots.filter(t => u.freeSlots.has(t));
          if (libres.length === winSlots.length) nucleo.push(u.nombre);
          else if (libres.length >= Math.max(2, Math.floor(reqSlots / 2))) {
            const tJoin = libres[0], tLeave = libres[libres.length - 1] + 0.5;
            const causa = (u.restHoy && u.restHoy.length) ? (ICONO_MOTIVO[u.restHoy[0].motivo] || 'Restricción') : 'Franja parcial';
            satelites.push({ nombre: u.nombre, nota: tJoin > tStart ? `se une a las ${fmtHM(tJoin)} tras ${causa}` : `sale a las ${fmtHM(tLeave)} por ${causa}` });
          } else {
            const r0 = u.restHoy && u.restHoy[0];
            bloqueados.push({ nombre: u.nombre, causa: r0 ? `${ICONO_MOTIVO[r0.motivo] || 'Restricción'} (${r0.desde}–${r0.hasta})` : 'Sin disponibilidad' });
          }
        });

        if (nucleo.length >= 1 && (nucleo.length + satelites.length) >= 2) {
          mejoresVentanas.push({ fecha, tStart, tEnd, nucleo, satelites, bloqueados,
            total: nucleo.length + satelites.length, score: nucleo.length * 10 + satelites.length * 4 });
        }
      }
    });

    mejoresVentanas.sort((a, b) => (b.score - a.score) || (b.nucleo.length - a.nucleo.length));
    const topWin = [];
    for (const w of mejoresVentanas) {
      if (!topWin.some(tw => tw.fecha === w.fecha && Math.abs(tw.tStart - w.tStart) < 2.5)) {
        topWin.push(w);
        if (topWin.length >= 4) break;
      }
    }

    const todasRestricciones = [];
    participantes.forEach(u => u.restricciones.forEach(r => todasRestricciones.push({ nombre: u.nombre, ...r })));
    const rangoRest = r => {
      const a = r.fechaDesde || r.fecha, b = r.fechaHasta || r.fecha || a;
      return !a ? 'Todos los días' : (a === b ? fmtShortDate(a) : `${fmtShortDate(a)}→${fmtShortDate(b)}`);
    };

    wrap.innerHTML = `
      <div style="font-size:0.83rem;color:var(--muted);margin-bottom:12px">
        Duración objetivo mediana: <b>${durIdeal} h</b> · compatibilidad horaria y bloqueos de clase/trabajo/exámenes:
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:16px">
        ${topWin.length ? topWin.map((w, idx) => `
          <div class="sol-log-box" style="border-left:3px solid ${idx === 0 ? 'var(--accent2)' : 'var(--accent3)'}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong style="font-size:0.92rem">📅 ${fmtShortDate(w.fecha)} · ${fmtHM(w.tStart)} → ${fmtHM(w.tEnd)}</strong>
              <span class="sol-badge ok">${w.total}/${participantes.length} asisten</span>
            </div>
            <div style="font-size:0.8rem;margin-bottom:4px"><b>Puntuales (${w.nucleo.length}):</b> ${w.nucleo.map(esc).join(', ')}</div>
            ${w.satelites.length ? `<div style="font-size:0.78rem;color:var(--accent3);margin-bottom:4px">
              <b>Incorporación parcial (${w.satelites.length}):</b> ${w.satelites.map(s => `${esc(s.nombre)} <em>(${esc(s.nota)})</em>`).join(' · ')}</div>` : ''}
            ${w.bloqueados.length ? `<div style="font-size:0.76rem;color:var(--accent)"><b>No pueden:</b> ${w.bloqueados.map(b => `${esc(b.nombre)} [${esc(b.causa)}]`).join(', ')}</div>`
              : `<div style="font-size:0.76rem;color:var(--accent2)">✓ ¡Sin bajas horarias!</div>`}
          </div>`).join('') : `<div class="muted-note">No hay tramos continuos de ${durIdeal} h para al menos 2 personas.</div>`}
      </div>

      <div style="font-size:0.8rem;font-weight:600;color:var(--muted);margin-bottom:6px;text-transform:uppercase">Mapa de coincidencia por franja</div>
      <div style="overflow-x:auto;margin-bottom:14px">
        <table class="compat-matrix-table">
          <thead><tr><th style="text-align:left">Fecha</th>
            ${FR.map(f => `<th>${esc(f.label)}<br><small style="font-weight:400;color:var(--muted)">${franjaSub(f)}</small></th>`).join('')}</tr></thead>
          <tbody>
            ${fechasOrdenadas.map(fecha => `<tr><th style="text-align:left">${fmtShortDate(fecha)}</th>${FR.map(f => {
              const libres = participantes.filter(u => u.dispPorFecha.get(fecha)?.has(f.id));
              const alpha = (libres.length / Math.max(1, participantes.length)) * 0.55;
              return `<td style="background:rgba(58,107,74,${alpha.toFixed(2)})" title="${esc(libres.map(u => u.nombre).join(', ') || 'Nadie')}">
                <b>${libres.length}/${participantes.length}</b>
                <div style="font-size:0.68rem">${libres.map(u => esc(u.nombre.slice(0, 6))).join(', ')}</div></td>`;
            }).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>

      ${todasRestricciones.length ? `
        <div style="font-size:0.8rem;font-weight:600;color:var(--muted);margin-bottom:6px;text-transform:uppercase">Restricciones declaradas</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
          ${todasRestricciones.map(r => `
            <span class="voter-chip ${r.meUnoAlSalir ? '' : 'veto'}">
              ${ICONO_MOTIVO[r.motivo] || '⏳'} <b>${esc(r.nombre)}</b>: ${esc(rangoRest(r))} ${esc(r.desde)}–${esc(r.hasta)}
              ${r.meUnoAlSalir ? '(⚡ se une al salir)' : '(bloqueo total)'}
            </span>`).join('')}
        </div>` : ''}`;
  } else {
    wrap.innerHTML = `<p style="color:var(--muted);font-size:0.85rem;margin-bottom:12px">Aún no hay disponibilidades horarias registradas. Añade la tuya abajo.</p>`;
  }

  // ── EDITOR EN VIVO DE MI DISPONIBILIDAD, RESTRICCIONES Y DURACIÓN ─────────
  const misFechas = dispToMap(base.disponibilidades);
  const fechasUnion = [...new Set([...fechasSet, ...misFechas.keys()])].sort();
  const ed = div('ref-reformulario-box');
  ed.style.marginTop = '14px';
  ed.innerHTML = `
    <div style="font-size:0.85rem;font-weight:600;margin-bottom:8px">Mi disponibilidad (clic para cambiar)</div>
    ${fechasUnion.length ? `
      <div style="overflow-x:auto"><table class="compat-matrix-table">
        <thead><tr><th style="text-align:left">Día</th>${FR.map(f => `<th>${esc(f.label)}<br><small style="font-weight:400">${franjaSub(f)}</small></th>`).join('')}</tr></thead>
        <tbody>${fechasUnion.map(f => `<tr><th style="text-align:left">${fmtShortDate(f)}</th>${FR.map(fr => {
          const on = misFechas.get(f)?.has(fr.id);
          return `<td><button type="button" class="franja-pill mh-toggle ${on ? 'active' : ''}" style="width:100%;padding:4px" data-f="${f}" data-fid="${esc(fr.id)}">${on ? '✓' : '·'}</button></td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table></div>` : ''}
    <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center;font-size:0.82rem">
      <span>Añadir intervalo:</span>
      <input type="date" class="mh-from" min="${hoyLocal()}" style="width:auto;padding:6px 8px">
      <span>→</span>
      <input type="date" class="mh-to" min="${hoyLocal()}" style="width:auto;padding:6px 8px">
      <button type="button" class="btn-propose mh-add" style="padding:6px 12px">+ Añadir (todas las franjas)</button>
    </div>

    <div style="font-size:0.85rem;font-weight:600;margin:16px 0 8px">Mis restricciones</div>
    <div class="restricciones-list" style="margin-top:0">
      ${(base.restricciones || []).map((r, i) => `
        <div class="restriccion-row" data-i="${i}">
          <div class="rest-grid">
            <select class="mr-motivo">${MOTIVOS_RESTRICCION.map(m => `<option value="${m.id}" ${m.id === r.motivo ? 'selected' : ''}>${m.label}</option>`).join('')}</select>
            <div class="rest-time-pair">
              <input type="date" class="mr-fd" value="${esc(r.fechaDesde || r.fecha || '')}">
              <span>→</span>
              <input type="date" class="mr-fh" value="${esc(r.fechaHasta || r.fecha || '')}">
            </div>
            <div class="rest-time-pair">
              <input type="time" class="mr-d" value="${esc(r.desde || '')}">
              <span>→</span>
              <input type="time" class="mr-h" value="${esc(r.hasta || '')}">
            </div>
            <button type="button" class="btn-remove mr-del" title="Eliminar">✕</button>
          </div>
          <label class="toggle-label" style="font-size:0.78rem;color:var(--muted)">
            <input type="checkbox" class="mr-join" ${r.meUnoAlSalir ? 'checked' : ''}><span class="toggle-pill"></span>
            <span>⚡ Me incorporo al salir</span>
          </label>
        </div>`).join('')}
    </div>
    <button type="button" class="btn-add mh-add-rest" style="margin-top:8px">+ Añadir restricción</button>

    <div style="display:flex;align-items:center;gap:10px;margin-top:14px;font-size:0.85rem">
      <span>Mi duración deseada (h):</span>
      <input type="number" class="mh-dur" min="1" max="12" value="${base.duracionHoras || q.config?.duracionIdeal || 3}" style="width:80px;padding:6px 8px">
    </div>`;

  ed.querySelectorAll('.mh-toggle').forEach(btn => btn.addEventListener('click', () => {
    const f = btn.dataset.f, fid = btn.dataset.fid;
    commit(nv => {
      const m = dispToMap(nv.disponibilidades);
      const s = m.get(f) || new Set();
      if (s.has(fid)) s.delete(fid); else s.add(fid);
      m.set(f, s);
      nv.disponibilidades = mapToDisp(m);
    });
  }));

  ed.querySelector('.mh-add').addEventListener('click', () => {
    const from = ed.querySelector('.mh-from').value;
    if (!from) return;
    const to = ed.querySelector('.mh-to').value;
    commit(nv => nv.disponibilidades.push({ desde: from, hasta: (to && to >= from) ? to : from, franjas: FR.map(f => f.id) }));
  });

  ed.querySelectorAll('.restriccion-row').forEach(row => {
    const i = +row.dataset.i;
    row.querySelector('.mr-del').addEventListener('click', () => commit(nv => nv.restricciones.splice(i, 1)));
    row.querySelectorAll('select, input').forEach(el => el.addEventListener('change', () => {
      const d = row.querySelector('.mr-d').value, h = row.querySelector('.mr-h').value;
      if (!d || !h || d === h) { showStatus('Indica una hora de inicio y de fin distintas', 'err'); return; }
      commit(nv => {
        const fd = row.querySelector('.mr-fd').value || null;
        nv.restricciones[i] = {
          motivo: row.querySelector('.mr-motivo').value,
          fechaDesde: fd, fechaHasta: row.querySelector('.mr-fh').value || fd,
          desde: d, hasta: h, meUnoAlSalir: row.querySelector('.mr-join').checked,
        };
      });
    }));
  });

  ed.querySelector('.mh-add-rest').addEventListener('click', () =>
    commit(nv => nv.restricciones.push({ motivo: 'clase', fechaDesde: null, fechaHasta: null, desde: '16:00', hasta: '20:00', meUnoAlSalir: true })));

  ed.querySelector('.mh-dur').addEventListener('change', e =>
    commit(nv => { nv.duracionHoras = Math.max(1, Math.min(12, +e.target.value || 3)); }));

  card.appendChild(ed);
}
