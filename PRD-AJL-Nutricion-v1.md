# PRD: AJL Nutrición Landing Page

## 1. Product overview

### 1.1 Document title and version

- PRD: AJL Nutrición Landing Page
- Version: 1.3
- Actualizado: 2026-05-19

### 1.2 Product summary

Esta es una landing page de precalificación pasiva para AJL Nutrición, una clínica de nutrición premium con base en Lima, Perú, dirigida a profesionales de 28–45 años de NSE A/B que buscan transformar su composición corporal sin restricciones alimentarias rígidas.

La página tiene una doble función: (1) convertir tráfico frío y tibio proveniente de Instagram, TikTok, Meta Ads y referidos en leads calificados, y (2) permitir el pago directo desde el sitio (Yape, transferencia BCP/CCI o tarjeta vía Culqi) con confirmación posterior por WhatsApp.

**Jerarquía de conversión (decisión tomada en v1.1, mantenida en v1.2):** los planes mensuales son el producto principal de la landing. La Evaluación Nutricional de S/80 es el producto de entrada para leads que aún no se deciden por un plan.

**Flujo de pago (nuevo en v1.2):** el lead que ya decidió hace clic en "Quiero este" en una card y aterriza en una página de checkout específica del plan (`/checkout/[slug]/`). Allí ve los 4 métodos de pago disponibles y un proceso de 4 pasos: pagar → enviar comprobante por WhatsApp → asesor confirma cita → primera sesión. Sigue habiendo touch humano post-pago, pero el compromiso financiero ocurre antes de la conversación de venta.

La landing complementa el filtro upstream (reels, stories, ads) con un filtro pasivo: contenido honesto, criterios explícitos de "para quién sí / para quién no", y CTAs directos al WhatsApp con mensaje pre-llenado que identifica fuente vía UTM y el plan de interés.

La hipótesis estratégica que esta versión busca validar es que precalificar al lead antes y durante la landing, sin formularios interactivos, mejora la calidad del lead que llega al asesor sin sacrificar volumen significativo. El éxito se medirá tras 60 días de tráfico estable post-lanzamiento.

## 2. Goals

### 2.1 Business goals

- Aumentar la conversión de tráfico digital (Instagram, TikTok, Meta Ads) a leads calificados en WhatsApp.
- Validar la hipótesis de que un filtro pasivo en la landing mejora la calidad del lead sin sacrificar volumen significativo.
- Posicionar los planes mensuales como el producto principal del funnel, con la Evaluación de S/80 como fallback para indecisos.
- Generar visibilidad de la fuente del lead y del plan de interés mediante UTMs y mensaje pre-llenado.
- Apoyar la meta de pasar de aproximadamente S/35,000/mes a S/60,000–70,000/mes en el año 1.
- Reducir tiempo del asesor con leads no calificados, aumentando capacidad efectiva sin contratar más asesores.

### 2.2 User goals

- Entender rápidamente si el método de AJL es diferente a lo que ya probó y por qué podría funcionar esta vez.
- Ver los planes disponibles, entender qué incluye cada uno y elegir el que encaja con su nivel de compromiso.
- Conocer el precio y alcance de la Evaluación de S/80 como alternativa si aún no sabe qué plan elegir.
- Sentir que la clínica entiende su frustración previa (planes rígidos, rebotes, culpa) y no lo va a juzgar.
- Identificar si encaja en el perfil de cliente ideal antes de invertir tiempo en una conversación.

### 2.3 Non-goals

- No reemplazar la conversación de WhatsApp con el asesor (post-pago el contacto humano sigue siendo obligatorio para confirmar la cita).
- No agendar slots de calendario directamente desde el sitio (el asesor coordina horario por WhatsApp).
- No funcionar como sitio web institucional con múltiples páginas (blog, equipo, etc.).
- No captar leads sin ningún filtro: la fricción pasiva es intencional.
- No prometer resultados específicos de pérdida de peso ni usar lenguaje de "método revolucionario".
- No convencer a perfiles incompatibles (rechazo de estructura, dogmatismo alimentario, expectativa de magia).

## 3. User personas

### 3.1 Key user types

- Paciente frío (tráfico de Meta Ads sin contacto previo con la marca).
- Paciente tibio (tráfico orgánico reciente de Instagram/TikTok, link en bio).
- Paciente caliente (seguidor antiguo o referido de un paciente actual).
- Visitante no calificado (perfil incompatible con el método: busca dietas rígidas, espera magia, rechaza estructura).
- Asesor comercial / equipo interno (recibe los leads derivados en WhatsApp con el contexto pre-llenado).

### 3.2 Basic persona details

- **Paciente frío (Carla, 34, gerente de marketing)**: Llegó desde un anuncio de Meta mientras hacía scroll. No conoce a AJL ni a Alejandro. Ha probado keto, ayuno intermitente y dos nutricionistas en los últimos 3 años. Siempre rebota. Sospecha de cualquier promesa nueva, pero le llamó la atención que el anuncio no prometía bajar X kilos.
- **Paciente tibio (Diego, 38, ingeniero)**: Vio dos o tres reels de AJL en las últimas semanas y entró desde el link en bio. Aún no escribe a WhatsApp porque no quiere recibir un sermón. Quiere entender el método y los planes antes de hablar con alguien. Le gusta comer fuera, usa Rappi seguido, no piensa renunciar a eso.
- **Paciente caliente (Valeria, 41, abogada)**: Sigue a Alejandro desde hace meses o llegó referida por una amiga que ya es paciente. Llega con intención clara de empezar. Necesita confirmación rápida de planes y precios, y un camino directo al WhatsApp sin fricción innecesaria.
- **Visitante no calificado (Miguel, 29)**: Quiere "una dieta para bajar 10 kilos en un mes". Espera que le digan qué comer y qué no, sin involucrarse. Cree que el azúcar es veneno. Idealmente la landing lo filtra y se autodescarta al leer la sección "Para quién no".
- **Asesor comercial (Rodrigo)**: No interactúa con la landing como visitante, pero recibe el resultado: un mensaje de WhatsApp pre-llenado que identifica fuente (UTM) y el plan de interés del lead.

