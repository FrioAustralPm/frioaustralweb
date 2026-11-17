/**
 * url_return de customer/register: Flow hace POST con "token" cuando el cliente termina de registrar la tarjeta.
 * Si había un plan pendiente, aquí se crea la suscripción mensual (cobro automático).
 *
 * Flow reintenta el callback si no recibe HTTP 200. Un 303 se trata como fallo y el reintento
 * (o un POST paralelo del navegador) llamaba a /subscription/create otra vez: dos cobros mensuales
 * y un subscriptionId huérfano que el panel no puede cancelar.
 */
const flow = require("../_lib/flow");
const { rest, enc, HttpError } = require("../_lib/supa");
const S = require("../_lib/subs");
const { readBody, redirect, queryOf } = require("../_lib/http");

function finish(res, req, location) {
  if (req.method === "GET") return redirect(res, location);
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const safe = String(location).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  res.end(
    `<!doctype html><meta http-equiv="refresh" content="0;url=${safe}"><script>location.replace(${JSON.stringify(location)})</script>`
  );
}

module.exports = async (req, res) => {
  const site = flow.siteUrl();
  const go = (q) => finish(res, req, `${site}/mi-cuenta.html?${q}`);
  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    const token = String(body.token || queryOf(req).token || "").trim();
    if (!token) return go("tarjeta=error");
    const reg = await flow.getRegisterStatus(token);
    const rows = await rest(`subscribers?select=*&flow_customer_id=eq.${enc(reg.customerId || "")}`);
    let sub = rows && rows[0];
    if (!sub) return go("tarjeta=error");
    if (String(reg.status) !== "1") {
      if (sub.pending_plan && !sub.flow_subscription_id) await S.updateSubscriber(sub.user_id, { status: "sin_suscripcion" });
      return go("tarjeta=rechazada");
    }
    sub = await S.updateSubscriber(sub.user_id, {
      card_brand: reg.creditCardType || null,
      card_last4: reg.last4CardDigits || null,
    });
    const planKey = sub.pending_plan;
    const plan = planKey ? flow.getPlan(planKey) : null;
    const alreadyLive = sub.flow_subscription_id && sub.status !== "cancelada" && sub.status !== "pendiente" && sub.status !== "pendiente_tarjeta";
    if (!plan || alreadyLive) return go(sub.flow_subscription_id ? "alta=ok" : "tarjeta=ok");
    try {
      await S.createSubscriptionFor(sub, plan.key);
    } catch (err) {
      if (err instanceof HttpError && err.code === "alta_en_curso") return go("alta=ok");
      if (err instanceof HttpError && err.code === "already_subscribed") return go("alta=ok");
      throw err;
    }
    return go("alta=ok");
  } catch (err) {
    console.error("[card-return]", err && err.code, err && err.message);
    return go("tarjeta=error");
  }
};
