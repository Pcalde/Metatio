// ══════════════════════════════════════════════════════════════════════════
//  VISTA «CONSENSO / REFORMULARIO» — src/js/ui/consensusView.js
//
//  Extraído de reformulario.js (líneas 915–fin). Capa SOLO de presentación:
//  consume el `model` y las `soluciones` que produce el motor puro
//  (engine/optimizador.js) y pinta tarjetas en #consensus-container.
// ══════════════════════════════════════════════════════════════════════════

function renderMarkdown(texto) {
  if (!texto) return '';
  const htmlCrudo = marked.parse(String(texto), { breaks: true, gfm: true });
  return DOMPurify.sanitize(htmlCrudo, { USE_PROFILES: { html: true } });
}

// Respuestas propias ya enviadas (o el borrador actual): dato de UI, no del motor.
function getMySubmittedAnswers() {
  if (!user) return null;
  const mine = respuestas.find(r => r.nombre.toLowerCase() === user.nombre.toLowerCase());
  return mine ? mine.answers : collectAnswers();
}

// ── Gate común: falta schema.sql o nadie ha respondido aún ────────────────
// Devuelve true si hay que abortar el render (ya ha pintado el aviso).
function _renderConsensusGate(container) {
  if (!serverHasV2) {
    const warn = div('card');
    warn.style.borderColor = 'var(--accent)';
    warn.innerHTML = `
      <div class="card-title"><span class="num" style="background:var(--accent)">!</span> El servidor no ha devuelto las respuestas</div>
      <p style="color:var(--ink);font-size:0.9rem;line-height:1.5">
        Hay <b>${respondentes.length}</b> participante(s) en la encuesta, pero el servidor de Supabase sigue ejecutando la función <code>_snapshot</code> antigua (que no enviaba el campo <code>respuestas</code> ni tenía la tabla <code>debate</code>).<br><br>
        Comprueba las migraciones instaladas y la respuesta de la RPC de consulta. No reinstales <code>schema.sql</code> en una base con el sistema de acceso actual.
      </p>`;
    container.appendChild(warn);
    return true;
  }
  if (!respuestas.length) {
    const empty = div('card');
    empty.innerHTML = `
      <div class="card-title"><span class="num">📊</span> Sin respuestas enviadas aún</div>
      <p style="color:var(--muted);font-size:0.9rem">
        Hay ${respondentes.length} persona(s) registrada(s) en el viaje, pero nadie ha pulsado <b>«Enviar mi respuesta →»</b> todavía.
      </p>`;
    container.appendChild(empty);
    return true;
  }
  return false;
}

// ── VISTA RESULTADOS (agregados, soluciones, topología) ───────────────────
function renderResultados() {
  const container = $('consensus-container');
  if (!container) return;
  if (container.querySelector('input[type=range]:active')) return;
  container.replaceChildren();
  try {
    if (_renderConsensusGate(container)) return;
    if (typeof ResultsWorkspace === 'undefined') throw new Error('No se ha cargado resultsWorkspace.js. Comprueba los archivos de la instalación.');
    ResultsWorkspace.render(container);
  } catch (error) {
    console.error('[Metatio] Error al mostrar resultados:', error);
    container.replaceChildren();
    const card = document.createElement('div'); card.className = 'card';
    const title = document.createElement('div'); title.className = 'card-title'; title.textContent = 'No se han podido mostrar los resultados';
    const note = document.createElement('p'); note.textContent = 'Las respuestas guardadas no se han modificado. Comprueba que has extraído todos los archivos de esta versión. Si persiste, copia el primer error de Metatio en la consola.';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn-pc'; retry.textContent = 'Reintentar'; retry.addEventListener('click', renderResultados);
    card.append(title, note, retry); container.append(card);
  }
}

function buildResultsOverview(studies,mode,integrated){
  const card=div('card ref-summary-card mt-results-overview');
  const on=typeof asistenciaActiva==='undefined'||asistenciaActiva;
  const ps=on?respondentes.map(r=>({nombre:r.nombre,p:getEffectiveProb(r.nombre)})):[];
  const expected=ps.reduce((a,b)=>a+b.p,0),sd=Math.sqrt(ps.reduce((a,b)=>a+b.p*(1-b.p),0));
  card.innerHTML=`<div class="ref-summary-header"><div><div class="card-title"><span class="num"><i class="fa-solid fa-chart-simple"></i></span> Panorama de resultados</div><p class="mt-results-note">${esc(integrated?'Optimización conjunta y estudios por pregunta.':mode.enabled?'Factibilidad temporal indeterminada: aún no hay fechas evaluables.':mode.reason)}</p></div>${on&&!integrated?`<label class="toggle-label"><input type="checkbox" class="mt-weight" ${weightByProb?'checked':''}><span class="toggle-pill"></span><span>Ponderar rankings por asistencia</span></label>`:''}</div><div class="kpi-grid"><div class="kpi-box"><span class="kpi-label">Respuestas enviadas</span><span class="kpi-val">${respuestas.length} <small>/ ${respondentes.length} participantes</small></span></div><div class="kpi-box"><span class="kpi-label">Estudios independientes</span><span class="kpi-val">${studies.length}</span></div><div class="kpi-box"><span class="kpi-label">Asistencia esperada a priori</span><span class="kpi-val">${on?expected.toFixed(1)+' ± '+sd.toFixed(1):'Desactivada'}</span>${on?'<small>Desviación típica bajo independencia</small>':''}</div></div>${on?`<div class="kpi-pills mt-attendance-pills">${ps.sort((a,b)=>b.p-a.p).map(x=>`<span class="user-prob-pill">${esc(x.nombre)} <b>${Math.round(100*x.p)}%</b></span>`).join('')}</div>`:''}`;
  card.querySelector('.mt-weight')?.addEventListener('change',e=>{weightByProb=e.target.checked;renderResultados();});
  return card;
}

function appendDecisionReportButton(container) {
  if (typeof window.openPrintReport === 'function') {
    const rBtn = document.createElement('button');
    rBtn.type = 'button';
    rBtn.className = 'btn-propose';
    rBtn.style.cssText = 'margin-top:6px;align-self:flex-start';
    rBtn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Exportar conclusiones a PDF';
    rBtn.addEventListener('click', () => window.openPrintReport());
    container.appendChild(rBtn);
  }
}

function buildDecisionStudyCard(s){
  const card=div('card ref-card');
  const label={transporte:'Transporte',presupuesto:'Presupuesto por persona',fechas:'Fechas',horarios:'Horarios',alojamiento:'Alojamiento',preferencia:'Preferencias'}[s.kind]||'Resultados';
  const n=x=>x==null?'Sin dato':Number(x).toLocaleString('es-ES',{maximumFractionDigits:2});
  card.innerHTML=`<div class="card-title">${esc(s.label)}</div><p style="color:var(--muted);font-size:.8rem">${esc(s.section?s.section+' · ':'')}${label}${s.conditional?' · Condicional':''} · ${s.answered}/${s.applicable} aplicables con respuesta · ${s.excluded} no aplican · ${s.unknown} rama desconocida · ${s.pending} sin envío</p>`;
  const add=t=>{const p=document.createElement('p');p.textContent=t;p.style.marginTop='8px';card.appendChild(p);};
  if(s.status==='no_aplicable'){add('No aplicable: ningún participante pertenece a esta rama.');return card;}
  if(s.transport){card.appendChild(buildTransportVisual(s));}
  else if(s.budget){add(`Mediana declarada: ${n(s.budget.median)}${s.kind==='presupuesto'?' €':''}.`);if(s.kind==='presupuesto')add(`Tope común de quienes han respondido: ${n(s.budget.commonCap)} € por persona. No equivale al coste del plan.`);}
  else if(s.dates){add(`${s.dates.known} participantes con días concretos. ${s.kind==='horarios'?'Coincidencia de días, no necesariamente de franjas.':'Disponibilidad por día, no ventanas completas.'}`);for(const d of s.dates.days.slice(0,10))add(`${fmtShortDate(d.date)} · ${d.count} disponibles`);}
  else if(s.options){for(const o of s.options)add(`${o.label}: ${o.mean==null?'sin valoraciones':s.prob?n(100*o.mean)+'% de media · '+n(o.sum)+' suma de probabilidades':s.points?n(o.sum)+' puntos':n(o.sum)+' selecciones'} (${o.count} respuestas evaluadas)`);}
  else add('Sin análisis cuantitativo específico.');
  return card;
}

// ── VISTA REFORMULARIO (tarjetas interactivas por pregunta) ───────────────
function renderReformularioInteractivo(target = null, section = null, predicate = null) {
  const container = target || $('reformulario-container');
  if (!container) return;
  if (container.querySelector('input[type=range]:active')) return;
  container.innerHTML = '';

  if (_renderConsensusGate(container)) return;

  const myAns = getMySubmittedAnswers();
  const secHeader = div('ref-section-divider');
  secHeader.innerHTML = `<span>Reformulario interactivo por pregunta (clic para cambiar tu voto en vivo)</span>`;
  container.appendChild(secHeader);

  schema.forEach((q, idx) => {
    if(predicate&&!predicate(q))return;
    if(section && (section==='__general__'?!!q.config?.seccion:q.config?.seccion!==section))return;
    if (typeof _refQidOverride !== 'undefined' && _refQidOverride && q.id !== _refQidOverride) return;
    const card = buildAnalyticalCard(q, idx, myAns);
    if (card) container.appendChild(card);
  });
}

// ── VISTA REFORMULARIO (tarjetas interactivas por pregunta) ───────────────
function renderResultadosInteractivo() {
  const container = $('reformulario-container');
  if (!container) return;
  if (container.querySelector('input[type=range]:active')) return;
  container.innerHTML = '';

  if (_renderConsensusGate(container)) return;

  const myAns = getMySubmittedAnswers();
  const secHeader = div('ref-section-divider');
  secHeader.innerHTML = `<span>Reformulario interactivo por pregunta (clic para cambiar tu voto en vivo)</span>`;
  container.appendChild(secHeader);

  schema.forEach((q, idx) => {
    if (typeof _refQidOverride !== 'undefined' && _refQidOverride && q.id !== _refQidOverride) return;
    const card = buildAnalyticalCard(q, idx, myAns);
    if (card) container.appendChild(card);
  });
}

