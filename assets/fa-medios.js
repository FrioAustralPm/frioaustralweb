/* Fotos y videos del sitio cambiados desde el panel del equipo (contenido.html).
   Pide /api/account?action=site-media y reemplaza SOLO los espacios que tienen archivo nuevo (catálogo: assets/fa-slots.js).
   Fallback: si no hay API, no hay archivos subidos o un archivo nuevo no carga, queda el archivo original del sitio. */
(function () {
  var CAT = window.FA_SLOTS;
  if (!CAT) return;
  var overrides = {};          /* nombre de video -> URL (lo usa assets/media.js) */
  window.FA_MEDIA_OVERRIDE = overrides;

  var ready = fetch("/api/account?action=site-media", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : { items: {} }; })
    .catch(function () { return { items: {} }; })
    .then(function (d) { return d && d.items ? d.items : {}; });
  window.FA_MEDIA_READY = Promise.race([ready, new Promise(function (ok) { setTimeout(function () { ok({}); }, 2500); })])
    .then(function (items) { prepare(items); return items; });

  function prepare(items) {
    CAT.SLOTS.forEach(function (s) {
      var o = items[s.id];
      if (o && o.kind === s.kind && /^https?:\/\//.test(o.url || "") && s.video) overrides[s.video] = o.url;
    });
  }

  function hasBase(str, bases) {
    str = String(str || "");
    for (var i = 0; i < bases.length; i++) if (str.indexOf("media/img/" + bases[i] + "-") !== -1) return true;
    return false;
  }

  function swapImage(img, url, alt) {
    if (img.dataset.faOrig) return;
    img.dataset.faOrig = JSON.stringify({ src: img.getAttribute("src"), srcset: img.getAttribute("srcset"), sizes: img.getAttribute("sizes") });
    var pic = img.parentElement && img.parentElement.tagName === "PICTURE" ? img.parentElement : null;
    var removed = [];
    if (pic) pic.querySelectorAll("source").forEach(function (s) { removed.push(s); s.parentNode.removeChild(s); });
    img.removeAttribute("srcset"); img.removeAttribute("sizes");
    img.addEventListener("error", function onErr() {
      img.removeEventListener("error", onErr);
      var o = JSON.parse(img.dataset.faOrig);          /* el archivo nuevo no cargó: vuelve el original */
      if (o.srcset) img.setAttribute("srcset", o.srcset); if (o.sizes) img.setAttribute("sizes", o.sizes);
      img.setAttribute("src", o.src);
      if (pic) removed.forEach(function (s) { pic.insertBefore(s, img); });
      delete img.dataset.faOrig;
    });
    img.src = url;
    if (alt) img.alt = alt;
  }

  function apply(items) {
    var css = "";
    CAT.SLOTS.forEach(function (s) {
      var o = items[s.id];
      if (!o || o.kind !== s.kind || !/^https?:\/\//.test(o.url || "") || s.kind !== "image") return;
      var url = o.url + (o.v ? (o.url.indexOf("?") === -1 ? "?" : "&") + "v=" + encodeURIComponent(o.v) : "");
      if (s.bases) {
        document.querySelectorAll("img").forEach(function (img) {
          if (hasBase(img.getAttribute("src"), s.bases) || hasBase(img.getAttribute("srcset"), s.bases)) swapImage(img, url, o.alt);
        });
        document.querySelectorAll("video[poster]").forEach(function (v) {
          if (hasBase(v.getAttribute("poster"), s.bases)) { v.dataset.faPoster = "1"; v.setAttribute("poster", url); }
        });
      }
      if (s.css) css += s.css + "{background-image:url(\"" + url.replace(/"/g, "%22") + "\")!important}";
    });
    if (css) { var st = document.createElement("style"); st.id = "fa-medios-css"; st.textContent = css; document.head.appendChild(st); }
  }

  function go() { window.FA_MEDIA_READY.then(apply); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