### 3.3 Role-based access

- **Visitante (público general)**: Acceso total al contenido informativo y al botón de WhatsApp. No requiere registro. No deja datos persistentes salvo lo que voluntariamente envía vía el mensaje pre-llenado.
- **Administrador / equipo interno (futuro)**: En v1.0 no existe panel de admin. La edición de contenido se hace vía despliegue de código (GitHub + Netlify). Considerado para roadmap, no requisito de v1.0.

## 4. Functional requirements

- **Hero section** (Priority: High)
  - Titular que valide la frustración previa del paciente (intentos fallidos).
  - Diferenciador estructural: estructura para vida real, no planes ideales.
  - CTA primario visible above-the-fold que hace scroll a la sección de planes (no abre WhatsApp directamente).
  - Comunicar que no se prometen kilos específicos ni resultados garantizados.

- **Sección "Por qué fallaste antes"** (Priority: High)
  - Tabla "lo que el paciente dice" vs "el problema real" con las causas raíz reales.
  - Encabezado: "¿Por qué tú sí, si ya muchos fallaron conmigo?" como miedo central a desactivar.
  - Validar emocionalmente sin culpar al paciente.

- **Sección "Cómo funciona el método"** (Priority: High)
  - 6 pasos del método: (1) Estructura en tu vida real, (2) Planificación semanal, (3) Gestión de porciones visible, (4) Backend calórico oculto, (5) Acompañamiento cercano, (6) Ajuste según adherencia real.
  - Bloque "Tu parte en el proceso" que comunica el compromiso requerido del paciente (filtro pasivo).
  - CTA al final hace scroll a la sección de planes.

- **Sección de planes** (Priority: High — producto principal)
  - 4 planes con nombre, tagline, precio, y layout comparativo en 3 secciones uniformes (`Sesiones individuales`, `Acompañamiento continuo`, `Programas`). Las 4 cards muestran las mismas categorías para que el usuario pueda comparar de un golpe de vista.
  - Planes: Básico (S/250), Acompañamiento (S/320), Constancia (S/440 — destacado, badge "Más elegido"), Transformación (S/600 — badge "Más completo").
  - Cada feature está marcada con número (`1`, `2`) o check (`✓`) si está incluida, o con dash gris (`—`) si no. La estrella (`★`) reservada para Atención prioritaria, exclusiva de Transformación.
  - Las features no incluidas se muestran al 28% de opacidad con tipografía más liviana — visibles para comparar pero sin competir con lo incluido.
  - Cada precio se muestra con asterisco visible (`S/250*`) y un footnote al pie del grid: "*El pago con tarjeta tiene un recargo del 5%".
  - Pill de frecuencia visible al lado del label "Sesiones individuales": `Única`, `Mensual`, `Quincenal`, `Semanal` según el plan.
  - Sección "Programas" en cada card muestra el ahorro al pagar 3 o 6 meses anticipados: Acompañamiento 3m S/900, Constancia 3m S/1,250 / 6m S/2,400, Transformación 3m S/1,700 / 6m S/3,200. Básico no aplica (es pago único).
  - Cada plan tiene su propio CTA "Quiero este" que dirige a la página de checkout específica del plan.
  - Nota al final de la sección apunta hacia la Evaluación S/80 como opción para indecisos.
  - **Diferencias reales por plan** (fuente de verdad — alineada con los productos comerciales):
    - **Básico (S/250)** — Solo 1 sesión de estrategia + plan personalizado. Sin seguimiento, sin acompañamiento continuo, sin sesiones grupales. Es el "primer paso de bajo riesgo" sin compromiso recurrente.
    - **Acompañamiento (S/320/mes)** — 1 sesión + plan, igual que Básico, pero suma acompañamiento continuo: WhatsApp, soporte L-V 9am-6pm / S 9am-1pm, sesiones grupales 4/mes, comunidad privada.
    - **Constancia (S/440/mes)** — Suma sobre Acompañamiento: 1 sesión de seguimiento quincenal y sesión de logros (primer mes). Mismo acompañamiento continuo.
    - **Transformación (S/600/mes)** — 2 sesiones de estrategia + 2 sesiones de seguimiento semanal. Único plan con Atención prioritaria.

- **Sección "¿Qué incluye cada plan?"** (Priority: High)
  - Detalle expandido de cada componente de los planes en tarjetas individuales.
  - Dos grupos: Sesiones individuales y Acompañamiento continuo.
  - Cada tarjeta muestra qué planes incluyen esa feature mediante etiquetas.
  - CTA al final abre WhatsApp para resolver dudas.

- **Sección "Producto de entrada: Evaluación Nutricional S/80"** (Priority: Medium — fallback para indecisos)
  - Posicionada después de planes y testimonios, no como producto principal.
  - Encabezado: "¿Todavía no te decides?" para dejar claro que es para indecisos.
  - Precio S/80 con asterisco visible y nota local "*El pago con tarjeta tiene un recargo del 5%".
  - Duración 20–30 min, diagnóstico + dirección clara.
  - Comunicar que los S/80 se descuentan del primer mes si contrata un plan.
  - CTA: "Agendar Evaluación →" que dirige a `/checkout/evaluacion/`.

