/* Panel del equipo · «Tienda»: agregar, editar, ocultar/mostrar y eliminar productos (nombre, precio, categoría, descripción y foto).
   Los productos viven en la tabla tienda_productos y las fotos en el bucket público «tienda». Escribe solo quien está en public.admins
   (lo hacen cumplir las políticas RLS de la base, no este archivo). tienda.html los muestra con assets/fa-tienda.js. */
(function () {
  const FAP = window.FAP, { $, $$, esc, ico } = FAP, MB = 1048576;
  const TABLA = "tienda_productos", BUCKET = "tienda";
  const clp = (n) => "$" + Number(n).toLocaleString("es-CL");
  const sb = () => FAP.A.client();
  const esSitio = (f) => /^media\//.test(f || "");

  /* errores de la base o del almacenamiento -> palabras simples */
  function msg(e) {
    console.debug("[tienda]", e && e.code, e && e.statusCode, e && e.message);
    const t = String((e && e.message) || ""), c = String((e && (e.code || e.statusCode)) || "");
    if (e instanceof TypeError || /failed to fetch|network|load failed/i.test(t)) return FAP.friendly({ code: "offline" });
    if (/jwt|not authenticated/i.test(t) || c === "401" || c === "PGRST301") { if (FAP.sessionLost) FAP.sessionLost({ status: 401, code: "bad_session" }); return FAP.friendly({ status: 401 }); }
    if (c === "no_permiso" || c === "42501" || c === "403" || /row-level security|permission denied|unauthorized/i.test(t)) return "Esta cuenta no puede cambiar la tienda. Pídele al administrador del sitio que la habilite.";
    if (c === "23514" || c === "22003") return "Revisa los datos: alguno no es válido (por ejemplo, el precio o el largo de un texto).";
    if (c === "413" || /too large|exceeded/i.test(t)) return FAP.friendly({ code: "too_big" }, { max: 5 });
    if (c === "foto") return FAP.friendly({ code: "upload_fail" });
    if (c === "not_found") return FAP.friendly({ code: "not_found" });
    return FAP.friendly({ code: "db_error" });
  }
  const falla = (code) => Object.assign(new Error(code), { code });

  /* ---------- datos ---------- */
  async function leer() {
    const c = await sb();
    const { data, error } = await c.from(TABLA).select("id,nombre,precio,categoria,descripcion,foto,visible,orden,created_at").order("orden").order("created_at");
    if (error) throw error;
    return data || [];
  }
  async function fotoUrl(f) {
    if (!f) return "assets/logo-frio-austral.png";
    if (esSitio(f)) return f;
    return (await sb()).storage.from(BUCKET).getPublicUrl(f).data.publicUrl;
  }
  async function subirFoto(file) {
    const c = await sb(), path = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2)) + ".webp";
    const { error } = await c.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (error) throw error;
    return path;
  }
  async function borrarFoto(f) {
    if (!f || esSitio(f)) return;
    try { await (await sb()).storage.from(BUCKET).remove([f]); } catch (e) { /* si no se pudo, queda una foto suelta; no afecta la tienda */ }
  }
  /* update/delete bloqueados por RLS no dan error: devuelven 0 filas. Se avisa en vez de aparentar que funcionó. */
  async function cambiar(id, valores) {
    const { data, error } = await (await sb()).from(TABLA).update(valores).eq("id", id).select("id");
    if (error) throw error;
    if (!data || !data.length) throw falla("no_permiso");
  }
  async function quitar(id) {
    const { data, error } = await (await sb()).from(TABLA).delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || !data.length) throw falla("no_permiso");
  }

  /* ---------- foto: se achica y pasa a WebP en el navegador ---------- */
  const check = (f) => FAP.checks.revisar(f, FAP.checks.COVER, 12, "una foto JPG, PNG, WebP o AVIF");
  async function prep(f) {
    const r = await FAP.aWebp(f, { max: 1600 });
    if (r.file.size > 5 * MB) throw falla("too_big");
    return { file: r.file, note: r.converted ? `La achicamos: pasó de ${FAP.fsize(r.from)} a ${FAP.fsize(r.to)}.` : "" };
  }
  const prepSeguro = async (f) => { try { return await prep(f); } catch (e) { return { file: f, note: "" }; } };

  /* ---------- precio: acepta «12990», «12.990» o «$12.990»; vacío = sin precio (la tienda muestra «Pronto») ---------- */
  function leerPrecio(t) {
    const s = String(t || "").replace(/[\s$.]/g, "");
    if (!s) return { ok: true, v: null };
    if (!/^\d{1,9}$/.test(s)) return { ok: false };
    return { ok: true, v: Number(s) };
  }

  /* ---------- tarjeta ---------- */
  async function tarjeta(p) {
    const u = await fotoUrl(p.foto);
    return `<article class="fap-card fap-rc fap-tp ${p.visible ? "" : "off"}" data-id="${esc(p.id)}"><div class="fap-thumb"><img src="${esc(u)}" alt="" loading="lazy"></div>
      <div class="body"><div class="top" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="fap-chip ${p.visible ? "ok" : "warn"}">${p.visible ? "Visible" : "Oculto"}</span>${p.categoria ? `<span class="fap-chip">${esc(p.categoria)}</span>` : ""}</div>
        <h4>${esc(p.nombre)}</h4><p class="fap-help" style="height:auto">${p.precio != null ? `<b>${clp(p.precio)}</b>` : "Sin precio: en la tienda se ve «Pronto»"}</p>
        <div class="acts"><button type="button" class="fap-btn sec sm" data-e="${esc(p.id)}">Editar</button><button type="button" class="fap-btn sec sm" data-t="${esc(p.id)}">${p.visible ? "Ocultar" : "Mostrar"}</button><button type="button" class="fap-btn danger sm" data-d="${esc(p.id)}">Eliminar</button></div></div></article>`;
  }

  /* ---------- vista ---------- */
  async function render(main) {
    FAP.setTitle("Tienda");
    let alive = true, items = [];
    const head = `<p class="fap-help" style="max-width:70ch">Aquí manejas los productos que se ven en la página Tienda del sitio. Los cambios se ven en el sitio al instante. Un producto oculto no lo ve nadie; puedes mostrarlo cuando quieras.</p>`;
    main.innerHTML = `<div class="fap-view">${head}<div class="fap-skel" style="height:240px"></div></div>`;
    const host = $(".fap-view", main);

    async function pintar() {
      const cards = await Promise.all(items.map(tarjeta));
      if (!alive) return;
      host.innerHTML = `${head}<div class="fap-head"><h2 style="font-size:22px">${items.length} ${items.length === 1 ? "producto" : "productos"}</h2><div style="display:flex;gap:10px;flex-wrap:wrap"><a class="fap-btn sec" href="tienda.html" target="_blank" rel="noopener">Ver la tienda ${ico("ext")}</a><button type="button" class="fap-btn" data-n>Agregar producto</button></div></div>
        ${items.length ? `<div class="fap-rcs">${cards.join("")}</div>` : `<div class="fap-card"><p><b>Todavía no hay productos.</b></p><p class="fap-help">Agrega el primero con «Agregar producto». Mientras la tienda esté vacía, el sitio muestra «No hay productos por ahora».</p></div>`}`;
      $("[data-n]", host).onclick = () => formulario(null);
      const por = Object.fromEntries(items.map((p) => [p.id, p]));
      $$("[data-e]", host).forEach((b) => (b.onclick = () => formulario(por[b.dataset.e])));
      $$("[data-t]", host).forEach((b) => (b.onclick = () => alternar(por[b.dataset.t], b)));
      $$("[data-d]", host).forEach((b) => (b.onclick = () => eliminar(por[b.dataset.d])));
    }
    async function cargar() {
      try { items = await leer(); await pintar(); }
      catch (e) {
        if (!alive) return;
        host.innerHTML = `${head}<div class="fap-card"><p><b>No se pudo cargar la tienda.</b></p><p class="fap-help">${esc(msg(e))}</p><p style="margin-top:12px"><button type="button" class="fap-btn" data-re>Reintentar</button></p></div>`;
        $("[data-re]", host).onclick = () => { host.innerHTML = `${head}<div class="fap-skel" style="height:240px"></div>`; cargar(); };
      }
    }

    async function alternar(p, b) {
      b.disabled = true;
      try { await cambiar(p.id, { visible: !p.visible }); FAP.aviso(p.visible ? `«${p.nombre}» quedó oculto: nadie lo ve en la tienda.` : `«${p.nombre}» ya se ve en la tienda.`, "ok"); await cargar(); }
      catch (e) { b.disabled = false; FAP.aviso(msg(e), "bad"); }
    }
    async function eliminar(p) {
      const r = await FAP.confirmar({ titulo: "¿Eliminar este producto?", cuerpo: `<p><b>${esc(p.nombre)}</b> se borra de la tienda para siempre, junto con su foto. Si solo quieres que no se vea por ahora, usa «Ocultar».</p>`, ok: "Eliminar producto", peligro: true });
      if (r !== "ok") return;
      try { await quitar(p.id); await borrarFoto(p.foto); FAP.aviso(`«${p.nombre}» se eliminó.`, "ok"); await cargar(); }
      catch (e) { FAP.aviso(msg(e), "bad"); }
    }

    /* ---------- agregar / editar ---------- */
    async function formulario(p) {
      const nuevo = !p, d = FAP.dialog({ title: nuevo ? "Agregar producto" : "Editar producto", side: true, cls: "sheet" });
      const cats = [...new Set(items.map((x) => x.categoria).filter(Boolean))];
      const actual = p ? await fotoUrl(p.foto) : "";
      let pk = null, ocupado = false;
      d.veto = () => { if (ocupado) return false; pk && pk.destroy(); return true; };
      d.body.innerHTML = `<div class="fap-field"><label for="tNom">Nombre</label><input id="tNom" maxlength="120" autocomplete="off" placeholder="Bomba de vacío" value="${esc(p ? p.nombre : "")}"></div>
        <div class="fap-field"><label for="tPre">Precio en pesos (opcional)</label><input id="tPre" inputmode="numeric" autocomplete="off" placeholder="Por ejemplo, 89990" value="${p && p.precio != null ? esc(String(p.precio)) : ""}"><small>Si lo dejas vacío, en la tienda se ve «Pronto».</small></div>
        <div class="fap-field"><label for="tCat">Categoría (opcional)</label><input id="tCat" maxlength="60" list="tCats" autocomplete="off" placeholder="Herramientas" value="${esc(p ? p.categoria : "")}"><datalist id="tCats">${cats.map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist></div>
        <div class="fap-field"><label for="tDes">Descripción (opcional)</label><textarea id="tDes" maxlength="600">${esc(p ? p.descripcion : "")}</textarea></div>
        ${p ? `<div class="fap-field"><span class="fap-lbl">Foto actual</span><div class="fap-thumb" style="width:120px;aspect-ratio:1/1;border-radius:12px"><img src="${esc(actual)}" alt=""></div></div>` : ""}
        <div data-pk></div>
        <label class="fap-check" style="margin-bottom:16px"><input type="checkbox" id="tVis" ${!p || p.visible ? "checked" : ""}> Visible en la tienda</label>
        <p class="fap-err" id="tErr" role="alert" hidden></p>`;
      pk = FAP.picker($("[data-pk]", d.body), { id: "tFoto", label: p ? "Cambiar la foto (opcional)" : "Foto", titulo: "Arrastra la foto aquí o toca para elegirla", boton: "Elegir foto", accept: FAP.checks.accept(FAP.checks.COVER), ayuda: "JPG, PNG, WebP o AVIF. La achicamos y la pasamos a WebP sola.", check, prep: prepSeguro, img: true });
      d.foot.innerHTML = `<button type="button" class="fap-btn sec" data-c>Cancelar</button><button type="button" class="fap-btn" data-g>${nuevo ? "Agregar producto" : "Guardar cambios"}</button>`;
      const er = $("#tErr", d.body), mal = (t, sel) => { er.hidden = false; er.textContent = t; const f = $(sel, d.body); if (f) f.focus(); };
      $("[data-c]", d.foot).onclick = () => { if (!ocupado) { pk.destroy(); d.close(null); } };
      $("[data-g]", d.foot).onclick = async () => {
        const nombre = $("#tNom", d.body).value.trim(), pr = leerPrecio($("#tPre", d.body).value);
        if (!nombre) return mal("Ponle un nombre al producto.", "#tNom");
        if (!pr.ok) return mal("El precio debe ser un número, por ejemplo 89990.", "#tPre");
        er.hidden = true;
        await pk.ready;
        const g = $("[data-g]", d.foot); g.disabled = true; g.textContent = "Guardando…"; ocupado = true;
        const v = { nombre, precio: pr.v, categoria: $("#tCat", d.body).value.trim(), descripcion: $("#tDes", d.body).value.trim(), visible: $("#tVis", d.body).checked };
        let nueva = null;
        try {
          if (pk.file) { try { nueva = await subirFoto(pk.file); } catch (e) { throw Object.assign(e, { code: e.statusCode === "413" ? "413" : "foto" }); } v.foto = nueva; }
          if (nuevo) {
            v.orden = items.reduce((m, x) => Math.max(m, x.orden || 0), 0) + 1;
            const { data, error } = await (await sb()).from(TABLA).insert(v).select("id");
            if (error) throw error;
            if (!data || !data.length) throw falla("no_permiso");
          } else await cambiar(p.id, v);
          if (nueva && p && p.foto !== nueva) await borrarFoto(p.foto);
          ocupado = false; pk.destroy(); d.close("ok");
          FAP.aviso(nuevo ? `«${nombre}» se agregó a la tienda.` : "Cambios guardados.", "ok");
          await cargar();
        } catch (e) {
          ocupado = false; g.disabled = false; g.textContent = nuevo ? "Agregar producto" : "Guardar cambios";
          if (nueva) borrarFoto(nueva);
          mal(msg(e));
        }
      };
      d.focus("#tNom");
    }

    cargar();
    return () => { alive = false; };
  }
  FAP.views.tienda = { render };
})();