function buildExecutiveSummaryCard(model, soluciones, topo) {
  const card = div('card ref-summary-card');
  const attendanceOn=typeof asistenciaActiva==='undefined'||asistenciaActiva;
  const nombres = attendanceOn?respondentes.map(r => r.nombre):[];
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
        <div class="card-title" style="margin-bottom:4px"><span class="num"><i class="fa-solid fa-magnifying-glass-chart"></i></span> Síntesis de Factibilidad y Reformulario</div>
        <p style="font-size:0.82rem;color:var(--muted)">
          ${soluciones.length} solución(es) factible(s) encontrada(s) · Máx. N=${nMax} asistentes · L=${lMax} días
          · Logística: ${model.logistica ? `considerada (${model.nLog}/${model.viajeros.length} con dato de transporte)` : 'no considerada'}
        </p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <label class="toggle-label" style="font-size:0.78rem;background:var(--bg);padding:5px 10px;border-radius:8px;border:1px solid var(--border)">
          <input type="checkbox" id="toggle-weight-prob" ${weightByProb && attendanceOn ? 'checked' : ''} ${attendanceOn?'':'disabled'}>
          <span class="toggle-pill"></span>
          <span>Ponderar rankings por pᵢ</span>
        </label>
        <label class="toggle-label" style="font-size:0.78rem;background:var(--bg);padding:5px 10px;border-radius:8px;border:1px solid var(--border)">
          <input type="checkbox" id="toggle-mc-empirical" ${mcUseEmpiricalProb && attendanceOn ? 'checked' : ''} ${attendanceOn?'':'disabled'}>
          <span class="toggle-pill"></span>
          <span>Monte Carlo con ausencias votadas</span>
        </label>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box">
        <span class="kpi-label">Participantes en el modelo</span>
        <span class="kpi-val">${model.viajeros.length} <small>/ ${respondentes.length} resp.</small></span>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Esperanza asistencia E[N] (a priori)</span>
        <span class="kpi-val">${attendanceOn?expected.toFixed(1)+' ± '+Math.sqrt(variance).toFixed(1):'Desactivada'}</span>
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
    renderResultados();
  });
  card.querySelector('#toggle-mc-empirical').addEventListener('change', e => {
    mcUseEmpiricalProb = e.target.checked;
    renderResultados();
  });

  return card;
}

// ── TABLA DE PREFERENCIAS BOOLEANAS POR VIAJERO ─────────────────────────────
function buildPreferenciasBooleanasCard(model) {
  const card = div('card pref-bool-card');

  if (!model.viajeros.length) {
    card.innerHTML = `
      <div class="card-title"><span class="num"><i class="fa-solid fa-chart-pie"></i></span> Preferencias booleanas</div>
      <p style="color:var(--muted);font-size:0.85rem">Sin viajeros con fechas válidas todavía.</p>`;
    return card;
  }

  const cols = [
    { key: 'diasMax',        label: 'Días máx.',       type: 'num' },
    { key: 'irYVenir',       label: 'Ir y venir',      type: 'bool' },
    { key: 'soloFinde',      label: 'Solo finde',      type: 'bool' },
    { key: 'meDaIgual',      label: 'Me da igual',     type: 'bool' },
    { key: 'preferirPuente', label: 'Preferir puente', type: 'bool' },
    { key: '_horarios',      label: 'Horarios',        type: 'tri' },
    { key: '_fechas',        label: 'Fechas',          type: 'tri' },
  ];

  const cellHtml = (v, col) => {
    if (col.type === 'num') return `<td><b>${v.diasMax}</b></td>`;
    if (col.type === 'bool') {
      const on = !!v[col.key];
      return `<td class="${on ? 'pb-yes' : 'pb-no'}" title="${on ? 'Sí' : 'No'}" style="text-align:center">
        <i class="fa-solid ${on ? 'fa-thumbs-up' : 'fa-thumbs-down'}"
           style="color:var(--${on ? 'ok' : 'err'})"></i>
      </td>`;
    }
    let val;
    if (col.key === '_horarios') val = v.horFranjasPorDia && Object.keys(v.horFranjasPorDia).length;
    else val = v.conjuntoFechas && v.conjuntoFechas.size;
    return `<td class="${val ? 'pb-yes' : 'pb-miss'}">${val ? 'Relleno' : 'Sin dato'}</td>`;
  };

  card.innerHTML = `
    <div class="card-title"><span class="num">P</span> Preferencias de los viajeros</div>
    <p style="font-size:0.82rem;color:var(--muted);margin-bottom:10px">
      Respuestas de cada participante. Las columnas "Horarios" y "Fechas" indican
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

// ── TARJETA DE ESTADÍSTICOS DE `diasMax` (media / mediana / Q₁) ─────────────
function buildDiasMaxStatsCard(model) {
  const card = div('card');

  if (!model.viajeros.length) {
    card.innerHTML = `
      <div class="card-title"><span class="num">📅</span> Días máximos por viajero</div>
      <p style="color:var(--muted);font-size:0.85rem">Sin viajeros con fechas válidas todavía.</p>`;
    return card;
  }

  const entries = model.viajeros
    .map(v => ({ nombre: v.nombre, val: Number(v.diasMax) }))
    .filter(e => isFinite(e.val) && e.val > 0);

  if (!entries.length) {
    card.innerHTML = `
      <div class="card-title"><span class="num">📅</span> Días máximos por viajero</div>
      <p style="color:var(--muted);font-size:0.85rem">Ningún viajero ha declarado un máximo de días utilizable.</p>`;
    return card;
  }

  entries.sort((a, b) => a.val - b.val);
  const vals = entries.map(e => e.val);
  const n = vals.length;
  const mean = vals.reduce((s, x) => s + x, 0) / n;

  // Percentil con interpolación lineal (método R‑7 / Excel PERCENTILE.INC)
  const percentile = (arr, p) => {
    if (!arr.length) return null;
    const idx = (arr.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? arr[lo] : arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
  };

  const min = vals[0];
  const max = vals[n - 1];
  const median = percentile(vals, 0.5);
  const q1 = percentile(vals, 0.25);
  const q3 = percentile(vals, 0.75);

  const fmtStat = x => Number.isInteger(x) ? String(x) : x.toFixed(1);
  const sinDato = model.viajeros.length - entries.length;
  const span = Math.max(1, max - min);
  const bottleneck = entries[0]; // quien menos días acepta → techo duro del grupo

  card.innerHTML = `
    <div class="card-title"><span class="num"><i class="fa-solid fa-calendar"></i></span> Días máximos por viajero: distribución</div>
    <p style="font-size:0.82rem;color:var(--muted);margin-bottom:10px">
      Estadísticos sobre el máximo de días que cada participante acepta estar de viaje.
      La <b>mediana</b> y el <b>Q₁</b> acotan la duración razonable de la ventana; el <b>mínimo</b>
      es el techo si van todos los asistentes (restricción activa del optimizador).
      ${sinDato > 0 ? `<br><span style="color:var(--accent)">⚠ ${sinDato} viajero(s) sin dato de <code>diasMax</code>, excluidos del cálculo.</span>` : ''}
    </p>

    <div class="kpi-grid">
      <div class="kpi-box">
        <span class="kpi-label">Media</span>
        <span class="kpi-val">${mean.toFixed(1)} <small>días</small></span>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Mediana</span>
        <span class="kpi-val">${fmtStat(median)} <small>días</small></span>
        <small>Q3: ${fmtStat(q3)} d</small>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Q_1 (percentil 25)</span>
        <span class="kpi-val">${fmtStat(q1)} <small>días</small></span>
        <small>75% acepta ≥ este valor</small>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Techo del grupo (mínimo)</span>
        <span class="kpi-val" style="color:var(--accent)">${min} <small>días</small></span>
        <small>Limitado por ${esc(bottleneck.nombre)}</small>
      </div>
    </div>

    <div class="ref-dist-list" style="margin-top:14px">
      ${entries.map(e => {
        const pct = ((e.val - min) / span) * 100;
        const isBottleneck = e.val === min;
        const isTop = e.val === max && !isBottleneck;
        return `
          <div class="ref-dist-row">
            <span class="ref-dist-name" style="min-width:140px;max-width:180px;flex:0 0 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(e.nombre)}">${esc(e.nombre)}${isBottleneck ? ' ⚠️' : ''}</span>
            <div class="ref-bar-track" style="flex:1;min-width:0">
              <div class="ref-bar-fill ${isBottleneck ? 'negative' : ''}"
                   style="width:${Math.max(4, Math.min(100, pct))}%"></div>
            </div>
            <span class="ref-dist-val" style="width:auto;min-width:60px;text-align:right">
              <b>${e.val}</b> d${isTop ? ' <small style="color:var(--accent2)">(máx.)</small>' : ''}
            </span>
          </div>
        `;
      }).join('')}
    </div>
  `;

  return card;
}

// Helper para renderizar el bloque de alertas priorizadas (§6.4) dentro de tarjetas de solución o consenso
function buildAlertBlockHtml(alertas) {
  if (!alertas || !alertas.length) return '';
  const top  = alertas[0];
  const rest = alertas.slice(1);
  return `
    <div class="prob-alert-box sev-${top.prioridad || 1}" style="margin-top:6px">
      <div class="prob-alert-main">
        <span>${esc(top.mensaje)}</span>
        ${rest.length ? `<button type="button" class="prob-alert-more-btn" data-count="${rest.length}">+${rest.length} ${rest.length === 1 ? 'alerta' : 'alertas'}</button>` : ''}
      </div>
      ${rest.length ? `
        <div class="prob-alert-extra">
          ${rest.map(a => `<div>• ${esc(a.mensaje)}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function bindAlertExpandButtons(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll('.prob-alert-more-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const box = btn.closest('.prob-alert-box');
      const extra = box && box.querySelector('.prob-alert-extra');
      if (!extra) return;
      const open = extra.classList.toggle('open');
      const cnt = Number(btn.dataset.count || 1);
      btn.textContent = open ? 'Ocultar' : `+${cnt} ${cnt === 1 ? 'alerta' : 'alertas'}`;
    });
  });
}

