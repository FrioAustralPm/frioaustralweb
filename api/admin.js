/**
 * API del panel del equipo. Requiere sesión de Supabase de un admin
 * (email en ADMIN_EMAILS o fila en la tabla admins).
 *   GET  /api/admin?action=list
 *   GET  /api/admin?action=thread&user=<uuid>
 *   POST /api/admin?action=reply        {user, body}
 *   POST /api/admin?action=sync         {user}
 *   GET  /api/admin?action=videos                     solicitudes de videollamada
 *   POST /api/admin?action=video-confirm  {id}
 *   POST /api/admin?action=video-propose  {id, when, note}
 *   POST /api/admin?action=video-cancel   {id}
 *   POST /api/admin?action=setup-plans  crea en Flow los planes de fa-config.js (idempotente)
 */
const flow = require("./_lib/flow");
const { getUserFromToken, rest, enc, HttpError } = require("./_lib/supa");
const S = require("./_lib/subs");
const V = require("./_lib/video");
const { readBody, send, bearer, queryOf, handle } = require("./_lib/http");

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function list(req, res) {
  const [subs, unread] = await Promise.all([
    rest("subscribers?select=user_id,email,nombre,plan,status,period_end,next_charge_at,cancel_at_period_end,card_last4,created_at&order=created_at.desc&limit=1000"),
    rest("messages?select=user_id,created_at&sender=eq.cliente&read_by_team=eq.false&limit=5000"),
  ]);
  const byUser = {};
  for (const m of unread || []) {
    const u = (byUser[m.user_id] = byUser[m.user_id] || { n: 0, last: null });
    u.n++;
    if (!u.last || m.created_at > u.last) u.last = m.created_at;
  }
  const items = (subs || []).map((s) => ({
    ...s,
    planName: s.plan ? (flow.getPlan(s.plan) || {}).name : null,
    unread: (byUser[s.user_id] || {}).n || 0,
    lastUnreadAt: (byUser[s.user_id] || {}).last || null,
    canAsk: S.canAsk(s),
  }));
  const active = items.filter((s) => s.canAsk);
  const mrr = active.reduce((acc, s) => acc + ((flow.getPlan(s.plan) || {}).amount || 0), 0);
  send(res, 200, { ok: true, items, stats: { total: items.length, active: active.length, unread: Object.values(byUser).reduce((a, b) => a + b.n, 0), mrr }, flowEnv: flow.getFlowConfig().env });
}

function userParam(v) {
  const id = String(v || "");
  if (!UUID_RE.test(id)) throw new HttpError(400, "Suscriptor no válido.", "bad_user");
  return id;
}

async function thread(req, res) {
  const id = userParam(queryOf(req).user);
  const sub = await S.getSubscriber(id);
  if (!sub) throw new HttpError(404, "Suscriptor no encontrado.", "not_found");
  const [messages, payments, quota] = await Promise.all([
    rest(`messages?select=id,sender,body,created_at&user_id=eq.${enc(id)}&order=created_at.asc&limit=500`),
    rest(`payments?select=flow_invoice_id,amount,status,period_start,period_end,paid_at,created_at&user_id=eq.${enc(id)}&order=created_at.desc&limit=24`),
    S.quotaFor(sub),
  ]);
  await rest(`messages?user_id=eq.${enc(id)}&sender=eq.cliente&read_by_team=eq.false`, {
    method: "PATCH", prefer: "return=minimal", body: { read_by_team: true },
  });
  send(res, 200, { ok: true, subscriber: { user_id: id, ...S.publicSub(sub) }, canAsk: S.canAsk(sub), quota, messages, payments });
}

async function reply(req, res, admin) {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido.", "method");
  const b = await readBody(req);
  const id = userParam(b.user);
  const text = S.cleanMessage(b.body);
  const sub = await S.getSubscriber(id);
  if (!sub) throw new HttpError(404, "Suscriptor no encontrado.", "not_found");
  const rows = await rest("messages", {
    method: "POST", prefer: "return=representation",
    body: [{ user_id: id, sender: "equipo", body: text, author_id: admin.id, read_by_team: true }],
  });
  await rest(`messages?user_id=eq.${enc(id)}&sender=eq.cliente&read_by_team=eq.false`, {
    method: "PATCH", prefer: "return=minimal", body: { read_by_team: true },
  });
  send(res, 201, { ok: true, message: rows[0] });
}

