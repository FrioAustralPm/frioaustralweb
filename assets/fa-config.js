/* Configuración pública de Frío Austral (la usan el navegador y las funciones de /api).
   Para reactivar la Academia: cambia ACADEMIA_ENABLED a true y vuelve a publicar.
   El código de la Academia (páginas, login, temario, admin) se mantiene en el repo.

   PRECIOS Y TEXTOS DE LA SUSCRIPCIÓN: se cambian SOLO aquí (PLANS).
   Las claves internas (basico, pro, premium) no se renombran: las usa Flow, la base
   de datos y las suscripciones ya creadas.

   Flow no deja cambiar el monto de un plan con suscriptores, así que cada monto
   genera su propio plan en Flow (id "fa-<plan>-<monto>"). Al cambiar un precio,
   los nuevos suscriptores toman el nuevo plan y los antiguos siguen con el suyo.

   HOTMART: cada plan tiene hotmartCheckoutUrl listo para pegar el link de cobro
   (hoy vacío). Todavía no se usa: el alta sigue por Flow hasta que Mathias envíe
   los links y se haga el cambio. */
(function (root) {
  function withFeatures(p) {
    const videollamada = !!p.videollamada;
    const ver_preguntas_otros = !!p.ver_preguntas_otros;
    const ebooks_gratis = !!p.ebooks_gratis;
    const biblioteca = !!p.biblioteca;
    return Object.assign({}, p, {
      videollamada,
      ver_preguntas_otros,
      ebooks_gratis,
      biblioteca,
      /* Alias que ya usa la API y Mi cuenta. */
      calls: !!(p.calls || videollamada),
      community: !!(p.community || ver_preguntas_otros),
      hotmartCheckoutUrl: p.hotmartCheckoutUrl || "",
    });
  }

  const FA_CONFIG = {
    /* false = la Academia no se usa ni se lanza. Rutas de campus/login redirigen.
       true  = se vuelve a mostrar Ingresar, Academia y el campus (el código sigue igual). */
    ACADEMIA_ENABLED: false,

    /* Checkout de Hotmart para todo "Comprar curso" mientras la Academia está desactivada. */
    HOTMART_CHECKOUT_URL: "https://pay.hotmart.com/M101158236T?hotfeature=51&_hi=eyJjaWQiOiIxNzg1MzgyMDM2NDM2Mzg2MzI4NTI3NDY1NzU1NjUwIiwiYmlkIjoiMTc4NTM4MjAzNjQzNjM4NjMyODUyNzQ2NTc1NTY1MCIsInNpZCI6Ijg3Mjg1YTEyOGI4MDRkNDRiNTQ0MmYzYjMwZjRkOGM1In0=.1794072662815",

    /* Suscripción mensual para preguntarle al equipo. Cobro automático cada mes
       con Flow (tarjeta registrada) hasta que el cliente cancele.
       questionsPerPeriod: null = ilimitadas.
       hotmartCheckoutUrl: slot por plan; vacío hasta que lleguen los links. */
    PLANS: {
      basico: withFeatures({
        name: "Plan Aprendiz",
        label: "Inicial",
        amount: 5000,
        questionsPerPeriod: 3,
        tagline: "Ideal para quienes están comenzando en el mundo del aire acondicionado automotriz.",
        benefits: [
          "3 preguntas mensuales.",
          "Acceso a la plataforma digital.",
          "Resolución de dudas técnicas.",
        ],
        hotmartCheckoutUrl: "",
      }),
      pro: withFeatures({
        name: "Plan Técnico",
        label: "Intermedio",
        amount: 10000,
        questionsPerPeriod: null,
        tagline: "Ideal para quienes quieren aprender constantemente y resolver todas sus dudas.",
        benefits: [
          "Preguntas ilimitadas.",
          "Acceso a la plataforma digital.",
          "Resolución de consultas técnicas.",
        ],
        hotmartCheckoutUrl: "",
      }),
      premium: withFeatures({
        name: "Plan Profesional",
        label: "Premium",
        amount: 20000,
        questionsPerPeriod: null,
        tagline: "Para quienes buscan capacitación continua y acompañamiento personalizado.",
        benefits: [
          "Preguntas ilimitadas.",
          "Videollamadas de asesoría.",
          "Acceso a todas las preguntas realizadas por otros usuarios.",
          "Acceso gratuito a todos los ebooks disponibles.",
          "Biblioteca de conocimientos para estudiar y profundizar.",
        ],
        videollamada: true,
        ver_preguntas_otros: true,
        ebooks_gratis: true,
        biblioteca: true,
        hotmartCheckoutUrl: "",
      }),
    },

    /* Panel del suscriptor y panel del equipo. */
    ACCOUNT_URL: "mi-cuenta.html",
    TEAM_URL: "equipo.html",

  };

  /* Compatibilidad con código anterior. */
  FA_CONFIG.PLAN_LABELS = Object.fromEntries(Object.entries(FA_CONFIG.PLANS).map(([k, p]) => [k, p.name]));

  if (typeof module !== "undefined" && module.exports) module.exports = FA_CONFIG;
  else root.FA_CONFIG = FA_CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
