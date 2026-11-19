/**
 * API del panel "Mi cuenta" (suscriptor).
 *   POST /api/account?action=signup        {nombre, email, password}   crea la cuenta (sin sesión)
 *   GET  /api/account?action=me                                         estado, cupo, chat, pagos
 *   POST /api/account?action=start         {plan}                       inicia la suscripción (Flow)
 *   POST /api/account?action=message       {body}                       envía una pregunta (respeta cupo)
 *   POST /api/account?action=cancel                                     cancela al final del período
 *   POST /api/account?action=change-plan   {plan}                       cambia de plan
 *   POST /api/account?action=change-card                                registrar otra tarjeta en Flow
 *   GET  /api/account?action=videos                                     videollamadas (Plan Premium)
 *   POST /api/account?action=video-request {when, note}                 pide una videollamada
 *   POST /api/account?action=video-accept  {id}                         acepta la hora que propuso el equipo
 *   POST /api/account?action=video-cancel  {id}                         cancela la solicitud
 *   GET  /api/account?action=community&q=                               preguntas de otros usuarios (Plan Premium, anonimizadas)
 *   GET  /api/account?action=materials                                  material asignado a MI plan (suscripción vigente)
 *   POST /api/account?action=material-url  {id}                         URL firmada (2 min) para descargar un material de mi plan
 *   GET  /api/account?action=site-media                                 (público) fotos y videos del sitio cambiados desde el panel
 */
const flow = require("./_lib/flow");
const { getUserFromToken, rest, enc, adminCreateUser, HttpError } = require("./_lib/supa");
const S = require("./_lib/subs");
const V = require("./_lib/video");
const C = require("./_lib/content");
const ST = require("./_lib/storage");
const { readBody, send, bearer, queryOf, handle } = require("./_lib/http");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function needPost(req) {
  if (req.method !== "POST") throw new HttpError(405, "Método no permitido.", "method");
}