- **Páginas de checkout** (Priority: High — nuevo en v1.2)
  - 5 páginas estáticas, una por producto: `/checkout/{evaluacion,basico,acompanamiento,constancia,transformacion}/`.
  - Diseño consistente con el landing (Plus Jakarta Sans, Inter, paleta gold/ink/bg compartida) servido por una hoja de estilos común en `/checkout/checkout.css`.
  - **Lista "Lo que incluye"** sincronizada con las features reales por plan (actualizada en v1.3 para reflejar la verdad comercial — incluye programas 3m/6m donde aplique y aclara explícitamente lo que NO incluye en Básico).
  - Cada página muestra:
    1. **Nav superior**: logo AJL + link "Volver a planes".
    2. **Card del plan**: nombre, tagline, precio base, precio con tarjeta (incluye 5% recargo), lista de "lo que incluye".
    3. **Flujo de 4 pasos**:
       - **Paso 1 — Realiza tu pago**: Yape (919 151 237), BCP cuenta corriente (193-91104808-0-57), CCI (19391104808057), y botón Culqi con monto +5% pre-configurado.
       - **Paso 2 — Envíanos tu comprobante por WhatsApp**: botón verde con mensaje pre-rellenado que identifica el plan y monto base ("Hola, te envío el comprobante del plan [Nombre] (S/X)").
       - **Paso 3 — Recibe tu link de inscripción**: incluye horario de atención (lunes a sábado, 9:00 a.m. a 8:00 p.m.).
       - **Paso 4 — Lista tu primera sesión**: modalidad presencial (Av. Almirante Manuel Villavicencio 1461, Lince, Lima) o virtual.
    4. **Footer**: link al asesor por WhatsApp para resolver dudas previas al pago.
  - Links de Culqi por plan (Culqi Express, monto +5% ya pre-configurado en el link):
    - Evaluación: `https://express.culqi.com/pago/CE455B801E`
    - Básico: `https://express.culqi.com/pago/D1100F369A`
    - Acompañamiento: `https://express.culqi.com/pago/DD1BE52C10`
    - Constancia: `https://express.culqi.com/pago/D4E12ED399`
    - Transformación: `https://express.culqi.com/pago/8F6B63FDF7`
  - Cada página dispara analytics propios en su carga: GA4 `begin_checkout` y Meta Pixel `InitiateCheckout` con `value` y `item_name` específicos del plan.

- **Sección "Pacientes reales"** (Priority: Medium)
  - Mínimo 3 testimonios con nombre, contexto y resultado enfocado en relación con la comida (no kilos específicos).
  - Pendiente: selección de testimonios reales por el equipo.

- **Sección "Para quién sí / Para quién no"** (Priority: High — filtro pasivo central)
  - Criterios exactos de cliente ideal e incompatible según documento de marca.
  - Mensaje empático de cierre para quien no encaja.
  - CTA hace scroll a sección de planes.
  - Evento `scroll_para_quien` registrado en analytics.

- **FAQ** (Priority: Medium)
  - Formato acordeón, navegable por teclado.
  - Preguntas: modalidad (presencial/virtual), qué pasa después de la evaluación, por qué la evaluación no es gratis, diferencias entre planes, tiempo para ver resultados, compatibilidad con restaurantes y delivery.

- **Botón flotante de WhatsApp** (Priority: High)
  - Visible desde el primer segundo de carga, durante todo el scroll.
  - Mensaje pre-llenado con UTM de origen.
  - Esquina inferior derecha. Evento `whatsapp_click_floating` registrado.

- **Tracking y UTMs** (Priority: High — activo)
  - Captura de `utm_source`, `utm_medium`, `utm_campaign` desde la URL.
  - Mensaje pre-llenado de WhatsApp incluye UTM cuando está disponible; sin UTM, el mensaje va sin etiqueta de origen.
  - Eventos custom en landing: `scroll_frustracion`, `scroll_metodo`, `scroll_testimonios`, `scroll_para_quien`, `whatsapp_click` (con `section_id` y `package_name`), `whatsapp_click_floating`.
  - Eventos custom en checkout: GA4 `begin_checkout` y Meta Pixel `InitiateCheckout` por plan, con `value` y `item_id`. La conversión final se confirma manualmente cuando el asesor valida el comprobante por WhatsApp (no hay webhook de Culqi → analytics todavía).
  - Meta Pixel: **activo** — Pixel ID `982472270539383`.
  - GA4: **activo** — Measurement ID `G-SQ5K6KFXT3`.
  - Convención de UTMs versionada en `docs/utms.md` (fuente única de verdad para los links de bio, stories, ads, ManyChat, etc.).

- **Pie de página** (Priority: Low)
  - Datos de contacto, CTA a WhatsApp, aviso legal mínimo, link a política de privacidad.

## 5. User experience

### 5.1 Entry points & first-time user flow

- **Instagram (orgánico)**: Link en bio o sticker de stories. `utm_source=ig&utm_medium=bio`.
- **TikTok (orgánico)**: Link en bio. `utm_source=tt&utm_medium=bio`.
- **Meta Ads (pagado)**: `utm_source=meta&utm_medium=ads&utm_campaign=<nombre>`.
- **ManyChat**: Respuesta automática a comentarios. `utm_source=manychat&utm_medium=dm`.
- **Referidos**: Link compartido por paciente actual. `utm_source=referido`.
- **Directo / desconocido**: Sin UTM. Registrado en analytics como origen desconocido. Mensaje de WhatsApp va sin etiqueta de origen.

**Flujo principal:** Hero (scroll a planes) → Por qué fallaste → Método → **Planes** → Qué incluye cada plan → Testimonios → Para quién sí/no → Evaluación S/80 (fallback) → FAQ → Footer. El botón flotante de WhatsApp está siempre disponible para leads que ya vienen decididos. Cuando el lead clickea "Quiero este" o "Agendar Evaluación", entra al sub-flujo de checkout: `/checkout/[slug]/` → elegir método de pago → pagar → enviar comprobante por WhatsApp → confirmar cita con asesor → primera sesión.

