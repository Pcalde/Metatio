// Transporte por carretera. Motor puro, sin llamadas de red; el proveedor entrega matrices.
(function(root){
  const finite=x=>x!==null&&x!==undefined&&String(x).trim()!==''&&Number.isFinite(Number(x));
  const point=p=>p&&finite(p.lat)&&finite(p.lng)&&Math.abs(+p.lat)<=90&&Math.abs(+p.lng)<=180?{lat:+p.lat,lng:+p.lng}:null;
  function minute(s){if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s||''))return null;const [h,m]=s.split(':').map(Number);return h*60+m;}
  function fmt(t){const m=Math.round(t);return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}${m>=1440?' (+1 día)':''}`;}
  const norm=s=>String(s).trim().toLocaleLowerCase('es');
  // Union of closed windows, with one preferred time per participant.
  function mergeWindows(ws){const out=[];for(const [a,b] of ws.slice().sort((x,y)=>x[0]-y[0])){const prev=out.at(-1);if(prev&&a<=prev[1])prev[1]=Math.max(prev[1],b);else out.push([a,b]);}return out;}
  function availability(a){const raw=[{desde:a?.desde,hasta:a?.hasta},...(Array.isArray(a?.franjas)?a.franjas:[])];if(raw.length>9)return null;const ws=raw.map(x=>[minute(x.desde),minute(x.hasta)]);if(ws.some(([lo,hi])=>lo==null||hi==null||lo>hi))return null;const windows=mergeWindows(ws);const ideal=minute(a?.ideal);if(a?.ideal&&ideal==null||ideal!=null&&!windows.some(([lo,hi])=>lo<=ideal&&ideal<=hi))return null;return {windows,from:windows[0][0],to:windows.at(-1)[1],ideal:ideal??Math.round((windows[0][0]+windows[0][1])/2),implicitIdeal:ideal==null};}
  function info(r){const v=r?.value||{},a=v.ruta||{},p=point(a.origen),w=availability(a);if(!p||!w)return null;
    const prefs=new Map();const sources=a.afinidades!=null?[a.afinidades]:[v.prefPasajeros,v.prefCoches];for(const obj of sources)for(const [name,x] of Object.entries(obj||{}))if(Number(x)===1||Number(x)===-1)prefs.set(norm(name),Number(x));
    return {name:r.nombre,p:{...p,texto:a.origen?.texto||''},...w,prefs,flexible:a.flexible===true};}
  const intersect=(ws,other,offset)=>mergeWindows(ws.flatMap(([a,b])=>other.flatMap(([c,d])=>{const lo=Math.max(a,c-offset),hi=Math.min(b,d-offset);return lo<=hi?[[lo,hi]]:[];})));
  const windowsOf=d=>d.windows||[[d.from,d.to]];
  function chooseTime(d,ws){return ws.map(window=>({window,start:clamp(d.ideal,...window)})).sort((a,b)=>Math.abs(a.start-d.ideal)-Math.abs(b.start-d.ideal)||a.start-b.start)[0];}
  function prepare(q,answered,capacity){const cfg=q.config?.routeStudy||{},dest=point(cfg.destino);if(!dest)return {error:'Selecciona el destino en el mapa.'};
    const rows=new Map(answered.map(r=>[r.nombre,r])),missing=[];
    const get=n=>{const i=info(rows.get(n));if(!i)missing.push(n);return i;};
    const drivers=capacity.drivers.map(d=>{const a=get(d.nombre);return a&&{...a,seats:d.plazas};}).filter(Boolean),passengers=capacity.passengers.map(get).filter(Boolean);
    if(missing.length||capacity.unknown.length)return {error:'Faltan ubicaciones u horarios válidos.',missing:[...new Set([...missing,...capacity.unknown])]};
    // Una recogida nunca puede preceder a la salida del conductor. Es una poda necesaria, no una heurística de proximidad de horas ideales.
    const eligible=p=>drivers.some(d=>d.name!==p.name&&d.seats>0&&d.from<=p.to);const active=passengers.filter(eligible),excluded=passengers.filter(p=>!active.includes(p));const flexible=drivers.filter(d=>d.flexible);active.push(...flexible.filter(eligible));
    const points=[dest],byPoint=new Map([[`${dest.lng},${dest.lat}`,0]]);for(const r of [...drivers,...active]){const key=`${r.p.lng},${r.p.lat}`;if(!byPoint.has(key)){byPoint.set(key,points.length);points.push(r.p);}r.idx=byPoint.get(key);}
    const maxKm=finite(cfg.maxExtraKm)?Math.max(0,+cfg.maxExtraKm):15,maxPct=finite(cfg.maxExtraPct)?Math.max(0,+cfg.maxExtraPct):20;
    return {drivers,passengers,flexible,active,excluded,points,maxKm,maxPct,destinationName:cfg.destino?.texto||'Destino',key:JSON.stringify(points.map(p=>[p.lng,p.lat]))};
  }
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const eps=1e-7;
  function evaluate(d,ps,m,p){let km=0,t=0,windows=windowsOf(d),at=d.idx;const times=[];const base=m.distances[d.idx][0];if(!finite(base)||!finite(m.durations[d.idx][0]))return null;
    for(const j of ps){const a=m.distances[at][j.idx],b=m.durations[at][j.idx];if(!finite(a)||!finite(b))return null;km+=+a;t+=b/60;windows=intersect(windows,windowsOf(j),t);if(!windows.length)return null;times.push(t);at=j.idx;}
    const a=m.distances[at][0],b=m.durations[at][0];if(!finite(a)||!finite(b))return null;km+=+a;t+=b/60;const extra=Math.max(0,km-base);if(extra>Math.min(p.maxKm,base*p.maxPct/100)+eps)return null;
    const {start,window}=chooseTime(d,windows),members=[d,...ps];let negative=0,positive=0;for(const x of members)for(const y of members)if(x!==y){const v=x.prefs.get(norm(y.name))||0;negative+=+(v<0);positive+=+(v>0);}
    return {conductor:d.name,base,km,extra,salida:fmt(start),llegada:fmt(start+t),window,windows,start,driverShift:Math.abs(start-d.ideal),passengerShift:ps.reduce((s,j,i)=>s+Math.abs(start+times[i]-j.ideal),0),negative,positive,flex:windows.reduce((sum,[a,b])=>sum+b-a,0),pickups:ps.map((j,i)=>({nombre:j.name,hora:fmt(start+times[i]),shift:Math.abs(start+times[i]-j.ideal)})),members:members.map(x=>x.name),stops:members.map(x=>({name:x.name,p:x.p,from:x.from,to:x.to,windows:windowsOf(x),ideal:x.ideal})),dest:p.points[0],destinationName:p.destinationName};
  }
  const objectives=s=>[s.km,s.extra,s.driverShift,s.passengerShift,s.negative,-s.positive,-s.flex];
  function dominates(a,b){const x=objectives(a),y=objectives(b);return x.every((v,i)=>v<=y[i]+eps)&&x.some((v,i)=>v<y[i]-eps);}
  function coassignment(solutions,names){const counts=names.map(()=>names.map(()=>0));for(const s of solutions)for(const r of s.routes)for(const x of r.members)for(const y of r.members){const i=names.indexOf(x),j=names.indexOf(y);if(i>=0&&j>=0)counts[i][j]++;}return {names,counts,total:solutions.length};}
  function optimize(p,m,opts={}){const limit=opts.limit??50000, frontierLimit=opts.frontierLimit??250;let states=0,truncated=false,frontierTrimmed=false;
    const tick=()=>{if(states>=limit){truncated=true;return false;}states++;return true;};
    if(!m||!['distances','durations'].every(k=>Array.isArray(m[k])&&m[k].length===p.points.length&&m[k].every(r=>Array.isArray(r)&&r.length===p.points.length&&r.every(v=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=0)))))return {status:'indeterminado',reason:'Matriz de rutas incompleta o inválida.'};
    const candidates=[];for(const d of p.drivers){const rs=[];const base=evaluate(d,[],m,p);if(!base)return {status:'indeterminado',reason:'No hay ruta directa por carretera para algún conductor.'};rs.push(base);
      function gen(path){if(truncated||path.length>=d.seats)return;for(const x of p.active){if(x.name===d.name||path.includes(x)||x.to<d.from)continue;if(!tick())return;const next=[...path,x],r=evaluate(d,next,m,p);if(r)rs.push(r); // no podar permutaciones por distancia: las matrices de rutas rápidas no son necesariamente métricas en km.
        gen(next);if(truncated)return;}}
      gen([]);candidates.push(rs);}
    // Incluso si se agota la enumeración, conservar una solución válida y continuar con un presupuesto independiente de combinaciones.
    const enumerationTruncated=truncated;truncated=false;const generated=states;states=0;
    let frontier=[],coverage=-1;const allNames=[...p.drivers,...p.passengers].map(x=>x.name);
    function accept(routes,used){const driving=new Set(routes.map(r=>r.conductor));if((p.flexible||[]).some(d=>!driving.has(d.name)&&!used.has(d.name)))return;const n=p.passengers.filter(x=>used.has(x.name)).length;if(n<coverage)return;if(n>coverage){coverage=n;frontier=[];frontierTrimmed=false;}
      const sum=k=>routes.reduce((s,r)=>s+r[k],0);const s={routes:routes.slice(),flexiblePassengers:(p.flexible||[]).filter(d=>used.has(d.name)).map(d=>d.name),unassigned:p.passengers.filter(x=>!used.has(x.name)).map(x=>x.name),extra:sum('extra'),km:sum('km'),driverShift:sum('driverShift'),passengerShift:sum('passengerShift'),negative:sum('negative'),positive:sum('positive'),flex:sum('flex')};
      if(frontier.some(x=>dominates(x,s)))return;frontier=frontier.filter(x=>!dominates(s,x));frontier.push(s);
      if(frontier.length>frontierLimit){frontierTrimmed=true;frontier.sort(compare);frontier.pop();}}
    function compare(a,b){return a.negative-b.negative||a.driverShift-b.driverShift||a.km-b.km||a.extra-b.extra||a.passengerShift-b.passengerShift||b.positive-a.positive||b.flex-a.flex;}
    accept(candidates.map(r=>r[0]),new Set());
    function visit(i,routes,used){if(!tick())return;if(i===candidates.length){accept(routes,used);return;}
      const d=p.drivers[i];const driving=new Set(routes.map(r=>r.conductor));
      if(!used.has(d.name)){const rs=candidates[i].slice().sort((a,b)=>b.pickups.length-a.pickups.length||a.negative-b.negative||a.driverShift-b.driverShift||a.extra-b.extra);for(const r of rs){if(r.pickups.some(x=>used.has(x.nombre)||driving.has(x.nombre)))continue;const next=new Set(used);r.pickups.forEach(x=>next.add(x.nombre));visit(i+1,[...routes,r],next);if(truncated)return;}}
      if(d.flexible&&!truncated)visit(i+1,routes,used);
    }
    if(candidates.length)visit(0,[],new Set());
    // Agrupar itinerarios con los mismos ocupantes: no contar dos permutaciones como dos acuerdos sociales.
    frontier.sort(compare);const distinct=new Map();for(const s of frontier){const k=JSON.stringify(s.routes.map(r=>r.members.slice().sort()).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));if(!distinct.has(k))distinct.set(k,s);}
    const stable=coassignment([...distinct.values()],allNames);const limited=enumerationTruncated||truncated||frontierTrimmed;
    return {status:limited?'busqueda_limitada':coverage<p.passengers.length?'sin_cobertura_completa':'cobertura_estimada',alternatives:frontier,stable,covered:coverage,total:p.passengers.length,distinct:distinct.size,truncated:limited,states:generated+states,maxKm:p.maxKm,maxPct:p.maxPct,excluded:p.excluded.map(x=>x.name),implicitIdeal:[...p.drivers,...p.passengers].filter(x=>x.implicitIdeal).map(x=>x.name),provider:'ORS',approximate:false};
  }
  // Verificación final de una ruta completa (las piernas pueden diferir de la matriz).
  function verify(car,segments,maxKm,maxPct){
    if(!Array.isArray(segments)||segments.length!==car.stops.length||segments.some(s=>!finite(s.km)||!finite(s.seconds)||s.km<0||s.seconds<0))return {ok:false,reason:'El proveedor no ha devuelto todos los tramos.'};
    const d=car.stops[0];let windows=windowsOf(d),t=0,km=0;const times=[];
    for(let j=0;j<segments.length;j++){const x=segments[j];t+=x.seconds/60;km+=x.km;if(j+1<car.stops.length){const p=car.stops[j+1];windows=intersect(windows,windowsOf(p),t);times.push(t);}}
    const extra=Math.max(0,km-car.base);if(extra>Math.min(maxKm,maxPct*car.base/100)+eps)return {ok:false,reason:'El itinerario completo supera el desvío permitido respecto a la ruta directa de la matriz.',km,extra};
    if(!windows.length)return {ok:false,reason:'El itinerario completo no mantiene una intersección de horarios factible.',km,extra};
    const {start,window}=chooseTime(d,windows);return {ok:true,km,extra,window,windows,salida:fmt(start),llegada:fmt(start+t),driverShift:Math.abs(start-d.ideal),pickups:car.stops.slice(1).map((x,i)=>({nombre:x.name,hora:fmt(start+times[i])}))};
  }
  const resultCache=new Map(),matrixCache=new Map();
  const matrixKey=p=>`${typeof user!=='undefined'?user?.eid||'':''}|${p.key}`;
  function solve(q,answered,capacity){const p=prepare(q,answered,capacity);if(p.error)return {status:'indeterminado',reason:p.error,missing:p.missing};if(!p.drivers.length)return {status:'sin_conductores',reason:p.passengers.length?'No hay conductores disponibles.':'No se necesitan recogidas.'};const mk=matrixKey(p),entry=matrixCache.get(mk);if(!entry)return {status:'pendiente_rutas',reason:'Calcula los itinerarios por carretera para generar propuestas.',points:p.points.length,excluded:p.excluded.map(x=>x.name),matrixKey:mk};
    const k=JSON.stringify([mk,q.id,p.maxKm,p.maxPct,answered.map(r=>[r.nombre,r.value])]);if(!resultCache.has(k)){if(resultCache.size>=25)resultCache.delete(resultCache.keys().next().value);resultCache.set(k,optimize(p,entry));}return resultCache.get(k);}
  function setMatrix(p,m){if(matrixCache.size>=20)matrixCache.delete(matrixCache.keys().next().value);matrixCache.set(matrixKey(p),m);resultCache.clear();}
  function simulateLimits(q,answered,capacity,km,pct){const p=prepare(q,answered,capacity);if(p.error)return {status:'indeterminado',reason:p.error};const m=matrixCache.get(matrixKey(p));if(!m)return {status:'pendiente_rutas',reason:'Calcula primero las rutas actuales.'};return optimize({...p,maxKm:km,maxPct:pct},m);}
  root.RouteStudy={point,minute,fmt,availability,prepare,optimize,solve,setMatrix,matrixKey,dominates,coassignment,verify,simulateLimits};
})(typeof window!=='undefined'?window:globalThis);