async function signup(req, res) {
  needPost(req);
  const b = await readBody(req);
  const nombre = String(b.nombre || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  if (!nombre) throw new HttpError(400, "Escribe tu nombre.", "nombre");
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Revisa tu email.", "email");
  if (password.length < 8) throw new HttpError(400, "La contraseña debe tener al menos 8 caracteres.", "password");
  const user = await adminCreateUser({ email, password, nombre });
  await S.ensureSubscriber({ id: user.id, email, user_metadata: { nombre } }, nombre);
  send(res, 201, { ok: true });
}

async function me(req, res, user) {
  let sub = await S.ensureSubscriber(user);
  sub = await S.maybeSync(sub);
  const [quota, messages, payments] = await Promise.all([
    S.quotaFor(sub),
    rest(`messages?select=id,sender,body,created_at&user_id=eq.${enc(user.id)}&order=created_at.desc&limit=200`),
    rest(`payments?select=flow_invoice_id,amount,status,subject,period_start,period_end,due_date,paid_at,payment_link,created_at&user_id=eq.${enc(user.id)}&order=created_at.desc&limit=36`),
  ]);
  await rest(`messages?user_id=eq.${enc(user.id)}&sender=eq.equipo&read_by_client=eq.false`, {
    method: "PATCH", prefer: "return=minimal", body: { read_by_client: true },
  }).catch(() => {});
  const plan = sub.plan ? flow.getPlan(sub.plan) : null;
  send(res, 200, {
    ok: true,
    subscriber: S.publicSub(sub),
    canAsk: S.canAsk(sub),
    quota,
    features: plan ? {
      calls: !!plan.calls,
      community: !!plan.community,
      videollamada: !!plan.videollamada,
      ver_preguntas_otros: !!plan.ver_preguntas_otros,
      ebooks_gratis: !!plan.ebooks_gratis,
      biblioteca: !!plan.biblioteca,
    } : { calls: false, community: false, videollamada: false, ver_preguntas_otros: false, ebooks_gratis: false, biblioteca: false },
    messages: (messages || []).reverse(),
    payments: payments || [],
    flowEnv: flow.getFlowConfig().env,
  });
}

async function ensureCustomer(sub) {
  if (sub.flow_customer_id) return sub;
  const c = await flow.createCustomer({ name: sub.nombre || sub.email, email: sub.email, externalId: sub.user_id });
  return S.updateSubscriber(sub.user_id, { flow_customer_id: c.customerId });
}

async function start(req, res, user) {
  needPost(req);
  const b = await readBody(req);
  const planKey = String(b.plan || "");
  if (!flow.getPlan(planKey)) throw new HttpError(400, "Plan no válido.", "bad_plan");
  let sub = await S.ensureSubscriber(user, b.nombre);
  if (sub.flow_subscription_id && sub.status !== "cancelada") {
    sub = await S.syncFromFlow(sub).catch(() => sub);
    if (sub.status !== "cancelada") {
      throw new HttpError(409, "Ya tienes una suscripción. Para cambiar de plan usa el panel Mi cuenta.", "already_subscribed");
    }
  }
  sub = await ensureCustomer(sub);
  if (sub.card_last4) {
    await S.createSubscriptionFor(sub, planKey);
    return send(res, 200, { ok: true, redirect: "mi-cuenta.html?alta=ok" });
  }
  await S.updateSubscriber(sub.user_id, { pending_plan: planKey, status: "pendiente_tarjeta" });
  const reg = await flow.registerCard(sub.flow_customer_id);
  send(res, 200, { ok: true, redirect: `${reg.url}?token=${encodeURIComponent(reg.token)}` });
}

async function message(req, res, user) {
  needPost(req);
  const b = await readBody(req);
  const text = S.cleanMessage(b.body);
  let sub = await S.getSubscriber(user.id);
  sub = await S.maybeSync(sub);
  if (!S.canAsk(sub)) throw new HttpError(403, "Tu suscripción no está activa. Renueva o regulariza el pago para seguir preguntando.", "inactive");
  const q = await S.quotaFor(sub);
  if (!q.unlimited && q.left <= 0) {
    throw new HttpError(403, `Usaste tus ${q.limit} preguntas de este período. Puedes cambiarte al Plan Técnico.`, "quota");
  }
  const rows = await rest("messages", {
    method: "POST", prefer: "return=representation",
    body: [{ user_id: user.id, sender: "cliente", body: text }],
  });
  send(res, 201, { ok: true, message: rows[0], quota: await S.quotaFor(sub) });
}

async function cancel(req, res, user) {
  needPost(req);
  const sub = await S.getSubscriber(user.id);
  if (!sub || !sub.flow_subscription_id || sub.status === "cancelada") throw new HttpError(400, "No tienes una suscripción activa.", "no_sub");
  await flow.cancelSubscription(sub.flow_subscription_id, true);
  const updated = await S.syncFromFlow(sub).catch(() => S.updateSubscriber(user.id, { cancel_at_period_end: true, status: "cancelada_fin_periodo" }));
  send(res, 200, { ok: true, subscriber: S.publicSub(updated) });
}

async function changePlan(req, res, user) {
  needPost(req);
  const b = await readBody(req);
  const planKey = String(b.plan || "");
  const plan = flow.getPlan(planKey);
  if (!plan) throw new HttpError(400, "Plan no válido.", "bad_plan");
  const sub = await S.getSubscriber(user.id);
  if (!sub || !sub.flow_subscription_id || sub.status === "cancelada") throw new HttpError(400, "No tienes una suscripción activa.", "no_sub");
  if (sub.plan === planKey) throw new HttpError(400, "Ya estás en ese plan.", "same_plan");
  await flow.ensureFlowPlan(planKey);
  await flow.changeSubscriptionPlan(sub.flow_subscription_id, plan.flowPlanId);
  let updated = await S.updateSubscriber(user.id, { plan: planKey, flow_plan_id: plan.flowPlanId, synced_at: null });
  updated = await S.syncFromFlow(updated).catch(() => updated);
  send(res, 200, { ok: true, subscriber: S.publicSub(updated) });
}

async function changeCard(req, res, user) {
  needPost(req);
  let sub = await S.ensureSubscriber(user);
  sub = await ensureCustomer(sub);
  let reg;
  try {
    reg = await flow.registerCard(sub.flow_customer_id);
  } catch (err) {
    if (err.name !== "FlowError" || err.code === "not_configured") throw err;
    /* Si Flow no deja registrar con una tarjeta vigente, se quita la anterior y se registra la nueva. */
    await flow.unregisterCard(sub.flow_customer_id);
    await S.updateSubscriber(user.id, { card_brand: null, card_last4: null });
    reg = await flow.registerCard(sub.flow_customer_id);
  }
  send(res, 200, { ok: true, redirect: `${reg.url}?token=${encodeURIComponent(reg.token)}` });
}

async function community(req, res, user) {
  const sub = await S.maybeSync(await S.getSubscriber(user.id));
  const plan = sub && sub.plan ? flow.getPlan(sub.plan) : null;
  if (!plan || !(plan.community || plan.ver_preguntas_otros) || !S.canAsk(sub)) throw new HttpError(403, "El historial de preguntas de otros usuarios es parte del Plan Premium.", "not_premium");
  const q = String(queryOf(req).q || "").trim().toLowerCase().slice(0, 80);
  const rows = await rest("messages?select=user_id,sender,body,created_at&order=user_id.asc,created_at.asc&limit=3000");
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];
    if (m.sender !== "cliente") continue;
    const reply = rows.slice(i + 1).find((x) => x.user_id === m.user_id && x.sender === "equipo");
    const nextQ = rows.slice(i + 1).find((x) => x.user_id === m.user_id && x.sender === "cliente");
    if (!reply || (nextQ && new Date(nextQ.created_at) < new Date(reply.created_at))) continue;
    if (q && !(m.body.toLowerCase().includes(q) || reply.body.toLowerCase().includes(q))) continue;
    items.push({ pregunta: String(m.body || ""), respuesta: String(reply.body || ""), fecha: reply.created_at });
  }
  items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  send(res, 200, { ok: true, items: items.slice(0, 60) });
}

