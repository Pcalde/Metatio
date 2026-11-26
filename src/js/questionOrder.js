// Orden de presentación, independiente de las coordenadas del dibujo del grafo.
(function(root){
  const norm=s=>String(s||'').trim().toLowerCase();
  function groups(qs){
    const out=[], by=new Map();
    for(const q of qs){
      const name=q.config?.seccion||(q.config?.esEncabezado?q.label:'');
      const key=name?'s:'+norm(name):'q:'+q.id;
      if(!by.has(key)){const g={key,title:name||q.label,items:[]};by.set(key,g);out.push(g);}
      by.get(key).items.push(q);
    }
    for(const g of out)g.items=[...g.items.filter(q=>q.config?.esEncabezado),...g.items.filter(q=>!q.config?.esEncabezado)];
    return out;
  }
  const flatten=gs=>gs.flatMap(g=>g.items);
  const rules=r=>Array.isArray(r)?r:Array.isArray(r?.rules)?r.rules:r?.qid?[r]:[];
  function deps(q,qs){
    const a=rules(q.config?.mostrarSi).map(r=>r?.qid).filter(Boolean);
    if(q.config?.seccion&&!q.config?.esEncabezado){const h=qs.find(h=>h.config?.esEncabezado&&norm(h.config.seccion||h.label)===norm(q.config.seccion));if(h)a.push(h.id);}
    return [...new Set(a)];
  }
  function violations(qs){const pos=new Map(qs.map((q,i)=>[q.id,i]));return qs.flatMap((q,i)=>deps(q,qs).filter(d=>!pos.has(d)||pos.get(d)>=i).map(d=>({source:d,target:q.id})));}
  function stableSort(items,key,dependencies){
    const pending=items.slice(), done=new Set(), result=[];
    while(pending.length){const i=pending.findIndex(x=>dependencies(x).every(d=>done.has(d)));if(i<0)return null;const x=pending.splice(i,1)[0];done.add(key(x));result.push(x);}return result;
  }
  function topological(qs){
    const gs=groups(qs), by=new Map(gs.flatMap(g=>g.items.map(q=>[q.id,g.key])));
    if(qs.some(q=>deps(q,qs).some(d=>!by.has(d))))return null;
    const ordered=stableSort(gs,g=>g.key,g=>[...new Set(g.items.flatMap(q=>deps(q,qs).map(d=>by.get(d))).filter(k=>k!==g.key))]);
    if(!ordered)return null;
    for(const g of ordered){const items=stableSort(g.items,q=>q.id,q=>deps(q,qs).filter(d=>by.get(d)===g.key));if(!items)return null;g.items=items;}
    return flatten(ordered);
  }
  function move(qs,from,to,after=false){
    const gs=groups(qs), a=gs.find(g=>g.items.some(q=>q.id===from)), b=gs.find(g=>g.items.some(q=>q.id===to));
    if(!a||!b||from===to)return flatten(gs);
    if(a!==b){gs.splice(gs.indexOf(a),1);gs.splice(gs.indexOf(b)+(after?1:0),0,a);}
    else{const x=a.items.find(q=>q.id===from),y=a.items.find(q=>q.id===to);if(x.config?.esEncabezado||y.config?.esEncabezado)return flatten(gs);a.items.splice(a.items.indexOf(x),1);a.items.splice(a.items.indexOf(y)+(after?1:0),0,x);}
    return flatten(gs);
  }
  function newViolations(before,after){const key=x=>x.source+'\0'+x.target;const old=new Set(violations(flatten(groups(before))).map(key));return violations(flatten(groups(after))).filter(x=>!old.has(key(x)));}
  root.QuestionOrder={groups,flatten,deps,violations,topological,move,newViolations};
})(typeof window!=='undefined'?window:globalThis);

