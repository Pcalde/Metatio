// Laboratorio didáctico aislado: no user, API, almacenamiento ni encuestas reales.
(function(root){
  const cases={
    trip:{title:'Escapada rural',names:['Ana','Bruno','Celia','Diego','Eva'],options:['Sierra','Costa'],cost:[65,95],caps:[90,80,120,75,100],prob:[[.95,.5],[.9,.8],[.8,.7],[.6,.95],[.3,.9]],votes:[[3,1],[3,1],[3,1],[1,3],[1,3]],seats:2,need:3},
    dinner:{title:'Cena de grupo',names:['Álex','Blanca','Carla','David','Elena'],options:['Menú A','Menú B'],cost:[22,32],caps:[35,30,40,25,40],prob:[[.9,.8],[.9,.4],[.8,.95],[.95,.3],[.6,.9]],votes:[[3,1],[3,1],[1,3],[3,1],[1,3]],seats:0,need:0}
  };
  const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!=null)e.textContent=txt;if(cls)e.className=cls;return e;};
  const fmt=(n,d=1)=>n.toLocaleString('es-ES',{maximumFractionDigits:d});
  function dist(ps){let d=[1];for(const p of ps){const z=Array(d.length+1).fill(0);d.forEach((v,i)=>{z[i]+=v*(1-p);z[i+1]+=v*p;});d=z;}return d;}
  function mount(host){
    const selector=el('select');selector.setAttribute('aria-label','Escena ficticia');for(const [k,v] of Object.entries(cases)){const o=el('option',v.title);o.value=k;selector.append(o);}const pane=el('div',null,'mg-demo-pane');host.append(selector,pane);
    function draw(){const c=cases[selector.value], p=c.prob.map(r=>r.slice()), votes=c.votes.map(r=>r.slice()), caps=c.caps.slice();let seats=c.seats,quorum=4,absent=false;pane.replaceChildren();
      pane.append(el('p','Cinco personas ficticias. Cambia las respuestas de la primera persona y explora cómo cambian los resultados del grupo. No se guarda ningún dato.','mg-muted'));
      const controls=el('div',null,'mg-demo-controls');const out=el('div',null,'mg-demo-output');
      function range(label,min,max,value,step,change,suffix=''){const l=el('label',null,'mg-range');const title=el('span',label);const val=el('strong',value+suffix);const top=el('span',null,'mg-range-top');top.append(title,val);const input=el('input');input.type='range';input.min=min;input.max=max;input.value=value;input.step=step;input.setAttribute('aria-label',label);input.oninput=()=>{val.textContent=input.value+suffix;change(+input.value);update();};l.append(top,input);controls.append(l);}
      c.options.forEach((name,j)=>range(c.names[0]+' · asistencia si se elige '+name,0,100,Math.round(p[0][j]*100),5,n=>p[0][j]=n/100,'%'));
      const voteLabel=el('label','Opción favorita de '+c.names[0]);const vote=el('select');c.options.forEach((name,j)=>{const o=el('option',name);o.value=j;vote.append(o);});vote.onchange=()=>{votes[0]=[1,1];votes[0][+vote.value]=3;update();};voteLabel.append(vote);controls.append(voteLabel);
      range('Presupuesto máximo de '+c.names[0],0,150,caps[0],5,n=>caps[0]=n,' €');range('Quórum mínimo',1,5,quorum,1,n=>quorum=n);
      if(c.need)range('Plazas libres disponibles',0,5,seats,1,n=>seats=n);
      const a=el('label',null,'mg-demo-check');const cb=el('input');cb.type='checkbox';cb.onchange=()=>{absent=cb.checked;update();};a.append(cb,el('span','Simular que '+c.names[4]+' no asiste'));controls.append(a);
      const reset=el('button','Restablecer ejemplo','btn-pc');reset.type='button';reset.onclick=draw;controls.append(reset);pane.append(controls,out);
      function update(){const ids=c.names.map((_,i)=>i).filter(i=>!absent||i!==4);const qs=[{id:'demo-vote',tipo:'voto-ponderado',label:'Preferencias',opciones:c.options,config:{}},{id:'demo-budget',tipo:'slider',label:'Presupuesto',config:{modelRole:'presupuesto'}}];const rows=ids.map(i=>({nombre:c.names[i],answers:{values:{'demo-vote':Object.fromEntries(c.options.map((o,j)=>[o,votes[i][j]])),'demo-budget':{ideal:Math.min(caps[i],c.cost[0]),max:caps[i]}}}}));const studies=root.DecisionModel.studies(qs,rows,rows);const cap=studies[1].budget.commonCap;const tbl=el('table',null,'mg-demo-table');const tr=el('tr');['Opción','Puntos','Asist. esperada','P(≥ '+quorum+')','Coste'].forEach(x=>tr.append(el('th',x)));const hd=el('thead');hd.append(tr);tbl.append(hd);const bd=el('tbody');c.options.forEach((name,j)=>{const ps=ids.map(i=>p[i][j]);const d=dist(ps);const e=ps.reduce((a,b)=>a+b,0);const s=studies[0].options.find(o=>o.label===name)?.sum??0;const r=el('tr');[name,fmt(s),fmt(e),fmt(100*d.slice(quorum).reduce((a,b)=>a+b,0))+'%',c.cost[j]+' €'].forEach(x=>r.append(el('td',x)));bd.append(r);});tbl.append(bd);const budget=el('p','Tope común declarado: '+cap+' €. '+c.options.map((x,j)=>x+': '+(c.cost[j]<=cap?'dentro del tope':'supera el tope')).join(' · ')+'.');out.replaceChildren(el('h3','Resultados del ejemplo'),tbl,budget);if(c.need)out.append(el('p','Capacidad: '+seats+' plazas libres para '+c.need+' pasajeros. '+(seats>=c.need?'Capacidad suficiente (no garantiza rutas).':'Faltan '+(c.need-seats)+' plazas.')+' Este estudio de capacidad es independiente del escenario de asistencia.'));out.append(el('p','La opción preferida puede no ser la que maximiza asistencia o respeta los topes. Las probabilidades del quórum son condicionales a la opción y presuponen independencia.','mg-muted'));}update();
    }selector.onchange=draw;draw();
  }
  root.MetatioGuideDemo={mount};
})(window);
