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
  if ($('aus-prob-slider')) setProb(75);
  if(typeof writePrioridades==='function')writePrioridades({});
  if(typeof writeQuorum==='function')writeQuorum(undefined);
}

function myVote() {
  return (user && ausencias.find(a => a.votante === user.nombre)) || null;
}

const ASISTENCIA_CATEGORIAS = [[0,'No voy','fa-circle-xmark'],[25,'Poco probable','fa-cloud'],[50,'Quizás','fa-circle-question'],[75,'Probable','fa-thumbs-up'],[98,'Casi seguro','fa-circle-check']];
function setProb(v) {
  const s = $('aus-prob-slider'); if(!s)return;
  const val=Number(v);s.value=Number.isFinite(val)?Math.max(0,Math.min(100,val)):75;
  const box=$('aus-prob-choices');if(!box)return;
  const current=[...box.querySelectorAll('input')];if(current.some(i=>+i.value===+s.value)&&current.length===ASISTENCIA_CATEGORIAS.length){current.forEach(i=>i.checked=+i.value===+s.value);return;}
  box.replaceChildren();const options=[...ASISTENCIA_CATEGORIAS];
  // Preserve old numerical answers until their owner explicitly changes them.
  if(!options.some(([p])=>p===+s.value))options.push([+s.value,'Valor anterior']);
  for(const [p,label,icon] of options){const l=document.createElement('label'),i=document.createElement('input'),t=document.createElement('span'),sm=document.createElement('small'),ico=document.createElement('i'),name=document.createElement('strong');i.type='radio';i.name='asistencia-propia';i.value=p;i.checked=p===+s.value;ico.className='fa-solid '+(icon||'fa-clock-rotate-left');ico.setAttribute('aria-hidden','true');name.textContent=label;sm.textContent=p+' %';t.append(ico,name,sm);l.append(i,t);i.onchange=()=>{setProb(p);box.querySelector('input:checked')?.focus();triggerSave()};box.append(l);}
}

function readAusCandidatos() {
  // Los controles visibles son la autoridad; los votos todavía no pintados
  // se conservan al navegar o mientras se reconstruye la lista por polling.
  document.querySelectorAll('#aus-respondentes-list .aus-check').forEach(i => {
    const key=typeof censusCanonical==='function'?censusCanonical(i.value):i.value;
    if (i.checked) ausMarcados.add(key); else {ausMarcados.delete(i.value);ausMarcados.delete(key);}
  });
  if(typeof censusCanonical==='function')ausMarcados=new Set([...ausMarcados].map(censusCanonical));
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
    const set = ausMarcados = new Set(d.ausencias_predichas.map(k=>typeof censusCanonical==='function'?censusCanonical(k):k));
    document.querySelectorAll('#aus-respondentes-list .aus-check').forEach(i => { i.checked = set.has(typeof censusCanonical==='function'?censusCanonical(i.value):i.value); });
  }
  if (d.prob_asistencia_propia !== undefined) setProb(d.prob_asistencia_propia);
}

function buildAusList(marcados) {
  const list = $('aus-respondentes-list');
  list.innerHTML = '';
  (typeof censusCandidates==='function'?censusCandidates():respondentes).forEach(r => {
    const item = div('opt-item');
    const lbl  = document.createElement('label'); lbl.className = 'opt-label';
    const inp  = document.createElement('input');
    inp.type = 'checkbox'; inp.value = r.nombre; inp.className = 'aus-check';
    inp.checked = marcados.has(r.nombre);
    const chk = document.createElement('span'); chk.className = 'check';
    const txt = document.createElement('span'); txt.textContent = r.label||r.nombre;
    lbl.append(inp, chk, txt);

    // No se muestra la estimación de asistencia de cada persona al votar:
    // conocerla condicionaría el voto. La probabilidad sigue usándose en
    // segundo plano para las simulaciones (getEffectiveProb / Monte Carlo).
    inp.addEventListener('change', triggerSave);
    item.appendChild(lbl);
    list.appendChild(item);
  });
}

function renderAusencias(preserve=false) {
  const card = $('ausencias-card');
  if (!card) return;
  if (!ausInicializado) {
    const mv = myVote();
    if (mv) writeAusencias({ausencias_predichas: mv.candidatos, prob_asistencia_propia: mv.mi_probabilidad ?? undefined});
    ausInicializado = true;
  }
  card.dataset.available = respondentes.length ? '1' : '0';
  const sig = JSON.stringify(typeof censusCandidates==='function'?censusCandidates():respondentes.map(r => r.nombre));
  if (sig !== ausListSig) {
    const marcados = new Set((preserve?[...ausMarcados]:readAusCandidatos()).map(k=>typeof censusCanonical==='function'?censusCanonical(k):k));
    ausMarcados=marcados;
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
  if (!asistenciaActiva || !ausencias || ausencias.length === 0) { container.style.display = 'none'; return; }

  container.style.display = 'block';
  lista.innerHTML = '';

  const conteo = {};
  ausencias.forEach(voto => {
    [...new Set((Array.isArray(voto.candidatos) ? voto.candidatos : []).map(c=>typeof censusCanonical==='function'?censusCanonical(c):c))].forEach(c => {
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
      <span class="aus-voto-name">${esc(typeof censusLabel==='function'?censusLabel(candidato):candidato)}</span>
      <span style="color:var(--muted);font-size:0.75rem">sospechoso/a para:</span>
      <span class="aus-voto-victims">${esc(votantes.map(n=>typeof censusLabel==='function'?censusLabel(n):n).join(', '))}</span>`;
    lista.appendChild(row);
  }
}

function bindAusencias() { setProb(75); if(typeof bindPrioridades==='function')bindPrioridades(); if(typeof bindQuorum==='function')bindQuorum(); }
