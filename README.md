# Frío Austral — sitio web (v5 Patagonia nocturna)

Sitio estático (HTML/CSS/JS, sin build) + funciones serverless en `/api` (Vercel, Node 20+).
Base: demo del cliente `demo-cliente` del 5 de noviembre de 2026.

## Qué hace hoy

- **Academia desactivada** (el código sigue completo). Se reactiva con `ACADEMIA_ENABLED: true` en `assets/fa-config.js`.
- **Comprar curso** → checkout de **Hotmart** (`HOTMART_CHECKOUT_URL` en `assets/fa-config.js`).
- **Suscripción para preguntarle al equipo** → **Flow, cobro mensual automático** con tarjeta registrada, hasta que el cliente cancele. Cada plan tiene su `hotmartCheckoutUrl` en `assets/fa-config.js`: los botones «Suscribirme para preguntar» de `planes.html` y de la portada abren el link de pago de Hotmart del plan en una pestaña nueva. El alta con Flow y Mi cuenta siguen en el código para los suscriptores existentes.
- **Mi cuenta** (`mi-cuenta.html`): el suscriptor ve su plan, estado, próximo cobro, tarjeta, preguntas disponibles del período, el **chat con el equipo**, sus **pagos**, y puede **cancelar**, **cambiar de plan** o **cambiar la tarjeta**. El **Plan Premium** suma **preguntas de otros usuarios** (solo lectura, sin nombre ni correo), pestaña para **agendar videollamadas** (el cliente propone día y hora; el equipo confirma), y secciones de **ebooks** y **biblioteca** (próximamente). El botón **Entrar a la videollamada** se habilita 10 minutos antes y abre la sala de meet.jit.si en una pestaña nueva, sin límite de tiempo.
- **Panel del equipo** (`equipo.html`): suscriptores, preguntas por responder, responder, pagos, estado en Flow, solicitudes de videollamada (confirmar, proponer otra hora, cancelar o entrar en una pestaña nueva) y botón para crear los planes en Flow.
- `admin.html` es la maqueta anterior (catálogo, video y links guardados solo en el navegador). Muestra un aviso que apunta al panel real.

## Planes (precio en un solo lugar)

`assets/fa-config.js` → `PLANS` (lo usan la web y el servidor):

| Plan | Etiqueta | Clave | Precio mensual | Incluye |
|---|---|---|---|---|
| Plan Aprendiz | Inicial | `basico` | $5.000 CLP | 3 preguntas mensuales |
| Plan Técnico | Intermedio | `pro` | $10.000 CLP | Preguntas ilimitadas |
| Plan Premium | Premium | `premium` | $20.000 CLP | Ilimitadas + videollamadas + preguntas de otros + ebooks y biblioteca (próximamente) |

- El período es el ciclo de cobro de Flow (si falta, los últimos 30 días). Solo cuentan los mensajes del cliente.
- Flow no permite cambiar el monto de un plan con suscriptores: cada monto crea su propio plan (`fa-basico-5000`, …). Si cambias un precio, los nuevos suscriptores toman el nuevo plan y los antiguos siguen con el suyo.

## Flujo de la suscripción

1. `planes.html` → el cliente elige plan, crea su cuenta (nombre, email, contraseña) o ingresa.
2. `POST /api/account?action=start` crea el cliente en Flow (`customer/create`) y lo manda a registrar su tarjeta (`customer/register`).
3. Flow vuelve a `POST /api/flow/card-return` → `customer/getRegisterStatus` → `subscription/create` (cobro mensual automático) → redirige a `mi-cuenta.html?alta=ok`.
4. Cada pago de un importe llega a `POST /api/flow/webhook` (urlCallback de los planes) → `payment/getStatus` → se resincroniza la suscripción (`subscription/get`).
5. Respaldo: cron diario `GET /api/cron/sync` (Vercel Cron, con `CRON_SECRET`) y resincronización al abrir Mi cuenta si pasaron 10 minutos.
6. El cliente puede preguntar solo si la suscripción está vigente y el último cobro está pagado. Si cancela, queda vigente hasta el fin del período (`subscription/cancel` con `at_period_end=1`).

## Datos (Supabase)

Proyecto dedicado **Frio Austral** (`akanruuybegwxfjxdpub`, región São Paulo, plan gratis). Migración: `supabase/migrations/20261112220000_suscripciones_mi_cuenta.sql` (ya aplicada).

Tablas `subscribers`, `messages`, `payments`, `admins`, todas con RLS: cada usuario solo puede **leer** lo suyo y nadie escribe desde el navegador; las escrituras pasan por `/api` con la service role, que aplica cupos y reglas.

## Variables de entorno

Ver `.env.example`. **Nunca** se suben claves a git.

| Variable | Dónde se obtiene | Secreta |
|---|---|---|
| `FLOW_API_KEY`, `FLOW_SECRET_KEY` | Flow → Integraciones → Datos de integración (sandbox o producción) | Sí |
| `FLOW_API_URL` | `https://sandbox.flow.cl/api` (pruebas) o `https://www.flow.cl/api` (real) | No |
| `SITE_URL` | Dominio público, sin `/` final | No |
| `SUPABASE_URL` | `https://akanruuybegwxfjxdpub.supabase.co` | No |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys (anon / publishable) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys (service_role / secret) | **Sí** |
| `ADMIN_EMAILS` | Emails del equipo que entran a `equipo.html`, separados por coma | No |
| `CRON_SECRET` | Valor largo aleatorio | Sí |

