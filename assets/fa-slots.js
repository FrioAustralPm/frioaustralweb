/* Catálogo de fotos y videos del sitio que el equipo puede cambiar desde el panel (contenido.html).
   Cada "espacio" (slot) agrupa las variantes de una misma imagen (escritorio / móvil / tamaños):
   al subir una foto nueva, reemplaza todas esas variantes.
   - bases: nombres de archivo en media/img/<base>-<ancho>.webp|avif que usa el HTML.
   - css:   selector de una portada que se pinta con background-image (media.css).
   - video: nombre del video en media/video/<nombre>-<calidad>.webm|mp4 (assets/media.js).
   Si un espacio no tiene archivo subido (o falla al cargar), el sitio usa el archivo original de siempre. */
(function (root) {
  const S = (id, kind, page, label, extra) => Object.assign({ id, kind, page, label }, extra);
  const SLOTS = [
    S("inicio-portada-foto", "image", "Inicio", "Portada: foto principal", { bases: ["i1-hero-poster"], hint: "Horizontal, mínimo 1600 px de ancho." }),
    S("inicio-portada-video", "video", "Inicio", "Portada: video de bienvenida", { video: "v1-hero-intro", hint: "MP4 o WebM, hasta 50 MB. Se reproduce sin sonido al abrir la página." }),
    S("inicio-curso", "image", "Inicio", "Sección del curso", { bases: ["i4-curso-v", "i4-curso-sq"] }),
    S("inicio-taller", "image", "Inicio", "Sección del taller", { bases: ["i6-taller-d", "i6-taller-m"] }),
    S("inicio-final", "image", "Inicio", "Fondo del cierre de la página", { bases: ["i9-cta"], hint: "Horizontal, mínimo 1600 px de ancho." }),
    S("taller-portada", "image", "Taller", "Portada de la página", { css: ".fa-ph-t1", bases: ["t1-phead-d", "t1-phead-m"] }),
    S("taller-nosotros", "image", "Taller", "Nosotros: técnico frente a la camioneta", { bases: ["p2-nosotros"] }),
    S("taller-foto-principal", "image", "Taller", "Foto del técnico con la camioneta", { bases: ["t2-gpic"] }),
    S("taller-galeria-1", "image", "Taller", "Galería: conexión al puerto de alta presión", { bases: ["t3-gal-alta"] }),
    S("taller-galeria-2", "image", "Taller", "Galería: técnico mostrando el manifold", { bases: ["t4-gal-vertical"] }),
    S("taller-galeria-3", "image", "Taller", "Galería: acople rápido", { bases: ["t5-gal-acople"] }),
    S("taller-galeria-4", "image", "Taller", "Galería: lectura de presiones", { bases: ["t6-gal-presiones"] }),
    S("taller-galeria-5", "image", "Taller", "Galería: camioneta con mangueras de servicio", { bases: ["p11-galeria-1"] }),
    S("taller-galeria-6", "image", "Taller", "Galería: camioneta con manómetros y cilindro", { bases: ["p12-galeria-2"] }),
    S("taller-equipo", "image", "Taller", "Equipo frente al taller", { bases: ["t7-equipo"] }),
    S("taller-servicio-mantencion", "image", "Taller", "Servicio: mantención de A/C", { bases: ["p8-servicio-mantencion-ac"] }),
    S("taller-servicio-diagnostico", "image", "Taller", "Servicio: diagnóstico con manómetros", { bases: ["p9-servicio-diagnostico"] }),
    S("cursos-portada", "image", "Cursos", "Portada de la página", { css: ".fa-ph-c1", bases: ["c1-phead-d", "c1-phead-m"] }),
    S("cursos-video", "video", "Cursos", "Video de presentación del curso", { video: "v2-curso-ac", hint: "MP4 o WebM, hasta 50 MB." }),
    S("cursos-video-poster", "image", "Cursos", "Imagen previa del video del curso", { bases: ["v2-curso-poster"] }),
    S("cursos-puerto-servicio", "image", "Cursos", "Lo que aprenderás: puerto de servicio", { bases: ["p4-curso-puerto-servicio"] }),
    S("cursos-lectura-presiones", "image", "Cursos", "Lo que aprenderás: lectura de presiones", { bases: ["p5-curso-lectura-presiones"] }),
    S("cursos-scanner", "image", "Cursos", "Lo que aprenderás: escáner", { bases: ["p6-curso-scanner"] }),
    S("cursos-manguera", "image", "Cursos", "Lo que aprenderás: mangueras", { bases: ["p7-curso-manguera"] }),
    S("cursos-parte2", "image", "Cursos", "Curso profesional: escáner de diagnóstico", { bases: ["c3-parte2"] }),
    S("cursos-manifold", "image", "Cursos", "Curso: conexión de mangueras del manifold", { bases: ["c4-manifold"] }),
    S("cursos-boton-ac", "image", "Cursos", "Curso: activación del A/C en el tablero", { bases: ["c4-boton-ac"] }),
    S("comunidad-portada", "image", "Comunidad", "Portada de la página", { css: ".fa-ph-m1", bases: ["m1-phead-d", "m1-phead-m"] }),
    S("comunidad-reel-1", "image", "Comunidad", "Reel: técnico trabajando con manómetros", { bases: ["m2-reel"] }),
    S("comunidad-reel-2", "image", "Comunidad", "Reel: técnico señalando el manifold", { bases: ["m3-reel"] }),
    S("comunidad-reel-3", "image", "Comunidad", "Reel: técnico con pulgares arriba", { bases: ["m4-reel"] }),
    S("comunidad-reel-4", "image", "Comunidad", "Reel: técnico frente a la camioneta", { bases: ["m5-reel"] }),
    S("gratis-portada", "image", "Gratis", "Portada de la página", { css: ".fa-ph-g1", bases: ["g1-phead-d", "g1-phead-m"] }),
    S("planes-portada", "image", "Suscripción", "Portada de la página", { css: ".fa-ph-p1", bases: ["p1-phead-d", "p1-phead-m"] }),
  ];

  const LIMITS = {
    image: { types: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }, maxBytes: 12 * 1024 * 1024, label: "JPG, PNG, WebP o AVIF de hasta 12 MB" },
    video: { types: { "video/mp4": "mp4", "video/webm": "webm" }, maxBytes: 50 * 1024 * 1024, label: "MP4 o WebM de hasta 50 MB" },
  };

  const api = { SLOTS, LIMITS, bySlot: (id) => SLOTS.find((s) => s.id === id) || null };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FA_SLOTS = api;
})(typeof window !== "undefined" ? window : globalThis);