function validatePresentationChange(next){
  const bad=QuestionOrder.newViolations(schema,next);
  if(!bad.length)return null;
  const b=bad[0], names=new Map(next.map(q=>[q.id,q.label]));
  return `«${names.get(b.source)||'Pregunta de origen'}» debe aparecer antes de «${names.get(b.target)||'Pregunta dependiente'}». Cambia la posición o reordena el recorrido antes de guardar.`;
}
function canEditQuestionOrder(){return !!user && respondentes.some(r=>r.organizer===true&&String(r.nombre).toLowerCase()===String(user.nombre).toLowerCase());}
let mtOrderSaving=false;
async function persistQuestionOrder(next){
  if(!canEditQuestionOrder()||mtOrderSaving)return false;
  const ids=next.map(q=>q.id), old=schema.map(q=>q.id);
  if(ids.length!==old.length||new Set(ids).size!==ids.length||old.some(id=>!ids.includes(id)))throw Error('El cuestionario ha cambiado. Abre de nuevo el editor.');
  mtOrderSaving=true;
  try{
    await apiAuth({action:'reordenar_preguntas',eid:user.eid,nombre:user.nombre,pinHash:user.pinHash,ids});
    // No reemplazar los objetos: preserva cambios de opciones recibidos durante la petición.
    const by=new Map(schema.map(q=>[q.id,q]));
    if(ids.length===by.size&&ids.every(id=>by.has(id)))schema.splice(0,schema.length,...ids.map(id=>by.get(id)));
    syncQuestionCardOrder(); refreshSecciones(); lastRaw='';
    if(typeof renderArbolSiAbierto==='function')renderArbolSiAbierto();
    await pollOnce(); return true;
  } finally {mtOrderSaving=false;}
}
function openQuestionOrder(initial){
  if(!canEditQuestionOrder()){showStatus('Solo el organizador puede cambiar el recorrido.','err');return;}
  document.getElementById('mt-order-dialog')?.remove();
  let draft=QuestionOrder.flatten(QuestionOrder.groups(initial||schema)), original=JSON.stringify(schema.map(q=>[q.id,q.config?.seccion,q.config?.mostrarSi]));
  const dlg=document.createElement('dialog');dlg.id='mt-order-dialog';dlg.className='mt-order-dialog';
  const title=document.createElement('h2');title.textContent='Orden del cuestionario';
  const intro=document.createElement('p');intro.textContent='Arrastra los bloques de sección o las preguntas dentro de su sección. También puedes usar las flechas. Para cambiar de sección, edita la pregunta. El orden no modifica los votos ni las condiciones.';
  const notice=document.createElement('p');notice.setAttribute('role','status');
  const list=document.createElement('div');list.className='mt-order-list';
  const footer=document.createElement('div');footer.className='mt-order-actions';
  function button(text,fn){const b=document.createElement('button');b.type='button';b.className='btn-pc';b.textContent=text;b.onclick=fn;return b;}
  const save=button('Guardar recorrido',async()=>{
    if(JSON.stringify(schema.map(q=>[q.id,q.config?.seccion,q.config?.mostrarSi]))!==original){notice.textContent='El cuestionario cambió mientras editabas. Cierra y vuelve a abrir.';return;}
    if(QuestionOrder.violations(draft).length)return;
    save.disabled=true;try{if(await persistQuestionOrder(draft)){dlg.close();showStatus('Recorrido guardado','ok');}}catch(e){notice.textContent=e.message;}finally{save.disabled=false;}
  });
  function redraw(){
    list.replaceChildren();const gs=QuestionOrder.groups(draft);let n=0;
    const step=(a,b,after)=>{draft=QuestionOrder.move(draft,a,b,after);redraw();};
    function drag(el,id,kind,group){el.draggable=true;el.ondragstart=e=>{e.stopPropagation();e.dataTransfer.setData('text/plain',JSON.stringify({id,kind,group}));e.dataTransfer.effectAllowed='move';};el.ondragover=e=>{e.preventDefault();e.stopPropagation();el.classList.add('mt-order-over');};el.ondragleave=()=>el.classList.remove('mt-order-over');el.ondrop=e=>{e.preventDefault();e.stopPropagation();el.classList.remove('mt-order-over');try{const d=JSON.parse(e.dataTransfer.getData('text/plain'));if(d.kind===kind&&(kind==='group'||d.group===group))step(d.id,id,e.clientY>el.getBoundingClientRect().top+el.offsetHeight/2);}catch(_){}};}
    gs.forEach((g,i)=>{
      const block=document.createElement('section');block.className='mt-order-group';const header=document.createElement('div');header.className='mt-order-row';
      const label=document.createElement('strong');label.textContent=`${i+1}. ${g.title}`;header.append(label);const id=g.items[0].id;
      const up=button('↑',()=>step(id,gs[i-1].items[0].id,false));up.disabled=!i;up.title='Subir sección';const down=button('↓',()=>step(id,gs[i+1].items[0].id,true));down.disabled=i===gs.length-1;down.title='Bajar sección';header.append(up,down);drag(header,id,'group',g.key);block.append(header);
      const qs=g.items.filter(q=>!q.config?.esEncabezado);qs.forEach((q,j)=>{const row=document.createElement('div');row.className='mt-order-row mt-order-question';const t=document.createElement('span');t.textContent=`${++n}. ${q.label}`;row.append(t);const u=button('↑',()=>step(q.id,qs[j-1].id,false));u.disabled=!j;u.title='Subir pregunta';const d=button('↓',()=>step(q.id,qs[j+1].id,true));d.disabled=j===qs.length-1;d.title='Bajar pregunta';row.append(u,d);drag(row,q.id,'question',g.key);block.append(row);});list.append(block);
    });
    const bad=QuestionOrder.violations(draft), names=new Map(draft.map(q=>[q.id,q.label]));
    notice.textContent=bad.length?'Dependencias pendientes: '+bad.map(b=>`${names.get(b.source)||'Pregunta eliminada'} debe ir antes de ${names.get(b.target)}`).join(' · '):'Orden válido: todas las preguntas de origen aparecen antes de sus dependientes.';
    notice.className=bad.length?'mt-order-warning':'';save.disabled=!!bad.length;
  }
  footer.append(button('Ordenar según dependencias',()=>{const sorted=QuestionOrder.topological(draft);if(sorted){draft=sorted;redraw();}else notice.textContent='No existe un recorrido válido manteniendo estas secciones como bloques. Reagrupa las preguntas o cambia las condiciones.';}),button('Cancelar',()=>dlg.close()),save);
  dlg.append(title,intro,notice,list,footer);dlg.addEventListener('close',()=>dlg.remove());document.body.append(dlg);redraw();dlg.showModal();
}
function openOrderFromGraph(from,to,after){openQuestionOrder(QuestionOrder.move(schema,from,to,after));}