## Pasar a producción (checklist)

1. **Vercel**: en vercel.com (cuenta personal de Mathias) → *Add New → Project* → importar `MathiasAlejandr0/FrioAustral` (framework *Other*, sin build ni output). Plan Hobby alcanza (6 funciones, 1 cron diario).
2. **Variables en Vercel** (Production y Preview): todas las de la tabla. `SUPABASE_SERVICE_ROLE_KEY`, `FLOW_SECRET_KEY` y `CRON_SECRET` como *Sensitive*. Para probar primero, deja `FLOW_API_URL=https://sandbox.flow.cl/api` con claves sandbox.
3. **Supabase → Authentication → URL Configuration**: *Site URL* = `SITE_URL`; agrega `SITE_URL/mi-cuenta.html` en *Redirect URLs* (para recuperar contraseña). Opcional: SMTP propio en *Authentication → Emails* (el correo por defecto de Supabase tiene un límite bajo por hora).
4. **Cuenta del equipo**: Supabase → *Authentication → Users → Add user* (email + contraseña, *Auto confirm*) para Guillermo, y pon ese email en `ADMIN_EMAILS`.
5. **Deploy** (redeploy después de cargar variables).
6. **Planes en Flow**: entra a `equipo.html` → *Verificar planes en Flow* (o `npm run flow:plans` con `.env.local`). Crea `fa-basico-5000`, `fa-pro-10000` y `fa-premium-20000` con el webhook `SITE_URL/api/flow/webhook`. Es idempotente.
7. **Prueba en sandbox**: suscríbete en `planes.html` con una tarjeta de prueba de Flow, revisa que `mi-cuenta.html` quede *Activa*, envía una pregunta, respóndela desde `equipo.html`, cancela.
8. **Producción**: cambia `FLOW_API_KEY`/`FLOW_SECRET_KEY` a las de producción y `FLOW_API_URL=https://www.flow.cl/api`, redeploy y repite el paso 6 (los planes de sandbox no existen en producción).
9. **Dominio**: agrega el dominio en Vercel y actualiza `SITE_URL` y la URL de Supabase Auth.

URLs que Flow usa (se configuran solas desde el código):
- Retorno del registro de tarjeta: `SITE_URL/api/flow/card-return`
- Webhook de pagos de los planes: `SITE_URL/api/flow/webhook`

## Probar en local

```bash
npm test                   # pruebas (sin red: Flow y Supabase simulados)
python servidor_demo.py    # sitio estático (sin /api)
```

## Medios

Solo van a git imágenes optimizadas y videos de menos de ~5 MB (ver `.gitignore`). Quedan fuera los originales y `v1-hero-intro-1080.mp4` (5,3 MB) y `v2-curso-ac-1080.mp4` (7,7 MB); si se necesitan, se suben a un hosting externo y se apunta `window.FA_MEDIA_BASE`. El video del hero parte silenciado con el botón **Activar sonido**.

## Origen

No se modificaron `D:\PROYECTOS\frio-austral\demo-cliente`, `05-premium` ni `05-premium-media-preview`.

## Contenido del sitio (panel del equipo)

`contenido.html` (se entra con la misma cuenta del equipo que `equipo.html`; hay un botón en ese panel) tiene tres pestañas:

- **Material por plan**: se sube un archivo (PDF, EPUB, ZIP, Word, Excel, PowerPoint, texto, imagen o video, hasta 50 MB), se le pone título, categoría (Ebook, Biblioteca, Guía, Video, Recurso) y se elige a qué planes va (uno o varios). Los suscriptores lo ven en **Mi cuenta → Material** (y en Ebooks / Biblioteca del Plan Premium) y lo descargan con un enlace firmado de 2 minutos. Se puede ocultar, editar o eliminar.
- **Fotos y videos**: cada espacio del catálogo `assets/fa-slots.js` (portadas, secciones, galería del taller, reels, video de bienvenida y video del curso) se puede cambiar subiendo un archivo nuevo. «Volver al original» borra el archivo subido. Si no hay archivo nuevo o no carga, el sitio usa el archivo de siempre (`assets/fa-medios.js`).
- **Accesos por plan**: la suscripción se paga en Hotmart y este sitio no recibe aviso del pago. Quien compra crea su cuenta con el mismo correo y el equipo le asigna el plan y la fecha hasta la que tiene acceso (normalmente un mes por pago). Quien paga con Flow se actualiza solo y no se puede cambiar a mano.

### Cómo se controla el acceso

- Bucket **`plan-material` privado** (sin URL pública). El navegador nunca recibe la ruta del archivo: `/api/account?action=material-url` comprueba sesión, plan del material y suscripción vigente (estado activa, período no vencido) y recién ahí entrega una URL firmada de 120 segundos.
- RLS en `plan_materials` y en `storage.objects` (función `fa_has_plan_access`): aunque alguien use la API de Supabase directamente, solo ve lo asignado a su plan vigente. Escribir (subir, editar, borrar) solo lo hace `/api/admin` con la service role, y solo para cuentas del equipo.
- Bucket **`site-media` público** (son las mismas fotos que ve cualquier visitante); solo el equipo escribe.
- Subidas: el servidor entrega un token de subida de un solo uso para una ruta concreta; el archivo viaja directo del navegador a Storage (sin pasar por la función de Vercel, que tiene límite de 4,5 MB).

Migraciones (aditivas): `20261119120000_material_planes_y_medios.sql` y `20261119121500_fa_has_plan_access_invoker.sql`.