async function requireVideoPlan(user) {
  const sub = await S.maybeSync(await S.getSubscriber(user.id));
  const plan = sub && sub.plan ? flow.getPlan(sub.plan) : null;
  if (!plan || !plan.videollamada || !S.canAsk(sub)) throw new HttpError(403, "Las videollamadas de asesoría son parte del Plan Premium.", "not_premium");
  return sub;
}

async function ownCall(user, id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ""))) throw new HttpError(400, "Solicitud no válida.", "bad_id");
  const rows = await rest(`videocalls?select=*&id=eq.${enc(id)}&user_id=eq.${enc(user.id)}&limit=1`);
  if (!rows || !rows[0]) throw new HttpError(404, "No encontramos esa videollamada.", "not_found");
  return rows[0];
}

async function videos(req, res, user) {
  await requireVideoPlan(user);
  const rows = await rest(`videocalls?select=*&user_id=eq.${enc(user.id)}&order=scheduled_at.desc&limit=20`);
  send(res, 200, { ok: true, items: (rows || []).map((v) => V.publicCall(v)) });
}

async function videoRequest(req, res, user) {
  needPost(req);
  await requireVideoPlan(user);
  const b = await readBody(req);
  const when = V.parseWhen(b.when);
  const open = await rest(`videocalls?select=id&user_id=eq.${enc(user.id)}&status=in.(solicitada,propuesta)&limit=5`);
  if (open && open.length >= 2) throw new HttpError(409, "Ya tienes solicitudes pendientes. Espera la respuesta del equipo.", "too_many");
  const rows = await rest("videocalls", {
    method: "POST", prefer: "return=representation",
    body: [{ user_id: user.id, scheduled_at: when, status: "solicitada", proposed_by: "cliente", room: V.newRoom(), note: V.cleanNote(b.note) }],
  });
  send(res, 201, { ok: true, item: V.publicCall(rows[0]) });
}