async function sync(req, res) {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido.", "method");
  const b = await readBody(req);
  const sub = await S.getSubscriber(userParam(b.user));
  if (!sub) throw new HttpError(404, "Suscriptor no encontrado.", "not_found");
  const updated = await S.syncFromFlow(sub);
  send(res, 200, { ok: true, subscriber: S.publicSub(updated) });
}

async function setupPlans(req, res) {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido.", "method");
  const plans = await flow.ensureAllFlowPlans();
  send(res, 200, { ok: true, plans, flowEnv: flow.getFlowConfig().env });
}

async function whoami(req, res, admin) {
  send(res, 200, { ok: true, email: admin.email });
}

async function getCall(id) {
  if (!UUID_RE.test(String(id || ""))) throw new HttpError(400, "Solicitud no válida.", "bad_id");
  const rows = await rest(`videocalls?select=*&id=eq.${enc(id)}&limit=1`);
  if (!rows || !rows[0]) throw new HttpError(404, "No encontramos esa videollamada.", "not_found");
  return rows[0];
}

async function patchCall(id, body) {
  const rows = await rest(`videocalls?id=eq.${enc(id)}`, { method: "PATCH", prefer: "return=representation", body: { ...body, updated_at: new Date().toISOString() } });
  return rows[0];
}

async function videos(req, res) {
  const [rows, subs] = await Promise.all([
    rest("videocalls?select=*&status=neq.cancelada&order=scheduled_at.asc&limit=200"),
    rest("subscribers?select=user_id,nombre,email&limit=1000"),
  ]);
  const who = Object.fromEntries((subs || []).map((s) => [s.user_id, s]));
  const items = (rows || []).filter((v) => v.status !== "cancelada").map((v) => ({
    ...V.publicCall(v), user_id: v.user_id, nombre: (who[v.user_id] || {}).nombre || "", email: (who[v.user_id] || {}).email || "",
  }));
  send(res, 200, { ok: true, items });
}

async function videoConfirm(req, res) {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido.", "method");
  const v = await getCall((await readBody(req)).id);
  if (v.status !== "solicitada") throw new HttpError(400, "Solo se puede confirmar una hora que propuso el cliente.", "bad_state");
  send(res, 200, { ok: true, item: V.publicCall(await patchCall(v.id, { status: "confirmada" })) });
}

async function videoPropose(req, res) {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido.", "method");
  const b = await readBody(req);
  const v = await getCall(b.id);
  if (v.status === "cancelada") throw new HttpError(400, "Esa videollamada está cancelada.", "bad_state");
  const item = await patchCall(v.id, { status: "propuesta", proposed_by: "equipo", scheduled_at: V.parseWhen(b.when), note: V.cleanNote(b.note) });
  send(res, 200, { ok: true, item: V.publicCall(item) });
}

async function videoCancel(req, res) {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido.", "method");
  const v = await getCall((await readBody(req)).id);
  send(res, 200, { ok: true, item: V.publicCall(await patchCall(v.id, { status: "cancelada" })) });
}

const ROUTES = { list, thread, reply, sync, "setup-plans": setupPlans, whoami, videos, "video-confirm": videoConfirm, "video-propose": videoPropose, "video-cancel": videoCancel };

module.exports = handle(async (req, res) => {
  const fn = ROUTES[String(queryOf(req).action || "")];
  if (!fn) throw new HttpError(404, "Acción no encontrada.", "not_found");
  const user = await getUserFromToken(bearer(req));
  if (!(await S.isAdmin(user))) throw new HttpError(403, "Esta cuenta no tiene acceso al panel del equipo.", "not_admin");
  return fn(req, res, user);
});