### 5.2 Core experience

- **Aterrizaje en hero**: Titular reconoce frustración previa. CTA hace scroll a planes (no a WhatsApp).
- **Diagnóstico del problema**: Sección "Por qué fallaste" con la pregunta central "¿Por qué tú sí, si ya muchos fallaron conmigo?".
- **Entendimiento del método**: 6 pasos + bloque de compromiso requerido actúa como filtro pasivo temprano.
- **Elección de plan**: El visitante ve los 4 planes con precio + asterisco que indica el recargo del 5% para pagos con tarjeta. Si está listo, clickea "Quiero este" y aterriza en la página de checkout del plan.
- **Pago + comprobante**: En el checkout elige uno de 4 métodos (Yape, BCP, CCI o Culqi). Tras pagar, envía la captura del comprobante por WhatsApp usando el botón verde, que llega al asesor con un mensaje pre-rellenado que identifica el plan y el monto.
- **Confirmación con asesor**: El asesor valida el pago, coordina día/hora de la cita y entrega el link de inscripción dentro del horario de atención (lunes a sábado, 9-20h).
- **Si no se decide**: La sección de Evaluación S/80 le ofrece un paso previo de bajo riesgo con el mismo flujo de checkout (`/checkout/evaluacion/`).
- **Autoidentificación**: La sección "Para quién sí/no" permite que el visitante incompatible se autodescarte sin sentirse rechazado.
- **Resolución de dudas**: FAQ responde objeciones comunes. El footer del checkout incluye un link al asesor para dudas previas al pago.

### 5.3 Advanced features & edge cases

- **Paciente caliente (referido / seguidor antiguo)**: Usa el botón flotante de WhatsApp directamente. La landing lo permite sin fricción desde el primer segundo.
- **Tráfico sin UTM**: El mensaje de WhatsApp va sin etiqueta de origen. Analytics lo registra igualmente.
- **Visitante que no scrollea más allá del hero**: CTA del hero lleva a la sección de planes. Botón flotante visible desde el inicio.
- **Visitante en móvil con conexión lenta**: Lighthouse >85 mobile, imágenes WebP/AVIF, lazy loading.
- **Visitante que comparte el link**: Open Graph configurado con título, descripción e imagen alineados con identidad de marca.

### 5.4 UI/UX highlights

- Paleta: negro #000000, blanco #ffffff, gris claro #f5f5f5, dorado #D4A843.
- Tipografía: Montserrat (Google Fonts) como fallback a Gilroy. Pesos 700/800/900.
- Mobile-first. La mayoría del tráfico viene de Instagram y TikTok en móvil.
- Sin pop-ups ni formularios de captura. Todo el contacto va por WhatsApp.

## 6. Narrative

Diego es un ingeniero de 38 años que ha intentado bajar grasa corporal durante los últimos tres años sin éxito sostenible. Probó keto, una app de conteo de calorías y dos nutricionistas distintos, y cada vez terminó en el mismo ciclo: tres meses de disciplina forzada, abandono, culpa y recuperación del peso perdido. Está cansado de planes que ignoran que almuerza fuera cuatro veces por semana y que no piensa renunciar a la cerveza con amigos los viernes. Lleva semanas viendo reels de AJL Nutrición en Instagram y le llama la atención que el discurso no le promete bajar diez kilos en treinta días. Entra a la landing desde el link en bio, lee el método, ve los planes y entiende qué nivel de acompañamiento necesita. Se identifica con el plan Constancia porque quiere revisiones quincenales sin comprometerse a algo semanal. Hace clic en "Quiero este plan", llega a WhatsApp con el mensaje "Hola, me interesa el plan Constancia de AJL Nutrición" y Rodrigo ya sabe cómo empezar la conversación.

## 7. Success metrics

### 7.1 User-centric metrics

- **Tasa de clic "Quiero este" → entrada a checkout**: >12% del total de visitantes.
- **Tasa de clic en botón flotante de WhatsApp**: >8% del total (mide leads que prefieren conversar antes de comprar).
- **Distribución de entradas a checkout por plan**: qué plan específico tiene más `begin_checkout` (vía `item_id`).
- **Tasa de pago completado por plan** (manual hasta que haya webhook Culqi → analytics): comprobantes recibidos por WhatsApp / `begin_checkout` registrados.
- **Distribución de método de pago elegido**: % Yape vs % BCP vs % CCI vs % Culqi. Útil para anticipar comisión efectiva y simplificar la oferta a futuro.
- **Tasa de scroll profundo**: >50% llegan a la sección de planes.
- **Tasa de scroll hasta "Para quién sí/no"**: >40%.
- **Tasa de rebote en hero**: <50%.
- **Satisfacción cualitativa del lead al llegar a WhatsApp con comprobante**: feedback subjetivo del asesor.

### 7.2 Business metrics

- **Calidad del lead**: % de conversaciones que terminan agendando o contratando. Objetivo: >25% vs ~3.5% actual.
- **Volumen de planes contratados desde la landing / mes**.
- **Volumen de evaluaciones de S/80 agendadas desde la landing / mes** (leads indecisos convertidos).
- **Distribución de origen del lead (por UTM)**: % por canal.
- **Plan más elegido**: qué plan menciona más frecuentemente Rodrigo como entrada de conversación.
- **Ventana de medición**: 60 días de tráfico estable post-lanzamiento.

### 7.3 Technical metrics

- Lighthouse Performance (mobile): >85.
- Lighthouse Accessibility: >90.
- Lighthouse SEO: >90.
- LCP <2.5s, CLS <0.1.
- Tiempo de carga en 3G: <4s.
- Cobertura de tracking: 100% de eventos clave registrados.

