/* Alta de suscripción: un callback o un doble clic no pueden crear dos cobros en Flow. */
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://db.test";
process.env.SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
process.env.FLOW_API_KEY = "k";
process.env.FLOW_SECRET_KEY = "s";
process.env.FLOW_API_URL = "https://sandbox.flow.cl/api";
process.env.SITE_URL = "https://sitio.test";

const USER = { id: "11111111-1111-1111-1111-111111111111", email: "cliente@test.cl" };

let db, creates, createDelayMs;

function json(status, data, headers = {}) {
  return {
    ok: status < 400,
    status,
    statusText: "",
    headers: { get: (h) => headers[h.toLowerCase()] || null },
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function matchRow(row, key, raw) {
  const [op, ...rest] = String(raw).split(".");
  const val = rest.join(".");
  if (op === "eq") return String(row[key]) === val;
  if (op === "neq") return String(row[key]) !== val;
  if (op === "gte") return String(row[key]) >= val;
  if (op === "is" && val === "null") return row[key] == null;
  if (op === "not" && val === "is.null") return row[key] != null;
  if (op === "in") {
    const inner = String(raw).slice(3); // (a,b,c)
    const list = inner.replace(/^\(/, "").replace(/\)$/, "").split(",");
    return list.includes(String(row[key]));
  }
  return true;
}

function reset() {
  creates = 0;
  createDelayMs = 40;
  db = {
    subscribers: [{
      user_id: USER.id,
      email: USER.email,
      nombre: "Cliente",
      plan: null,
      pending_plan: "basico",
      status: "pendiente_tarjeta",
      flow_customer_id: "cus_1",
      flow_subscription_id: null,
      card_last4: null,
    }],
    messages: [],
    payments: [],
    admins: [],
  };
}

global.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const method = init.method || "GET";
  if (u.host === "db.test" && u.pathname === "/auth/v1/user") {
    return init.headers.Authorization === "Bearer good" ? json(200, USER) : json(401, {});
  }
  if (u.host === "db.test" && u.pathname.startsWith("/rest/v1/")) {
    const table = u.pathname.split("/").pop();
    const rows = db[table];
    if (method === "GET") {
      let out = rows.slice();
      for (const [k, v] of u.searchParams) {
        if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
        out = out.filter((r) => matchRow(r, k, v));
      }
      return json(200, out, { "content-range": `0-${out.length}/${out.length}` });
    }
    if (method === "POST") {
      const body = JSON.parse(init.body);
      const added = body.map((r, i) => ({ id: rows.length + i + 1, created_at: new Date().toISOString(), ...r }));
      rows.push(...added);
      return json(201, added);
    }
    if (method === "PATCH") {
      const patch = JSON.parse(init.body);
      let out = rows;
      for (const [k, v] of u.searchParams) out = out.filter((r) => matchRow(r, k, v));
      out.forEach((r) => Object.assign(r, patch));
      return json(200, out);
    }
  }
  if (u.host === "sandbox.flow.cl") {
    if (u.pathname.endsWith("/customer/getRegisterStatus")) {
      return json(200, { status: "1", customerId: "cus_1", creditCardType: "Visa", last4CardDigits: "4242" });
    }
    if (u.pathname.endsWith("/plans/get") || u.pathname.endsWith("/plans/create")) {
      return json(200, { planId: "fa-basico-5000", amount: 5000 });
    }
    if (u.pathname.endsWith("/subscription/create")) {
      creates += 1;
      const id = `sus_${creates}`;
      if (createDelayMs) await new Promise((r) => setTimeout(r, createDelayMs));
      return json(200, { subscriptionId: id, planId: "fa-basico-5000", customerId: "cus_1", status: 1 });
    }
    if (u.pathname.endsWith("/subscription/get")) {
      const id = db.subscribers[0].flow_subscription_id || "sus_1";
      return json(200, {
        subscriptionId: id,
        planId: "fa-basico-5000",
        status: 1,
        morose: 0,
        cancel_at_period_end: 0,
        period_start: "2026-11-01 00:00:00",
        period_end: "2099-12-01 00:00:00",
        invoices: [{ id: 9, status: 1, amount: 5000, created: "2026-11-01 00:00:00" }],
      });
    }
  }
  return json(404, { message: "no mock " + url });
};

const cardReturn = require("../api/flow/card-return");
const account = require("../api/account");

function call(handler, { method = "GET", url, body, token = "good", contentType = "application/json" }) {
  return new Promise((resolve) => {
    const req = {
      method,
      url,
      headers: { authorization: token ? `Bearer ${token}` : "", "content-type": contentType },
      body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      query: Object.fromEntries(new URL(url, "http://x").searchParams),
    };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(data) { resolve({ status: this.statusCode, body: data || null, headers: this.headers, json: (() => { try { return JSON.parse(data); } catch { return null; } })() }); },
    };
    handler(req, res);
  });
}

beforeEach(reset);

test("el POST de Flow a card-return responde 200 (no 303) para que no reintente", async () => {
  createDelayMs = 0;
  const r = await call(cardReturn, { method: "POST", url: "/api/flow/card-return", body: "token=tok", contentType: "application/x-www-form-urlencoded" });
  assert.equal(r.status, 200);
  assert.equal(creates, 1);
  assert.match(r.headers.Location || r.body, /alta=ok/);
  assert.equal(db.subscribers[0].flow_subscription_id, "sus_1");
});

test("dos POST paralelos de card-return solo crean una suscripción en Flow", async () => {
  const p1 = call(cardReturn, { method: "POST", url: "/api/flow/card-return", body: "token=tok", contentType: "application/x-www-form-urlencoded" });
  const p2 = call(cardReturn, { method: "POST", url: "/api/flow/card-return", body: "token=tok", contentType: "application/x-www-form-urlencoded" });
  const [a, b] = await Promise.all([p1, p2]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(creates, 1, "Flow no debe recibir un segundo /subscription/create");
  assert.equal(db.subscribers[0].flow_subscription_id, "sus_1");
});

test("un reintento después del alta no vuelve a crear en Flow", async () => {
  createDelayMs = 0;
  await call(cardReturn, { method: "POST", url: "/api/flow/card-return", body: "token=tok", contentType: "application/x-www-form-urlencoded" });
  const r = await call(cardReturn, { method: "POST", url: "/api/flow/card-return", body: "token=tok", contentType: "application/x-www-form-urlencoded" });
  assert.equal(r.status, 200);
  assert.equal(creates, 1);
});

test("doble clic en start con tarjeta ya guardada solo crea una suscripción", async () => {
  db.subscribers[0].pending_plan = null;
  db.subscribers[0].status = "sin_suscripcion";
  db.subscribers[0].card_last4 = "4242";
  const p1 = call(account, { method: "POST", url: "/api/account?action=start", body: { plan: "basico" } });
  const p2 = call(account, { method: "POST", url: "/api/account?action=start", body: { plan: "basico" } });
  const [a, b] = await Promise.all([p1, p2]);
  const statuses = [a.status, b.status].sort();
  assert.equal(creates, 1, "doble clic no debe abrir dos cobros mensuales");
  assert.ok(statuses.includes(200));
  assert.equal(db.subscribers[0].flow_subscription_id, "sus_1");
});
