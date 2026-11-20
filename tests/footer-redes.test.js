const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html"));

function footers(html) {
  return [...html.matchAll(/<footer class="footer">[\s\S]*?<\/footer>/g)].map((m) => m[1] || m[0]);
}

function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

test("en Redes, el Instagram de la empresa dice 'Instagram de Frío Austral' y no se confunde con el de Guillermo", () => {
  let seen = 0;
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    for (const foot of footers(html)) {
      if (!foot.includes("instagram.com/frioaustralspa")) continue;
      seen++;
      assert.match(foot, />Instagram de Frío Austral<\/a>/, file);
      assert.doesNotMatch(foot, /frioaustralspa">Instagram<\/a>/, file);
      assert.match(foot, />Instagram de Guillermo<\/a>/, file);
    }
  }
  assert.ok(seen >= 8, "se revisaron los pies de las páginas públicas");
});

test("el pie público y el JSON-LD solo publican el teléfono del taller (…5601), no el de consultas premium (…9188)", () => {
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    for (const foot of footers(html)) {
      assert.doesNotMatch(foot, /9188/, `${file}: el pie no debe mostrar el número …9188`);
      if (/tel:|wa\.me/.test(foot)) {
        assert.match(foot, /5601/, `${file}: el pie debe conservar el teléfono del taller …5601`);
      }
    }
    for (const raw of ldBlocks(html)) {
      const data = JSON.parse(raw);
      const tels = [];
      (function walk(o) {
        if (o && typeof o === "object") {
          if (typeof o.telephone === "string") tels.push(o.telephone);
          Object.values(o).forEach(walk);
        }
      })(data);
      for (const t of tels) {
        assert.ok(!t.endsWith("9188"), `${file}: JSON-LD no debe publicar el número …9188`);
      }
    }
  }
});