const renderVoterValuationChip = (det) => {
  // El color del chip debe reflejar el VALOR del voto (+3 / +1 / 0 / −1),
  // no el rol (núcleo/satélite), que se mantiene como tag aparte [★]/[sat].
  const txt = String(det.texto || '').trim();
  const numMatch = txt.match(/[+-]?\d+/);
  const pts = numMatch ? parseInt(numMatch[0], 10) : null;

  const isVeto   = det.veto === true || (pts != null && pts < 0);
  const isStrong = !isVeto && pts != null && pts >= 3;
  const isNeutral = !isVeto && !isStrong && pts === 0;

  const voteCls = isVeto    ? 'veto'
                : isStrong  ? 'vote-star'   // +3 → azul
                : isNeutral ? 'vote-neutral'// 0  → neutro
                : 'vote-pos';               // +1 o positivo desconocido

  const rolTag = det.esNucleo ? '★' : 'sat';
  return `<span class="voter-chip ${voteCls}" title="${det.esNucleo ? 'Miembro del núcleo' : 'Satélite'}">${esc(det.nombre)} <small style="opacity:0.75">[${rolTag}]</small> <b>${esc(det.texto)}</b></span>`;
};

// ── RENDER DE SOLUCIONES ÓPTIMAS (Con Presupuesto Núcleo, Doble Barra, Coherencia Plan->Casa y Matching Coches) ──
function buildFeasibleSolutionsSection(soluciones, diagnosticos, topo, scopeLabel = null) {
  const wrap = div('ref-solutions-wrap');

  if (!soluciones.length) {
    const diagHtml = diagnosticos.slice(0, 6).map(d => `<li>${esc(d)}</li>`).join('');
    wrap.innerHTML = `
      <div class="card" style="border-color:var(--accent)">
        <div class="card-title"><span class="num" style="background:var(--accent)">!</span> ${scopeLabel ? "Sin ventanas factibles en este estudio parcial" : "Sin soluciones simultáneamente factibles en fechas y transporte"}</div>
        <p style="font-size:0.86rem;color:var(--muted);margin-bottom:10px">
          El optimizador evaluó las ventanas con al menos 2 miembros de núcleo, pero ninguna superó las restricciones ${scopeLabel ? "temporales de este estudio" : "de capacidad de vehículos, solapamiento de fechas o cruce de horarios"}:
        </p>
        ${diagHtml ? `<ul style="font-size:0.8rem;color:var(--muted);padding-left:18px;margin-bottom:10px">${diagHtml}</ul>` : ''}
        <p style="font-size:0.84rem;color:var(--ink)">
          <b>Usa el Reformulario</b> para revisar las restricciones aplicables a este estudio.
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

    // Formateo explícito del presupuesto mínimo del NÚCLEO vs GRUPO TOTAL
    const fmtBudgetPair = (ideal, max, autor) => {
      if (max == null && ideal == null) return 'Sin dato';
      const base = ideal != null && max != null && ideal < max
        ? `${ideal} € cómodo / ${max} € máx.`
        : `${max ?? ideal} €`;
      return autor ? `${base} (${autor})` : base;
    };

    const strPresuNucleo = fmtBudgetPair(sol.pIdealNucleo, sol.pMaxNucleo, sol.autorMinNucleo);
    const strPresuGrupo  = fmtBudgetPair(sol.pIdealGrupo, sol.pMaxGrupo, sol.autorMinGrupo);

    const logOn = !(sol.flujo && sol.flujo.sinLogistica);
    const sinDato = logOn ? sol.viajerosAsignados.filter(v => !v.tieneLogistica).map(v => v.nombre) : [];
    const mapViajeros = new Map(sol.viajerosAsignados.map(v => [v.nombre, v]));

    // ── 1. TABLAS DE LOGÍSTICA (IDAS Y VUELTAS CON PREFERENCIAS DE COCHES/PASAJEROS) ──
    const renderPasajeroConPreferencia = (conductorName, paxName, detPrecalculado) => {
      let prefCond = 0, prefPax = 0, notaPax = '';
      if (detPrecalculado) {
        prefCond = detPrecalculado.prefCond || 0;
        prefPax  = detPrecalculado.prefPax  || 0;
        notaPax  = detPrecalculado.notaPax  || '';
      } else {
        const dObj = mapViajeros.get(conductorName);
        const pObj = mapViajeros.get(paxName);
        if (dObj && dObj.prefPasajeros && paxName in dObj.prefPasajeros) prefCond = Number(dObj.prefPasajeros[paxName]) || 0;
        if (pObj && pObj.prefCoches && conductorName in pObj.prefCoches) prefPax = Number(pObj.prefCoches[conductorName]) || 0;
        if (pObj && pObj.notaRuta) notaPax = pObj.notaRuta;
      }

      let prefBadge = '';
      if (prefCond > 0 && prefPax > 0) { // lo he anonimizado por inseguridad: no sé si la gente querrá saber o que sepan
        prefBadge = ` <span class="sol-badge ok" style="font-size:0.68rem;padding:1px 6px" title="Asignación propuesta"><i class="fa-solid fa-people-pulling"></i> Asignado</span>`;
      } else if (prefPax > 0) {
        prefBadge = ` <span class="sol-badge ok" style="font-size:0.68rem;padding:1px 6px" title="Asignación propuesta"><i class="fa-solid fa-people-pulling"></i> Asignado</span>`;
      } else if (prefCond > 0) {
        prefBadge = ` <span class="sol-badge ok" style="font-size:0.68rem;padding:1px 6px" title="Asignación propuesta"><i class="fa-solid fa-people-pulling"></i> Asignado</span>`;
      } else if (prefCond < 0 || prefPax < 0) {
        prefBadge = ` <span class="sol-badge" style="font-size:0.68rem;padding:1px 6px"><i class="fa-solid fa-link"></i> Asignado</span>`;
      }

      const notaHtml = notaPax ? ` <small style="color:var(--muted)">(${esc(notaPax)})</small>` : '';
      return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px"><b>${esc(paxName)}</b>${prefBadge}${notaHtml}</span>`;
    };

    const renderTablaViajes = (viajes, titulo, badgeCls) => {
      if (!viajes || !viajes.length) return `<div class="muted-note">Sin desplazamientos en coche requeridos.</div>`;
      const groups=new Map();viajes.forEach(v=>{if(!groups.has(v.fecha))groups.set(v.fecha,[]);groups.get(v.fecha).push(v);});
      const visuals=[...groups].map(([date,cars])=>`<div class="mt-classic-day"><b><i class="fa-solid fa-calendar-day"></i> ${fmtShortDate(date)}</b>${cars.map(v=>{const used=(v.pasajeros||[]).length,cap=Math.max(used,v.plazasTotales??mapViajeros.get(v.conductor)?.plazasLibres??used);return `<div class="mt-classic-car"><span><i class="fa-solid fa-car-side"></i> <b>${esc(v.conductor)}</b></span><div class="mt-seats">${Array.from({length:Math.min(40,cap)},(_,i)=>`<i class="fa-solid fa-person ${i<used?'used':''}" title="${i<used?'Ocupada':'Libre'}"></i>`).join('')} <small>${used}/${cap}</small></div><div class="mt-classic-pax">${(v.pasajeros||[]).map(n=>`<span><i class="fa-solid fa-person"></i> ${esc(n)}</span>`).join('')||'<small>Sin pasajeros</small>'}</div></div>`;}).join('')}</div>`).join('');
      return `
        <div class="sol-log-box">
          <div class="sol-log-title ${badgeCls}">${titulo}</div>${visuals}<details class="mt-work-details"><summary>Tabla de asignaciones y notas</summary><div class="mt-work-chart">
          <table class="sol-log-table">
            <thead><tr><th>Fecha</th><th>Conductor (Plazas)</th><th>Pasajeros asignados y afinidad</th></tr></thead>
            <tbody>
              ${viajes.map(v => {
                const dObj  = mapViajeros.get(v.conductor);
                const notaD = (v.notaConductor || (dObj && dObj.notaRuta))
                  ? ` <div style="font-size:0.72rem;color:var(--muted)"><i class="fa-solid fa-map-pin" style="color:var(--accent-600, #491209); font-size:0.85em; margin-right:0.35em; vertical-align:-0.05em;"></i> ${esc(v.notaConductor || dObj.notaRuta)}</div>`
                  : '';
                const ocupadas = v.pasajeros ? v.pasajeros.length : 0;
                const totales  = v.plazasTotales ?? (dObj ? dObj.plazasLibres : ocupadas);
                const detMap   = new Map((v.pasajerosDetalle || []).map(d => [d.nombre, d]));

                const paxHtml = v.pasajeros && v.pasajeros.length
                  ? v.pasajeros.map(pName => renderPasajeroConPreferencia(v.conductor, pName, detMap.get(pName))).join(' · ')
                  : '<em style="color:var(--muted)">Viaja solo (0 pasajeros asignados)</em>';

                return `
                  <tr>
                    <td class="mono-cell">${fmtShortDate(v.fecha)}</td>
                    <td>
                      <b><i class="fa-solid fa-car-side" style="color:var(--accent2-600, #f59e0b); font-size:0.85em; margin-right:0.35em; vertical-align:-0.05em;"></i>
                         ${esc(v.conductor)}</b> <small style="color:var(--muted)">(${ocupadas}/${totales})</small>
                      ${notaD}
                    </td>
                    <td>${paxHtml}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table></div></details>
        </div>
      `;
    };

    // ── 2. DESGLOSE DE PLANES VOTADOS EN LA VENTANA (CON NÚCLEO Y PUNTOS/PROB) ──
    const planesHtml = (sol.planesEvaluados && sol.planesEvaluados.length)
      ? `
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
          ${sol.planesEvaluados.map((pl, pIdx) => `
            <div style="padding:8px 10px;border-radius:8px;border:1px solid ${pIdx === 0 ? 'var(--accent2)' : 'var(--border)'};background:rgba(128,128,128,0.03)">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:4px">
                <div>
                  <strong style="font-size:0.88rem">
                    ${pIdx === 0 ? '<i class="fa-solid fa-trophy plan-ico" style="color:var(--accent4, #f59e0b); font-size:1.15em; margin-right:0.35em; vertical-align:-0.05em;"></i> ' : ''}${esc(pl.label)}
                  </strong>
                  ${pIdx === 0 ? `<span class="sol-badge ok" style="margin-left:6px">Plan principal en ventana</span>` : ''}
                </div>
                <span style="font-size:0.78rem;color:var(--muted)">
                  <b>${pl.apoyosNucleo + pl.apoyosSat}</b> <i class="fa-solid fa-thumbs-up"></i>
                  ${pl.vetos > 0 ? `<b style="color:var(--accent)">${pl.vetos} <i class="fa-solid fa-thumbs-down"></i></b>` : ''}
                </span>
              </div>
              <div class="ref-voters" style="gap:4px">
                ${pl.detallesVotantes.map(renderVoterValuationChip).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `
      : `<div style="font-size:0.82rem;color:var(--muted);margin-bottom:8px">Plan en ventana: <strong style="color:var(--ink)">${esc(sol.opcionVotada)}</strong></div>`;

    // ── 3. EVALUACIÓN DE ALOJAMIENTOS (COHERENCIA CONDICIONAL + DOS BARRAS DE PRESUPUESTO + VOTOS DEL NÚCLEO) ──
    let casasHtml = '';
    if (sol.casasSonCoherentes === false) {
      casasHtml = `<div class="muted-note"><i class="fa-solid fa-circle-info"></i> ${esc(sol.motivoOcultarCasas || 'Las opciones de alojamiento no aplican para el plan seleccionado.')}</div>`;
    } else if (sol.casasEvaluadas && sol.casasEvaluadas.length) {
      casasHtml = sol.casasEvaluadas.map(c => {
        const isProbModel = c.E != null && c.P25 != null;
        const bp = c.barrasPresupuesto;

        let budgetBadge = '';
        if (c.viable && c.comoda !== false) {
          budgetBadge = `<span class="sol-badge ok">✓ Dentro del presupuesto aceptado</span>`;
        } else if (c.viable && c.comoda === false) {
          budgetBadge = `<span class="sol-badge" style="background:rgba(245,158,11,0.16);color:#f59e0b"><i class="fa-regular fa-circle-check"></i> Se lo pueden permitir</span>`;
        } else if (c.viableNucleo && !c.viable) {
          budgetBadge = `<span class="sol-badge" style="background:rgba(245,158,11,0.16);color:#f59e0b"><i class="fa-solid fa-person-circle-exclamation"></i> Viable para el Núcleo (excede a un satélite)</span>`;
        } else {
          budgetBadge = `<span class="sol-badge err"><i class="fa-solid fa-skull-crossbones"></i> Excede presupuesto máximo / Veto</span>`;
        }

        // Renderizado de las DOS barras de presupuesto:
        // 1) "Precio aceptado (cómodo)" (siempre que haya datos de presupuesto)
        // 2) "Se lo pueden permitir (Hard Cap)" (solo si existe respuesta a esa segunda barra)
        let barrasPresuHtml = '';
        if (bp && bp.totalConPresu > 0) {
          const fuerzanNombres = bp.enEsfuerzoHardCap.map(x => `${x.nombre} (cómodo ${x.ideal}€ → tope ${x.cap}€)`).join(', ');
          const excluidosNombres = bp.noPuedenPermitirse.map(x => `${x.nombre} (máx ${x.cap}€)`).join(', ');

          barrasPresuHtml = `
            <div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:rgba(128,128,128,0.05);display:flex;flex-direction:column;gap:6px">
              <div>
                <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:2px">
                  <span><i class="fa-solid fa-hand-peace"></i> <b>Precio aceptado / cómodo</b>:</span>
                  <span><b>${bp.nComodo}/${bp.totalConPresu}</b> asistentes (Núcleo: <b>${bp.nucleoComodo}/${bp.nucleoConPresu}</b>) · <b>${bp.pctComodo}%</b></span>
                </div>
                <div class="ref-bar-track" style="height:6px">
                  <div class="ref-bar-fill" style="width:${bp.pctComodo}%;background:#10b981"></div>
                </div>
              </div>

              ${bp.hayDobleBarra ? `
                <div>
                  <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:2px">
                    <span><i class="fa-regular fa-thumbs-up"></i> <b>Se lo pueden permitir — Límite estricto (Hard Cap)</b> (${c.p_coop.toFixed(1)}€ ≤ tope máx.):</span>
                    <span><b>${bp.nPermitido}/${bp.totalConPresu}</b> asistentes (Núcleo: <b>${bp.nucleoPermitido}/${bp.nucleoConPresu}</b>) · <b>${bp.pctPermitido}%</b></span>
                  </div>
                  <div class="ref-bar-track" style="height:6px">
                    <div class="ref-bar-fill" style="width:${bp.pctPermitido}%;background:#f59e0b"></div>
                  </div>
                </div>
              ` : ''}

              ${fuerzanNombres ? `<div style="font-size:0.72rem;color:#f59e0b"><i class="fa-solid fa-face-meh" style="color:var(--accent2, #f59e0b); font-size:0.85em; margin-right:0.35em; vertical-align:-0.05em;"></i> Por encima del ideal: <b>${esc(fuerzanNombres)}</b></div>` : ''}
              ${excluidosNombres ? `<div style="font-size:0.72rem;color:var(--accent)"><i class="fa-solid fa-skull-crossbones"></i> No se lo pueden permitir: <b>${esc(excluidosNombres)}</b></div>` : ''}
            </div>
          `;
        }

        const sobrecosteBajas = Math.max(0, c.p_coal - c.p_coop);

        return `
          <div class="sol-casa-item ${c.viable ? 'viable' : 'inviable'}" style="margin-top:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <strong><i class="fa-solid fa-house-flag" style="color:var(--accent3-600, #09518b); font-size:1.15em; margin-right:0.35em; vertical-align:-0.05em;"></i> ${esc(c.nombre)}</strong>
                ${c.esPredilecta ? `<span class="prob-pred-badge">★ Opción predilecta</span>` : ''}
                ${isProbModel && c.enFronteraPareto && !c.esPredilecta ? `<span class="prob-quad-badge ganador">Frontera de Pareto</span>` : ''}
                ${isProbModel && c.cuadrante ? `<span class="prob-quad-badge ${c.cuadrante.id}">${esc(c.cuadrante.label)}</span>` : ''}
              </div>
              ${budgetBadge}
            </div>

            <div class="sol-casa-meta" style="margin-top:4px">
              <span>Precio total: <b>${c.precio_total.toFixed(0)}€</b></span>
              <span title="Precio por persona si van y pagan todos los asistentes de la ventana (${sol.N})">
                Si pagan los ${sol.N} asistentes: <b>${c.p_coop.toFixed(1)}€/pers</b>
              </span>
              <span title="Precio por persona si solo van/pagan quienes votaron a favor de esta casa (mide el riesgo si el resto se baja)">
                Si solo pagan quienes la apoyan (${isProbModel ? `E[X]=${c.E.toFixed(1)}` : `${c.votos}p`}): <b>${c.p_coal.toFixed(1)}€/pers</b>
                ${sobrecosteBajas >= 1 ? `<small style="color:var(--accent)">(+${sobrecosteBajas.toFixed(0)}€ de riesgo)</small>` : ''}
              </span>
              <span>
                Apoyo del Núcleo: <b>${c.apoyosNucleo ?? c.votos}/${sol.N_full}</b>
                ${sol.N_convoy > 0 && c.apoyosSat != null ? ` · Satélites: <b>${c.apoyosSat}/${sol.N_convoy}</b>` : ''}
              </span>
            </div>

            ${c.detallesVotantes && c.detallesVotantes.length ? `
              <div class="ref-voters" style="margin-top:6px;gap:4px">
                ${c.detallesVotantes.map(renderVoterValuationChip).join('')}
              </div>
            ` : ''}

            ${barrasPresuHtml}

            ${isProbModel ? `
              <div class="mt-casa-prob"><span><i class="fa-solid fa-users"></i> <b>${c.E.toFixed(1)}</b> esperados</span><span><i class="fa-solid fa-chart-simple"></i> <b>${Math.round(c.P25*100)}%</b> P25</span></div><details class="mt-work-details"><summary>Interpretación probabilística</summary><div class="mt-work-note">${esc(c.msgE)}<br>${esc(c.msgP25)}</div></details>
              ${buildAlertBlockHtml(c.alertas)}
            ` : ''}
          </div>
        `;
      }).join('');
    } else {
      casasHtml = `<div class="muted-note">No hay alojamientos con precio numérico votados por este subgrupo.</div>`;
    }

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
          <span class="sol-tag">${scopeLabel ? "Ventana parcial" : "Solución propuesta"} #${idx + 1} · ${tagFinde}${esc(tagExcursion)}</span>
          ${sol.ranking?`<div class="mt-rank-note">${esc(sol.ranking.etiquetas.join(" · ")||"Alternativa del ranking")} · L¹ ${(100*sol.ranking.L1).toFixed(1)}% · L∞ ${(100*sol.ranking.Linf).toFixed(1)}%</div>`:""}<h3 class="sol-interval">${fmtShortDate(sol.fIni)} → ${fmtShortDate(sol.fFin)} (${sol.L} día${sol.L === 1 ? '' : 's'})${esc(cruceStr)}</h3>
        </div>
        <div class="sol-pills">
          <span class="sol-pill">Total <b>${sol.N}</b></span>${sol.asistencia&&asistenciaActiva?`<span class="sol-pill">E <b>${sol.asistencia.E.toFixed(2)}</b></span><span class="sol-pill">Q común ${sol.asistencia.quorum} <b>${(100*sol.asistencia.Q).toFixed(1)}%</b></span><span class="sol-pill">Var <b>${sol.asistencia.variance.toFixed(2)}</b></span>${sol.asistencia.quorumNucleo?.k!=null?`<span class="sol-pill">Quórum núcleo ≥ ${sol.asistencia.quorumNucleo.k} <b>${(100*sol.asistencia.quorumNucleo.Q).toFixed(1)}%</b></span>`:''}`:""}
          <span class="sol-pill">Núcleo <b>${sol.N_full}</b></span>
          <span class="sol-pill">Satélites <b>${sol.N_convoy}</b></span>
          <span class="sol-pill" title="Presupuesto más bajo dentro del Núcleo">Mín. Núcleo: <b>${esc(strPresuNucleo)}</b></span>
          ${sol.N_convoy > 0 && sol.pMaxGrupo !== sol.pMaxNucleo
            ? `<span class="sol-pill" title="Presupuesto más bajo incluyendo Satélites">Mín. Grupo: <b>${esc(strPresuGrupo)}</b></span>`
            : ''}
        </div>
      </div>

      <div class="sol-group-chips">
        <div><small>Núcleo (${sol.N_full}):</small> ${sol.asistentesNucleo.map(n => `<span class="voter-chip nucleo">${esc(n)}</span>`).join(' ')}</div>
        ${sol.satelitesAsignados.length ? `<div><small>Satélites (${sol.N_convoy}):</small>${sol.satelitesAsignados.map(n => `<span class="voter-chip satelite">${esc(n)} (${fmtShortDate(sol.asignacion[n][0])}→${fmtShortDate(sol.asignacion[n][sol.asignacion[n].length - 1])})</span>`).join(' ')}</div>` : ''}
        ${sol.excluidos.length
          ? `<div><small>Ausentes (${sol.excluidos.length}):</small>${sol.excluidos.map(n => `<span class="voter-chip ausente">${esc(n)}</span>`).join(' ')}</div>`
          : `<div><span style="color:var(--accent2);font-size:0.8rem">✓ ¡Asistencia perfecta del grupo!</span></div>`}
      </div>

      ${logOn ? `
        <div class="sol-log-grid">
          ${renderTablaViajes(sol.flujo.idas, '↗ Viajes de Ida', 'ida')}
          ${renderTablaViajes(sol.flujo.vueltas, '↙ Viajes de Vuelta', 'vuelta')}
        </div>
        ${sinDato.length ? `<div class="muted-note">Sin dato de transporte (no entran en el reparto de coches): <b>${sinDato.map(esc).join(', ')}</b></div>` : ''}
      ` : `<div class="muted-note"><i class="fa-solid fa-notdef"></i> Logística no considerada: nadie ha indicado transporte, así que la factibilidad solo depende de fechas.</div>`}

      <div style="margin-top:14px">
        <div style="font-size:0.8rem;font-weight:600;color:var(--muted);text-transform:uppercase;margin-bottom:6px">
          1. Planes votados por los asistentes de esta ventana
        </div>
        ${planesHtml}

        <div style="font-size:0.8rem;font-weight:600;color:var(--muted);text-transform:uppercase;margin:10px 0 6px">
          2. Alojamientos / Opciones vinculadas al plan
        </div>
        ${casasHtml}
      </div>

      ${fragHtml}

      <div style="margin-top:12px;display:flex;justify-content:flex-end">
        <button type="button" class="btn-propose btn-propose-sol" style="padding:6px 12px;font-size:0.8rem">
          <i class="fa-solid fa-thumbtack" style="margin-right: 0.25em;"></i> Llevar esta solución como Propuesta a la Sala de Debate →
        </button>
      </div>
    `;

    bindAlertExpandButtons(card);

    card.querySelector('.btn-propose-sol').addEventListener('click', () => {
      const textoPropuesta = `${scopeLabel ? "Propongo estudiar la ventana parcial ("+scopeLabel+", no es una solución global)" : "Propongo cerrar la Solución"} #${idx + 1}: del ${fmtShortDate(sol.fIni)} al ${fmtShortDate(sol.fFin)} (${sol.L} día${sol.L === 1 ? '' : 's'}, ${sol.N} asistentes: ${[...sol.asistentesNucleo, ...sol.satelitesAsignados].join(', ')}). Plan: ${sol.opcionVotada}.`;
      if (typeof createProposalFromConsensus === 'function') {
        createProposalFromConsensus(textoPropuesta);
      }
    });

    wrap.appendChild(card);
  });

  return wrap;
}

