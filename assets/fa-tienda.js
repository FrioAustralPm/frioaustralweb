/* tienda.html: muestra los productos que el equipo maneja desde el panel (tabla tienda_productos).
   Lee con la clave pública; la base solo entrega los productos visibles. Si no se puede leer (sin conexión o sin configurar),
   se deja el catálogo que ya trae la página, para que nunca quede vacía por una falla. */
(function () {
  var row = document.querySelector(".shop-row[data-tienda]");
  if (!row || !window.FA || !FA.card) return;
  var BUCKET = "tienda";

  function foto(url, f) {
    if (!f) return "assets/logo-frio-austral.png";
    if (/^media\//.test(f)) return f;
    return url + "/storage/v1/object/public/" + BUCKET + "/" + String(f).split("/").map(encodeURIComponent).join("/");
  }

  fetch("/api/public-config", { headers: { Accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("config")); })
    .then(function (c) {
      if (!c || !c.ready || !c.supabaseUrl || !c.supabaseAnonKey) return Promise.reject(new Error("config"));
      var q = "/rest/v1/tienda_productos?select=nombre,precio,categoria,descripcion,foto&order=orden.asc,created_at.asc";
      return fetch(c.supabaseUrl + q, { headers: { apikey: c.supabaseAnonKey, Authorization: "Bearer " + c.supabaseAnonKey, Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("lectura")); })
        .then(function (lista) { return { url: c.supabaseUrl, lista: lista }; });
    })
    .then(function (d) {
      if (!Array.isArray(d.lista)) return;
      row.innerHTML = d.lista.length
        ? d.lista.map(function (p) { return FA.card({ nombre: p.nombre, precio: p.precio, categoria: p.categoria, desc: p.descripcion, img: foto(d.url, p.foto) }); }).join("")
        : '<p class="lead">No hay productos por ahora.</p>';
      row.setAttribute("data-listo", "1");
    })
    .catch(function () { row.setAttribute("data-listo", "error"); /* se queda el catálogo que ya trae la página */ });
})();
