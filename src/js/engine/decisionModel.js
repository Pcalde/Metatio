// Estudios por pregunta: el identificador de pregunta es el identificador del estudio.
// No inventa fechas ni reúne automáticamente restricciones de ramas diferentes.
(function(root) {
  const E = root.Esquema;
  function role(q) {
    if (!q || q.config?.esEncabezado) return null;
    const c=q.config||{};
    if (c.modelRole === 'preferencia') return 'preferencia';
    if(q.tipo==='radio' && c.conditionalStepper) return 'transporte';
    if(q.tipo==='slider' && (c.modelRole==='presupuesto' || (!c.modelRole && (q.id==='precio'||/^presu_/.test(q.id)||String(c.unit||'').includes('€'))))) return 'presupuesto';
    if(q.tipo==='disponibilidad') return 'fechas';
    if(q.tipo==='horarios') return 'horarios';
    if(q.tipo==='casas'||(q.tipo==='probabilidad-opcion'&&c.modoCasas===true)) return 'alojamiento';
    return 'preferencia';
  }
  function conditions(q, schema) {
    const out=[]; const c=q.config||{};
    if(!c.esEncabezado && c.seccion) {
      const norm=x=>String(x||'').trim().toLowerCase();
      const h=schema.find(x=>x.config?.esEncabezado&&norm(x.config.seccion||x.label)===norm(c.seccion));
      if(h?.config?.mostrarSi?.qid) out.push(h.config.mostrarSi);
    }
    if(c.mostrarSi?.qid) out.push(c.mostrarSi);
    return out;
  }
  // 1 = aplica, 0 = no aplica, null = falta información sobre la rama.
  function applicability(q, ans, schema, trail=new Set()) {
    if(trail.has(q.id)) return null;
    const seen=new Set(trail); seen.add(q.id);
    let unknown=false;
    for(const cond of conditions(q,schema)) {
      const src=schema.find(x=>x.id===cond.qid);
      if(!src){unknown=true;continue;}
      const upstream=applicability(src,ans,schema,seen);
      if(upstream===0)return 0;
      if(upstream===null){unknown=true;continue;}
      const raw=E.rawAnswer(ans,src);
      if(raw==null || (src.tipo==='radio' && !(typeof raw==='object'?raw.estado:raw))){unknown=true;continue;}
      const keys=(Array.isArray(cond.valor)?cond.valor:[cond.valor]).map(String);
      let matches;
      if(src.tipo==='probabilidad-opcion') {
        // Un 0 explícito es dato; una opción sin valorar no lo es.
        const known=keys.filter(k=>raw[k]!=null && Number.isFinite(Number(raw[k])));
        matches=known.some(k=>Number(raw[k])>=0.5);
        if(!matches&&known.length<keys.length){unknown=true;continue;}
      } else if(Array.isArray(raw)) matches=raw.some(v=>keys.includes(String(typeof v==='object'?v?.nombre:v)));
      else if(src.tipo==='radio') matches=keys.includes(String(typeof raw==='object'?raw.estado:raw));
      else if(src.tipo==='voto-ponderado') matches=keys.some(k=>Number(raw[k])>0);
      else {unknown=true;continue;}
      if(cond.no?matches:!matches) return 0;
    }
    return unknown?null:1;
  }
  function cohorts(q, rows, schema) {
    const out={applicable:[],excluded:[],unknown:[],answered:[],missing:[]};
    for(const r of rows){
      const a=applicability(q,r.answers||{},schema);
      if(a===0){out.excluded.push(r);continue;}
      if(a===null){out.unknown.push(r);continue;}
      out.applicable.push(r);
      const v=E.rawAnswer(r.answers||{},q);
      if(v==null || (typeof v==='string'&&!v.trim()) || (q.tipo==='probabilidad-opcion'&&!Object.keys(v||{}).length))out.missing.push(r);
      else out.answered.push({...r,value:E.extractAnswer(r.answers,q)});
    }
    return out;
  }
  function transport(q, answered) {
    const cs=E.getRadioStepperConfig(q); const drivers=[], passengers=[], independent=[], unknown=[];
    for(const r of answered){
      const v=r.value, state=typeof v==='object'?v.estado:v;
      if(state===cs.when){
        const raw=typeof v==='object'?v[cs.key||'plazasLibres']:null;
        const n=Number(raw);
        if(raw==null||!Number.isInteger(n)||n<0){unknown.push(r.nombre);continue;}
        drivers.push({nombre:r.nombre,plazas:n});
      }else if(state==='necesito')passengers.push(r.nombre);
      else if(state==='propio')independent.push(r.nombre);
      else unknown.push(r.nombre);
    }
    const seats=drivers.reduce((s,d)=>s+d.plazas,0);
    return {drivers,passengers,independent,unknown,seats,balance:seats-passengers.length};
  }
  function budget(answered, nonnegative=true){
    const values=[];
    for(const r of answered){const v=r.value, ideal=Number(typeof v==='object'?v.ideal??v.value:v), cap=Number(typeof v==='object'?v.max??v.ideal??v.value:v);
      if(Number.isFinite(ideal)&&Number.isFinite(cap)&&(!nonnegative||ideal>=0)&&cap>=ideal)values.push({nombre:r.nombre,ideal,cap});}
    const med=a=>{const s=a.slice().sort((a,b)=>a-b),i=Math.floor(s.length/2);return s.length?(s.length%2?s[i]:(s[i-1]+s[i])/2):null;};
    return {values,median:med(values.map(v=>v.ideal)),commonCap:values.length?Math.min(...values.map(v=>v.cap)):null};
  }
  function dateStudy(q,answered){
    const days=new Map(); let known=0;
    for(const r of answered){const v=r.value;if(!v||v.noSe)continue;
      const dates=new Set();
      if(q.tipo==='horarios')for(const f of E.dispToMap(v.disponibilidades||[]).keys())dates.add(f);
      else for(const rg of v.rangos||[]){if(!rg.desde||!rg.hasta)continue;const d=new Date(rg.desde+'T00:00:00Z'),end=new Date(rg.hasta+'T00:00:00Z');for(let k=0;d<=end&&k<366;k++,d.setUTCDate(d.getUTCDate()+1)){const f=d.toISOString().slice(0,10);if(!v.soloFinde||isWeekendISO(f))dates.add(f);}}
      if(!dates.size)continue;
      known++; for(const f of dates) days.set(f,(days.get(f)||0)+1);
    }
    return {known,days:[...days].map(([date,count])=>({date,count})).sort((a,b)=>b.count-a.count||a.date.localeCompare(b.date))};
  }
  function optionStudy(q,answered){
    return (q.opciones||[]).map(o=>{const n=E.normalizeOption(q,o),scores=[];
      for(const r of answered){const v=r.value;
        if(q.tipo==='probabilidad-opcion'){if(v&&v[n.key]!=null&&Number.isFinite(Number(v[n.key])))scores.push(Math.max(0,Math.min(1,Number(v[n.key]))));}
        else if(q.tipo==='voto-ponderado')scores.push(Number(v?.[n.key]||0));
        else if(q.tipo==='radio')scores.push(Number((typeof v==='object'?v.estado:v)===n.key));
        else if(Array.isArray(v))scores.push(Number(v.some(x=>(typeof x==='object'?x?.nombre:x)===n.key)));
      }
      const sum=scores.reduce((a,b)=>a+b,0);return {label:n.label,count:scores.length,sum,mean:scores.length?sum/scores.length:null};
    }).sort((a,b)=>(b.mean??-Infinity)-(a.mean??-Infinity));
  }
  function studies(schema, rows, registered=[]){
    const submitted=new Set(rows.map(r=>String(r.nombre).toLowerCase()));
    const pending=registered.filter(r=>!submitted.has(String(r.nombre).toLowerCase())).length;
    return schema.filter(q=>!q.config?.esEncabezado).map(q=>{
      const c=cohorts(q,rows,schema), kind=role(q);
      const s={qid:q.id,label:q.label,section:q.config?.seccion||'',kind,conditional:conditions(q,schema).length>0,applicable:c.applicable.length,answered:c.answered.length,missing:c.missing.length,excluded:c.excluded.length,unknown:c.unknown.length,pending};
      if(kind==='transporte'){s.transport=transport(q,c.answered);const t=s.transport;s.status=(!s.answered||s.missing||s.unknown||s.pending||t.unknown.length)?'indeterminado':t.balance>=0?'factible':'infactible';}
      else if(kind==='presupuesto'||q.tipo==='slider'){s.budget=budget(c.answered,kind==='presupuesto');s.status='descriptivo';}
      else if(kind==='fechas'||kind==='horarios'){s.dates=dateStudy(q,c.answered);s.status='descriptivo';}
      else if(['radio','checkbox','casas','voto-ponderado','probabilidad-opcion'].includes(q.tipo)){s.options=optionStudy(q,c.answered);s.prob=q.tipo==='probabilidad-opcion';s.points=q.tipo==='voto-ponderado';s.status='descriptivo';}
      else {s.status='descriptivo';}
      if(!s.applicable&&s.excluded&&!s.unknown&&!s.pending)s.status='no_aplicable';
      return s;
    });
  }
  function integratedMode(schema){
    const qs=schema.filter(q=>!q.config?.esEncabezado);
    const count=k=>qs.filter(q=>role(q)===k).length;
    if(!count('fechas')&&!count('horarios'))return {enabled:false,reason:'No se está decidiendo una fecha. Los estudios independientes siguen disponibles.'};
    if(['fechas','horarios','transporte','presupuesto','alojamiento'].some(k=>count(k)>1))return {enabled:false,reason:'Hay varios estudios del mismo tipo. No se combinan automáticamente restricciones de problemas diferentes.'};
    if(qs.some(q=>conditions(q,schema).length))return {enabled:false,reason:'Hay ramas condicionales. Los estudios se calculan con sus propios participantes; la optimización conjunta por escenarios aún no está disponible.'};
    return {enabled:true,reason:''};
  }
  root.DecisionModel={role,conditions,applicability,cohorts,studies,integratedMode};
})(typeof window!=='undefined'?window:globalThis);