// ── TARJETA DE SENSIBILIDAD, TOPOLOGÍA E IMPRESCINDIBLES ────────────
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
        <small>${s.nomEco==='Ninguno'?'Sin presupuesto evaluado':`Fija el techo coop. en ${s.valEco} €/pers`}</small>
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
function buildAnalyticalCard(q, idx, myAns, options={}) {
  if(q.config?.esEncabezado)return null;
  const card = div('card ref-card');
  const title = div('card-title');
  title.innerHTML = `<span class="num">${idx + 1}</span> ${esc(q.label)}`;
  card.appendChild(title);
  if(options.readOnly&&typeof stabilityElement==='function'){const cert=stabilityElement(q);if(cert)card.append(cert);}

  const readOnly=!!options.readOnly;
  const study=options.study;
  if(study){const info=div('mt-study-meta');info.textContent=`${study.answered}/${study.applicable} aplicables con respuesta · ${study.excluded} fuera de la rama · ${study.unknown} rama desconocida · ${study.pending} sin envío`;card.appendChild(info);if(study.status==='no_aplicable'){const note=div('muted-note');note.textContent='No aplicable: ningún participante pertenece a esta rama.';card.appendChild(note);return card;}}
  const applicable = DecisionModel.applicability(q,myAns||{},schema)===1;
  const myVal = applicable ? extractAnswer(myAns, q) : null;

  switch (q.tipo) {
    case 'checkbox':
    case 'voto-ponderado':
    case 'casas':
      buildOptionsConsensus(card, q, myVal);
      break;
    case 'probabilidad-opcion':
      buildProbabilidadOpcionConsensus(card, q, myVal);
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
  if(readOnly){
    card.classList.add('mt-readonly-analysis');
    card.querySelectorAll('.ref-inline-pond,.btn-ref-toggle,.ref-reformulario-box').forEach(el=>el.remove());
    card.querySelectorAll('.prob-scale-row').forEach(el=>el.parentElement.remove());
    if(study?.transport)card.appendChild(buildTransportVisual(study));
    return card;
  }
  if(q.config?.routeStudy){const actual=DecisionModel.studies(schema,respuestas,respondentes).find(x=>x.qid===q.id);if(actual?.transport)card.appendChild(buildTransportVisual(actual));}
  if(!applicable){const note=div();note.textContent="No aplica o falta responder a la condición de origen. Los resultados son del grupo al que sí aplica.";card.appendChild(note);card.querySelectorAll("button,input,select,textarea").forEach(el=>el.disabled=true);}
  return card;
}

// ── NUEVA VISTA DE CONSENSO PARA `probabilidad-opcion` (§4, §5, §6 y §7) ───
function buildProbabilidadOpcionConsensus(card, q, myVal) {
  const pcIdx  = pcIndex();
  const escala = typeof getEscalaProbabilidad === 'function' ? getEscalaProbabilidad(q) : [
    { label: 'No voy', val: 0.00, pct: '0%' },
    { label: 'Poco probable', val: 0.20, pct: '20%' },
    { label: 'Quizás / ns', val: 0.50, pct: '50%' },
    { label: 'Probable', val: 0.75, pct: '70%' },
    { label: 'Casi seguro', val: 0.90, pct: '90%' },
    { label: 'Seguro', val: Esquema.PROB_OPTION_MAX, pct: '98%*' },
  ];
  const myDict = typeof normProbOpcion === 'function' ? normProbOpcion(myVal) : (myVal || {});

  // Evaluar métricas E[X], P25[X], frontera de Pareto, cuadrantes y alertas desde el motor único
  const evalFn = typeof evaluarCatalogoProbabilidad === 'function' ? evaluarCatalogoProbabilidad : null;
  const evalRes = evalFn ? evalFn(q, null, true) : null;

  if (!evalRes || (!evalRes.frontera.length && !evalRes.descartadas.length && !(q.opciones || []).length)) {
    card.innerHTML += `<p style="color:var(--muted);font-size:0.85rem">Sin opciones o valoraciones registradas aún.</p>`;
    return;
  }

  // Mapa auxiliar para recuperar URL/foto de cada opción del esquema
  const rawByKey = new Map();
  (q.opciones || []).forEach(op => {
    const k = optVal(q, op);
    rawByKey.set(k, op);
  });

  const maxE = Math.max(1, evalRes.nVotantes || 1, ...evalRes.opciones.map(o => o.E || 0));

  const renderOptionRow = (it, isPredilecta, isDescartada = false) => {
    const rawOp = rawByKey.get(it.key);
    const url   = (rawOp && typeof rawOp === 'object' && rawOp.url) ? safeUrl(rawOp.url) : '';
    const foto  = (rawOp && typeof rawOp === 'object' && rawOp.foto) ? safeUrl(rawOp.foto) : '';

    const entriesPC = pcIdx.get(q.id + '\u0000' + it.key) || [];
    const pros = entriesPC.filter(e => e.tipo === 'pro').length;
    const cons = entriesPC.filter(e => e.tipo === 'contra').length;

    const myProb = (it.key in myDict) ? Number(myDict[it.key]) : null;
    const pctBar = Math.max(0, Math.min(100, (it.E / maxE) * 100));

    const row = div('ref-opt-row' + (isPredilecta ? ' is-leader' : ''));
    if (isPredilecta) row.style.borderColor = '#10b981';

    // Badges de estado (Predilecta, Cuadrante 2x2 o Causa de descarte Pareto/Grupo pequeño)
    const statusBadgesHtml = isDescartada
      ? (it.inviableGrupoPequeno
          ? `<span class="prob-quad-badge rechazar">Inviable (veto 0.00 en grupo ≤ 4)</span>`
          : `<span class="prob-quad-badge tibio">Dominada por «${esc(it.dominadaPor)}»</span>`)
      : `${isPredilecta ? `<span class="prob-pred-badge">★ Opción predilecta</span>` : ''}
         <span class="prob-quad-badge ${it.cuadrante.id}">${esc(it.cuadrante.label)}</span>`;

    // Chips individuales de votantes con su probabilidad declarada
    const porUsuarioEntries = Object.entries(it.porUsuario || it.probPorViajero || {})
      .sort((a, b) => b[1] - a[1]);

    const votersHtml = porUsuarioEntries.length
      ? porUsuarioEntries.map(([nom, p]) => {
          const cls = p === 0 ? 'veto' : (p >= 0.90 ? 'star' : '');
          return `<span class="voter-chip ${cls}">${esc(nom)} <b>${Math.round(p * 100)}%</b></span>`;
        }).join('')
      : `<span style="color:var(--muted);font-size:0.75rem">Sin valoraciones aún</span>`;

    // Botonera interactiva en vivo para cambiar mi probabilidad directamente desde el Reformulario
    const scaleBtnsHtml = escala.map(cat => {
      const isAct = myProb != null && Math.abs(myProb - cat.val) < 0.03;
      return `
        <button type="button" class="btn-prob-cat ${isAct ? 'active' : ''}" data-prob="${cat.val}" title="${esc(cat.label)} (${cat.pct})" style="min-width:56px;padding:3px 5px">
          <span style="font-size:0.7rem">${esc(cat.label)}</span>
          <small>${esc(cat.pct)}</small>
        </button>
      `;
    }).join('');

    row.innerHTML = `
      <div class="ref-opt-main" style="align-items:flex-start">
        <div class="ref-opt-info" style="flex-wrap:wrap;gap:6px">
          ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="ref-link">${esc(it.label)} ↗</a>` : `<span class="ref-opt-title">${esc(it.label)}</span>`}
          ${it.precio ? `<span class="casa-precio">${esc(it.precio)}</span>` : ''}
          ${foto ? `<img class="ref-foto" src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
          ${statusBadgesHtml}
        </div>
        <div class="prob-metrics-pills">
          <span class="prob-metric-pill" title="Asistencia esperada E[X] = Σ p_i">E[X]: <b>${it.E.toFixed(1)}</b></span>
          <span class="prob-metric-pill" title="Percentil 25 de las probabilidades">P25: <b>${it.P25.toFixed(2)}</b></span>
        </div>
      </div>

      <div class="ref-bar-track" style="margin:6px 0">
        <div class="ref-bar-fill ${it.P25 < 0.15 ? 'negative' : ''}" style="width:${pctBar}%"></div>
      </div>

      ${it.nOpt > 0 ? `
        <details class="mt-work-details"><summary><i class="fa-solid fa-circle-info"></i> Interpretación y compromiso</summary><div class="prob-cand-msgs"><div>${esc(it.msgE)}</div><div>${esc(it.msgP25)}</div></div><div class="prob-cand-tradeoff">${esc(it.cuadrante.tradeoff)}</div></details>
        ${buildAlertBlockHtml(it.alertas)}
      ` : ''}

      <div style="margin-top:8px">
        <div style="font-size:0.73rem;color:var(--muted);margin-bottom:4px">Mi probabilidad en esta opción (clic para cambiar en vivo):</div>
        <div class="prob-scale-row">${scaleBtnsHtml}</div>
      </div>

      <div class="ref-opt-meta" style="margin-top:8px">
        <div class="ref-voters">${votersHtml}</div>
        <button type="button" class="btn-JumpDebate">
          💬 ${pros + cons > 0 ? `▲${pros} ▼${cons} · Debatir` : 'Debatir opción'}
        </button>
      </div>
    `;

    bindAlertExpandButtons(row);

    row.querySelectorAll('.btn-prob-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        const pVal = typeof clipProbabilidad === 'function'
          ? clipProbabilidad(btn.dataset.prob)
          : Esquema.clipProbOpcionCompartida(btn.dataset.prob);
        const next = Object.assign({}, myDict);
        if (next[it.key] != null && Math.abs(next[it.key] - pVal) < 0.03) {
          delete next[it.key];
        } else {
          next[it.key] = pVal;
        }
        patchSingleAnswer(q.id, next);
      });
    });

    row.querySelector('.btn-JumpDebate').addEventListener('click', () => {
      if (typeof openDebateFor === 'function') openDebateFor(q.id, it.key);
    });

    appendOptionDetails(row, rawOp && typeof rawOp === 'object' ? {...rawOp, foto:''} : rawOp);
    return row;
  };

  // Cabecera de síntesis de la pregunta (Expectativa a priori vs Candidatas en Frontera de Pareto)
  const summaryBar = div();
  summaryBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;font-size:0.82rem;color:var(--muted)';
  summaryBar.innerHTML = `
    <span><b>Candidatas en la Frontera de Pareto (${evalRes.frontera.length})</b> · Las opciones no dominadas compiten en la decisión principal.</span>
    <span>Votantes: <b>${evalRes.nVotantes}</b> · Asistencia esperada a priori: <b>${evalRes.eBase.toFixed(1)}</b> pers.</span>
  `;
  card.appendChild(summaryBar);
  card.appendChild(buildParetoPlot(evalRes));

  const frontList = div('ref-opt-list');
  if (evalRes.frontera.length) {
    evalRes.frontera.forEach(it => {
      const isPred = !!(evalRes.predilecta && evalRes.predilecta.key === it.key);
      frontList.appendChild(renderOptionRow(it, isPred, false));
    });
  } else {
    // Si aún nadie ha votado o todas tienen veto en grupo <= 4, mostramos las sin voto para poder votarlas
    const sinVotos = evalRes.opciones.filter(o => o.nOpt === 0);
    if (sinVotos.length) {
      sinVotos.forEach(it => frontList.appendChild(renderOptionRow(it, false, false)));
    } else {
      const msg = div('muted-note', 'Ninguna opción supera el filtro de viabilidad en grupo pequeño (n ≤ 4 con algún voto 0.00). Despliega las opciones descartadas debajo.');
      frontList.appendChild(msg);
    }
  }
  card.appendChild(frontList);

  // Opciones aún sin ningún voto cuando ya hay frontera activa (para que cualquier usuario pueda estrenarlas)
  const unwatched = evalRes.opciones.filter(o => o.nOpt === 0);
  if (evalRes.frontera.length && unwatched.length) {
    const unwatchedWrap = div('ref-opt-list');
    unwatchedWrap.style.marginTop = '8px';
    unwatched.forEach(it => unwatchedWrap.appendChild(renderOptionRow(it, false, false)));
    card.appendChild(unwatchedWrap);
  }

  // §5.2 y §7: Apartado secundario plegado ("Resto / opciones descartadas")
  if (evalRes.descartadas.length) {
    const details = document.createElement('details');
    details.className = 'prob-discarded-details';
    details.style.marginTop = '12px';
    const summary = document.createElement('summary');
    summary.textContent = `Ver resto / opciones descartadas por dominancia de Pareto (${evalRes.descartadas.length})`;
    const discList = div('ref-opt-list');
    discList.style.marginTop = '8px';
    evalRes.descartadas.forEach(it => {
      discList.appendChild(renderOptionRow(it, false, true));
    });
    details.append(summary, discList);
    card.appendChild(details);
  }
}

