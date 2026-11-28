// ── API (Supabase RPC) ──────────────────────────────────────────────────────

const ident = b => ({ p_eid: b.eid, p_nombre: b.nombre, p_pin: b.pinHash });

const RPC = {
  get_census:{fn:"get_trip_census",args:b=>ident(b)},
  edit_census:{fn:"edit_trip_census",args:b=>({...ident(b),p_action:b.operation,p_data:b.data,p_revision:b.revision})},
  get_decisions: {fn:'get_trip_decisions',args:b=>ident(b)},
  set_decision: {fn:'set_trip_decision',args:b=>({...ident(b),p_qid:b.qid,p_value:b.value})},
  rename_trip: { fn: 'rename_trip', args: b => ({ ...ident(b), p_titulo: b.titulo }) },
  set_attendance: { fn: 'set_attendance', args: b => ({ ...ident(b), p_enabled: b.enabled }) },
  open_session: { fn: 'open_session', args: b => ident(b) },
  revoke_session: { fn: 'revoke_session', args: b => ({ p_token: b.token }) },
  revoke_all_sessions: { fn: 'revoke_all_sessions', args: b => ident(b) },
  join_invited: { fn: 'join_invited', args: b => ({ ...ident(b), p_invite: b.invite }) },
  manage_invites: { fn: 'manage_invites', args: b => ({ ...ident(b), p_revoke: !!b.revoke }) },
  set_recovery: { fn: 'set_recovery', args: b => ({ ...ident(b), p_code: b.code }) },
  recover_access: { fn: 'recover_access', args: b => ({ p_eid: b.eid, p_nombre: b.nombre, p_code: b.code, p_new_pin: b.newPin }) },
  restore_question: { fn: 'restore_question', args: b => ({ ...ident(b), p_qid: b.qid || null }) },
  transfer_organizer: { fn: 'transfer_organizer', args: b => ({ ...ident(b), p_target: b.target }) },
  crear_encuesta:  { fn: 'crear_encuesta_publica', args: b => ({ ...ident(b), p_plantilla: b.plantilla || 'vacia', p_titulo: b.titulo || 'Cuestionario de viaje' }) },
  entrar:          { fn: 'entrar',          args: b => ident(b) },
  all:             { fn: 'get_all',         args: b => ident(b) },
  delete_participant: { fn: 'delete_participant', args: b => ({ ...ident(b), p_participante: b.participant }) },
  submit_response: { fn: 'submit_response', args: b => ({ ...ident(b), p_answers: b.answers }) },
  vote_ausencia:   { fn: 'vote_ausencia',   args: b => ({ ...ident(b), p_candidatos: b.candidatos, p_prob: b.prob_propia }) },
  add_pregunta:    { fn: 'add_pregunta',    args: b => ({ ...ident(b), p_pregunta: b.pregunta }) },
  edit_pregunta:   { fn: 'edit_pregunta',   args: b => ({ ...ident(b), p_qid: b.questionId, p_label: b.label, p_config: b.config || null }) },
  delete_pregunta: { fn: 'delete_pregunta', args: b => ({ ...ident(b), p_qid: b.questionId }) },
  add_opcion:      { fn: 'add_opcion',      args: b => ({ ...ident(b), p_qid: b.questionId, p_opcion: b.opcion }) },
  edit_opcion:     { fn: 'edit_opcion',     args: b => ({ ...ident(b), p_qid: b.questionId, p_old_optkey: b.oldOptKey, p_nueva_opcion: b.nuevaOpcion }) },
  delete_opcion:   { fn: 'delete_opcion',   args: b => ({ ...ident(b), p_qid: b.questionId, p_optkey: b.optKey }) },
  add_proscontra:  { fn: 'add_proscontra',  args: b => ({ ...ident(b), p_qid: b.questionId, p_optkey: b.optKey, p_tipo: b.tipo, p_texto: b.texto }) },
  add_debate:      { fn: 'add_debate',      args: b => ({ ...ident(b), p_tipo: b.tipo, p_texto: b.texto, p_qid: b.qid || null, p_optkey: b.optKey || null, p_parent: b.parentId || null }) },
  vote_debate:     { fn: 'vote_debate',     args: b => ({ ...ident(b), p_id: b.id }) },
  resolve_debate:  { fn: 'resolve_debate',  args: b => ({ ...ident(b), p_id: b.id, p_resuelto: b.resuelto }) },
  edit_proscontra:   { fn: 'edit_proscontra',   args: b => ({ ...ident(b), p_id: b.id, p_texto: b.texto }) },
  delete_proscontra: { fn: 'delete_proscontra', args: b => ({ ...ident(b), p_id: b.id }) },
  vote_proscontra:   { fn: 'vote_proscontra',   args: b => ({ ...ident(b), p_id: b.id, p_voto: b.voto }) },
  reordenar_preguntas: { fn: 'reordenar_preguntas', args: b => ({ ...ident(b), p_ids: b.ids }) },
  update_profile:    { fn: 'update_profile',    args: b => ({ ...ident(b), p_nuevo_nombre: b.nuevoNombre || null, p_nuevo_pin: b.nuevoPinHash || null }) },
};

function unwrap(data) {
  if (data && data.error) {
    const error = new Error(data.error); error.definitive = true; throw error;
  }
  return data;
}

async function api(body) {
  // El pinHash puede venir en el cuerpo (flujo normal) o inyectarse en un
  // reintento con credencial rotada por apiAuthenticated().
  const def = RPC[body.action];
  if (!def) throw new Error('Acción desconocida: ' + body.action);

  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  if (SUPABASE_KEY.startsWith('eyJ')) headers.Authorization = 'Bearer ' + SUPABASE_KEY;

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${def.fn}`, {
      method: 'POST', headers, body: JSON.stringify(def.args(body)),
    });
  } catch (e) {
    throw new Error('Sin conexión con el servidor (comprueba SUPABASE_URL y tu red)');
  }
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const j = await res.json(); msg = j.message || j.error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return unwrap(await res.json());
}

// Envoltura de todas las llamadas autenticadas: reintenta una vez con la
// credencial de sesión si el servidor rechaza el pinHash en memoria.
async function apiAuth(body) {
  if (!user || body.eid !== user.eid || body.nombre.toLowerCase() !== user.nombre.toLowerCase()) {
    return api(body);
  }
  return apiAuthenticated(pin => {
    const b = { ...body, pinHash: pin || body.pinHash };
    return api(b);
  });
}

const apiPost = apiAuth;
