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
  function buildCover(model, soluciones) {
    return `
      <div class="report-cover">
        <h1>${e(encuestaTitulo || 'Viaje')}</h1>
        <div class="report-subtitle">Informe de conclusiones y plan propuesto</div>
        <div class="report-meta">
          <span><b>${respondentes.length}</b> participantes</span>
          <span><b>${respuestas.length}</b> respuestas</span>
          <span><b>${soluciones.length}</b> solución${soluciones.length === 1 ? '' : 'es'} factible${soluciones.length === 1 ? '' : 's'}</span>
          <span>${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>`;
  }

  function buildSynthesis(model, soluciones, topo) {
    const probs = respondentes.map(r => getEffectiveProb(r.nombre));
    const expected = probs.reduce((a, p) => a + p, 0);
    const variance = probs.reduce((a, p) => a + p * (1 - p), 0);
    const sigma = Math.sqrt(variance);
    const firstSol = soluciones[0];

    const parts = [`<h2>Síntesis ejecutiva</h2>`, `<div class="kpis">`];
    parts.push(`<div class="kpi"><div class="kpi-label">Asistencia esperada</div>
      <div class="kpi-value">${expected.toFixed(1)} <small>± ${sigma.toFixed(1)}</small></div></div>`);
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
    respuestas.forEach(r => {
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
    respuestas.forEach(r => {
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
    respuestas.forEach(r => {
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
      if (q.tipo === 'textarea' && q.config && q.config.descripcion) return; // informativa
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
        parts.push(buildDispoSummary());
      } else if (q.tipo === 'horarios') {
        parts.push(`<p style="font-size:9pt;color:#666;font-style:italic">Ver detalle de horarios en el Reformulario de la aplicación.</p>`);
      }
    });
    parts.push(`</div>`);
    return parts.join('\n');
  }

  // ── Ensamblado y apertura ────────────────────────────────────────────────
  function buildReportHtml(options) {
    options = Object.assign({ includeReform: true }, options || {});
    const model = buildModelData();
    const { soluciones } = ejecutarMotorFactibilidad(model);
    const topo = computeTopologyAndSensitivity(model, soluciones);

    const parts = [
      buildCover(model, soluciones),
      buildSynthesis(model, soluciones, topo),
      buildPreferences(model),
      buildDaysStats(model),
      buildSolutions(model, soluciones),
      buildTopology(topo),
    ];
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

  function openPrintReport(options) {
    const html = buildReportHtml(options);
    const w = window.open('', '_blank', 'width=1000,height=1200');
    if (!w) {
      const msg = 'Permite ventanas emergentes para exportar el informe a PDF.';
      if (typeof showStatus === 'function') showStatus(msg, 'err', 6000);
      else alert(msg);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Espera a que el layout esté listo antes de disparar el diálogo de impresión.
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) {} }, 700);
  }

  // ── Enlazado automático del botón (sidebar) ──────────────────────────────
  function bindReportButton() {
    const btn = document.getElementById('btn-print-report');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      if (typeof closeSideNav === 'function') closeSideNav();
      openPrintReport();
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
})();