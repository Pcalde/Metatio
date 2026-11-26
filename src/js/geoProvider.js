// Única frontera de red del módulo. No contiene claves de ORS.
(function(root){
  const pending=new Map(), cache=new Map();
  async function call(op,data){if(typeof user==='undefined'||!user)throw Error('Abre primero el viaje.');const owner=user,key=JSON.stringify([owner.eid,owner.nombre,op,data]);if(cache.has(key))return cache.get(key);if(pending.has(key))return pending.get(key);
    const work=(async()=>{const headers={'Content-Type':'application/json',apikey:SUPABASE_KEY};if(SUPABASE_KEY.startsWith('eyJ'))headers.Authorization='Bearer '+SUPABASE_KEY;
      const response=await fetch(`${SUPABASE_URL}/functions/v1/metatio-geo`,{method:'POST',headers,body:JSON.stringify({op,...data,eid:owner.eid,nombre:owner.nombre,pin:owner.pinHash}),signal:AbortSignal.timeout(25000)});let j;try{j=await response.json();}catch{throw Error('El servicio geográfico no está disponible.');}if(!response.ok||j.error)throw Error(j.error||j.message||'Servicio geográfico no disponible.');if(user!==owner)throw Error('El viaje ha cambiado.');if(cache.size>=60)cache.delete(cache.keys().next().value);cache.set(key,j);return j;})().finally(()=>pending.delete(key));pending.set(key,work);return work;}
  root.GeoProvider={search:text=>call('search',{text}),matrix:points=>call('matrix',{locations:points.map(p=>[p.lng,p.lat])}),directions:points=>call('directions',{locations:points.map(p=>[p.lng,p.lat])})};
})(window);