// Diagrama de objetivos con las métricas del evaluador original (sin recalcularlas).
function buildParetoPlot(result){
  const items=result.opciones.filter(o=>o.nOpt>0),wrap=div('mt-pareto-plot');
  if(!items.length)return wrap;
  const W=560,H=260,L=48,R=20,T=20,B=47, xmax=Math.max(1,result.nVotantes,...items.map(o=>o.E));
  const x=v=>L+(W-L-R)*v/xmax,y=v=>H-B-(H-B-T)*v;
  const es=items.map(o=>o.E).sort((a,b)=>a-b),mid=(es[Math.floor((es.length-1)/2)]+es[Math.floor(es.length/2)])/2;
  const front=new Set(result.frontera.map(o=>o.key));
  const frontier=items.filter(o=>front.has(o.key)).sort((a,b)=>a.E-b.E);
  const groups=new Map();items.forEach((o,i)=>{const key=`${o.E.toFixed(8)}:${o.P25.toFixed(8)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({o,i});});
  const points=[...groups.values()].map(group=>{const o=group[0].o,cls=group.some(v=>front.has(v.o.key))?'front':group.every(v=>v.o.inviableGrupoPequeno)?'veto':'dominated';const info=group.map(({o})=>`${o.label}: E=${o.E.toFixed(2)}, P25=${o.P25.toFixed(2)}, n=${o.nOpt}`).join(' | ');return `<g class="mt-pareto-point ${cls}" tabindex="0" role="img" aria-label="${esc(info)}"><title>${esc(info)}</title>${cls==='front'?`<circle class="mt-pareto-ring" cx="${x(o.E)}" cy="${y(o.P25)}" r="${Math.min(11,5+Math.sqrt(o.nOpt))+4}"/>`:``}<circle cx="${x(o.E)}" cy="${y(o.P25)}" r="${Math.min(11,5+Math.sqrt(o.nOpt))}"/><text x="${x(o.E)}" y="${y(o.P25)-15}" text-anchor="middle">${group.map(v=>v.i+1).join(', ')}</text></g>`;}).join('');
  wrap.innerHTML=`<div class="mt-plot-title">Asistencia esperada frente a compromiso del grupo</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Diagrama de Pareto de asistencia esperada y percentil 25"><rect class="mt-pareto-upper" x="${L}" y="${T}" width="${x(mid)-L}" height="${y(.5)-T}" fill="var(--accent3)" opacity=".09"/><rect class="mt-pareto-upper" x="${x(mid)}" y="${T}" width="${W-R-x(mid)}" height="${y(.5)-T}" fill="var(--ok)" opacity=".10"/><rect class="mt-pareto-lower" x="${L}" y="${y(.5)}" width="${x(mid)-L}" height="${H-B-y(.5)}" fill="var(--err)" opacity=".08"/><rect class="mt-pareto-lower" x="${x(mid)}" y="${y(.5)}" width="${W-R-x(mid)}" height="${H-B-y(.5)}" fill="var(--accent)" opacity=".09"/><line x1="${x(mid)}" x2="${x(mid)}" y1="${T}" y2="${H-B}" stroke="var(--muted)" stroke-dasharray="3 4"/><line class="mt-pareto-threshold" x1="${L}" x2="${W-R}" y1="${y(.5)}" y2="${y(.5)}" stroke="var(--accent)" stroke-dasharray="5 4"/>${[0,.25,.5,.75,1].map(v=>`<line class="mt-plot-grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end">${Math.round(v*100)}%</text>`).join('')}${[0,.25,.5,.75,1].map(v=>`<text x="${x(v*xmax)}" y="${H-B+17}" text-anchor="middle">${Number((v*xmax).toFixed(1))}</text>`).join('')}<path class="mt-plot-axis" d="M${L} ${T} V${H-B} H${W-R}"/>${frontier.length>1?`<polyline class="mt-pareto-line" points="${frontier.map(o=>`${x(o.E)},${y(o.P25)}`).join(' ')}"/>`:''}${points}<text x="${(L+W-R)/2}" y="${H-7}" text-anchor="middle">E[X] · personas esperadas</text><text x="12" y="${(T+H-B)/2}" text-anchor="middle" transform="rotate(-90 12 ${(T+H-B)/2})">P25</text></svg><div class="mt-plot-legend"><span class="mt-front">● No dominada</span><span class="mt-dominated">● Dominada</span><span class="mt-veto">● Veto en grupo pequeño</span></div><div class="mt-plot-labels">${items.map((o,i)=>`<span><b>${i+1}.</b> ${esc(o.label)} <small>(n=${o.nOpt})</small></span>`).join('')}</div><p class="mt-results-note">Cada punto utiliza las valoraciones disponibles de esa opción; si el número de votantes difiere, compara también n. Guías visuales: mediana de E y umbral P25 exploratorio; no cambian la clasificación del motor. La línea no representa opciones intermedias factibles.</p>`;
  const controls=div('mt-pareto-controls');controls.innerHTML='<label><i class="fa-solid fa-sliders"></i> Umbral visual de P25 <strong>50%</strong><input type="range" min="0" max="100" step="5" value="50" aria-label="Umbral visual de P25"></label>';wrap.insertBefore(controls,wrap.querySelector('svg'));const input=controls.querySelector('input');input.addEventListener('input',()=>{const v=Number(input.value)/100,yy=y(v);controls.querySelector('strong').textContent=input.value+'%';wrap.querySelectorAll('.mt-pareto-upper').forEach(el=>el.setAttribute('height',yy-T));wrap.querySelectorAll('.mt-pareto-lower').forEach(el=>{el.setAttribute('y',yy);el.setAttribute('height',H-B-yy);});const line=wrap.querySelector('.mt-pareto-threshold');line.setAttribute('y1',yy);line.setAttribute('y2',yy);});
  return wrap;
}

function buildOptionsConsensus(card, q, myVal) {
  const pcIdx = pcIndex();
  const opts  = (q.opciones || []).map(op => {
    const key    = optVal(q, op);
    const precio = optionPriceLabel(op);
    const url    = (op && typeof op === 'object' && op.url) ? safeUrl(op.url) : '';
    const foto   = (op && typeof op === 'object' && op.foto) ? safeUrl(op.foto) : '';
    return { key, precio, raw: op, url, foto, score: 0, rawScore: 0, voters: [], vetoes: [], positive:0, negative:0 };
  });

  const map = new Map(opts.map(o => [o.key, o]));

  DecisionModel.cohorts(q,respuestas,schema).answered.forEach(r => {
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
        if (pNum < 0) { item.vetoes.push(r.nombre); item.negative += -pNum*w; }
        else { item.voters.push({ nombre: r.nombre, pts: pNum }); item.positive += pNum*w; }
      });
    }
  });
  opts.forEach(o => {
    o.pcAdj = pcAjuste(pcIdx.get(q.id + '\u0000' + o.key) || []);
    o.score += o.pcAdj; o.rawScore += o.pcAdj;
  });
  opts.sort((a, b) => b.score - a.score || b.voters.length - a.voters.length);
  const maxScore = Math.max(1, ...opts.map(o => Math.abs(o.score)));
  const maxDivergent = Math.max(1,...opts.flatMap(o=>[o.positive,o.negative]));

  const list = div('ref-opt-list');

  opts.forEach((o, rank) => {
    const row = div('ref-opt-row' + (rank === 0 && o.score > 0 ? ' is-leader' : ''));
    const pct = Math.max(0, Math.min(100, (Math.abs(o.score) / maxScore) * 100));
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
      ${q.tipo==='voto-ponderado'?`<div class="mt-divergent" title="Oposición y apoyo en la misma escala, sin ajuste del debate"><span><b style="width:${100*o.negative/maxDivergent}%"></b></span><span><b style="width:${100*o.positive/maxDivergent}%"></b></span></div><div class="mt-div-label"><span>−${o.negative.toFixed(1)} oposición</span><span>+${o.positive.toFixed(1)} apoyo</span></div>`:`<div class="ref-bar-track"><div class="ref-bar-fill ${o.score < 0 ? 'negative' : ''}" style="width:${pct}%"></div></div>`}
      <div class="ref-opt-meta">
        <div class="ref-voters">
          ${o.voters.map(v => {
            const cls = v.pts === 3 ? 'vote-star'
                      : v.pts === 0 ? 'vote-neutral'
                      : (v.pts != null && v.pts < 0) ? 'veto'
                      : 'vote-pos';
            const suffix = v.pts === 3 ? ' ★' : '';
            return `<span class="voter-chip ${cls}">${esc(v.nombre)}${suffix}</span>`;
          }).join('')}
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
            : [...cur, { nombre: o.key, precio: o.raw?.precio || null }];
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

    appendOptionDetails(row, o.raw && typeof o.raw === 'object' ? {...o.raw, foto:''} : o.raw);
    list.appendChild(row);
  });

  card.appendChild(list);
}

