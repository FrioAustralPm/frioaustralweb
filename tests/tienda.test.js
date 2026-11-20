const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

/* Tienda administrable: tabla + bucket con RLS (solo el equipo escribe), sección en el panel y tienda.html leyendo de la base. */
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const MIG = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => /tienda/.test(f)).map((f) => read("supabase/migrations/" + f)).join("\n");

test("la migración de la tienda activa RLS y solo el equipo (public.admins) escribe", () => {
  assert.match(MIG, /create table if not exists public\.tienda_productos/);
  assert.match(MIG, /alter table public\.tienda_productos enable row level security/);
  assert.match(MIG, /for select to anon using \(visible\)/, "el visitante solo ve lo visible");
  for (const cmd of ["insert", "update", "delete"]) assert.match(MIG, new RegExp(`for ${cmd} to authenticated`), cmd);
  assert.ok(!/to anon[^;]*for (insert|update|delete)|for (insert|update|delete) to anon/i.test(MIG), "anon nunca escribe");
  assert.ok(!/\bto public\b(?!\.)/i.test(MIG));
  /* todas las políticas de escritura y las de storage exigen ser admin */
  const pols = MIG.split(/create policy/i).slice(1).filter((p) => /for (insert|update|delete)|storage\.objects/.test(p));
  assert.ok(pols.length >= 5);
  for (const p of pols) assert.match(p, /public\.admins/, p.slice(0, 60));
  assert.match(MIG, /revoke all on public\.tienda_productos from anon, authenticated/);
  assert.match(MIG, /values \('tienda', 'tienda', true, 5242880/);
});

test("la migración carga los 5 productos que ya mostraba tienda.html, sin precio", () => {
  const html = read("tienda.html");
  const vistos = [...html.matchAll(/<b>([^<]+)<\/b><span class="soon mono">Pronto<\/span>/g)].map((m) => m[1]);
  assert.equal(vistos.length, 5);
  for (const n of vistos) assert.ok(MIG.includes(`'${n}'`), n + " no está en la carga inicial");
  for (const f of html.match(/media\/img\/tienda-[a-z-]+-300\.webp/g)) assert.ok(MIG.includes(f), f);
});

test("el panel tiene la sección Tienda y equipo.html carga su script", () => {
  assert.match(read("assets/fa-panel.js"), /\["tienda", "Tienda", "bag"\]/);
  assert.match(read("equipo.html"), /assets\/fa-panel-tienda\.js/);
  const js = read("assets/fa-panel-tienda.js");
  for (const t of ["Agregar producto", "Editar", "Ocultar", "Mostrar", "Eliminar", "¿Eliminar este producto?"]) assert.ok(js.includes(t), t);
  assert.ok(!/hotmart/i.test(js));
  /* update/delete bloqueados por RLS devuelven 0 filas sin error: el panel debe avisar, no aparentar éxito */
  assert.match(js, /\.update\(valores\)\.eq\("id", id\)\.select\("id"\)/);
  assert.match(js, /\.delete\(\)\.eq\("id", id\)\.select\("id"\)/);
});

test("tienda.html lee los productos de la base y, si falla, conserva el catálogo que ya trae", () => {
  const html = read("tienda.html"), js = read("assets/fa-tienda.js");
  assert.match(html, /class="shop-row" data-tienda/);
  assert.match(html, /<script src="assets\/fa-tienda\.js" defer><\/script>/);
  assert.match(js, /\/api\/public-config/);
  assert.match(js, /tienda_productos\?select=nombre,precio,categoria,descripcion,foto&order=orden\.asc,created_at\.asc/);
  assert.match(js, /\.catch\(function \(\) \{[^}]*data-listo/, "ante un error no toca el catálogo");
  assert.ok(!/service_role|SERVICE_ROLE/i.test(js), "el navegador no usa la clave de servidor");
  assert.match(read("assets/fa-store.js"), /hasAttribute\('data-tienda'\)/, "el catálogo antiguo (localStorage) no pisa a la base");
  assert.ok(!/hotmart/i.test(js));
});
