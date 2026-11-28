/* Stable invited-person IDs, separate from accounts. Never creates voters or drivers. */
(function(root){
 const norm=x=>String(x??'').trim().toLowerCase(), prefix='@censo:';
 function directory(census,registered){const accounts=new Map((registered||[]).filter(r=>r?.nombre).map(r=>[norm(r.nombre),r.nombre])), seen=new Set(),out=[];for(const p of census?.people||[]){const account=accounts.get(norm(p.account))||null;if(account)seen.add(norm(account));out.push({key:prefix+p.id,label:p.label,account,id:p.id});}for(const [k,name] of accounts)if(!seen.has(k))out.push({key:name,label:name,account:name,id:null});return out;}
 function resolve(key,dir){const s=String(key??'');if(s.startsWith(prefix))return dir.find(p=>p.key===s)?.account||null;return dir.find(p=>p.account&&norm(p.account)===norm(s))?.account||null;}
 function canonical(key,dir){const p=dir.find(p=>p.key===key)||dir.find(p=>p.account&&norm(p.account)===norm(key));return p?.key||key;}
 function label(key,dir){return dir.find(p=>p.key===key)?.label||dir.find(p=>p.account&&norm(p.account)===norm(key))?.label||(String(key).startsWith(prefix)?'Invitado retirado':String(key));}
 function affinity(map,dir){const out=Object.create(null);for(const [k,v] of Object.entries(canonicalMap(map,dir))){const account=resolve(k,dir);if(account&&[-1,1].includes(+v))out[account]=+v;}return out;}
 function canonicalMap(map,dir){const out=Object.create(null),entries=Object.entries(map||{});for(const [k,v] of entries.filter(([k])=>!k.startsWith(prefix)))out[canonical(k,dir)]=v;for(const [k,v] of entries.filter(([k])=>k.startsWith(prefix)))out[k]=v;return out;}
 function absenceRows(rows,dir){return (rows||[]).map(r=>({...r,candidatos:[...new Set((r.candidatos||[]).map(k=>resolve(k,dir)).filter(Boolean))]}));}
 function value(v,dir){if(!v||typeof v!=='object'||Array.isArray(v))return v;return {...v,...(v.prefCoches?{prefCoches:affinity(v.prefCoches,dir)}:{}),...(v.prefPasajeros?{prefPasajeros:affinity(v.prefPasajeros,dir)}:{}),...(v.ruta?.afinidades?{ruta:{...v.ruta,afinidades:affinity(v.ruta.afinidades,dir)}}:{})};}
 function answerRows(rows,dir){return rows.map(r=>{const a=r.answers||{},copy={...a};if(a.values)copy.values=Object.fromEntries(Object.entries(a.values).map(([k,v])=>[k,value(v,dir)]));if(a.extras)copy.extras=Object.fromEntries(Object.entries(a.extras).map(([k,v])=>[k,value(v,dir)]));for(const k of Object.keys(a))if(k!=='values'&&k!=='extras'&&a[k]&&typeof a[k]==='object'&&(a[k].prefCoches||a[k].prefPasajeros||a[k].ruta))copy[k]=value(a[k],dir);return {...r,answers:copy};});}
 function count(census,dir){return dir.length+(census?.anonymous_count||0);}
 root.CensusModel={directory,resolve,canonical,label,affinity,canonicalMap,absenceRows,value,answerRows,count};
})(typeof window==='undefined'?globalThis:window);
let censusOwner='',censusData=null,censusLoading=false,censusEpoch=0,censusRetry=0,censusStale=false,censusRenderKey='',censusError='';
function censusKey(){return user?`${user.eid}:${user.nombre.toLowerCase()}`:'';}
function censusCurrent(){return censusOwner===censusKey()&&!censusStale?censusData:null;}
function censusDirectory(){return CensusModel.directory(censusOwner===censusKey()?censusData:null,respondentes);}
function censusLabel(key){return CensusModel.label(key,censusDirectory());}
function censusCandidates(){const dir=censusDirectory();return dir.map(p=>({nombre:p.key,label:p.label+(p.id&&!p.account?' (sin vincular)':dir.filter(x=>x.label.toLowerCase()===p.label.toLowerCase()).length>1&&p.account?' (cuenta: '+p.account+')':''),account:p.account}));}
function censusCanonical(key){return CensusModel.canonical(key,censusDirectory());}
function censusResolveMap(map){return CensusModel.affinity(map,censusDirectory());}
function censusCanonicalMap(map){return CensusModel.canonicalMap(map,censusDirectory());}
function censusAbsences(){return CensusModel.absenceRows(ausencias,censusDirectory());}
function censusAnswerRows(rows){return CensusModel.answerRows(rows,censusDirectory());}
async function refreshCensus(force=false){const key=censusKey();if(!key)return;if(censusOwner!==key){censusOwner=key;censusData=null;censusStale=false;censusLoading=false;censusRetry=0;censusError='';censusRenderKey='';++censusEpoch;}if(censusLoading&&!force||Date.now()<censusRetry&&!force)return;censusLoading=true;const epoch=++censusEpoch;try{const next=await apiAuth({action:'get_census',...user});if(!Array.isArray(next?.people)||!Number.isInteger(next.revision))throw Error('Respuesta de censo incompatible');if(key!==censusKey()||epoch!==censusEpoch)return;const changed=JSON.stringify(next)!==JSON.stringify(censusData)||censusStale;if(changed&&typeof readAusCandidatos==='function')readAusCandidatos();censusData=next;censusStale=false;censusError='';censusRetry=0;renderCensus();if(typeof refreshQuorumControl==='function')refreshQuorumControl();if(changed){if(typeof renderAusencias==='function')renderAusencias(true);if(typeof refreshTransportCards==='function')refreshTransportCards();if(activeMode==='consensus')renderResultados();}}catch(e){if(key===censusKey()&&epoch===censusEpoch){censusStale=true;censusError=e.message||String(e);console.warn('[Metatio] Censo:',censusError);censusRetry=Date.now()+60000;renderCensus();if(typeof refreshQuorumControl==='function')refreshQuorumControl();if(activeMode==='consensus')renderResultados();}}finally{if(epoch===censusEpoch)censusLoading=false;}}
function renderCensus(){
 const host=$('census-card');if(!host||!user)return;
 const data=censusCurrent(),dir=censusDirectory(),org=decisionOrganizer(),key=censusKey();
 const sig=JSON.stringify([key,data,censusStale,censusError,dir,respuestas.map(r=>r.nombre),org]);
 if(sig===censusRenderKey)return;
 if(!censusStale&&host.contains(document.activeElement)&&document.activeElement?.matches('input,select')&&host.dataset.owner===key)return;
 censusRenderKey=sig;host.dataset.owner=key;host.replaceChildren();
 const el=(tag,text,cls)=>{const a=document.createElement(tag);if(text!=null)a.textContent=text;if(cls)a.className=cls;return a;};
 const btn=(text,fn,icon)=>{const b=el('button',null,'btn-pc');b.type='button';if(icon){const i=el('i',null,'fa-solid '+icon);i.setAttribute('aria-hidden','true');b.append(i,document.createTextNode(' '));}b.append(document.createTextNode(text));b.onclick=fn;return b;};
 const submitted=new Set(respuestas.map(r=>r.nombre.toLowerCase())),expected=CensusModel.count(data,dir),answered=dir.filter(p=>p.account&&submitted.has(p.account.toLowerCase())).length;
 const head=el('div',null,'mt-people-head');head.append(el('div','Censo de invitados','card-title'),btn('Actualizar',()=>refreshCensus(true),'fa-rotate'));host.append(head);
 const stats=el('div',null,'mt-people-stats');for(const [v,label] of [[expected,'Previstos'],[respondentes.length,'Registrados'],[answered,'Con respuesta']]){const k=el('div');k.append(el('strong',String(v)),el('small',label));stats.append(k);}host.append(stats);
 if(!data){host.append(el('p',censusLoading&&!censusError?'Consultando censo…':'Censo no disponible. '+(censusError||'Pulsa Actualizar.')+' No se certifican ganadores.','participants-note'));return;}
 host.append(el('p',data.closed?'Lista confirmada por el organizador.':'Lista no cerrada.','participants-note'));
 if(!org)host.append(el('p','Solo el organizador puede editar el censo.','participants-note'));
 async function edit(action,body,account=null){
  if(!org||host.dataset.busy==='1'||key!==censusKey())return;
  host.dataset.busy='1';const ident={...user};
  try{
   await apiAuth({action:'edit_census',...ident,operation:action,data:body,revision:data.revision});
   if(key!==censusKey())return;
   if(account){
    const next=await apiAuth({action:'get_census',...ident});if(key!==censusKey())return;
    const person=next?.people?.find(p=>p.label.toLowerCase()===body.label.trim().toLowerCase());
    if(!person||person.account)throw Error('El nombre se ha añadido, pero no se pudo identificar para vincularlo. Actualiza el censo.');
    await apiAuth({action:'edit_census',...ident,operation:'link',data:{id:person.id,account},revision:next.revision});
   }
   if(key!==censusKey())return;
   showStatus('Censo actualizado.','ok');
  }catch(e){if(key===censusKey())showStatus(e.message,'err');}
  finally{delete host.dataset.busy;if(key===censusKey()){censusRenderKey='';document.activeElement?.blur();await refreshCensus(true);}}
 }
 function nameEditor(row,p){
  if(row.querySelector('.mt-census-name-editor'))return;
  const box=el('div',null,'mt-census-name-editor'),input=el('input',null,'inp-text');input.type='text';input.maxLength=80;input.value=p.label;input.setAttribute('aria-label','Nombre visible de '+p.label);
  const save=()=>{const name=input.value.trim();if(name&&name!==p.label){edit(p.id?'rename':'add',p.id?{id:p.id,label:name}:{label:name},p.id?null:p.account);}else box.remove();};
  box.append(input,btn('Guardar',save,'fa-check'),btn('Cancelar',()=>box.remove(),'fa-xmark'));row.append(box);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save();}if(e.key==='Escape')box.remove();});input.focus();input.select();
 }
 const free=dir.filter(p=>!p.id&&p.account);
 if(org){const controls=el('div',null,'mt-census-controls mt-people-add'),name=el('input',null,'inp-text');name.placeholder='Nombre del invitado';name.maxLength=80;name.setAttribute('aria-label','Nombre del invitado');const add=()=>{if(name.value.trim())edit('add',{label:name.value});};controls.append(name,btn('Añadir invitado',add,'fa-user-plus'));name.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();add();}});host.append(controls);}
 for(const p of dir){
  const row=el('div',null,'mt-census-row'),info=el('div',null,'mt-people-info'),avatar=el('i',null,'fa-solid '+(p.account?'fa-user-check':'fa-user-clock'));avatar.setAttribute('aria-hidden','true');
  const text=el('div');text.append(el('strong',p.label),el('small',p.account?`${p.account===p.label?'Cuenta registrada':'Cuenta: '+p.account} · ${submitted.has(p.account.toLowerCase())?'Ha respondido':'Sin respuesta'}`:'Sin cuenta vinculada','participants-note'));info.append(avatar,text);row.append(info);
  if(org){
   row.append(btn(p.id?'Renombrar':'Asignar nombre',()=>nameEditor(row,p),'fa-pen'));
   if(p.id&&p.account)row.append(btn('Desvincular',()=>{if(confirm('¿Desvincular esta cuenta? Las preferencias sobre el invitado conservan su identidad.'))edit('unlink',{id:p.id});},'fa-link-slash'));
   if(p.id&&!p.account){
    if(free.length){const select=el('select',null,'inp-text');select.setAttribute('aria-label','Cuenta de '+p.label);select.append(new Option('Vincular cuenta…',''));for(const a of free)select.append(new Option(a.account,a.account));row.append(select,btn('Vincular',()=>{if(select.value&&confirm(`¿Vincular ${p.label} con ${select.value}?`))edit('link',{id:p.id,account:select.value});},'fa-link'));}
    row.append(btn('Retirar',()=>{if(confirm('¿Retirar este invitado del censo? No se eliminará ninguna cuenta ni respuesta.'))edit('remove',{id:p.id});},'fa-user-minus'));
   }
  }
  host.append(row);
 }
 if(org){const cfg=el('div',null,'mt-census-controls'),n=el('input',null,'inp-text');n.type='number';n.min=0;n.max=500;n.value=data.anonymous_count||0;n.setAttribute('aria-label','Invitados todavía sin nombre');const closed=el('input');closed.type='checkbox';closed.checked=!!data.closed;const lab=el('label');lab.append(closed,document.createTextNode(' La lista de invitados está completa'));cfg.append(el('span','Invitados aún sin nombre'),n,lab,btn('Guardar censo',()=>{if(!n.checkValidity()||n.value==='')return;edit('config',{anonymous_count:+n.value,closed:closed.checked});},'fa-floppy-disk'));host.append(cfg);host.append(el('small','Retirar un invitado no borra cuentas ni respuestas. Desvincula primero a quien ya tenga una cuenta asociada. Las cuentas registradas siguen contando aunque no tengan un nombre asignado en el censo.','participants-note'));}
}
