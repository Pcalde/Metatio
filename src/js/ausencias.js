// ── AUSENCIAS ───────────────────────────────────────────────────────────────
// La lista se reconstruye solo si cambia el conjunto de respondentes, conservando
// lo que el usuario tenga marcado. El slider solo se rellena desde el servidor
// la primera vez: los sondeos ya no pisan lo que el usuario está tocando.

let ausInicializado = false;
let ausMarcados = new Set();
let ausListSig = null; // firma de la lista pintada; null = aún no construida

function resetAusencias() {
  ausListSig = null;
  ausInicializado = false;
  ausMarcados = new Set();
  if ($('aus-respondentes-list')) $('aus-respondentes-list').replaceChildren();
  if ($('aus-prob-slider')) setProb(80);
}

function myVote() {
  return (user && ausencias.find(a => a.votante === user.nombre)) || null;
}

function setProb(v) {
  const s = $('aus-prob-slider');
  s.value = v;
  $('aus-prob-display').textContent = s.value + '%';
  s.style.setProperty('--pct', s.value + '%');
}

function readAusCandidatos() {
  // Los controles visibles son la autoridad; los votos todavía no pintados
  // se conservan al navegar o mientras se reconstruye la lista por polling.
  document.querySelectorAll('#aus-respondentes-list .aus-check').forEach(i => {
    if (i.checked) ausMarcados.add(i.value); else ausMarcados.delete(i.value);
  });
  return [...ausMarcados];
}

// Probabilidad y predicciones se envían juntas, independientemente de la
// sección activa. Así actualizar desde la portada no borra votos previos.
function readAusencias() {
  const slider = $('aus-prob-slider');
  if (!slider) return null;
  return {
    ausencias_predichas: readAusCandidatos(),
    prob_asistencia_propia: +slider.value,
  };
}

function readAusenciasForzado() { return readAusencias(); }

function writeAusencias(d) {
  if (!d) return;
  if (Array.isArray(d.ausencias_predichas)) {
    const set = ausMarcados = new Set(d.ausencias_predichas);
    document.querySelectorAll('#aus-respondentes-list .aus-check').forEach(i => { i.checked = set.has(i.value); });
  }
  if (d.prob_asistencia_propia !== undefined) setProb(d.prob_asistencia_propia);
}

function buildAusList(marcados) {
  const list = $('aus-respondentes-list');
  list.innerHTML = '';
  respondentes.forEach(r => {
    const item = div('opt-item');
    const lbl  = document.createElement('label'); lbl.className = 'opt-label';
    const inp  = document.createElement('input');
    inp.type = 'checkbox'; inp.value = r.nombre; inp.className = 'aus-check';
    inp.checked = marcados.has(r.nombre);
    const chk = document.createElement('span'); chk.className = 'check';
    const txt = document.createElement('span'); txt.textContent = r.nombre;
    lbl.append(inp, chk, txt);

    // No se muestra la estimación de asistencia de cada persona al votar:
    // conocerla condicionaría el voto. La probabilidad sigue usándose en
    // segundo plano para las simulaciones (getEffectiveProb / Monte Carlo).
    inp.addEventListener('change', triggerSave);
    item.appendChild(lbl);
    list.appendChild(item);
  });
}

function renderAusencias() {
  const card = $('ausencias-card');
  if (!card) return;
  if (!ausInicializado) {
    const mv = myVote();
    if (mv) writeAusencias({ausencias_predichas: mv.candidatos, prob_asistencia_propia: mv.mi_probabilidad ?? undefined});
    ausInicializado = true;
  }
  card.dataset.available = respondentes.length ? '1' : '0';
  const sig = JSON.stringify(respondentes.map(r => r.nombre));
  if (sig !== ausListSig) {
    const marcados = new Set(readAusCandidatos());
    ausListSig = sig;
    buildAusList(marcados);
  }
  if (typeof applySectionPaging === 'function') applySectionPaging();
  else card.style.display = respondentes.length ? 'block' : 'none';
  renderVotosPublicos();
}

function renderVotosPublicos() {
  const container = $('aus-votos-publicos');
  const lista     = $('aus-votos-candidatos');
  if (!ausencias || ausencias.length === 0) { container.style.display = 'none'; return; }

  container.style.display = 'block';
  lista.innerHTML = '';

  const conteo = {};
  ausencias.forEach(voto => {
    (Array.isArray(voto.candidatos) ? voto.candidatos : []).forEach(c => {
      (conteo[c] = conteo[c] || []).push(voto.votante);
    });
  });

  if (Object.keys(conteo).length === 0) {
    lista.innerHTML = '<div style="font-size:0.8rem;color:var(--muted)">Aún no hay predicciones de ausencias.</div>';
    return;
  }
  for (const [candidato, votantes] of Object.entries(conteo)) {
    const row = div('aus-voto-row');
    row.innerHTML = `
      <span class="aus-voto-name">${esc(candidato)}</span>
      <span style="color:var(--muted);font-size:0.75rem">sospechoso/a para:</span>
      <span class="aus-voto-victims">${esc(votantes.join(', '))}</span>`;
    lista.appendChild(row);
  }
}

function bindAusencias() {
  $('aus-prob-slider').addEventListener('input', function () {
    setProb(this.value);
    triggerSave();
  });
}