## 8. Technical considerations

### 8.1 Integration points

- **WhatsApp**: `https://wa.me/51919151237?text=<mensaje>`. Dos modos:
  - Desde landing → mensaje "me interesa el plan X" + UTM si disponible.
  - Desde checkout → mensaje "te envío el comprobante del plan X (S/Y)" para que el asesor sepa de entrada qué pago debe validar.
- **Culqi (Express)**: 5 links de pago independientes, uno por producto, cada uno con el monto base × 1.05 ya pre-configurado en Culqi para cubrir el recargo del 5% que la pasarela cobra.
- **Datos bancarios manuales**:
  - Yape: 919 151 237
  - BCP cuenta corriente: 193-91104808-0-57
  - CCI: 19391104808057
  - Estos datos se centralizan visualmente en cada página de checkout. En código viven duplicados (hard-coded en cada `checkout/*/index.html`); si en algún momento cambian, hay que actualizarlos en los 5 archivos. Pendiente de refactor futuro a una fuente única.
- **Meta Pixel**: **Activo** — Pixel ID `982472270539383`. Eventos: `PageView` en todas las páginas, `InitiateCheckout` con `value` y `content_name` en cada página de checkout al cargar.
- **Google Analytics 4**: **Activo** — Measurement ID `G-SQ5K6KFXT3`. Eventos: pageview automático, eventos de scroll en landing, `begin_checkout` en cada página de checkout.
- **UTM parameters**: Convención definida en `docs/utms.md`. Aplicada en bios de Instagram y TikTok.
- **Hosting**: Sitio estático desplegado en **GitHub Pages** desde la raíz del repo `Loayza97/AJL-Landing`. El `index.html` principal vive en la raíz (no es output de Astro). Las páginas de checkout son archivos HTML estáticos en `/checkout/[slug]/index.html`. Dominio `ajlnutricion.com` mapeado vía `CNAME`.
- **Nota de deuda técnica**: el repo también contiene un proyecto Astro en `src/` que NO se despliega. Coexiste con el `index.html` raíz como código paralelo. Hay un refactor pendiente para unificar la fuente de verdad.

### 8.2 Data storage & privacy

- No se almacenan datos personales en el sitio. Las páginas de checkout son estáticas y no envían datos a ningún servidor propio.
- El pago vía Culqi se procesa en el dominio de Culqi (`express.culqi.com`); los datos de tarjeta nunca tocan nuestro dominio. Culqi cumple con PCI-DSS.
- Los comprobantes (capturas de pago) viajan por WhatsApp directo al asesor; no se almacenan en infraestructura propia.
- Cookie banner implementado según Ley 29733 (Perú).
- Política de privacidad: placeholder en footer, pendiente de texto legal definitivo (mayor urgencia ahora que se procesan pagos, aunque no se almacenan datos).
- HTTPS garantizado por GitHub Pages.

### 8.3 Scalability & performance

- Sitio estático: escalabilidad ilimitada para el volumen esperado.
- CDN incluido por defecto en Netlify.
- Imágenes: WebP/AVIF con lazy loading.
- JS mínimo client-side: captura UTM, construcción de links de WhatsApp, scroll tracking con IntersectionObserver.

### 8.4 Potential challenges

- **Hipótesis no validada**: ventana de 60 días y métricas claras permiten decisión basada en datos.
- **Testimonios pendientes**: la sección existe con placeholders. Requiere selección de pacientes reales.
- **Foto del hero**: pendiente. Idealmente foto real de Alejandro o consulta (no stock).
- **Política de privacidad**: texto legal pendiente, mayor urgencia ahora que se procesa pago.
- **Asimetría visible de precio**: el cliente que paga con tarjeta paga 5% más que el que paga con Yape o transferencia. Como ambos terminan hablando con el asesor por WhatsApp, podrían comparar precios y la diferencia salir a la conversación. La mitigación actual es comunicar el recargo desde el sitio con el asterisco y la nota. Vigilar si genera fricción real con clientes en los primeros 60 días.
- **Conversión de pago no medida automáticamente**: hoy se mide `begin_checkout` pero no la conversión final (pago confirmado). Requiere validación manual con el asesor. Mejora futura: webhook de Culqi → endpoint → evento `purchase` en GA4 / `Purchase` en Meta Pixel.
- **Doble código fuente (Astro vs `index.html` raíz)**: ya descrito en 8.1. Hay que decidir si se migra el deploy a Astro o se elimina el código Astro.
- **OG image actual es funcional pero no óptima**: la imagen `og-image.jpg` activa (1200×630, generada en v1.2) es una foto portrait de Alejandro con blurred fill en los laterales. Sirve para que los previews ya no salgan vacíos, pero idealmente debería ser una imagen pensada nativamente como banner horizontal con logo y tagline. Reemplazable cuando haya un asset mejor.

## 9. Milestones & sequencing

### 9.1 Estado actual (v1.3)

Landing en producción en `ajlnutricion.com` (GitHub Pages). Páginas de checkout implementadas y servidas como rutas estáticas. GA4 y Meta Pixel activos. UTMs aplicadas en bios y documentadas en `docs/utms.md`. Pago directo vía Yape / BCP / CCI / Culqi habilitado para los 4 planes mensuales y la Evaluación. **Cards del landing rediseñadas en v1.3** con formato comparativo (las 4 cards muestran las mismas categorías de features con ✓ o gris, facilitando la comparación visual). **OG image activa** (`og-image.jpg`) con meta tags completos para previews al compartir el link.

### 9.2 Próximos pasos

