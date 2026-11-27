// ══════════════════════════════════════════════════════════════════════════
//  INFORME PDF DE CONCLUSIONES — src/js/ui/reportajePDF.js
//
//  Módulo PARALELO a consensusView.js. Genera una versión imprimible
//  autocontenida (HTML + CSS A4) de las conclusiones del viaje. El usuario
//  pulsa «Guardar como PDF» en el diálogo nativo del navegador.
//
//  Ventajas frente a jsPDF / html2pdf:
//    · 0 kB de dependencias añadidas al bundle
//    · Impresión nativa: fuentes vectoriales, saltos A4 y calidad perfectas
//    · Funciona en móvil (Compartir → Imprimir → Guardar como PDF)
//    · Reutiliza exactamente los mismos agregados del motor que Resultados
//
//  Requiere: buildModelData(), ejecutarMotorFactibilidad(),
//            computeTopologyAndSensitivity() (engine/index.js),
//            state (schema, respuestas, respondentes, encuestaTitulo).
// ══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── CSS del informe (autocontenido, optimizado para A4) ──────────────────
  const REPORT_CSS = `
@page { size: A4; margin: 15mm 12mm; }

:root {
  --rp-ink:      #1a1a1a;
  --rp-muted:    #666;
  --rp-accent:   #c94f2c;
  --rp-ok:       #3a6b4a;
  --rp-star:     #2f5f7a;
  --rp-warn:     #b7791f;
  --rp-border:   #bbb;
  --rp-bg-alt:   #f0f0f0;
  --rp-bar-neutral: #e0e0e0;
}
* { box-sizing: border-box; }
body { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt;
       line-height: 1.5; color: var(--rp-ink); max-width: 190mm; margin: 0 auto; padding: 20px 0; }
h1, h2, h3, h4 { font-family: Georgia, serif; font-weight: 600; margin: 0 0 8px;
                 break-after: avoid; page-break-after: avoid; }
h1 { font-size: 22pt; font-weight: 300; margin-bottom: 4px; }
h2 { font-size: 14pt; margin-top: 20px; padding-bottom: 4px; border-bottom: 1.5px solid var(--rp-accent); }
h3 { font-size: 11.5pt; margin-top: 14px; }
h4 { font-size: 10.5pt; }

/* Control de huérfanas y viudas + aislamiento de bloques */
p, li { orphans: 3; widows: 3; }
.report-section, .sol-block, .kpi, .report-chart { break-inside: avoid; page-break-inside: avoid; }

.report-cover { text-align: center; padding: 36px 20px 24px; border-bottom: 2px solid var(--rp-ink); margin-bottom: 24px; }
.report-cover h1 { font-size: 26pt; }
.report-subtitle { font-size: 10pt; color: var(--rp-muted); letter-spacing: 0.03em; }
.report-meta { display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; margin-top: 14px; font-size: 9.5pt; color: #444; }
.report-section { margin-bottom: 24px; }
.ref-card { margin: 10px 0; padding: 8px; border: 1px solid #bbb; break-inside: avoid; }
.ref-card .card-title { font-weight: 600; }
.ref-card p { margin: 4px 0; }
.report-page-break { page-break-before: always; }
.report-chart { margin: 8px 0 12px; }
.report-chart svg { display: block; max-width: 100%; height: auto; }

table.report-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 8px 0; }
table.report-table th, table.report-table td { border: 1px solid var(--rp-border); padding: 4px 6px; text-align: left; vertical-align: top; }
table.report-table th { background: var(--rp-bg-alt); font-weight: 600; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.02em; }
table.report-table .num-col { text-align: right; font-variant-numeric: tabular-nums; }
table.report-table .center-col { text-align: center; }

.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0; }
.kpi { border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; }
.kpi-label { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--rp-muted); margin-bottom: 2px; }
.kpi-value { font-size: 14pt; font-weight: 600; }
.kpi-value small { font-size: 9pt; font-weight: 400; color: var(--rp-muted); }
.kpi-bar { margin-top: 6px; }

.sol-block { border: 1px solid #999; border-left: 4px solid var(--rp-ok); padding: 10px 12px; margin-bottom: 16px; }
.sol-title { font-size: 12pt; font-weight: 600; margin-bottom: 4px; }
.sol-dates { font-size: 9.5pt; color: #555; margin-bottom: 8px; }
.sol-group { font-size: 9pt; margin: 4px 0; }
.sol-group strong { color: #333; }
.sol-subsection-title { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: var(--rp-muted); margin: 10px 0 4px; font-weight: 700; }

.no-print-actions { display: flex; gap: 10px; justify-content: center; padding: 16px 0; border-top: 1px dashed #ccc; margin-top: 30px; }
.no-print-actions button { padding: 8px 16px; font-family: inherit; font-size: 10pt; cursor: pointer; }
@media print { body { padding: 0; } .no-print { display: none !important; } }
`;


  // ── Helpers ──────────────────────────────────────────────────────────────
  const e = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const fmtDate = iso => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    const MO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${parseInt(d, 10)} ${MO[parseInt(m, 10) - 1]} ${y.slice(2)}`;
  };

  const fmtNum = n => Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(1)) : '—';
  const yes = b => b ? '✓' : '✗';

  const CHIP_STYLE = {
    nucleo:  'color:#682f7a;font-weight:600',
    satelite:'color:#856404',
    ausente: 'color:#a83f20',
    star:    'color:#2f5f7a;font-weight:600',
    veto:    'color:#c94f2c;text-decoration:line-through',
    normal:  'color:#333',
  };
  const chip = (nombre, kind) =>
    `<span style="font-size:8.5pt;${CHIP_STYLE[kind] || ''}">${e(nombre)}</span>`;

  // ── HELPERS SVG (0 kB, vectoriales, imprimibles) ─────────────────────────
// Todos respetan max-width:100% + viewBox para escalar en A4 sin pérdida.

function _svgText(x, y, txt, opts) {
  opts = opts || {};
  const size   = opts.size   || 9.5;
  const fill   = opts.fill   || '#333';
  const anchor = opts.anchor || 'start';
  const weight = opts.weight ? ` font-weight="${opts.weight}"` : '';
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"${weight} font-family="Georgia, serif">${e(txt)}</text>`;
}