// ── SLIDER CONSENSUS (Soporta escalar clásico y objeto Dual { ideal, max }) ─
function buildSliderConsensus(card, q, myVal) {
  const cfg  = q.config || {};
  const min  = cfg.min ?? 10, max = cfg.max ?? 500, step = cfg.step ?? 10;
  const unit = cfg.unit ?? (DecisionModel.role(q)==='presupuesto'?' €':'');

  const unpackSlider = v => {
    if (v == null) return null;
    if (typeof v === 'object') {
      const ideal = Number(v.ideal ?? v.value ?? v.min);
      const cap   = Number(v.max ?? ideal);
      if (!isFinite(ideal)) return null;
      return { ideal, max: isFinite(cap) ? Math.max(ideal, cap) : ideal, isDual: isFinite(cap) && cap > ideal };
    }
    const num = Number(v);
    return isFinite(num) ? { ideal: num, max: num, isDual: false } : null;
  };

  const entries = [];
  DecisionModel.cohorts(q,respuestas,schema).answered.forEach(r => {
    const parsed = unpackSlider(extractAnswer(r.answers, q));
    if (parsed) entries.push({ nombre: r.nombre, val: parsed.ideal, max: parsed.max, isDual: parsed.isDual });
  });

  if (!entries.length) {
    card.innerHTML += `<p style="color:var(--muted);font-size:0.85rem">Sin datos numéricos aún.</p>`;
    return;
  }

  entries.sort((a, b) => a.max - b.max || a.val - b.val);
  const hardCaps = entries.map(e => e.max);
  const ideals   = entries.map(e => e.val).sort((a, b) => a - b);

  const vMinCap   = hardCaps[0];
  const vMinIdeal = ideals[0];
  const q1   = ideals[Math.floor((ideals.length - 1) * 0.25)];
  const mid = Math.floor(ideals.length/2);
  const med = ideals.length%2 ? ideals[mid] : (ideals[mid-1]+ideals[mid])/2;
  const mean = ideals.reduce((acc, x) => acc + x, 0) / ideals.length;

  const myParsed  = unpackSlider(myVal);
  const curMyVal  = myParsed ? myParsed.ideal : (cfg.default ?? med);
  const curMyMax  = myParsed ? myParsed.max   : curMyVal;
  const hasMyDual = myParsed ? myParsed.isDual : false;

  const wrap = div('ref-slider-analysis');
  wrap.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:14px">
      <div class="kpi-box">
        <span class="kpi-label">${DecisionModel.role(q)==='presupuesto'?'Restricción activa (tope común)':'Mínimo declarado'}</span>
        <span class="kpi-val" style="color:var(--accent)">${vMinCap}${esc(unit)}</span>
        <small>Por ${esc(entries[0].nombre)}${vMinIdeal < vMinCap ? ` ( cómodo mín: ${vMinIdeal}${esc(unit)} )` : ''}</small>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Percentil 25 (Q₁ cómodo)</span>
        <span class="kpi-val">${q1}${esc(unit)}</span>
        <small>Cuantil empírico de valores declarados</small>
      </div>
      <div class="kpi-box">
        <span class="kpi-label">Mediana / Media</span>
        <span class="kpi-val">${med}${esc(unit)} <small>/ ${Math.round(mean)}${esc(unit)}</small></span>
      </div>
    </div>

    <div class="ref-dist-list">
      ${entries.map(e => {
        const pct = max > min ? ((e.val - min) / (max - min)) * 100 : 50;
        const capTxt = e.isDual ? ` <small style="color:var(--muted)">(tope ${e.max}${esc(unit)})</small>` : '';
        return `
          <div class="ref-dist-row">
            <span class="ref-dist-name">${esc(e.nombre)}</span>
            <div class="ref-bar-track" style="flex:1">
              <div class="ref-bar-fill" style="width:${Math.max(4, Math.min(100, pct))}%"></div>
            </div>
            <span class="ref-dist-val" style="width:auto;min-width:75px;text-align:right">${e.val}${esc(unit)}${capTxt}</span>
          </div>
        `;
      }).join('')}
    </div>

    <div class="ref-reformulario-box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:0.85rem;font-weight:500">${DecisionModel.role(q)==='presupuesto'?'Ajustar mi presupuesto cómodo en caliente:':'Ajustar mi valor en caliente:'}</span>
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
    lbl.textContent = sl.value + unit + (hasMyDual ? ` (Tope: ${Math.max(+sl.value, curMyMax)}${unit})` : '');
  };
  updatePct();
  sl.addEventListener('input', updatePct);
  sl.addEventListener('change', () => {
    const newIdeal = +sl.value;
    if (hasMyDual) {
      patchSingleAnswer(q.id, { ideal: newIdeal, max: Math.max(newIdeal, curMyMax), value: newIdeal });
    } else {
      patchSingleAnswer(q.id, newIdeal);
    }
  });

  card.appendChild(wrap);
}

