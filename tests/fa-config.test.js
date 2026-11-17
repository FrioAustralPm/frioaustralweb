const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const HOTMART = "https://pay.hotmart.com/M101158236T?hotfeature=51&_hi=eyJjaWQiOiIxNzg1MzgyMDM2NDM2Mzg2MzI4NTI3NDY1NzU1NjUwIiwiYmlkIjoiMTc4NTM4MjAzNjQzNjM4NjMyODUyNzQ2NTc1NTY1MCIsInNpZCI6Ijg3Mjg1YTEyOGI4MDRkNDRiNTQ0MmYzYjMwZjRkOGM1In0=.1794072662815";

test("fa-config.js deja la Academia apagada y usa la URL exacta de Hotmart", () => {
  const cfg = require("../assets/fa-config.js");
  assert.equal(cfg.ACADEMIA_ENABLED, false);
  assert.equal(cfg.HOTMART_CHECKOUT_URL, HOTMART);
});

test("precios de la suscripción en un solo lugar", () => {
  const cfg = require("../assets/fa-config.js");
  assert.deepEqual(Object.fromEntries(Object.entries(cfg.PLANS).map(([k, p]) => [k, p.amount])), { basico: 5000, pro: 10000, premium: 20000 });
  assert.deepEqual(cfg.PLAN_LABELS, { basico: "Plan Aprendiz", pro: "Plan Técnico", premium: "Plan Profesional" });
  assert.equal(cfg.PLANS.basico.label, "Inicial");
  assert.equal(cfg.PLANS.pro.label, "Intermedio");
  assert.equal(cfg.PLANS.premium.label, "Premium");
  assert.equal(cfg.PLANS.basico.questionsPerPeriod, 3);
  assert.equal(cfg.PLANS.pro.questionsPerPeriod, null);
  assert.equal(cfg.PLANS.premium.questionsPerPeriod, null);
  assert.equal(cfg.PLANS.basico.ver_preguntas_otros, false);
  assert.equal(cfg.PLANS.pro.ver_preguntas_otros, false);
  assert.equal(cfg.PLANS.premium.whatsapp, true);
  assert.equal(cfg.PLANS.premium.videollamada, true);
  assert.equal(cfg.PLANS.premium.ver_preguntas_otros, true);
  assert.equal(cfg.PLANS.premium.ebooks_gratis, true);
  assert.equal(cfg.PLANS.premium.biblioteca, true);
  assert.equal(cfg.PLANS.premium.community, true);
  assert.equal(cfg.PLANS.premium.calls, true);
  for (const p of Object.values(cfg.PLANS)) {
    assert.equal(p.hotmartCheckoutUrl, "", "el link de Hotmart del plan debe quedar vacío hasta que Mathias lo pegue");
  }
});

test("los textos de los planes coinciden con lo publicado", () => {
  const cfg = require("../assets/fa-config.js");
  assert.equal(cfg.PLANS.basico.tagline, "Ideal para quienes están comenzando en el mundo del aire acondicionado automotriz.");
  assert.deepEqual(cfg.PLANS.basico.benefits, ["3 preguntas mensuales.", "Acceso a la plataforma digital.", "Resolución de dudas técnicas."]);
  assert.equal(cfg.PLANS.pro.tagline, "Ideal para quienes quieren aprender constantemente y resolver todas sus dudas.");
  assert.deepEqual(cfg.PLANS.pro.benefits, ["Preguntas ilimitadas.", "Acceso a la plataforma digital.", "Resolución de consultas técnicas."]);
  assert.equal(cfg.PLANS.premium.tagline, "Para quienes buscan capacitación continua y acompañamiento personalizado.");
  assert.deepEqual(cfg.PLANS.premium.benefits, [
    "Preguntas ilimitadas.",
    "Consultas mediante WhatsApp.",
    "Videollamadas de asesoría.",
    "Acceso a todas las preguntas realizadas por otros usuarios.",
    "Acceso gratuito a todos los ebooks disponibles.",
    "Biblioteca de conocimientos para estudiar y profundizar.",
  ]);
});

test("el código de la Academia se mantiene en el proyecto", () => {
  for (const file of ["academia.html", "ingresar.html", "mi-academia.html", "leccion.html", "certificado.html", "assets/academia.js", "assets/academia-data.js", "assets/academia-nav.js"]) {
    assert.ok(fs.existsSync(path.join(root, file)), `falta ${file}`);
  }
});

test("todas las páginas cargan fa-config, fa-gate y fa-flow", () => {
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith(".html") && x !== "admin.html")) {
    const html = fs.readFileSync(path.join(root, f), "utf8");
    assert.match(html, /assets\/fa-config\.js/, f);
    assert.match(html, /assets\/fa-gate\.js/, f);
    assert.match(html, /assets\/fa-flow\.js/, f);
  }
});

test("Mi cuenta y el panel del equipo existen y no se indexan", () => {
  for (const f of ["mi-cuenta.html", "equipo.html"]) {
    const html = fs.readFileSync(path.join(root, f), "utf8");
    assert.match(html, /name="robots" content="noindex"/);
    assert.match(html, /assets\/fa-auth\.js/);
  }
});

test("Vercel Hobby: máximo 12 funciones en /api", () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name.startsWith("_") ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [e.name] : []);
  const n = walk(path.join(root, "api")).length;
  assert.ok(n <= 12, `hay ${n} funciones`);
});

test("no hay claves en el repo (.env.example vacío en secretos)", () => {
  const env = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  for (const k of ["FLOW_API_KEY", "FLOW_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]) {
    assert.match(env, new RegExp(`^${k}=$`, "m"), k);
  }
});