// Barras horizontales para distribuciones ordenadas (días, scores, etc.)
function buildHorizontalBarSvg(items, opts) {
  // items: [{ label, value, highlight?: 'min'|'max' }]
  opts = Object.assign({
    width: 560, maxVal: null, unit: '',
    labelWidth: 130, color: '#3a6b4a', colorHi: '#c94f2c',
    fontSize: 9.5, rowHeight: 16, barRadius: 2,
  }, opts || {});
  if (!items.length) return '';

  const max = opts.maxVal != null ? opts.maxVal : Math.max(1, ...items.map(i => i.value));
  const barX = opts.labelWidth + 8;
  const valueW = 46;
  const barMaxW = opts.width - barX - valueW - 8;
  const pad = 4;
  const height = items.length * opts.rowHeight + pad * 2;
  const baseline = opts.rowHeight / 2 + opts.fontSize / 3;

  const rows = items.map((it, i) => {
    const y = pad + i * opts.rowHeight;
    const w = Math.max(2, (it.value / max) * barMaxW);
    const color = (it.highlight === 'min' || it.highlight === 'max') ? opts.colorHi : opts.color;
    return `
      ${_svgText(opts.labelWidth, y + baseline, it.label, { anchor: 'end', size: opts.fontSize })}
      <rect x="${barX}" y="${y + 3}" width="${w.toFixed(1)}" height="${opts.rowHeight - 6}" fill="${color}" rx="${opts.barRadius}"/>
      ${_svgText(barX + w + 6, y + baseline, `${it.value}${opts.unit}`, { size: opts.fontSize })}`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${height}"
    viewBox="0 0 ${opts.width} ${height}" role="img">${rows}</svg>`;
}

// Barra de progreso compacta (0–100 %) para KPIs y resiliencia
function buildProgressBarSvg(pct, opts) {
  opts = Object.assign({ width: 200, height: 8, color: null }, opts || {});
  pct = Math.max(0, Math.min(100, pct || 0));
  const color = opts.color || (pct >= 80 ? '#2c7a3e' : pct >= 50 ? '#b7791f' : '#c94f2c');
  const w = ((pct / 100) * opts.width).toFixed(1);
  const r = opts.height / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}"
    viewBox="0 0 ${opts.width} ${opts.height}" style="display:inline-block;vertical-align:middle">
    <rect x="0" y="0" width="${opts.width}" height="${opts.height}" fill="#e0e0e0" rx="${r}"/>
    <rect x="0" y="0" width="${w}" height="${opts.height}" fill="${color}" rx="${r}"/>
  </svg>`;
}

// Barras divergentes (apoyos a la derecha, vetos a la izquierda)
function buildDivergingBarSvg(rows, opts) {
  // rows: [{ label, positives: <int>, vetoes: <int> }]
  opts = Object.assign({
    width: 560, labelWidth: 150, fontSize: 9.5, rowHeight: 16,
    posColor: '#3a6b4a', negColor: '#c94f2c',
  }, opts || {});
  if (!rows.length) return '';

  const maxV = Math.max(1, ...rows.map(r => r.positives + r.vetoes));
  const trackW = opts.width - opts.labelWidth - 10;
  const centerX = opts.labelWidth + trackW / 2;
  const halfW = trackW / 2 - 24;
  const height = rows.length * opts.rowHeight + 8;
  const baseline = opts.rowHeight / 2 + opts.fontSize / 3;

  const body = rows.map((r, i) => {
    const y = 4 + i * opts.rowHeight;
    const posW = (r.positives / maxV) * halfW;
    const negW = (r.vetoes   / maxV) * halfW;
    return `
      ${_svgText(opts.labelWidth, y + baseline, r.label, { anchor: 'end', size: opts.fontSize })}
      ${r.positives > 0 ? `<rect x="${centerX}" y="${y + 3}" width="${posW.toFixed(1)}" height="${opts.rowHeight - 6}" fill="${opts.posColor}" rx="1"/>` : ''}
      ${r.vetoes   > 0 ? `<rect x="${(centerX - negW).toFixed(1)}" y="${y + 3}" width="${negW.toFixed(1)}" height="${opts.rowHeight - 6}" fill="${opts.negColor}" rx="1"/>` : ''}
      ${r.positives > 0 ? _svgText(centerX + posW + 4, y + baseline, `+${r.positives}`, { size: opts.fontSize - 1, fill: opts.posColor }) : ''}
      ${r.vetoes   > 0 ? _svgText(centerX - negW - 4, y + baseline, `−${r.vetoes}`, { size: opts.fontSize - 1, fill: opts.negColor, anchor: 'end' }) : ''}`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${height}"
    viewBox="0 0 ${opts.width} ${height}" role="img">
    <line x1="${centerX}" y1="0" x2="${centerX}" y2="${height}" stroke="#999" stroke-width="1"/>
    ${body}</svg>`;
}

  // ── Secciones del informe ────────────────────────────────────────────────
  function buildCover(model, soluciones, integrated=true) {
    return `
      <div class="report-cover">
        <h1>${e(encuestaTitulo || 'Viaje')}</h1>
        <div class="report-subtitle">Informe de conclusiones y plan propuesto</div>
        <div class="report-meta">
          <span><b>${respondentes.length}</b> participantes</span>
          <span><b>${respuestas.length}</b> respuestas</span>
          <span>${integrated?`<b>${soluciones.length}</b> soluciones temporales encontradas`:'Estudios independientes'}</span>
          <span>${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>`;
  }

  function buildSynthesis(model, soluciones, topo) {
    const attendanceOn=typeof asistenciaActiva==='undefined'||asistenciaActiva;
    const probs = attendanceOn?respondentes.map(r => getEffectiveProb(r.nombre)):[];
    const expected = probs.reduce((a, p) => a + p, 0);
    const variance = probs.reduce((a, p) => a + p * (1 - p), 0);
    const sigma = Math.sqrt(variance);
    const firstSol = soluciones[0];

    const parts = [`<h2>Síntesis ejecutiva</h2>`, `<div class="kpis">`];
    parts.push(`<div class="kpi"><div class="kpi-label">Asistencia esperada</div>
      <div class="kpi-value">${attendanceOn?expected.toFixed(1)+' ± '+sigma.toFixed(1):'Desactivada'}</div></div>`);
    parts.push(`<div class="kpi"><div class="kpi-label">Soluciones factibles</div>
      <div class="kpi-value">${soluciones.length}</div></div>`);
    if (firstSol) {
      parts.push(`<div class="kpi"><div class="kpi-label">Ventana óptima</div>
        <div class="kpi-value">${fmtDate(firstSol.fIni)} → ${fmtDate(firstSol.fFin)}</div>
        <div class="kpi-label" style="margin-top:4px">${firstSol.L} día${firstSol.L === 1 ? '' : 's'} · ${firstSol.N} asistente${firstSol.N === 1 ? '' : 's'}</div></div>`);
    }
    parts.push(`</div>`);

    if (model.viajeros.length >= 2 && topo && topo.sensibilidad) {
      const s = topo.sensibilidad;
      parts.push(`
        <h3>Cuellos de botella del grupo</h3>
        <table class="report-table">
          <thead><tr><th>Dimensión</th><th>Restricción activa</th><th>Detalle</th></tr></thead>
          <tbody>
            <tr><td>Logística</td><td>${e(s.diaCritico)}</td>
              <td>${s.logistica ? `Holgura mínima: ${s.minHolgura} plaza${s.minHolgura === 1 ? '' : 's'}` : 'Sin datos de transporte'}</td></tr>
            <tr><td>Aislamiento temporal (L₁)</td><td>${e(s.nomAislado)}</td>
              <td>${s.valAislado} intersecciones con el grupo</td></tr>
            <tr><td>Restricción económica</td><td>${e(s.nomEco)}</td>
              <td>Techo cooperativo: ${s.valEco} €/pers</td></tr>
            <tr><td>Menor disponibilidad</td><td>${e(s.nomT)}</td>
              <td>${s.valT} días totales</td></tr>
          </tbody>
        </table>`);
    }
    return parts.join('\n');
  }

  function buildPreferences(model) {
    if (!model.viajeros.length) return '';
    const cols = [
      { label: 'Días máx.',       fmt: v => `<b>${v.diasMax}</b>` },
      { label: 'Ir y venir',      fmt: v => yes(!!v.irYVenir) },
      { label: 'Solo finde',      fmt: v => yes(!!v.soloFinde) },
      { label: 'Me da igual',     fmt: v => yes(!!v.meDaIgual) },
      { label: 'Preferir puente', fmt: v => yes(!!v.preferirPuente) },
      { label: 'Horarios',        fmt: v => v.horFranjasPorDia && Object.keys(v.horFranjasPorDia).length ? '✓' : '·' },
      { label: 'Fechas',          fmt: v => v.conjuntoFechas && v.conjuntoFechas.size ? '✓' : '·' },
    ];
    return `
      <div class="report-section">
        <h2>Preferencias de los viajeros</h2>
        <table class="report-table">
          <thead><tr><th>Viajero</th>${cols.map(c => `<th class="center-col">${e(c.label)}</th>`).join('')}</tr></thead>
          <tbody>${model.viajeros.map(v => `
            <tr><th>${e(v.nombre)}</th>
              ${cols.map(c => `<td class="center-col">${c.fmt(v)}</td>`).join('')}</tr>
          `).join('')}</tbody>
        </table>
      </div>`;
  }

  function buildDaysStats(model) {
  const entries = model.viajeros
    .map(v => ({ nombre: v.nombre, val: Number(v.diasMax) }))
    .filter(x => isFinite(x.val) && x.val > 0)
    .sort((a, b) => a.val - b.val);
  if (!entries.length) return '';

  const vals = entries.map(x => x.val);
  const n = vals.length;
  const mean = vals.reduce((s, x) => s + x, 0) / n;
  const pctile = p => {
    const idx = (n - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
  };
  const median = pctile(0.5);
  const q1 = pctile(0.25);
  const min = vals[0];
  const max = vals[n - 1];
  const bottleneck = entries[0];

  // Gráfico de barras: mínimo resaltado en color de acento (cuello de botella)
  const items = entries.map((x, i) => ({
    label: x.nombre,
    value: x.val,
    highlight: i === 0 ? 'min' : (i === n - 1 && n > 1 ? 'max' : null),
  }));
  const chart = buildHorizontalBarSvg(items, { unit: ' d', labelWidth: 150 });

  return `
    <div class="report-section">
      <h2>Días máximos declarados</h2>
      <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
        <div class="kpi"><div class="kpi-label">Media</div>
          <div class="kpi-value">${mean.toFixed(1)} <small>d</small></div></div>
        <div class="kpi"><div class="kpi-label">Mediana</div>
          <div class="kpi-value">${fmtNum(median)} <small>d</small></div></div>
        <div class="kpi"><div class="kpi-label">Q₁ (P25)</div>
          <div class="kpi-value">${fmtNum(q1)} <small>d</small></div></div>
        <div class="kpi"><div class="kpi-label">Techo del grupo</div>
          <div class="kpi-value" style="color:var(--rp-accent)">${min} <small>d</small></div>
          <div class="kpi-label" style="margin-top:4px">Limitado por ${e(bottleneck.nombre)}</div></div>
      </div>
      <div class="report-chart">${chart}</div>
      <p style="font-size:8.5pt;color:var(--rp-muted);margin:0">
        Rojo: mínimo del grupo (restricción activa cuando van todos). Naranja: máximo. Verde: resto.
        Rango completo: ${min}–${max} días.
      </p>
    </div>`;
}

  function buildSolutions(model, soluciones) {
    if (!soluciones.length) {
      return `<div class="report-section report-page-break">
        <h2>Soluciones factibles</h2>
        <p style="color:#a83f20;font-style:italic">El motor no encontró ninguna ventana que cumpliera simultáneamente las restricciones de fechas, transporte y presupuesto.</p>
      </div>`;
    }

    const blocks = soluciones.map((sol, idx) => {
      const tag = sol.incluyeFinde ? 'Incluye fin de semana' : 'Solo entre semana';
      const tagExtra = (sol.excursion || sol.L === 1) ? ' · Excursión' : '';
      const cruceStr = sol.cruceHorario ? ` · Cruce horario: ${sol.cruceHorario.texto} (${sol.cruceHorario.solape.toFixed(1)} h)` : '';

      const grupoHtml = `
        <div class="sol-group"><strong>Núcleo (${sol.N_full}):</strong>
          ${sol.asistentesNucleo.map(n => chip(n, 'nucleo')).join(' · ')}</div>
        ${sol.satelitesAsignados.length ? `<div class="sol-group"><strong>Satélites (${sol.N_convoy}):</strong>
          ${sol.satelitesAsignados.map(n => chip(n, 'satelite')).join(' · ')}</div>` : ''}
        ${sol.excluidos.length ? `<div class="sol-group"><strong>Ausentes (${sol.excluidos.length}):</strong>
          ${sol.excluidos.map(n => chip(n, 'ausente')).join(' · ')}</div>`
          : `<div class="sol-group" style="color:#3a6b4a"><b>✓ Asistencia perfecta del grupo</b></div>`}`;

      const planHtml = (sol.planesEvaluados && sol.planesEvaluados[0]) ? `
        <div class="sol-subsection-title">Plan votado principal</div>
        <div style="font-size:9.5pt"><b>${e(sol.planesEvaluados[0].label)}</b>
          · ${sol.planesEvaluados[0].apoyosNucleo + sol.planesEvaluados[0].apoyosSat} apoyos
          ${sol.planesEvaluados[0].vetos > 0 ? ` · ${sol.planesEvaluados[0].vetos} vetos` : ''}</div>` : '';

      const casaViable = (sol.casasEvaluadas || []).find(c => c.viable);
      const casaHtml = casaViable ? `
        <div class="sol-subsection-title">Alojamiento viable</div>
        <div style="font-size:9.5pt">
          <b>${e(casaViable.nombre)}</b>
          · Precio total: <b>${casaViable.precio_total.toFixed(0)} €</b>
          · Por persona (todos ${sol.N}): <b>${casaViable.p_coop.toFixed(1)} €</b>
          ${casaViable.p_coal > casaViable.p_coop + 1 ? ` · Si solo pagan votantes: <b>${casaViable.p_coal.toFixed(1)} €</b>` : ''}
          · Apoyo núcleo: ${casaViable.apoyosNucleo ?? casaViable.votos}/${sol.N_full}
        </div>` : '';

      const tablaViajes = (viajes, titulo) => {
        if (!viajes || !viajes.length) return '';
        return `<div class="sol-subsection-title">${titulo}</div>
          <table class="report-table">
            <thead><tr><th>Fecha</th><th>Conductor</th><th>Pasajeros</th></tr></thead>
            <tbody>${viajes.map(v => `
              <tr><td>${fmtDate(v.fecha)}</td>
                <td>${e(v.conductor)} <small>(${(v.pasajeros || []).length}/${v.plazasTotales ?? '?'})</small></td>
                <td>${(v.pasajeros || []).length ? v.pasajeros.map(e).join(', ') : '<i>—</i>'}</td></tr>
            `).join('')}</tbody>
          </table>`;
      };
      const logisticaHtml = (sol.flujo && !sol.flujo.sinLogistica)
        ? tablaViajes(sol.flujo.idas, 'Viajes de ida') + tablaViajes(sol.flujo.vueltas, 'Viajes de vuelta')
        : '';

      const frag = sol.fragilidad;
      let fragHtml = '';
    if (frag) {
    const pct = Math.round(frag.viabilidadGlobal * 100);
    const criticos = Object.entries(frag.impactoIndividual).filter(([, v]) => v === 1).map(([k]) => k);
    const cadenaArr = Object.entries(frag.impactoCadena)
        .map(([k, v]) => ({ nombre: k, drop: Math.round(v * 1000) / 10, crit: frag.impactoIndividual[k] === 1 }))
        .sort((a, b) => b.drop - a.drop)
        .slice(0, 6);

    const impactChart = cadenaArr.length
        ? buildHorizontalBarSvg(
            cadenaArr.map(x => ({ label: x.nombre, value: x.drop, highlight: x.crit ? 'max' : null })),
            { unit: ' %', color: '#3a6b4a', colorHi: '#c94f2c', labelWidth: 150 }
        )
        : '';

    fragHtml = `
        <div class="sol-subsection-title">Resiliencia (Monte Carlo, ${frag.nSim} sims)</div>
        <div style="display:flex;align-items:center;gap:12px;font-size:9.5pt;margin-bottom:8px">
        <b style="font-size:13pt;color:${pct >= 80 ? '#2c7a3e' : pct >= 50 ? '#b7791f' : '#c94f2c'}">${pct}%</b>
        <div style="flex:1">${buildProgressBarSvg(pct, { width: 260, height: 8 })}</div>
        <span style="color:var(--rp-muted);font-size:9pt">viabilidad ante bajas</span>
        </div>
        ${criticos.length
        ? `<div style="font-size:9pt;margin-bottom:6px">Imprescindibles: <b style="color:var(--rp-accent)">${criticos.map(e).join(', ')}</b></div>`
        : `<div style="font-size:9pt;margin-bottom:6px;color:var(--rp-ok)">✓ Sin miembros críticos</div>`}
        ${impactChart
        ? `<div class="report-chart" style="margin-top:4px">${impactChart}</div>
            <p style="font-size:8.5pt;color:var(--rp-muted);margin:0">Caída de viabilidad al eliminar a cada viajero.</p>`
        : ''}
    `;
    }

      const cls = idx > 0 ? 'report-page-break' : '';
      return `
        <div class="sol-block ${cls}">
          <div class="sol-title">Solución #${idx + 1} · ${e(tag)}${tagExtra}</div>
          <div class="sol-dates"><b>${fmtDate(sol.fIni)} → ${fmtDate(sol.fFin)}</b>
            (${sol.L} día${sol.L === 1 ? '' : 's'}, ${sol.N} asistente${sol.N === 1 ? '' : 's'})${e(cruceStr)}</div>
          ${grupoHtml}${planHtml}${casaHtml}${logisticaHtml}${fragHtml}
        </div>`;
    }).join('\n');

    return `
      <div class="report-section report-page-break">
        <h2>Soluciones factibles</h2>
        <p style="font-size:9.5pt;color:#555;margin-bottom:12px">
          El motor evaluó las ventanas con al menos 2 miembros de núcleo. Se muestran las ${soluciones.length} soluciones que superaron las restricciones de fechas, capacidad de vehículos, solapamiento horario y presupuesto.
        </p>
        ${blocks}
      </div>`;
  }

  function buildTopology(topo) {
  if (!topo || !topo.rankingIndispensables || !topo.rankingIndispensables.length) return '';
  const top = topo.rankingIndispensables.slice(0, 10);
  const maxScore = Math.max(1, ...top.map(r => r.score));
  const chart = buildHorizontalBarSvg(
    top.map(r => ({ label: r.nombre, value: r.score, highlight: r.score === maxScore ? 'max' : null })),
    { maxVal: maxScore, color: '#2f5f7a', colorHi: '#c94f2c', labelWidth: 150 }
  );
  return `
    <div class="report-section">
      <h2>Índice de imprescindibilidad</h2>
      <p style="font-size:9.5pt;color:var(--rp-muted);margin-bottom:8px">
        Agregado Monte Carlo: qué personas, si faltaran, causarían mayor impacto negativo sobre la viabilidad del plan.
        La barra se normaliza al máximo; el primero marca el techo.
      </p>
      <div class="report-chart">${chart}</div>
    </div>`;
}

  // ── Reformulario (agregados por pregunta) ────────────────────────────────
  function buildOptionsTable(q) {
    const map = new Map();
    (q.opciones || []).forEach(op => {
      const k = typeof optVal === 'function' ? optVal(q, op) : (typeof op === 'string' ? op : op.nombre);
      if (k != null) map.set(k, { key: k, label: k, votes: 0, score: 0, voters: [], vetoes: [] });
    });
    DecisionModel.cohorts(q,respuestas,schema).answered.forEach(r => {
      const v = extractAnswer(r.answers, q);
      if (v == null) return;
      if (q.tipo === 'voto-ponderado') {
        Object.entries(v || {}).forEach(([k, pts]) => {
          const item = map.get(k); if (!item) return;
          const n = Number(pts);
          item.score += n;
          if (n < 0) item.vetoes.push(r.nombre); else item.voters.push({ nombre: r.nombre, pts: n });
        });
      } else if (q.tipo === 'radio') {
        const k = typeof v === 'object' ? v.estado : v;
        const item = map.get(k); if (!item) return;
        item.votes++; item.voters.push({ nombre: r.nombre, pts: 1 });
      } else if (q.tipo === 'casas') {
        (Array.isArray(v) ? v : []).forEach(c => {
          const k = typeof c === 'string' ? c : c.nombre;
          const item = map.get(k); if (!item) return;
          item.votes++; item.voters.push({ nombre: r.nombre, pts: 1 });
        });
      } else {
        (Array.isArray(v) ? v : []).forEach(k => {
          const item = map.get(k); if (!item) return;
          item.votes++; item.voters.push({ nombre: r.nombre, pts: 1 });
        });
      }
    });
    const rows = [...map.values()].sort((a, b) => {
      const sa = q.tipo === 'voto-ponderado' ? a.score : a.votes;
      const sb = q.tipo === 'voto-ponderado' ? b.score : b.votes;
      return sb - sa;
    });

    // Gráfico divergente solo si es voto-ponderado con mezcla de positivos y vetos
    const diverging = (q.tipo === 'voto-ponderado' && rows.some(r => r.vetoes.length > 0))
    ? buildDivergingBarSvg(
        rows.map(r => ({
            label: r.label,
            positives: r.voters.length,
            vetoes: r.vetoes.length,
        })),
        { labelWidth: 150 }
        )
    : '';

    return `${diverging ? `<div class="report-chart">${diverging}</div>` : ''}
    <table class="report-table">
    <thead><tr><th>Opción</th>
        <th class="num-col">${q.tipo === 'voto-ponderado' ? 'Puntos' : 'Votos'}</th>
        <th>Votantes</th></tr></thead>
    <tbody>${rows.map(r => `
        <tr><td>${e(r.label)}</td>
        <td class="num-col"><b>${q.tipo === 'voto-ponderado' ? r.score : r.votes}</b></td>
        <td>${r.voters.map(v => chip(v.nombre, v.pts === 3 ? 'star' : 'normal')).join(', ')}
            ${r.vetoes.length ? `<br><small style="color:var(--rp-accent)">Vetos: ${r.vetoes.map(e).join(', ')}</small>` : ''}</td></tr>
    `).join('')}</tbody>
    </table>`;
  }

  function buildSliderSummary(q) {
    const entries = [];
    DecisionModel.cohorts(q,respuestas,schema).answered.forEach(r => {
      const v = extractAnswer(r.answers, q);
      if (v == null) return;
      const val = typeof v === 'object' ? Number(v.ideal ?? v.value ?? v.min) : Number(v);
      if (isFinite(val)) entries.push({ nombre: r.nombre, val, max: typeof v === 'object' && v.max != null ? Number(v.max) : null });
    });
    if (!entries.length) return `<p style="font-size:9pt;color:#666;font-style:italic">Sin datos numéricos.</p>`;
    entries.sort((a, b) => a.val - b.val);
    const vals = entries.map(x => x.val);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const med = vals[Math.floor((vals.length - 1) * 0.5)];
    const unit = (q.config && q.config.unit) || (/^(precio|presu)/.test(q.id) ? ' €' : '');
    return `
      <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi"><div class="kpi-label">Mínimo</div><div class="kpi-value">${vals[0]}${e(unit)}</div></div>
        <div class="kpi"><div class="kpi-label">Mediana</div><div class="kpi-value">${med}${e(unit)}</div></div>
        <div class="kpi"><div class="kpi-label">Media</div><div class="kpi-value">${mean.toFixed(0)}${e(unit)}</div></div>
      </div>
      <table class="report-table">
        <thead><tr><th>Viajero</th><th class="num-col">Valor</th></tr></thead>
        <tbody>${entries.map(x => `<tr><td>${e(x.nombre)}</td>
          <td class="num-col">${x.val}${e(unit)}${x.max ? ` <small>(tope ${x.max}${e(unit)})</small>` : ''}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  function buildProbSummary(q) {
    if (typeof evaluarCatalogoProbabilidad === 'function') {
      const res = evaluarCatalogoProbabilidad(q, null, true);
      if (res && res.opciones && res.opciones.length) {
        return `<table class="report-table">
          <thead><tr><th>Opción</th><th class="num-col">E[X]</th><th class="num-col">P25</th><th class="center-col">Estado</th></tr></thead>
          <tbody>${res.opciones.slice().sort((a, b) => (b.E || 0) - (a.E || 0)).map(o => `
            <tr><td>${e(o.label)}</td>
              <td class="num-col">${(o.E || 0).toFixed(1)}</td>
              <td class="num-col">${(o.P25 || 0).toFixed(2)}</td>
              <td class="center-col">${o.cuadrante ? e(o.cuadrante.label) : '—'}</td></tr>
          `).join('')}</tbody></table>`;
      }
    }
    return `<p style="font-size:9pt;color:#666;font-style:italic">Sin valoraciones registradas.</p>`;
  }

  function buildNotesSummary(q) {
    const notes = [];
    DecisionModel.cohorts(q,respuestas,schema).answered.forEach(r => {
      const v = extractAnswer(r.answers, q);
      if (v && String(v).trim()) notes.push({ nombre: r.nombre, texto: String(v).trim() });
    });
    if (!notes.length) return `<p style="font-size:9pt;color:#666;font-style:italic">Sin comentarios.</p>`;
    return `<table class="report-table">
      <thead><tr><th style="width:22%">Autor</th><th>Comentario</th></tr></thead>
      <tbody>${notes.map(n => `<tr><td>${e(n.nombre)}</td><td>${e(n.texto)}</td></tr>`).join('')}</tbody>
    </table>`;
  }

  function buildDispoSummary() {
    if (typeof buildModelData !== 'function') return '';
    const model = buildModelData();
    if (!model.indiceFechas || !model.indiceFechas.length) return '';
    const activeDays = model.indiceFechas.filter(f =>
      model.viajeros.some(v => model.matriz[f] && model.matriz[f][v.nombre])
    ).slice(0, 30);
    if (!activeDays.length) return '';
    return `<p style="font-size:9pt;color:#666;margin-bottom:4px">Días con al menos un viajero disponible (máx. 30):</p>
      <table class="report-table" style="font-size:8.5pt">
        <thead><tr><th>Viajero</th>${activeDays.map(f => `<th class="center-col">${fmtDate(f)}</th>`).join('')}</tr></thead>
        <tbody>${model.viajeros.map(v => `
          <tr><th>${e(v.nombre)}</th>
            ${activeDays.map(f => `<td class="center-col">${model.matriz[f]?.[v.nombre] ? '✓' : '·'}</td>`).join('')}</tr>
        `).join('')}</tbody>
      </table>`;
  }

  function buildReformSection() {
    if (!schema || !schema.length) return '';
    const parts = [`<div class="report-section report-page-break"><h2>Respuestas del grupo, pregunta a pregunta</h2>`];
    schema.forEach((q, idx) => {
      if (q.config?.esEncabezado || (q.tipo === 'textarea' && q.config && q.config.descripcion)) return; // informativa
      parts.push(`<h3>${idx + 1}. ${e(q.label)}</h3>`);
      if (q.tipo === 'voto-ponderado' || q.tipo === 'checkbox' || q.tipo === 'casas' || q.tipo === 'radio') {
        parts.push(buildOptionsTable(q));
      } else if (q.tipo === 'slider') {
        parts.push(buildSliderSummary(q));
      } else if (q.tipo === 'probabilidad-opcion') {
        parts.push(buildProbSummary(q));
      } else if (q.tipo === 'textarea') {
        parts.push(buildNotesSummary(q));
      } else if (q.tipo === 'disponibilidad') {
        const actual=DecisionModel.studies(schema,respuestas,respondentes).find(s=>s.qid===q.id);
        parts.push(`<p>${(actual?.dates?.days||[]).slice(0,30).map(d=>e(fmtDate(d.date))+': '+d.count).join(' · ')||'Sin fechas concretas.'}</p>`);
      } else if (q.tipo === 'horarios') {
        parts.push(`<p style="font-size:9pt;color:#666;font-style:italic">Ver detalle de horarios en el Reformulario de la aplicación.</p>`);
      }
    });
    parts.push(`</div>`);
    return parts.join('\n');
  }

  // ── Ensamblado y apertura ────────────────────────────────────────────────
  function buildLegacyReportHtml(options) {
    options = Object.assign({ includeReform: true }, options || {});
    const model = buildModelData();
    const { soluciones } = ejecutarMotorFactibilidad(model);
    const topo = computeTopologyAndSensitivity(model, soluciones);

    const mode=DecisionModel.integratedMode(schema);
    const integrated=mode.enabled&&model.indiceFechas.length>0;
    const parts=[buildCover(model,soluciones,integrated),`<h2>Estudios independientes</h2><p>${e(mode.enabled?(integrated?'El estudio temporal conjunto se muestra a continuación.':'Factibilidad temporal indeterminada: sin fechas evaluables.'):mode.reason)}</p>`];
    for(const study of DecisionModel.studies(schema,respuestas,respondentes))parts.push(buildDecisionStudyCard(study).outerHTML);
    if(integrated){parts.push(buildSynthesis(model,soluciones,topo),buildPreferences(model),buildDaysStats(model));if(soluciones.length)parts.push(buildSolutions(model,soluciones));else parts.push('<p>No se encontraron ventanas en los datos evaluados. No implica que el problema completo sea infactible si faltan respuestas.</p>');parts.push(buildTopology(topo));}
    if (options.includeReform) parts.push(buildReformSection());

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${e(encuestaTitulo || 'Viaje')} — Conclusiones</title>
<style>${REPORT_CSS}</style>
</head>
<body>
${parts.join('\n')}
<div class="no-print no-print-actions">
  <button onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  <button onclick="window.close()">Cerrar</button>
</div>
</body>
</html>`;
  }

  const SHARE_CSS = "/* Local workspace styles; use Metatio theme variables. */\n#view-consensus.wide-wrap{max-width:1480px;width:100%;}\n.mt-workspace{display:grid;grid-template-columns:220px minmax(0,1fr);gap:22px;align-items:start;min-width:0;}\n.mt-work-nav{position:sticky;top:16px;display:flex;flex-direction:column;gap:6px;border:1px solid var(--border);background:var(--card);border-radius:14px;padding:12px;min-width:0;}\n.mt-work-nav-title{color:var(--accent2);font-weight:700;font-size:.88rem;padding:8px 6px 12px;border-bottom:1px solid var(--border);margin-bottom:4px;}\n.mt-work-nav-title i{margin-right:5px}.mt-work-nav-btn{display:flex;gap:10px;align-items:center;text-align:left;background:transparent;color:var(--ink);border:1px solid transparent;border-radius:8px;padding:10px;font:inherit;font-size:.85rem;cursor:pointer;min-height:44px;}\n.mt-work-nav-btn i{width:17px;text-align:center;color:var(--accent2);}.mt-work-nav-btn.sub{padding-left:22px;}.mt-work-nav-btn.active{background:color-mix(in srgb,var(--accent2) 12%,var(--card));border-color:var(--accent2);font-weight:600;}.mt-work-nav-btn:hover{border-color:var(--border);}\n.mt-work-filter{display:flex;flex-direction:column;gap:5px;color:var(--muted);font-size:.77rem;margin:10px 0 6px;}.mt-work-filter select,.mt-scenario-controls select{max-width:100%;min-width:0;width:100%;font:inherit;background:var(--bg);color:var(--ink);border:1px solid var(--border);padding:8px;border-radius:7px;}\n.mt-work-content{display:flex;flex-direction:column;gap:16px;min-width:0;}.mt-work-heading h2{margin:0 0 4px;color:var(--ink);font-size:clamp(1.25rem,2.4vw,1.8rem);}.mt-work-heading p,.mt-work-note{font-size:.83rem;color:var(--muted);line-height:1.55;margin:5px 0 10px;}.mt-work-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start;min-width:0;}.mt-work-grid>*{min-width:0;margin:0;}.mt-work-card{min-width:0;overflow-wrap:anywhere;}.mt-work-card>.card{margin:12px 0;}.mt-full{grid-column:1/-1;}.mt-study-group{display:flex;flex-direction:column;gap:12px;min-width:0;scroll-margin-top:16px;}.mt-study-group>.card{margin:0;}.mt-work-content .ref-solutions-wrap{min-width:0;}.mt-work-content .ref-opt-main,.mt-work-content .ref-opt-info{min-width:0;flex-wrap:wrap;}.mt-work-content .ref-opt-title{overflow-wrap:anywhere;}.mt-summary-text{font-size:.93rem;line-height:1.5;margin:8px 0 12px;}.mt-work-chart{max-width:100%;overflow-x:auto;}.mt-work-chart svg{display:block;width:100%;height:auto;}.mt-work-chart svg text{fill:var(--ink);font-size:10px;}.mt-gridline{stroke:var(--border);stroke-width:1;}.mt-bar-ok{fill:var(--ok);}.mt-bar-muted{fill:var(--muted);opacity:.45;}.mt-meanline{stroke:var(--accent3);stroke-width:2;stroke-dasharray:4 3;}.mt-exact-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0;}.mt-exact-kpis>div{border:1px solid var(--border);border-top:3px solid var(--accent2);border-radius:8px;padding:10px;}.mt-exact-kpis small{display:block;color:var(--muted);font-size:.72rem;}.mt-exact-kpis strong{display:block;font-size:1.35rem;color:var(--ink);}.mt-prob-row,.mt-budget-row{display:grid;grid-template-columns:minmax(65px,1fr) minmax(70px,2fr) auto;align-items:center;gap:10px;margin:9px 0;font-size:.78rem;}.mt-prob-row>span,.mt-budget-row>span{overflow-wrap:anywhere;}.mt-dot-track,.mt-budget-track{height:6px;background:var(--border);position:relative;border-radius:8px;margin:0 5px;}.mt-dot-track b,.mt-budget-track em{position:absolute;top:50%;width:11px;height:11px;background:var(--ok);border-radius:50%;transform:translate(-50%,-50%);}.mt-budget-track b{position:absolute;height:5px;background:var(--accent);top:0;}.mt-budget-track em.cap{background:var(--accent);}.mt-budget-track i{position:absolute;height:18px;top:-6px;border-left:1px dashed var(--ok);}.mt-budget-track i.mt-budget-cap{border-color:var(--err);}.mt-work-details{margin-top:12px;}.mt-work-details>summary{cursor:pointer;color:var(--accent3);font-size:.83rem;}.mt-divergent{display:grid;grid-template-columns:1fr 1fr;height:12px;border-radius:6px;overflow:hidden;background:var(--bg);margin-top:8px;}.mt-divergent span{display:flex;}.mt-divergent span:first-child{justify-content:flex-end;border-right:1px solid var(--muted);}.mt-divergent b{display:block;background:var(--ok);}.mt-divergent span:first-child b{background:var(--err);}.mt-div-label{display:flex;justify-content:space-between;font-size:.72rem;color:var(--muted);margin:3px 0 7px;}.mt-gantt{border-collapse:separate;border-spacing:3px;font-size:.7rem;white-space:nowrap;}.mt-gantt th{text-align:left;padding:4px;}.mt-gantt td{min-width:24px;text-align:center;background:var(--bg);color:transparent;border-radius:3px;}.mt-gantt td.core{background:var(--ok);color:white;}.mt-gantt td.sat{background:repeating-linear-gradient(45deg,var(--accent) 0 3px,transparent 3px 6px);color:var(--ink);}.mt-gantt-head th{background:var(--bg);color:var(--accent2);}.mt-l1{position:relative;min-width:45px;padding:3px;}.mt-l1 b{position:absolute;left:0;top:0;bottom:0;background:var(--accent2);opacity:.25;}.mt-l1 span{position:relative;}.mt-scenario-people{display:flex;flex-wrap:wrap;gap:8px;}.mt-scenario-people label{display:flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:.83rem;}.mt-scenario-controls{display:flex;align-items:end;flex-wrap:wrap;gap:12px;margin:16px 0 4px;}.mt-scenario-controls label{display:flex;flex-direction:column;gap:4px;max-width:100%;font-size:.8rem;}.mt-scenario-controls input{max-width:100px;}.mt-scenario-output,.mt-work-reform{display:flex;flex-direction:column;gap:14px;min-width:0;}.mt-work-content .mt-route-detail{min-width:0;overflow-wrap:anywhere;}\n@media(max-width:1100px){.mt-workspace{grid-template-columns:185px minmax(0,1fr);gap:14px;}.mt-work-grid{grid-template-columns:1fr;}}\n@media(max-width:720px){#survey-screen:has(#view-consensus[style*=\"block\"]){padding-inline:10px;}.mt-workspace{grid-template-columns:1fr;gap:12px;}.mt-work-nav{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;padding:8px;}.mt-work-nav-title,.mt-work-filter{grid-column:1/-1;}.mt-work-nav-btn.sub{padding-left:10px;}.mt-work-nav-btn{font-size:.8rem;padding:8px;}.mt-work-nav>.btn-pc{align-self:end;min-height:40px;}.mt-work-content{gap:12px;}.mt-work-content .card{padding:12px;}.mt-work-grid{gap:10px;}.mt-work-content .kpi-grid{grid-template-columns:repeat(auto-fit,minmax(115px,1fr));}.mt-exact-kpis strong{font-size:1.15rem;}}\n.mt-work-vehicle{margin:12px 0;padding:10px;border:1px solid var(--border);border-radius:8px;}.mt-car-seat-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:.78rem;padding:5px 0;}.mt-seats{display:flex;gap:7px;flex-wrap:wrap;}.mt-seats i{color:var(--muted);opacity:.35;}.mt-seats i.used{opacity:1;}.mt-work-content .sol-log-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));}\n@media(min-width:721px){.mt-work-nav{top:68px;max-height:calc(100vh - 84px);overflow-y:auto;}}\n.mt-work-content .sens-grid-4,.mt-work-content .kpi-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));}\n.mt-work-content .card-title{overflow-wrap:anywhere;}\n@media(max-width:720px){.mt-work-nav-title{text-align:center;padding-left:44px;padding-right:44px;}.mt-work-nav .mt-work-filter{margin:4px 0;}.mt-work-content .mt-study-group .card{padding:12px;}}\n\n/* v16.1: visual hierarchy, compact summaries and accessible scenario controls. */\n.mt-work-content .mt-panel-title{display:flex;align-items:center;gap:9px;font-weight:650;line-height:1.35;}\n.mt-panel-title>i{color:var(--accent3);font-size:1.05em;flex:none;}\n.mt-panel-title>span{min-width:0;}\n.mt-work-content .sol-casa-item,.mt-work-content .sol-casa-item details,.mt-work-content .prob-cand-msgs{font-family:'DM Sans',sans-serif;line-height:1.45;}\n.mt-casa-prob{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;font-size:.81rem;}.mt-casa-prob span{display:inline-flex;gap:5px;align-items:center;background:var(--bg);border-radius:8px;padding:6px 9px;}.mt-casa-prob i{color:var(--accent3);}\n.mt-essential-card{display:flex;flex-direction:column;gap:11px;}.mt-essential-card .card-title{margin:0;}.mt-mini-response{display:flex;gap:7px;align-items:center;color:var(--muted);font-size:.76rem;}.mt-mini-response>.mt-mini-track{flex:1;min-width:30px;}.mt-mini-response>i{color:var(--accent3);}.mt-mini-track{height:8px;background:var(--border);border-radius:6px;overflow:hidden;}.mt-mini-track b{height:100%;display:block;background:var(--ok);border-radius:6px;}.mt-mini-track b.negative{background:var(--err);}.mt-mini-track b.demand{background:var(--accent3);}\n.mt-mini-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,86px),1fr));gap:7px;margin:6px 0;}.mt-mini-metric{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:4px;padding:10px 5px;background:var(--bg);border:1px solid var(--border);border-radius:10px;min-width:0;}.mt-mini-metric>i{color:var(--accent3);font-size:1.32rem;}.mt-mini-metric>strong{font:600 1.36rem 'DM Sans',sans-serif;line-height:1.25;color:var(--ink);}.mt-mini-metric>small{font-size:.72rem;color:var(--muted);line-height:1.2;}.mt-mini-bars{display:grid;gap:9px;}.mt-mini-row>div:first-child{display:flex;justify-content:space-between;align-items:baseline;gap:9px;font-size:.81rem;margin-bottom:4px;}.mt-mini-row>div:first-child span{min-width:0;overflow-wrap:anywhere;}.mt-mini-row strong{white-space:nowrap;}.mt-mini-winner{display:flex;align-items:center;gap:11px;padding:10px;border:1px solid color-mix(in srgb,var(--ok) 55%,var(--border));background:color-mix(in srgb,var(--ok) 7%,var(--bg));border-radius:9px;}.mt-mini-winner>i{font-size:1.3rem;color:var(--star,var(--accent));}.mt-mini-winner small,.mt-mini-winner strong{display:block;}.mt-mini-winner small{font-size:.7rem;color:var(--muted);}.mt-mini-winner strong{font-size:.94rem;}.mt-mini-destination,.mt-mini-missing{font-size:.78rem;color:var(--muted);}.mt-mini-destination i{color:var(--accent3);}.mt-mini-missing i{color:var(--warn);}.mt-essential-card .mt-summary-text{font-size:.77rem;line-height:1.4;margin:0;color:var(--muted);}.mt-mini-link{display:flex;justify-content:flex-start;align-items:center;gap:7px;border:0;border-top:1px solid var(--border);background:transparent;color:var(--accent3);font:600 .82rem 'DM Sans',sans-serif;cursor:pointer;padding:9px 0 0;text-align:left;}.mt-mini-link>i:last-child{margin-left:auto;}.mt-mini-link:hover{text-decoration:underline;}\n.mt-mini-days{display:flex;align-items:stretch;gap:4px;height:85px;overflow-x:auto;padding:3px 1px 18px;}.mt-mini-days>div{flex:1 0 15px;position:relative;display:flex;align-items:flex-end;justify-content:center;min-width:0;}.mt-mini-days b{width:85%;max-width:28px;display:block;background:var(--accent3);opacity:.65;border-radius:4px 4px 0 0;}.mt-mini-days b.best{opacity:1;background:var(--ok);}.mt-mini-days small{position:absolute;bottom:-16px;text-align:center;font-size:.62rem;color:var(--muted);}.mt-overview-visual{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:14px;margin-top:12px;align-items:stretch;}.mt-overview-progress,.mt-overview-hist{padding:10px;border:1px solid var(--border);border-radius:9px;min-width:0;}.mt-overview-progress>span,.mt-overview-hist>span{display:block;font-size:.78rem;color:var(--muted);}.mt-overview-progress>strong{display:block;font-size:1.65rem;line-height:1.5;}.mt-overview-progress>.mt-mini-track{margin-top:5px;}.mt-overview-hist .mt-mini-days{height:64px;}.mt-individual-probs h4{margin:13px 0 10px;font-size:.86rem;color:var(--ink);}.mt-individual-probs h4 i{color:var(--accent3);}.mt-dot-track b.mid{background:var(--warn);}.mt-dot-track b.low{background:var(--err);}\n.mt-scenario-people{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;}.mt-scenario-people label{position:relative;display:flex;flex-direction:column;gap:4px;align-items:center;justify-content:center;min-height:91px;padding:12px 5px 8px;cursor:pointer;border:1px solid var(--border);background:var(--bg);border-radius:10px;}.mt-scenario-people label>input{position:absolute;left:8px;top:8px;width:13px;height:13px;accent-color:var(--accent2);}.mt-scenario-people label>i{font-size:1.4rem;color:var(--ok);}.mt-scenario-person-name{font-weight:600;overflow-wrap:anywhere;max-width:100%;text-align:center;}.mt-scenario-person-status{font-size:.69rem;color:var(--muted);}.mt-scenario-people label.absent{border-color:var(--warn);background:color-mix(in srgb,var(--warn) 10%,var(--bg));}.mt-scenario-people label.absent>i{color:var(--warn);}.mt-scenario-people label:focus-within{outline:2px solid var(--accent3);outline-offset:2px;}.mt-scenario-controls .stepper{max-width:max-content;}.mt-scenario-controls label{font-weight:500;}.mt-scenario-controls label>i{display:none;}.mt-scenario-controls label:has(.stepper){flex:0 0 auto;}.mt-scenario-controls .stepper button{min-width:38px;}.mt-scenario-controls select{max-width:100%;min-height:44px;}.mt-scenario-controls>label:has(select){flex:1 1 200px;}.mt-scenario-controls>button{min-height:44px;}.mt-quorum-label{font-size:.78rem;color:var(--muted);}.mt-quorum-label .stepper{margin-top:4px;}.mt-quorum-output{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:10px;}.mt-quorum-output>.mt-work-note{grid-column:1;}.mt-quorum-output>.card{grid-column:2;grid-row:1/3;margin:0;}.mt-gauge svg{width:100%;max-width:340px;display:block;margin:auto;}.mt-gauge{min-width:0;}\n.mt-transport-capacity{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-weight:600;margin:9px 0;font-size:.84rem;}.mt-transport-capacity.ok{color:var(--ok);}.mt-transport-capacity.err{color:var(--err);}.mt-transport-capacity.warn{color:var(--warn);}.mt-transport-capacity small{font-size:.7rem;color:var(--muted);font-weight:400;}.mt-route-destination{display:flex;align-items:center;gap:8px;padding:10px 0;font-size:.9rem;}.mt-route-destination i{color:var(--accent3);}.mt-route-action{margin-top:10px;}.mt-route-action button{min-height:44px;width:100%;}.mt-route-info{font-size:.78rem;}.mt-route-detail .mt-route-info{margin:5px 0;}.mt-route-info summary{color:var(--muted);}.mt-route-info p{margin:8px 0;}.mt-transport-analysis .mt-route-detail{padding:10px;margin-top:10px;}.mt-heat-top{height:28px;display:flex;align-items:flex-end;justify-content:center;}.mt-heat-top b{display:block;width:75%;background:var(--ok);border-radius:3px 3px 0 0;}.mt-heat-col.weekend{color:var(--warn);}.mt-heat-right{position:relative;min-width:45px;padding:3px;}.mt-heat-right b{position:absolute;inset:0 auto 0 0;opacity:.3;background:var(--ok);border-radius:4px;}.mt-heat-right span{position:relative;}.mt-classic-day{border-top:1px solid var(--border);padding:8px 0;font-size:.77rem;}.mt-classic-day>b{display:block;color:var(--muted);margin:2px 0 8px;}.mt-classic-car{display:flex;gap:6px;flex-wrap:wrap;align-items:center;border:1px solid var(--border);border-radius:8px;padding:8px;margin:5px 0;background:var(--bg);}.mt-classic-car>span{flex:1 1 85px;}.mt-classic-car>span i,.mt-classic-car .mt-seats i.used{color:var(--accent3);}.mt-classic-pax{flex:1 0 100%;display:flex;flex-wrap:wrap;gap:5px;}.mt-classic-pax span{border:1px solid var(--border);border-radius:12px;padding:3px 6px;}.mt-classic-pax i{color:var(--accent3);}\n@media(max-width:720px){.mt-overview-visual,.mt-quorum-output{grid-template-columns:1fr;}.mt-quorum-output>.card,.mt-quorum-output>.mt-work-note{grid-column:auto;grid-row:auto;}.mt-scenario-people{grid-template-columns:repeat(auto-fill,minmax(88px,1fr));}.mt-mini-metric>strong{font-size:1.17rem;}.mt-transport-metrics{grid-template-columns:repeat(2,minmax(0,1fr));}.mt-scenario-controls{gap:9px;}.mt-scenario-controls>label:has(select){flex:1 1 100%;}.mt-scenario-controls>button{flex:1 1 auto;}.mt-mini-response{flex-wrap:wrap;}.mt-mini-days>div{flex-basis:15px;}}\n.mt-mini-track.signed{position:relative;}.mt-mini-track.signed:after{content:'';position:absolute;left:50%;height:100%;top:0;width:1px;background:var(--muted);}.mt-mini-track.signed b{position:absolute;left:50%;}.mt-mini-track.signed b.negative{left:auto;right:50%;}.mt-pareto-point.front circle.mt-pareto-ring{fill:none;stroke:var(--accent3);stroke-width:1.6;}.mt-pareto-controls label{display:block;color:var(--muted);font-size:.77rem;}.mt-pareto-controls strong{float:right;color:var(--ink);}.mt-pareto-controls input[type=range]{width:100%;margin:7px 0 0;accent-color:var(--accent2);}.mt-scenario-people{grid-template-columns:repeat(5,minmax(0,1fr));}.mt-scenario-people label{min-height:77px;}.mt-work-content .mt-scenario-controls .btn-propose{background:var(--accent2);color:var(--btn-fg);}.mt-work-content .mt-scenario-controls .btn-propose:hover{filter:brightness(.92);}@media(max-width:900px){.mt-scenario-people{grid-template-columns:repeat(4,minmax(0,1fr));}}@media(max-width:480px){.mt-scenario-people{grid-template-columns:repeat(3,minmax(0,1fr));}}\n/* The original dark theme uses very dark status colours for backgrounds.\n   Foreground icons/graphs need the lighter semantic accent variants. */\n.mt-workspace{--mt-pos:var(--accent2);--mt-neg:var(--accent);--mt-warn:var(--accent4);}\n.mt-workspace .mt-mini-track b,.mt-workspace .mt-mini-days b.best,.mt-workspace .mt-heat-top b,.mt-workspace .mt-dot-track b.high,.mt-workspace .mt-bar-ok{background:var(--mt-pos);fill:var(--mt-pos);}.mt-workspace .mt-mini-track b.negative,.mt-workspace .mt-dot-track b.low{background:var(--mt-neg);}.mt-workspace .mt-mini-track b.demand{background:var(--accent3);}.mt-workspace .mt-dot-track b.mid{background:var(--mt-warn);}.mt-workspace .mt-transport-capacity.ok,.mt-workspace .mt-scenario-people label>i{color:var(--mt-pos);}.mt-workspace .mt-transport-capacity.err{color:var(--mt-neg);}.mt-workspace .mt-transport-capacity.warn,.mt-workspace .mt-scenario-people label.absent>i,.mt-workspace .mt-mini-missing i{color:var(--mt-warn);}.mt-workspace .mt-scenario-people label.absent{border-color:var(--mt-warn);}.mt-workspace .mt-budget-track em{background:var(--mt-pos);}.mt-workspace .mt-budget-track em.cap{background:var(--mt-warn);}.mt-workspace .mt-budget-track b{background:var(--mt-warn);}.mt-workspace .mt-budget-track i{border-color:var(--mt-pos);}.mt-workspace .mt-budget-track i.mt-budget-cap{border-color:var(--mt-neg);}\n\n/* Compact plans, shared with the printable report. */\n.mt-compact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start;margin-top:12px}.mt-compact-plan{min-width:0;border:1px solid var(--border);border-left:3px solid var(--accent2);border-radius:11px;background:var(--card);padding:12px;margin:9px 0;overflow-wrap:anywhere}.mt-plan-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:6px;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:8px}.mt-plan-head>span{font-size:.77rem;color:var(--muted)}.mt-plan-head i,.mt-plan-line i,.mt-compact-travel i{color:var(--accent3)}.mt-plan-head>strong{font-size:1.04rem}.mt-compact-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:8px 0 12px}.mt-compact-metric{display:flex;flex-direction:column;align-items:center;text-align:center;gap:3px;padding:6px 3px;border-radius:8px;background:var(--bg)}.mt-compact-metric>i{color:var(--accent3);font-size:1rem}.mt-compact-metric>strong{font-size:1.24rem;line-height:1.2}.mt-compact-metric>small,.mt-plan-group>small{font-size:.72rem;color:var(--muted)}.mt-plan-group{margin:8px 0;font-size:.81rem}.mt-plan-group>small{display:block;margin-bottom:4px;font-weight:600}.mt-plan-person{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);border-radius:12px;padding:3px 7px;font-size:.74rem;margin:2px 2px 2px 0}.mt-plan-person i{color:var(--accent3);font-size:.7rem}.mt-plan-line{font-size:.83rem;margin:7px 0}.mt-plan-house{display:flex;justify-content:space-between;gap:7px;padding:5px 0;border-bottom:1px solid var(--border)}.mt-plan-house b{white-space:nowrap}.mt-compact-travel{font-size:.78rem;margin:8px 0;padding:7px;border-radius:7px;background:var(--bg)}.mt-compact-travel>strong{display:block;margin-bottom:4px}.mt-compact-travel>div{margin:3px 0}.mt-compact-travel>div>span{display:block;color:var(--muted)}.mt-report-section-label{font-size:.7rem;color:var(--muted);margin:3px 0;overflow-wrap:anywhere}@media(max-width:1100px){.mt-compact-grid{grid-template-columns:1fr}}@media(max-width:480px){.mt-compact-metrics{grid-template-columns:repeat(2,minmax(0,1fr));}.mt-plan-head{flex-direction:column;align-items:start}.mt-plan-house{flex-wrap:wrap}.mt-compact-plan{padding:10px}}\n\n:root{--ink:#252c29;--muted:#52605a;--bg:#f4f6f3;--card:#fff;--border:#d5ddd6;--accent:#a94437;--accent2:#276548;--accent3:#285c80;--accent4:#986719;--ok:#276548;--err:#a94437;--warn:#986719;--star:#986719;--mt-pos:#276548;--mt-neg:#a94437;--mt-warn:#986719}*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:10pt;line-height:1.4;color:var(--ink);max-width:186mm;margin:auto;padding:8mm 0;overflow-wrap:anywhere}h1,h2,h3{line-height:1.2;break-after:avoid;margin:0 0 8px}h1{font-size:25pt;letter-spacing:-.7px}h2{font-size:16pt;border-bottom:1px solid var(--border);padding-bottom:6px;margin-top:18px}h3{font-size:11pt;margin-top:12px}.mt-report-cover{border-top:5px solid var(--accent2);padding:12px 0 8px;margin-bottom:14px}.mt-report-kicker{text-transform:uppercase;letter-spacing:1.4px;color:var(--accent2);font-size:9pt;font-weight:bold}.mt-report-meta{font-size:9pt;color:var(--muted);margin:5px 0}.mt-report-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.mt-report-kpis>div{border:1px solid var(--border);border-radius:8px;padding:8px}.mt-report-kpis strong{display:block;font-size:18pt;color:var(--accent2)}.mt-report-kpis small{color:var(--muted)}.mt-report-note{font-size:8.5pt;color:var(--muted);margin:8px 0}.mt-report-section{margin:12px 0}.mt-report-section>.card{margin:12px 0}.card{background:#fff;border:1px solid var(--border);padding:11px;border-radius:9px;min-width:0;color:var(--ink)}.card-title{font-size:11pt;font-weight:700;color:var(--ink);margin-bottom:6px}.mt-work-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:start}.mt-compact-grid{display:block}.mt-compact-plan{break-inside:avoid;page-break-inside:avoid}.mt-essential-card,.mt-report-kpis,.mt-work-chart,.mt-compact-metrics{break-inside:avoid}.mt-report-content>.mt-report-section>.card{break-inside:auto}.mt-report-content .mt-work-chart{overflow:visible}.mt-report-content .mt-work-chart svg,.mt-pareto-plot svg{width:100%;height:auto;min-width:0!important;max-width:100%;display:block}.mt-mini-days{overflow:visible;gap:2px}.mt-mini-days>div{flex:1 1 0;min-width:0}.mt-mini-days small{font-size:6px}.mt-report-content .mt-mini-metrics{grid-template-columns:repeat(auto-fit,minmax(48px,1fr))}.mt-mini-metric strong{font-size:12pt}.mt-report-content .mt-gantt{white-space:normal;table-layout:fixed;width:100%;border-spacing:1px;font-size:6.5pt}.mt-gantt td{min-width:0;padding:0}.mt-gantt th:first-child{width:84px;overflow-wrap:anywhere}.mt-gantt th{font-size:6.5pt;padding:2px;overflow-wrap:anywhere}.mt-report-content table{max-width:100%;border-collapse:collapse}.mt-report-content .mt-work-chart table:not(.mt-gantt) th,.mt-report-content .mt-work-chart table:not(.mt-gantt) td{padding:3px;font-size:7.5pt;border:1px solid var(--border)}.mt-report-content i.fa-solid,.mt-report-content i.fa-regular{display:none}.mt-compact-travel{break-inside:avoid}.mt-report-content .mt-pareto-plot{overflow:visible}.mt-report-content .mt-plan-person{font-size:8pt}.mt-report-content .mt-report-section-label{font-size:8pt}.mt-print-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;margin-bottom:14px}.mt-print-actions button{background:var(--accent2);color:white;border:0;border-radius:6px;padding:9px 13px;font:inherit;cursor:pointer}.mt-print-actions button+button{background:white;color:var(--ink);border:1px solid var(--border)}.mt-print-actions span{font-size:8.5pt;color:var(--muted)}@page{size:A4;margin:13mm 12mm}@media print{body{padding:0;max-width:none}.mt-print-actions{display:none!important}.mt-work-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mt-report-content{print-color-adjust:exact;-webkit-print-color-adjust:exact}.mt-report-kpis{print-color-adjust:exact;-webkit-print-color-adjust:exact}h2,h3,.mt-plan-head{break-after:avoid}.mt-report-section{break-inside:auto}.mt-report-content .mt-compact-plan{break-inside:avoid}}@media screen and (max-width:650px){body{padding:12px}.mt-work-grid{grid-template-columns:1fr}.mt-report-kpis{grid-template-columns:1fr}.mt-report-content .mt-gantt{font-size:6pt}}\n\n/* Recuperación de resultados: aprovecha el tema de Metatio. */\n.mt-results-overview .kpi-box {border-top:3px solid var(--accent2);}\n.mt-results-overview .kpi-box:nth-child(2){border-top-color:var(--accent3);}\n.mt-results-overview .kpi-box:nth-child(3){border-top-color:var(--accent);}\n.mt-results-note,.mt-study-meta{color:var(--muted);font-size:.82rem;line-height:1.5;margin:8px 0 12px;}\n.mt-study-meta{border-bottom:1px solid var(--border);padding-bottom:8px;}\n.mt-attendance-pills{margin-top:12px;}\n.mt-readonly-analysis .ref-bar-track{height:10px;}\n.mt-date-yes{background:var(--ok)!important;color:white!important;}\n.mt-date-unknown{color:var(--muted);background:var(--bg);}\n.mt-transport-analysis{margin-top:16px;}\n.mt-route-detail{margin-top:12px;background:var(--bg);padding:12px;border-radius:8px;}\n.mt-readonly-analysis .ref-opt-actions:empty{display:none;}\n#survey-main-title{overflow-wrap:anywhere;}\n\n.mt-pareto-plot{border:1px solid var(--border);background:var(--bg);padding:12px;border-radius:10px;margin:12px 0;}\n.mt-plot-title{font-weight:600;font-size:.9rem;margin-bottom:4px;}\n.mt-pareto-plot svg{display:block;width:100%;max-width:680px;margin:auto;overflow:visible;}\n.mt-pareto-plot svg text{fill:var(--ink);font-size:12px;}\n.mt-plot-grid{stroke:var(--border);stroke-width:1;}\n.mt-plot-axis{stroke:var(--muted);fill:none;stroke-width:1.4;}\n.mt-pareto-line{stroke:var(--accent2);stroke-width:2;stroke-dasharray:5 4;fill:none;}\n.mt-pareto-point circle{stroke:var(--card);stroke-width:2;}\n.mt-pareto-point.front circle{fill:var(--accent2);}\n.mt-pareto-point.dominated circle{fill:var(--muted);}\n.mt-pareto-point.veto circle{fill:var(--err);}\n.mt-plot-legend,.mt-plot-labels{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:.78rem;margin-top:8px;}\n.mt-front{color:var(--accent2);}.mt-dominated{color:var(--muted);}.mt-veto{color:var(--err);}\n\n.mt-report-content .mt-pareto-plot svg{min-width:0!important;max-width:100%;height:auto;}\n\n@media print{.mt-report-content .mt-compact-plan{padding:9px;margin:6px 0}.mt-report-content .mt-compact-metrics{margin:5px 0 7px}.mt-report-content .mt-compact-travel{padding:5px 7px;margin:5px 0}.mt-report-content .mt-compact-travel>div>span{display:inline;margin-left:6px}.mt-report-content .mt-compact-travel>div{margin:2px 0}.mt-report-content .mt-plan-group{margin:5px 0}.mt-report-content .mt-plan-person{padding:2px 6px}.mt-report-content .mt-work-card.mt-full{border:0;padding:0}.mt-report-content .mt-compact-grid{margin:4px 0}.mt-report-content .mt-plan-line{margin:4px 0}.mt-report-content .mt-essential-card{padding:8px}.mt-report-content .mt-mini-days{height:60px}.mt-report-content .mt-work-note{margin:3px 0 6px}}" + "\n/* v16.4: six-color descending rank scale; applies also to the printable summary. */\n.mt-workspace,.mt-report-content{--mt-rank-max:#35965f;--mt-rank-q1:#4c87ce;--mt-rank-q2:#d5b02e;--mt-rank-q3:#e18b37;--mt-rank-q4:#d95850;--mt-rank-min:#a22c45;}\n.mt-workspace .mt-mini-track b.maximum,.mt-workspace .mt-mini-days b.maximum,.mt-report-content .mt-mini-track b.maximum,.mt-report-content .mt-mini-days b.maximum,.mt-mini-legend .maximum:before{background:var(--mt-rank-max);opacity:1}\n.mt-workspace .mt-mini-track b.quartile1,.mt-workspace .mt-mini-days b.quartile1,.mt-report-content .mt-mini-track b.quartile1,.mt-report-content .mt-mini-days b.quartile1,.mt-mini-legend .quartile1:before{background:var(--mt-rank-q1);opacity:1}\n.mt-workspace .mt-mini-track b.quartile2,.mt-workspace .mt-mini-days b.quartile2,.mt-report-content .mt-mini-track b.quartile2,.mt-report-content .mt-mini-days b.quartile2,.mt-mini-legend .quartile2:before{background:var(--mt-rank-q2);opacity:1}\n.mt-workspace .mt-mini-track b.quartile3,.mt-workspace .mt-mini-days b.quartile3,.mt-report-content .mt-mini-track b.quartile3,.mt-report-content .mt-mini-days b.quartile3,.mt-mini-legend .quartile3:before{background:var(--mt-rank-q3);opacity:1}\n.mt-workspace .mt-mini-track b.quartile4,.mt-workspace .mt-mini-days b.quartile4,.mt-report-content .mt-mini-track b.quartile4,.mt-report-content .mt-mini-days b.quartile4,.mt-mini-legend .quartile4:before{background:var(--mt-rank-q4);opacity:1}\n.mt-workspace .mt-mini-track b.minimum,.mt-workspace .mt-mini-days b.minimum,.mt-report-content .mt-mini-track b.minimum,.mt-report-content .mt-mini-days b.minimum,.mt-mini-legend .minimum:before{background:var(--mt-rank-min);opacity:1}\n .mt-plan-day{padding:5px 0;border-top:1px solid var(--border)}.mt-plan-day>b{font-size:.76rem;color:var(--muted)}\n";
  // Brief travel sheet: no survey statistics, no analytical jargon.
  function buildBriefReportHtml(){
    const data=ResultsWorkspace.briefData(), fmt=v=>v==null?'':new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(v), date=v=>v?fmtDate(v):'Por concretar', names=a=>(a||[]).map(e).join(', '), title=e(encuestaTitulo||'Viaje');
    const paths={calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4m8-4v4"/>',users:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',house:'<path d="m3 11 9-8 9 8v10H3zM9 21v-8h6v8"/>',car:'<path d="m3 16 2-7h14l2 7v4h-3v-3H6v3H3zM5 9l2-4h10l2 4M6 13h2m8 0h2"/>',wallet:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M21 10h-6v5h6M16 12.5h1"/>',flag:'<path d="M5 22V3m0 1c5-4 9 4 15 0v10c-6 4-10-4-15 0"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',check:'<path d="m5 12 5 5L20 7"/>',pin:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2"/>'};
    const ic=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[k]||paths.flag}</svg>`;
    const line=(k,label,content)=>content?`<div class="brief-line">${ic(k)}<div><b>${e(label)}</b> ${content}</div></div>`:'';
    const travel=(arr,label)=>arr.length?line('car',label,arr.map(v=>`<span class="car-row"><b>${e(v.driver)}</b> <span>${e(date(v.date))}${v.departure?' · Sale '+e(v.departure):' · Hora por acordar'}${v.arrival?' · Llega '+e(v.arrival):''}</span><br>${names(v.people)||'Sin pasajeros'}</span>`).join('')):'';
    const daily=p=>p.part.length&&p.daily?.length?`<div class="brief-daily">${ic('calendar')}<div><b>Asistentes por día</b>${p.daily.map(d=>`<div class="brief-day"><strong>${e(date(d.date))} · ${d.people.length}</strong><span>${names(d.people)||'Nadie asignado'}</span></div>`).join('')}</div></div>`:'';
    const plans=data.plans.map((p,i)=>`<article class="brief-plan"${i?' hidden':''}><header><span class="plan-index">${String(i+1).padStart(2,'0')}</span><div><h2>${e(date(p.from))}${p.from===p.to?'':' — '+e(date(p.to))}</h2><small>${p.partial?'Propuesta parcial':'Propuesta de viaje'}${p.incomplete?' · Datos por completar':''}</small></div><div class="plan-count">${ic('users')} <strong>${e(p.count)}</strong> <span>personas</span><br><span>${e(p.days)} ${p.days===1?'día':'días'}</span></div></header>${p.partial?`<div class="scope">${e(p.scope)}</div>`:''}<div class="brief-body">${line('users','Viaje completo:',names(p.full))}${daily(p)}${line('users','Sin encaje:',names(p.excluded))}${line('house','Alojamiento por elegir:',p.house.map(h=>`${e(h.name)} · <strong>${e(fmt(h.price))} €/persona</strong>`).join(' / ')+(p.houseMore?` · +${p.houseMore} opciones`:''))}${p.noHouse?line('house','Alojamiento:','Sin opción compatible calculada.'):''}${p.part.length&&p.house.length?line('wallet','Precio del alojamiento:','Reparto igual estimado; coste individual según estancia pendiente.'):''}${line('wallet','Presupuesto máximo común:',p.cap!=null?`${e(fmt(p.cap))} €/persona`: '')}${line('wallet','Presupuesto cómodo común:',p.comfortable!=null?`${e(fmt(p.comfortable))} €/persona`:'')}${line('flag','Actividad preferida:',e(p.activity))}${line('clock','Horario:',e(p.time))}${p.out.length||p.back.length?`<div class="brief-travel-grid">${travel(p.out,'Ida:')}${travel(p.back,'Vuelta:')}</div>`:''}</div></article>`).join('');
    const routes=data.routes.map(r=>`<article class="brief-route"><h3>${ic('car')} ${e(r.title)} · ${e(r.dest)}</h3>${r.branch?`<small>${e(r.branch)}</small>`:''}<small>Propuesta de recogidas · horarios estimados; verificar antes de viajar.${r.incomplete?' Datos por completar.':''}</small>${r.cars.map(c=>line('car',c.driver,`Salida ${e(c.from)} · Llegada ${e(c.to)} · ${e(fmt(c.km))} km${c.pickups.length?`<span class="car-row">${c.pickups.map(p=>`${e(p.name)} (${e(p.time)})`).join(' · ')}</span>`:''}`)).join('')}${line('users','Sin recogida:',names(r.unassigned))}${line('users','Por su cuenta:',names(r.independent))}${r.more?`<small>Hay ${r.more} alternativas adicionales en Metatio.</small>`:''}</article>`).join('');
    const groups=new Map();for(const p of data.pending){const key=p.branch?`${p.section||''}\n${p.branch}`:'general';if(!groups.has(key))groups.set(key,{section:p.branch?(p.section||'Rama del viaje'):'Decisiones generales',branch:p.branch||'',items:[]});groups.get(key).items.push(p);}
    const pending=[...groups.values()].map(g=>`<div class="pending-item"><h3>${e(g.section)}</h3>${g.branch?`<small>${e(g.branch)}</small>`:''}${g.items.map(p=>`<div class="pending-line"><b>${e(p.title)}:</b> ${e(p.text.replace(/ · otras opciones en Metatio/g,' · más opciones disponibles').replace(/\. Por acordar\.$/,'.'))}</div>`).join('')}</div>`).join('');
    const css=`@page{size:A4;margin:11mm 12mm}*{box-sizing:border-box}body{font:10.2pt/1.35 Arial,Helvetica,sans-serif;color:#23372e;margin:16px auto;max-width:820px;padding:0 12px;overflow-wrap:anywhere}svg{width:15px;height:15px;flex:none;vertical-align:middle;color:#36785e}h1,h2,h3,p{margin:0}h1{font-size:23pt;line-height:1.12;letter-spacing:-.6px}h2{font-size:15pt;line-height:1.15}h3{font-size:10.5pt}small{font-size:8.3pt;color:#53645a;display:block}.brief-head{border-top:5px solid #36785e;padding:12px 0 10px;border-bottom:1px solid #b9c9bf;margin-bottom:12px}.brand{font-size:8pt;letter-spacing:1.8px;color:#36785e;font-weight:bold;text-transform:uppercase;margin-bottom:5px}.intro{font-size:9pt;color:#53645a;margin-top:5px}.brief-plan,.brief-route{border:1px solid #c6d5cb;border-radius:8px;margin:0 0 8px;break-inside:avoid;page-break-inside:avoid}.brief-plan header{display:flex;align-items:center;gap:9px;padding:8px 10px;background:#e9f2ec;border-radius:7px 7px 0 0}.plan-index{font-size:16pt;font-weight:bold;color:#36785e;line-height:1}.plan-count{margin-left:auto;text-align:right;font-size:9pt;white-space:nowrap}.plan-count strong{font-size:15pt}.plan-count span{color:#53645a}.scope{font-size:8.3pt;color:#53645a;padding:4px 10px 0}.brief-body{padding:7px 10px;display:grid;grid-template-columns:1fr 1fr;gap:4px 12px}.brief-travel-grid{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}.brief-daily{grid-column:1/-1;display:flex;gap:5px;font-size:9pt}.brief-daily>div{flex:1;min-width:0}.brief-day{display:grid;grid-template-columns:105px 1fr;gap:6px;border-bottom:1px solid #e6ede8;padding:2px 0;font-size:8.5pt}.brief-day strong{color:#36785e}.brief-line{display:flex;gap:5px;align-items:baseline;font-size:9pt;min-width:0}.brief-line>div{min-width:0}.brief-line svg{align-self:flex-start;margin-top:1px}.brief-line b{color:#31473b}.car-row{display:block;font-size:8.7pt;margin:1px 0}.car-row span{color:#53645a}.section-title{font-size:12pt;color:#36785e;margin:12px 0 6px;break-after:avoid}.brief-route{padding:8px 10px}.brief-route h3{margin-bottom:4px}.brief-route .brief-line{margin-top:4px}.pending-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 12px}.pending-item{border-left:3px solid #d5a555;padding:4px 7px;background:#faf6ec;break-inside:avoid;font-size:9pt;min-width:0}.pending-item h3{margin:0 0 3px;color:#76551f;font-size:10pt}.pending-item b{display:inline}.pending-line{margin:3px 0}.pending-item small{font-size:7.8pt;margin:1px 0}.brief-foot{border-top:1px solid #c6d5cb;font-size:8pt;color:#53645a;margin-top:10px;padding-top:5px}.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px;background:#e9f2ec;padding:9px;border-radius:7px}.actions button{font:inherit;background:#36785e;color:white;border:0;border-radius:5px;padding:8px 12px;cursor:pointer}.actions button+button{background:white;color:#23372e;border:1px solid #c6d5cb}.actions label{font-size:9pt}.actions select{font:inherit;padding:5px}.brief-plan[hidden]{display:none!important}@media print{body{padding:0;margin:0;max-width:none;print-color-adjust:exact;-webkit-print-color-adjust:exact}.actions{display:none}.brief-plan header{padding:7px 9px}}@media screen and (max-width:520px){.brief-body,.pending-grid,.brief-travel-grid{grid-template-columns:1fr}.plan-count span{font-size:8pt}h1{font-size:20pt}h2{font-size:12pt}}`;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} · Plan de viaje</title><style>${css}</style></head><body><div class="actions"><button onclick="window.print()">Guardar PDF</button><button onclick="window.close()">Cerrar</button>${data.plans.length>1?`<label>Propuestas <select onchange="document.querySelectorAll('.brief-plan').forEach((el,i)=>el.hidden=this.value!=='all' &amp;&amp; i!==Number(this.value))">${data.plans.map((p,i)=>`<option value="${i}"${i===0?' selected':''}>Propuesta ${i+1} · ${e(date(p.from))}</option>`).join('')}<option value="all">Comparar ${data.plans.length} propuestas</option></select></label>`:''}</div><header class="brief-head"><div class="brand">Metatio · Ficha de viaje</div><h1>${title}</h1><p class="intro">Propuestas para acordar · aún no son reservas ni decisiones confirmadas.${data.plans.some(p=>p.partial)?' Las fechas y los desplazamientos independientes no forman un itinerario conjunto verificado.':''}</p></header>${plans?`<div class="brief-plans">${plans}</div>`:''}${routes?`<h2 class="section-title">Desplazamientos independientes</h2>${routes}`:''}${pending?`<h2 class="section-title">Por decidir o confirmar</h2><div class="pending-grid">${pending}</div>`:''}${!plans&&!routes&&!pending?'<p>El plan todavía está por concretar.</p>':''}<footer class="brief-foot">Precios estimados cuando se indican; no incluyen otros gastos salvo que se especifique. · ${e(new Date().toLocaleDateString('es-ES'))}</footer></body></html>`;
  }
  function buildReportHtml(options) {
    options=options||{};
    if(options.brief && window.ResultsWorkspace?.briefData) return buildBriefReportHtml();
    if(options.legacy || !window.ResultsWorkspace?.reportContent) return buildLegacyReportHtml(options);
    const extended=!!options.extended;
    const on=typeof asistenciaActiva==='undefined'||asistenciaActiva;
    const ps=on?respondentes.map(r=>getEffectiveProb(r.nombre)):[];
    const expected=ps.reduce((a,p)=>a+p,0);
    const stamp=new Date().toLocaleString('es-ES',{dateStyle:'long',timeStyle:'short'});
    const body=ResultsWorkspace.reportContent(extended);
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(encuestaTitulo||'Viaje')} · Informe Metatio</title><style>${SHARE_CSS}</style></head><body><div class="mt-print-actions"><button onclick="window.print()">Guardar como PDF / Imprimir</button><button onclick="window.close()">Cerrar</button><span>Vista previa A4. Elige Guardar como PDF en el diálogo de impresión.</span></div><header class="mt-report-cover"><div class="mt-report-kicker">Metatio · Centro de decisión</div><h1>${e(encuestaTitulo||'Viaje')}</h1><div class="mt-report-meta">${extended?'Informe con anexo gráfico':'Informe justificativo'} · ${e(stamp)}</div><div class="mt-report-kpis"><div><small>Respuestas</small><strong>${respuestas.length}/${respondentes.length}</strong></div><div><small>Preguntas evaluadas</small><strong>${schema.filter(q=>!q.config?.esEncabezado).length}</strong></div><div><small>Asistencia esperada</small><strong>${on?fmtNum(expected):'—'}</strong></div></div><p class="mt-report-note">Instantánea de las respuestas enviadas. Las alternativas son propuestas, no acuerdos cerrados. Los estudios parciales no acreditan factibilidad conjunta. No incluye afinidades individuales ni coordenadas de recogida. ${!extended?'Se muestra la primera alternativa disponible por estudio; el informe con anexo incluye todas. ':''}${extended?'El anexo contiene análisis individuales de presupuesto y disponibilidad; compártelo solo con el grupo.':''}</p></header>${body}<footer class="mt-report-note">Generado con Metatio · ${e(stamp)} · Las respuestas posteriores no modifican este documento.</footer></body></html>`;
  }

  function openPrintReport(options) {
    const w = window.open('', '_blank', 'width=1000,height=1200');
    if (!w) {
      const msg = 'Permite ventanas emergentes para exportar el informe a PDF.';
      if (typeof showStatus === 'function') showStatus(msg, 'err', 6000);
      else alert(msg);
      return;
    }
    let html;
    try { html=buildReportHtml(options); } catch(error) { w.close(); console.error(error); if(typeof showStatus==='function')showStatus('No se pudo generar el informe.','err',6000); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Preview first; print only after explicit user action.
    try { w.focus(); } catch (_) {}
  }

  // ── Enlazado automático del botón (sidebar) ──────────────────────────────
  function bindReportButton() {
    const btn = document.getElementById('btn-print-report');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      if (typeof closeSideNav === 'function') closeSideNav();
      openPrintReport({brief:true});
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindReportButton);
  } else {
    bindReportButton();
  }

  // API pública
  window.openPrintReport = openPrintReport;
  window.buildReportHtml = buildReportHtml;
  window.buildLegacyReportHtml = buildLegacyReportHtml;
})();