function buildDisponibilidadConsensus(card,q) {
  const cohort=DecisionModel.cohorts(q,respuestas,schema);
  const entries=cohort.answered.map(r=>{
    const v=r.value||{}, dates=new Set();
    if(!v.noSe)for(const rg of v.rangos||[]){
      const d=new Date(rg.desde+'T00:00:00Z'),end=new Date(rg.hasta+'T00:00:00Z');
      for(let k=0;d<=end&&k<366;k++,d.setUTCDate(d.getUTCDate()+1)){
        const f=d.toISOString().slice(0,10);if(!v.soloFinde||isWeekendISO(f))dates.add(f);
      }
    }
    return {nombre:r.nombre,dates,days:v.diasMax,unknown:!!v.noSe||!dates.size};
  });
  const all=[...new Set(entries.flatMap(r=>[...r.dates]))].sort();
  if(!all.length){card.appendChild(div('muted-note','Sin fechas concretas registradas en esta pregunta.'));return;}
  const dates=all.slice(0,45),known=entries.filter(r=>!r.unknown);
  const counts=all.map(f=>({f,n:known.filter(r=>r.dates.has(f)).length})).sort((a,b)=>b.n-a.n||a.f.localeCompare(b.f));
  const wrap=div('mt-date-analysis');
  wrap.innerHTML=`<div class="kpi-grid"><div class="kpi-box"><span class="kpi-label">Días con disponibilidad</span><span class="kpi-val">${all.length}</span></div><div class="kpi-box"><span class="kpi-label">Mayor coincidencia diaria</span><span class="kpi-val">${counts[0].n}/${known.length}</span><small>${fmtShortDate(counts[0].f)}</small></div></div><p class="mt-results-note">Mapa de calor por participante (${dates.length}/${all.length} días). «?» indica falta de fechas concretas, no indisponibilidad.</p><div style="overflow-x:auto"><table class="compat-matrix-table"><thead><tr><th>Participante</th><th>Días máx.</th>${dates.map(f=>`<th class="mt-heat-col ${isWeekendISO(f)?'weekend':''}">${fmtShortDate(f)}</th>`).join('')}<th>Días disponibles</th></tr><tr class="mt-heat-marginal"><th colspan="2">Disponibles</th>${dates.map(f=>{const n=known.filter(r=>r.dates.has(f)).length;return `<th><div class="mt-heat-top" title="${n} disponibles"><b style="height:${100*n/Math.max(1,known.length)}%"></b></div>${n}</th>`;}).join('')}<th></th></tr></thead><tbody>${entries.map(r=>`<tr><th>${esc(r.nombre)}</th><td>${esc(r.days??'—')}</td>${dates.map(f=>`<td class="${r.dates.has(f)?'mt-date-yes':r.unknown?'mt-date-unknown':''}" title="${esc(r.nombre)} · ${esc(f)}">${r.dates.has(f)?'✓':r.unknown?'?':'·'}</td>`).join('')}<td><div class="mt-heat-right"><b style="width:${100*r.dates.size/Math.max(1,all.length)}%"></b><span>${r.unknown?'?':r.dates.size}</span></div></td></tr>`).join('')}</tbody></table></div><p class="mt-results-note">Mejores días por número de disponibles (no equivale a una ventana conjunta factible).</p>${counts.slice(0,10).map(x=>`<div class="ref-dist-row"><span class="ref-dist-name">${fmtShortDate(x.f)}</span><div class="ref-bar-track" style="flex:1"><div class="ref-bar-fill" style="width:${100*x.n/Math.max(1,known.length)}%"></div></div><strong>${x.n}/${known.length}</strong></div>`).join('')}`;
  card.appendChild(wrap);
}

