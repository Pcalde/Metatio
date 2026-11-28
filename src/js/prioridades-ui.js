let prioridadesLocal={};
const PRIORITY_ICONS={participacion:'fa-users',economia:'fa-wallet',duracion:'fa-clock',fiabilidad:'fa-shield-halved',satisfaccion:'fa-heart'};
function priorityIcon(name){const i=document.createElement('i');i.className='fa-solid '+name;i.setAttribute('aria-hidden','true');return i;}
function readPrioridades(){return {...prioridadesLocal};}
function writePrioridades(v){prioridadesLocal=PlanPrioridades.normalize(v);bindPrioridades();}
function bindPrioridades(){
 const host=$('prioridades-choices');if(!host)return;host.replaceChildren();
 for(const [k,title,description] of PlanPrioridades.criteria){
  const row=document.createElement('fieldset'),legend=document.createElement('legend'),choices=document.createElement('div');
  row.className='mt-priority-field';legend.append(priorityIcon(PRIORITY_ICONS[k]),document.createTextNode(title));const desc=document.createElement('span');desc.className='mt-priority-description';desc.textContent=description;legend.append(desc);choices.className='mt-priority-choices';
  for(const [v,t] of [...PlanPrioridades.levels.map((x,i)=>[String(i),x]),['','No sé']]){
   const lab=document.createElement('label'),inp=document.createElement('input'),chip=document.createElement('span');
   inp.type='radio';inp.name='mt-priority-'+k;inp.value=v;inp.checked=String(prioridadesLocal[k]??'')===v;chip.className='mt-priority-chip';
   if(v==='')chip.classList.add('mt-priority-ns');else{const mark=document.createElement('span');mark.className='mt-priority-meter';mark.setAttribute('aria-hidden','true');for(let j=0;j<4;j++){const bar=document.createElement('b');if(j<+v)bar.className='on';mark.append(bar);}chip.append(mark);}
   chip.append(document.createTextNode(t));lab.append(inp,chip);choices.append(lab);
   inp.onchange=()=>{if(v==='')delete prioridadesLocal[k];else prioridadesLocal[k]=+v;invalidateReadStateCache();triggerSave();};
  }
  row.append(legend,choices);host.append(row);
 }
}
// undefined = untouched suggested value; null = explicit abstention. Never store Infinity.
let quorumLocal=undefined;
function quorumExpected(){const c=typeof censusCurrent==='function'?censusCurrent():null;const n=c?CensusModel.count(c,censusDirectory()):respondentes.length;return {n:Math.max(1,n),confirmed:!!c,closed:!!c?.closed};}
function quorumRange(n,stored){return Math.min(1000,Math.max(1,Math.ceil(1.25*n),stored||0));}
function readQuorum(){return quorumLocal===undefined?Math.min(1000,quorumExpected().n):quorumLocal;}
function quorumIsAutomatic(){return quorumLocal===undefined;}
function writeQuorum(v){quorumLocal=v===undefined?undefined:PlanPrioridades.quorumValue(v);refreshQuorumControl();}
function refreshQuorumControl(){
 const i=$('quorum-personal');if(!i)return;const {n,confirmed,closed}=quorumExpected(),v=readQuorum(),limit=quorumRange(n,v),blank=limit+1;
 i.max=String(blank);i.value=String(v===null?blank:v);const ratio=(+i.value-1)/(blank-1);i.style.setProperty('--pct',(ratio*100)+'%');
 i.setAttribute('aria-valuetext',v===null?'Me da igual, sin preferencia':v+' personas');
 $('quorum-value').textContent=v===null?'∞':v;$('quorum-unit').textContent=v===null?'Sin preferencia':v===1?'persona':'personas';
 $('quorum-expected').textContent=n+(confirmed?' previstos':' registrados (referencia)')+(confirmed&&!closed?' · provisional':'');$('quorum-max-label').textContent=limit;
 $('quorum-marker').style.setProperty('--mark',(Math.min(n,limit)-1)/(blank-1)*100+'%');$('quorum-blank').setAttribute('aria-pressed',String(v===null));
 invalidateReadStateCache();
}
function bindQuorum(){const i=$('quorum-personal');if(!i)return;i.oninput=()=>{quorumLocal=+i.value===+i.max?null:PlanPrioridades.quorumValue(+i.value);refreshQuorumControl();triggerSave();};$('quorum-blank').onclick=()=>{quorumLocal=null;refreshQuorumControl();triggerSave();};refreshQuorumControl();}
