// Estudio de recogidas. Distancia geodésica y velocidad constante: NO es un navegador.
(function(root){
  const finite=x=>x!==null&&x!==undefined&&String(x).trim()!==''&&Number.isFinite(Number(x));
  function point(p){return p&&finite(p.lat)&&finite(p.lng)&&Math.abs(+p.lat)<=90&&Math.abs(+p.lng)<=180?{lat:+p.lat,lng:+p.lng}:null;}
  function minute(s){if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s||''))return null;const [h,m]=s.split(':').map(Number);return h*60+m;}
  function distance(a,b){const r=Math.PI/180,x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lng-a.lng)*r/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,x))));}
  function info(r){const p=point(r?.value?.ruta?.origen),from=minute(r?.value?.ruta?.desde),to=minute(r?.value?.ruta?.hasta);return p&&from!=null&&to!=null&&from<=to?{name:r.nombre,p,from,to}:null;}
  function fmt(t){return `${String(Math.floor(t/60)%24).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}${t>=1440?' (+1 día)':''}`;}
  function solve(q,answered,capacity,opts={}){
    const cfg=q.config?.routeStudy||{}, dest=point(cfg.destino), maxKm=finite(cfg.maxExtraKm)?Math.max(0,+cfg.maxExtraKm):15,maxPct=finite(cfg.maxExtraPct)?Math.max(0,+cfg.maxExtraPct):20,speed=finite(cfg.speed)&&+cfg.speed>0?+cfg.speed:60;
    if(!dest)return {status:'indeterminado',reason:'Faltan coordenadas del destino del desplazamiento.'};
    const rows=new Map(answered.map(r=>[r.nombre,r])), missing=[];
    const drivers=capacity.drivers.map(d=>{const i=info(rows.get(d.nombre));if(!i){missing.push(d.nombre);return null;}return {...i,seats:d.plazas,base:distance(i.p,dest)};}).filter(Boolean);
    const passengers=capacity.passengers.map(n=>{const i=info(rows.get(n));if(!i)missing.push(n);return i;}).filter(Boolean);
    if(missing.length||capacity.unknown.length)return {status:'indeterminado',reason:'Faltan puntos de encuentro u horarios válidos.',missing:[...new Set([...missing,...capacity.unknown])]};
    function evaluate(d,ps){
      if(ps.length>d.seats)return null;
      let km=0,time=d.from,at=d.p;const pickups=[];
      for(const p of ps){const leg=distance(at,p.p);km+=leg;time=Math.max(time+leg/speed*60,p.from);if(time>p.to+1e-8)return null;pickups.push({nombre:p.name,hora:fmt(Math.ceil(time))});at=p.p;}
      const last=distance(at,dest);km+=last;time+=last/speed*60;const extra=Math.max(0,km-d.base);
      if(extra>Math.min(maxKm,d.base*maxPct/100)+1e-8)return null;
      return {conductor:d.name,base:d.base,km,extra,salida:fmt(d.from),llegada:fmt(Math.ceil(time)),pickups};
    }
    // Enumerar todas las asignaciones y permutaciones por inserción. Un estado
    // parcial con desvío excesivo se puede podar por desigualdad triangular.
    // No podar por horario parcial: insertar otra parada no mejora la llegada
    // con métrica triangular, pero evaluamos todas las hojas igualmente.
    let states=0,truncated=false,best=null;const limit=opts.limit||50000;
    const routes=drivers.map(()=>[]),unassigned=[];
    function visit(i){
      if(++states>limit){truncated=true;return;}
      if(best&&unassigned.length>best.unassigned.length)return;
      if(i===passengers.length){const result=drivers.map((d,j)=>evaluate(d,routes[j]));if(result.some(x=>!x))return;const cost=result.reduce((s,r)=>s+r.extra,0);if(!best||unassigned.length<best.unassigned.length||(unassigned.length===best.unassigned.length&&cost<best.extra-1e-8))best={routes:result,unassigned:unassigned.slice(),extra:cost};return;}
      const p=passengers[i];for(let j=0;j<drivers.length&&!truncated;j++)if(routes[j].length<drivers[j].seats){for(let k=0;k<=routes[j].length&&!truncated;k++){routes[j].splice(k,0,p);if(evaluate(drivers[j],routes[j]))visit(i+1);routes[j].splice(k,1);}}
      if(!truncated){unassigned.push(p.name);visit(i+1);unassigned.pop();}
    }
    // Siempre existe la solución de no recoger a nadie.
    best={routes:drivers.map(d=>evaluate(d,[])),unassigned:passengers.map(p=>p.name),extra:0};visit(0);
    return {...best,status:truncated?'busqueda_limitada':best.unassigned.length?'sin_cobertura_completa':'cobertura_estimada',truncated,states:Math.min(states,limit),maxKm,maxPct,speed,approximate:true};
  }
  root.RouteStudy={solve,point,minute,distance};
})(typeof window!=='undefined'?window:globalThis);