async function videoAccept(req, res, user) {
  needPost(req);
  await requireVideoPlan(user);
  const v = await ownCall(user, (await readBody(req)).id);
  if (v.status !== "propuesta") throw new HttpError(400, "No hay una hora propuesta por el equipo para aceptar.", "bad_state");
  const rows = await rest(`videocalls?id=eq.${enc(v.id)}&user_id=eq.${enc(user.id)}`, { method: "PATCH", prefer: "return=representation", body: { status: "confirmada", updated_at: new Date().toISOString() } });
  send(res, 200, { ok: true, item: V.publicCall(rows[0]) });
}

async function videoCancel(req, res, user) {
  needPost(req);
  const v = await ownCall(user, (await readBody(req)).id);
  if (v.status === "cancelada") return send(res, 200, { ok: true, item: V.publicCall(v) });
  const rows = await rest(`videocalls?id=eq.${enc(v.id)}&user_id=eq.${enc(user.id)}`, { method: "PATCH", prefer: "return=representation", body: { status: "cancelada", updated_at: new Date().toISOString() } });
  send(res, 200, { ok: true, item: V.publicCall(rows[0]) });
}

/* ---------- material por plan: solo lo ve y lo descarga quien tiene su plan vigente ---------- */
async function accessiblePlan(user) {
  let sub = await S.getSubscriber(user.id);
  sub = await S.maybeSync(sub);
  if (!S.canAsk(sub)) throw new HttpError(403, "Tu suscripción no está activa. Renueva tu plan para ver el material.", "inactive");
  return sub.plan;
}

async function materials(req, res, user) {
  const plan = await accessiblePlan(user);
  const rows = await rest(`plan_materials?select=id,title,description,category,file_name,content_type,size_bytes,created_at&published=eq.true&plans=cs.${enc(`{${plan}}`)}&order=created_at.desc&limit=500`);
  send(res, 200, { ok: true, plan, items: (rows || []).map((m) => C.publicMaterial(m)) });
}

async function materialUrl(req, res, user) {
  needPost(req);
  const plan = await accessiblePlan(user);
  const id = String((await readBody(req)).id || "");
  if (!C.UUID_RE.test(id)) throw new HttpError(400, "Material no válido.", "bad_id");
  const rows = await rest(`plan_materials?select=storage_path,file_name,plans,published&id=eq.${enc(id)}`);
  const m = rows && rows[0];
  if (!m || !m.published || !(m.plans || []).includes(plan)) throw new HttpError(404, "Ese material no está disponible en tu plan.", "not_found");
  const url = await ST.createSignedDownload(ST.BUCKET_MATERIAL, m.storage_path, { expiresIn: 120, downloadName: m.file_name });
  if (!url) throw new HttpError(404, "El archivo no está disponible por ahora. Avísanos por el chat.", "file_missing");
  send(res, 200, { ok: true, url, fileName: m.file_name, expiresIn: 120 });
}

/* ---------- fotos y videos del sitio (público, sin sesión) ---------- */
async function siteMedia(req, res) {
  let items = {};
  try {
    const rows = await rest("site_media?select=slot,kind,storage_path,alt,updated_at&limit=200");
    for (const r of rows || []) items[r.slot] = { kind: r.kind, url: ST.publicUrl(ST.BUCKET_MEDIA, r.storage_path), alt: r.alt || "", v: r.updated_at };
  } catch (e) { items = {}; /* sin base de datos: el sitio usa sus archivos de siempre */ }
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ ok: true, items }));
}

const ROUTES = { me, start, message, cancel, "change-plan": changePlan, "change-card": changeCard, community, videos, "video-request": videoRequest, "video-accept": videoAccept, "video-cancel": videoCancel, materials, "material-url": materialUrl };

module.exports = handle(async (req, res) => {
  const action = String(queryOf(req).action || "");
  if (action === "signup") return signup(req, res);
  if (action === "site-media") return siteMedia(req, res);
  const fn = ROUTES[action];
  if (!fn) throw new HttpError(404, "Acción no encontrada.", "not_found");
  const user = await getUserFromToken(bearer(req));
  return fn(req, res, user);
});