function buildTransportVisual(s){
  const t=s.transport,wrap=div('mt-transport-analysis'),scale=Math.max(1,t.seats,t.passengers.length);
  const complete=s.status==='factible'||s.status==='infactible';const status=!complete?'Datos incompletos':t.balance<0?`Faltan ${-t.balance} plazas`:t.balance===0?'Sin plazas de margen':`+${t.balance} plazas de margen`;
  const metrics=[['fa-car-side',t.drivers.length,'Coches'],['fa-chair',t.seats,'Plazas libres'],['fa-person',t.passengers.length,'Pasajeros'],['fa-person-walking',t.independent.length,'Por su cuenta']];
  wrap.innerHTML=`<div class="mt-mini-metrics mt-transport-metrics">${metrics.map(([i,v,l])=>`<div class="mt-mini-metric"><i class="fa-solid ${i}"></i><strong>${v}</strong><small>${l}</small></div>`).join('')}</div><div class="mt-transport-capacity ${!complete?'warn':t.balance<0?'err':'ok'}"><i class="fa-solid ${!complete?'fa-circle-question':t.balance<0?'fa-circle-exclamation':'fa-circle-check'}"></i> ${esc(status)} <small> · solo capacidad</small></div><div class="mt-mini-bars">${[['Plazas disponibles',t.seats],['Personas sin coche',t.passengers.length]].map(([label,n],i)=>`<div class="mt-mini-row"><div><span>${label}</span><strong>${n}</strong></div><div class="mt-mini-track"><b class="${i?'demand':''}" style="width:${100*n/scale}%"></b></div></div>`).join('')}</div>`;
  if(t.unknown.length)wrap.append(div('mt-work-note','Datos incompletos: '+t.unknown.join(', ')));
  if(s.route)wrap.appendChild(buildRouteStudyVisual(s));
  return wrap;
}

function buildRadioConsensus(card, q, myVal) {
  const cs = getRadioStepperConfig(q);
  const counts = new Map();
  (q.opciones || []).forEach(op => {
    const norm = typeof normalizeOption === 'function'
      ? normalizeOption(q, op)
      : (() => {
          const s = (op && typeof op === 'object') ? String(op.nombre || '') : String(op);
          const [val, label] = s.includes('|') ? s.split('|') : [s, s];
          return { key: val, label };
        })();
    counts.set(norm.key, { val: norm.key, label: norm.label, users: [], extraSum: 0 });
  });

  DecisionModel.cohorts(q,respuestas,schema).answered.forEach(r => {
    const v = extractAnswer(r.answers, q);
    if (!v) return;
    const est = typeof v === 'object' ? v.estado : v;
    const entry = counts.get(est);
    if (entry) {
      const extra = (cs && typeof v === 'object' && v[cs.key || 'plazasLibres']) ? Number(v[cs.key || 'plazasLibres']) : 0;
      const prefsObj = (!q.config?.routeStudy && typeof v === 'object') ? (v.prefPasajeros || v.prefCoches || null) : null;
      const favs = prefsObj ? Object.entries(prefsObj).filter(([, s]) => Number(s) > 0).map(([k]) => k) : [];
      entry.users.push({ nombre: r.nombre, extra, favs });
      entry.extraSum += extra;
    }
  });

  const myEstado = myVal ? (typeof myVal === 'object' ? myVal.estado : myVal) : null;
  const myExtra  = (cs && myVal && typeof myVal === 'object' && myVal[cs.key || 'plazasLibres'] != null) ? Number(myVal[cs.key || 'plazasLibres']) : (cs ? cs.default : 3);

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
      <div class="ref-bar-track" style="margin-top:8px"><div class="ref-bar-fill" style="width:${100*item.users.length/Math.max(1,[...counts.values()].reduce((a,v)=>a+v.users.length,0))}%"></div></div>
      <div class="ref-voters" style="margin-top:6px">
        ${item.users.map(u => {
          const favTxt = u.favs && u.favs.length ? ` · ★ ${u.favs.join(', ')}` : '';
          return `<span class="voter-chip">${esc(u.nombre)}${u.extra ? ` (+${u.extra} pl.)` : ''}${esc(favTxt)}</span>`;
        }).join('') || `<span style="color:var(--muted);font-size:0.75rem">Nadie aún</span>`}
      </div>
    `;

    row.querySelector('.btn-ref-toggle').addEventListener('click', () => {
      if (cs) {
        const payload = (myVal && typeof myVal === 'object') ? Object.assign({}, myVal) : {};
        payload.estado = item.val;
        if (item.val === cs.when) {
          payload[cs.key || 'plazasLibres'] = myExtra;
        } else {
          delete payload[cs.key || 'plazasLibres'];
        }
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
  DecisionModel.cohorts(q,respuestas,schema).answered.forEach(r => {
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
    item.innerHTML = `<strong>${esc(n.nombre)}:</strong> <div class="md-content">${renderMarkdown(n.texto)}</div>`;
    wrap.appendChild(item);
  });
  card.appendChild(wrap);
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

  const commit = mut => {
    const nv = JSON.parse(JSON.stringify(base));
    nv.disponibilidades = nv.disponibilidades || [];
    nv.restricciones    = nv.restricciones || [];
    mut(nv);
    patchSingleAnswer(q.id, nv);
  };

  const participantes = [], fechasSet = new Set(), duraciones = [];
  DecisionModel.cohorts(q,respuestas,schema).answered.forEach(r => {
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
              ${r.meUnoAlSalir ? '(se une al salir)' : '(bloqueo total)'}
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
            <span><i class="fa-solid fa-car-burst"></i> Me incorporo al salir</span>
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