1. Verificar que los 5 links de Culqi tienen el monto exacto que muestran las páginas de checkout (S/84, S/262.50, S/336, S/462, S/630). Si difieren, ajustar en código o en Culqi.
2. Reemplazar testimonios placeholder con contenido real.
3. Agregar foto real al hero.
4. Completar política de privacidad (mayor urgencia ahora que se procesa pago).
5. Implementar webhook Culqi → endpoint → evento `purchase` en GA4 / `Purchase` en Meta Pixel, para medir conversión final automáticamente.
6. Decidir el destino del código Astro paralelo (`src/`): migrar deploy o eliminar.
7. Crear OG image dedicada (banner horizontal con logo + tagline), reemplazando la actual generada a partir de foto portrait.
8. Iniciar ventana de medición de 60 días con el sitio completo en producción.

## 10. User stories

### 10.1 Aterrizar desde Instagram orgánico

- **ID**: US-001
- **Description**: Como paciente tibio que llega desde el link en bio de Instagram, quiero aterrizar en una landing que cargue rápido y comunique de inmediato de qué se trata.
- **Acceptance criteria**:
  - `utm_source=ig` y `utm_medium=bio` se registran en analytics.
  - LCP <2.5s en 4G.
  - Titular del hero visible above-the-fold en 375px de ancho.
  - Botón flotante de WhatsApp visible desde el primer segundo de carga.

### 10.2 Aterrizar desde Meta Ads

- **ID**: US-002
- **Description**: Como paciente frío que llega desde un anuncio de Meta, quiero ver un mensaje que reconozca mi frustración previa.
- **Acceptance criteria**:
  - `utm_source=meta`, `utm_medium=ads`, `utm_campaign=<nombre>` se registran en analytics y se incluyen en el mensaje pre-llenado de WhatsApp.
  - Meta Pixel registra el evento PageView.
  - El titular del hero contiene validación explícita de intentos previos fallidos.

### 10.3 Aterrizar desde TikTok

- **ID**: US-003
- **Description**: Como paciente frío o tibio que llega desde TikTok, quiero que la landing se vea perfecta en mobile.
- **Acceptance criteria**:
  - `utm_source=tt&utm_medium=bio` se registra correctamente.
  - Todos los elementos son tap-friendly (mínimo 44×44px).
  - Sin scroll horizontal en pantallas mobile estándar.

### 10.4 Aterrizar desde ManyChat

- **ID**: US-004
- **Description**: Como paciente que comentó un video y recibió el link vía ManyChat, quiero que la landing reconozca mi origen.
- **Acceptance criteria**:
  - `utm_source=manychat` se registra y aparece en el mensaje pre-llenado de WhatsApp.

### 10.5 Aterrizar como referido

- **ID**: US-005
- **Description**: Como paciente caliente referido por un paciente actual, quiero poder ir directo al WhatsApp sin recorrer toda la landing si ya estoy decidido.
- **Acceptance criteria**:
  - `utm_source=referido` se registra.
  - El botón flotante de WhatsApp está visible desde el primer segundo de carga.
  - El CTA del hero hace scroll a la sección de planes (camino rápido para elegir y luego escribir).

### 10.6 Aterrizar sin UTM

- **ID**: US-006
- **Description**: Como visitante cuyo origen no se identifica vía UTM, quiero que el sistema registre mi visita igualmente y derive correctamente al asesor.
- **Acceptance criteria**:
  - El sistema registra la visita en analytics sin UTM.
  - El mensaje pre-llenado de WhatsApp va sin etiqueta de origen (no muestra "origen: directo").
  - El flujo funciona idéntico al de un visitante con UTM, sin errores.

### 10.7 Leer la sección de validación de frustración previa

- **ID**: US-007
- **Description**: Como visitante que ha probado dietas y nutricionistas sin éxito, quiero leer una sección que reconozca por qué los intentos previos fallaron.
- **Acceptance criteria**:
  - La sección "Por qué fallaste antes" está visible al hacer scroll desde el hero.
  - El titular plantea la pregunta "¿Por qué tú sí, si ya muchos fallaron conmigo?".
  - Contiene la tabla "lo que el paciente dice" vs "el problema real" con las causas raíz del documento de marca.
  - El evento `scroll_frustracion` se registra en analytics cuando el visitante llega a esta sección.

### 10.8 Comprender el método de los 6 pasos

- **ID**: US-008
- **Description**: Como visitante interesado en saber qué hace AJL diferente, quiero entender los 6 pasos del método y qué se requiere de mí como paciente.
- **Acceptance criteria**:
  - Los 6 pasos están presentes y numerados: (1) Estructura en tu vida real, (2) Planificación semanal, (3) Gestión de porciones visible, (4) Backend calórico oculto, (5) Acompañamiento cercano, (6) Ajuste según adherencia real.
  - Existe un bloque "Tu parte en el proceso" que comunica el compromiso requerido del paciente.
  - La sección es legible en mobile sin scroll horizontal.
  - El evento `scroll_metodo` se registra en analytics.

### 10.9 Conocer la Evaluación Nutricional Personal de S/80

- **ID**: US-009
- **Description**: Como visitante indeciso que no sabe qué plan elegir, quiero ver la Evaluación de S/80 como paso previo de bajo riesgo.
- **Acceptance criteria**:
  - La sección está posicionada después de planes y testimonios, con el encabezado "¿Todavía no te decides?".
  - El precio S/80 está visible sin hover ni click, con asterisco que indica el recargo del 5% si se paga con tarjeta.
  - Se comunica que los S/80 se descuentan del primer mes si el paciente contrata un plan.
  - Se especifica duración (20–30 min) y que incluye diagnóstico + dirección clara.
  - El CTA dice "Agendar Evaluación →" y dirige a `/checkout/evaluacion/`.

### 10.10 Ver los planes de forma informativa y elegir uno

- **ID**: US-010
- **Description**: Como visitante, quiero ver los 4 planes disponibles con sus precios, frecuencias y diferencias en un formato comparativo, para elegir el que encaja con mi caso antes de iniciar el pago.
- **Acceptance criteria**:
  - Los 4 planes están presentes: Básico (S/250), Acompañamiento (S/320), Constancia (S/440), Transformación (S/600).
  - **Las 4 cards usan el mismo layout comparativo**: tres secciones idénticas en cada card (`Sesiones individuales`, `Acompañamiento continuo`, `Programas`), mostrando las mismas filas de features para facilitar comparación lado a lado.
  - Features incluidas se marcan con número (cuando aplica cantidad) o check `✓`. Features no incluidas con dash gris (`—`) al 28% de opacidad. Estrella `★` para Atención prioritaria, exclusiva de Transformación.
  - Cada plan muestra nombre, tagline, precio con asterisco visible, pill de frecuencia (`Única` / `Mensual` / `Quincenal` / `Semanal`), descripciones cortas de cada feature incluida, y pricing de programas (3/6 meses donde aplique).
  - El footnote del grid aclara: "*El pago con tarjeta tiene un recargo del 5%".
  - Cada plan tiene su propio CTA "Quiero este" que dirige a `/checkout/[slug]/`.
  - Al cargar la página de checkout se dispara `begin_checkout` (GA4) e `InitiateCheckout` (Meta Pixel) con el `item_id` y `value` del plan.

### 10.11 Entender en detalle qué incluye cada plan

- **ID**: US-010b
- **Description**: Como visitante, quiero ver el detalle de cada componente de los planes (sesiones, seguimiento, comunidad, etc.) para entender exactamente qué estoy eligiendo.
- **Acceptance criteria**:
  - Existe la sección "¿Qué incluye cada plan?" entre planes y testimonios.
  - Tiene dos grupos: Sesiones individuales y Acompañamiento continuo.
  - Cada tarjeta muestra descripción completa y etiquetas con los planes que la incluyen.
  - CTA al final permite escribir al asesor para resolver dudas.

### 10.12 Autoidentificarme como cliente ideal o no ideal

- **ID**: US-011
- **Description**: Como visitante, quiero leer criterios claros sobre para quién sí y para quién no es este método.
- **Acceptance criteria**:
  - Sección con dos columnas: "Para ti si..." y "No es para ti si...".
  - Criterios alineados con el documento de marca (no genéricos).
  - Mensaje empático de cierre para quien no encaja.
  - La sección es visualmente prominente.
  - El evento `scroll_para_quien` se registra en analytics.

### 10.13 Resolver dudas comunes vía FAQ

- **ID**: US-012
- **Description**: Como visitante con dudas específicas, quiero resolverlas en la misma página sin tener que escribir al asesor.
- **Acceptance criteria**:
  - Sección FAQ en formato acordeón, navegable por teclado.
  - Respuestas concisas (máximo 3 oraciones).
  - Preguntas cubren: modalidad, qué pasa después de la evaluación, por qué no es gratis, diferencias entre planes, tiempo para ver resultados, compatibilidad con restaurantes/delivery.

### 10.14 Hacer clic en CTA hacia WhatsApp desde cualquier sección

- **ID**: US-013
- **Description**: Como visitante decidido a contactar al asesor (sin pagar todavía), quiero poder hacerlo desde múltiples puntos de la landing.
- **Acceptance criteria**:
  - Los CTAs de planes y evaluación dirigen al checkout, no a WhatsApp.
  - Los CTAs que siguen yendo a WhatsApp son: sección "qué incluye" ("¿Dudas?"), CTA del hero secundario, footer, y botón flotante.
  - El CTA principal del hero hace scroll a planes (no abre WhatsApp directamente).
  - Cada CTA a WhatsApp lleva mensaje pre-llenado con plan o evaluación de interés + UTM si está disponible.
  - Evento `whatsapp_click` con `section_id` fijo acordado y `package_name` cuando aplica.

### 10.15 Usar el botón flotante de WhatsApp en cualquier momento

- **ID**: US-014
- **Description**: Como paciente caliente o decidido, quiero un acceso siempre visible al WhatsApp sin importar dónde estoy en el scroll.
- **Acceptance criteria**:
  - Botón flotante visible durante todo el scroll desde el primer segundo de carga.
  - Abre WhatsApp con mensaje pre-llenado con UTM de origen.
  - Evento `whatsapp_click_floating` registrado en analytics.

### 10.16 Compartir el link de la landing en redes sociales

- **ID**: US-015
- **Description**: Como visitante que quiere compartir la landing, quiero que el preview en redes se vea profesional.
- **Acceptance criteria**:
  - Open Graph configurado: `og:type`, `og:site_name`, `og:title`, `og:description`, `og:image`, `og:image:width`, `og:image:height`, `og:image:alt`, `og:url`. Twitter Card configurado con `summary_large_image`.
  - `og-image.jpg` (1200×630, 133 KB, JPEG calidad 95) sirvido desde la raíz del sitio.
  - Preview renderiza correctamente en WhatsApp, Facebook, Instagram DM, LinkedIn y X/Twitter.
  - **Mejora futura**: la imagen actual fue generada a partir de una foto portrait con blurred fill lateral. Reemplazar por un banner horizontal nativo con logo + tagline cuando haya un asset diseñado para ese formato.

### 10.17 Cargar la landing en conexiones móviles lentas

- **ID**: US-016
- **Description**: Como visitante con conexión 3G o 4G débil, quiero que la landing cargue en un tiempo razonable.
- **Acceptance criteria**:
  - FCP en 3G simulado <4s.
  - Imágenes en WebP/AVIF con lazy loading.
  - Lighthouse Performance >85 en mobile.

### 10.18 Acceder a la landing con HTTPS garantizado

- **ID**: US-017
- **Description**: Como visitante, quiero que la landing se sirva siempre por HTTPS.
- **Acceptance criteria**:
  - HTTP redirige a HTTPS automáticamente (configurado en `netlify.toml`).
  - Certificado SSL válido, sin warnings en navegadores modernos.
  - Todos los assets cargados por HTTPS.

### 10.19 Recibir leads como asesor con contexto pre-llenado

- **ID**: US-018
- **Description**: Como asesor comercial (Rodrigo), quiero recibir cada lead en WhatsApp con un mensaje pre-llenado que identifique de entrada qué necesita el lead, sea consulta previa, pago confirmado o duda específica.
- **Acceptance criteria**:
  - **Consulta previa al pago** (links de "Hablar con un asesor" en checkout y "¿Dudas?" en landing): mensaje "Hola, tengo una duda antes de pagar el plan [Nombre]".
  - **Comprobante post-pago** (botón verde en paso 2 del checkout): mensaje "Hola, te envío el comprobante del plan [Nombre] (S/[base])".
  - **Lead sin checkout** (botón flotante, footer, hero secundario): mensaje genérico "Vi su página web y quiero iniciar mi cambio con ustedes" o "Hola, me interesa el plan [Nombre]" + UTM si disponible.
  - El mensaje es editable por el lead antes de enviar.
  - El texto es natural y corto, en primera persona del lead.
  - El texto visible no supera 200 caracteres.

### 10.20 Ver prueba social de pacientes reales

- **ID**: US-019
- **Description**: Como visitante escéptico, quiero leer testimonios reales con resultados concretos de pacientes del método AJL.
- **Acceptance criteria**:
  - Mínimo 3 testimonios con nombre (pila), contexto y resultado enfocado en relación con la comida.
  - Al menos un testimonio menciona un intento previo fallido.
  - Imágenes en WebP/AVIF con lazy loading.
  - Evento `scroll_testimonios` registrado en analytics.
  - **Pendiente**: contenido real a proveer por el equipo (hoy hay placeholders).

### 10.21 Entender el compromiso que requiere el método

- **ID**: US-020
- **Description**: Como visitante interesado, quiero entender qué se requiere de mí como paciente antes de contactar al asesor.
- **Acceptance criteria**:
  - Bloque "Tu parte en el proceso" dentro de la sección del método.
  - Especifica: registro de comidas las primeras semanas, asistencia a revisiones, disposición a cuestionar creencias previas.
  - Copy no promete resultados sin esfuerzo.

### 10.22 Cumplir con aviso de privacidad y cookies

- **ID**: US-021
- **Description**: Como visitante, quiero saber que mis datos de navegación se usan de forma transparente.
- **Acceptance criteria**:
  - Banner de cookies visible en primera visita con botón de aceptación.
  - Link a política de privacidad (placeholder hoy, texto legal pendiente).
  - Banner no bloquea el contenido principal en mobile.
  - Cumple con Ley N° 29733 de Protección de Datos Personales del Perú.

### 10.23 Pagar un plan con tarjeta vía Culqi

- **ID**: US-022
- **Description**: Como lead decidido que quiere pagar con tarjeta, quiero hacerlo directo desde el sitio sin tener que conversar con el asesor primero.
- **Acceptance criteria**:
  - En la página `/checkout/[slug]/`, hay un botón visible "Pagar S/[monto+5%] con tarjeta" en la lista de métodos de pago.
  - El botón abre el link de Culqi correspondiente al plan en una pestaña nueva.
  - El monto que se ve en el botón coincide con el monto que Culqi cobra realmente (incluye el 5% del recargo).
  - La página de checkout aclara visualmente que el precio con tarjeta incluye un recargo del 5% (no es una sorpresa al llegar a Culqi).
  - Al cargar la página, se dispara `begin_checkout` (GA4) e `InitiateCheckout` (Meta Pixel) con `value` y `item_name` del plan.

### 10.24 Pagar con Yape o transferencia y enviar comprobante

- **ID**: US-023
- **Description**: Como lead que prefiere no pagar con tarjeta para evitar el recargo, quiero ver los datos para pagar por Yape o transferencia y un canal claro para enviar el comprobante.
- **Acceptance criteria**:
  - La página de checkout muestra los datos completos para Yape (919 151 237), BCP cuenta corriente (193-91104808-0-57) e interbancaria CCI (19391104808057).
  - Los números son seleccionables (CSS `user-select: all`) para que el usuario los pueda copiar de un solo click.
  - En el paso 2 hay un botón verde "Enviar comprobante por WhatsApp" con mensaje pre-rellenado: "Hola, te envío el comprobante del plan [Nombre] (S/[base])".
  - El paso 3 aclara que el asesor responde en horario de atención (lunes a sábado, 9:00 a.m. a 8:00 p.m.).

### 10.25 Confirmar la cita después del pago

- **ID**: US-024
- **Description**: Como lead que ya pagó, quiero saber exactamente qué pasa después y cuándo tendré mi primera sesión.
- **Acceptance criteria**:
  - El paso 3 de la página de checkout describe: "Recibe tu link de inscripción. Uno de nuestros asesores te contactará para completar tu registro y agendar tu primera sesión".
  - El paso 4 describe las dos modalidades disponibles con dirección presencial completa (Av. Almirante Manuel Villavicencio 1461, Lince, Lima) y opción virtual.
  - El sitio NO promete confirmación instantánea ni agendamiento automático (la coordinación es manual con el asesor por WhatsApp).
  - Si el lead tiene dudas previas, hay un link al asesor en el footer del checkout: "Habla con un asesor por WhatsApp".
