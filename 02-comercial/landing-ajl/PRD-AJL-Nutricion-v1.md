# PRD: AJL Nutrición Landing Page

## 1. Product overview

### 1.1 Document title and version

- PRD: AJL Nutrición Landing Page
- Version: 1.1
- Actualizado: Mayo 2026

### 1.2 Product summary

Esta es una landing page de precalificación pasiva para AJL Nutrición, una clínica de nutrición premium con base en Lima, Perú, dirigida a profesionales de 28–45 años de NSE A/B que buscan transformar su composición corporal sin restricciones alimentarias rígidas.

La página tiene una función única: convertir tráfico frío y tibio proveniente de Instagram, TikTok, Meta Ads y referidos en leads calificados que llegan al WhatsApp de ventas listos para contratar un plan o, en caso de duda, agendar una Evaluación Nutricional Personal de S/80.

**Jerarquía de conversión (decisión tomada en v1.1):** los planes mensuales son el producto principal de la landing. La Evaluación Nutricional de S/80 es el producto de entrada para leads que aún no se deciden por un plan. El flujo es: ver planes → elegir plan → WhatsApp. Solo si el visitante no sabe cuál plan elegir, se le ofrece la evaluación como paso previo.

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

- No cerrar ventas de planes directamente en la página (sin carrito ni pago online).
- No procesar pagos ni gestionar carrito en la v1.0.
- No reemplazar la conversación de WhatsApp con el asesor.
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
  - 4 planes con nombre, tagline, precio, frecuencia de sesiones, features incluidas y no incluidas, y pricing de programas (3 y 6 meses donde aplique.
  - Planes: Básico (S/250), Acompañamiento (S/320), Constancia (S/440 — destacado), Transformación (S/600).
  - Cada plan tiene su propio CTA a WhatsApp con mensaje pre-llenado que incluye el nombre del plan.
  - Nota al final de la sección apunta hacia la Evaluación S/80 como opción para indecisos.

- **Sección "¿Qué incluye cada plan?"** (Priority: High)
  - Detalle expandido de cada componente de los planes en tarjetas individuales.
  - Dos grupos: Sesiones individuales y Acompañamiento continuo.
  - Cada tarjeta muestra qué planes incluyen esa feature mediante etiquetas.
  - CTA al final abre WhatsApp para resolver dudas.

- **Sección "Producto de entrada: Evaluación Nutricional S/80"** (Priority: Medium — fallback para indecisos)
  - Posicionada después de planes y testimonios, no como producto principal.
  - Encabezado: "¿Todavía no te decides?" para dejar claro que es para indecisos.
  - Precio visible (S/80), duración 20–30 min, diagnóstico + dirección clara.
  - Comunicar que los S/80 se descuentan del primer mes si contrata un plan.
  - CTA: "Primero quiero la Evaluación →" con mensaje pre-llenado que lo identifica.

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

- **Tracking y UTMs** (Priority: High — pendiente de activación)
  - Captura de `utm_source`, `utm_medium`, `utm_campaign` desde la URL.
  - Mensaje pre-llenado incluye UTM cuando está disponible; sin UTM, el mensaje va sin etiqueta de origen.
  - Eventos custom: `scroll_frustracion`, `scroll_metodo`, `scroll_testimonios`, `scroll_para_quien`, `whatsapp_click` (con `section_id` y `package_name`), `whatsapp_click_floating`.
  - Meta Pixel: pendiente de activación (falta Pixel ID).
  - GA4: pendiente de activación (falta Measurement ID G-XXXXXXXXXX).

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

**Flujo principal:** Hero (scroll a planes) → Por qué fallaste → Método → **Planes** → Qué incluye cada plan → Testimonios → Para quién sí/no → Evaluación S/80 (fallback) → FAQ → Footer. El botón flotante de WhatsApp está siempre disponible para leads que ya vienen decididos.

### 5.2 Core experience

- **Aterrizaje en hero**: Titular reconoce frustración previa. CTA hace scroll a planes (no a WhatsApp).
- **Diagnóstico del problema**: Sección "Por qué fallaste" con la pregunta central "¿Por qué tú sí, si ya muchos fallaron conmigo?".
- **Entendimiento del método**: 6 pasos + bloque de compromiso requerido actúa como filtro pasivo temprano.
- **Elección de plan**: El visitante ve los 4 planes, qué incluye cada uno, y si está listo escribe al asesor mencionando el plan de interés.
- **Si no se decide**: La sección de Evaluación S/80 le ofrece un paso previo de bajo riesgo.
- **Autoidentificación**: La sección "Para quién sí/no" permite que el visitante incompatible se autodescarte sin sentirse rechazado.
- **Resolución de dudas**: FAQ responde objeciones comunes antes de que el visitante necesite escribir al asesor.

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

- **Tasa de clic en CTA WhatsApp**: >15% del total de visitantes.
- **Distribución de clics por sección**: hero, planes, qué incluye, para quién, evaluación, footer, flotante.
- **Distribución de clics por plan**: qué plan específico genera más conversaciones (vía `package_name` en evento).
- **Tasa de scroll profundo**: >50% llegan a la sección de planes.
- **Tasa de scroll hasta "Para quién sí/no"**: >40%.
- **Tasa de rebote en hero**: <50%.
- **Satisfacción cualitativa del lead al llegar a WhatsApp**: feedback subjetivo de Rodrigo.

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

- **WhatsApp**: `https://wa.me/51919151237?text=<mensaje>`. Mensaje incluye nombre del plan o evaluación + UTM si está disponible.
- **Meta Pixel**: Pendiente de activación. Pixel ID requerido.
- **Google Analytics 4**: Pendiente de activación. Measurement ID requerido.
- **UTM parameters**: Convención definida en sección 5.1. Pendiente de aplicar en cada canal.
- **Hosting**: Astro estático desplegado en Netlify. Repo en GitHub (`HanzoDYoko/ajl-nutricion-`).

### 8.2 Data storage & privacy

- No se almacenan datos personales en v1.0. Todo viaja en el mensaje pre-llenado de WhatsApp.
- Cookie banner implementado según Ley 29733 (Perú).
- Política de privacidad: placeholder en footer, pendiente de texto legal definitivo.
- HTTPS garantizado vía Netlify (redirect HTTP → HTTPS configurado en `netlify.toml`).

### 8.3 Scalability & performance

- Sitio estático: escalabilidad ilimitada para el volumen esperado.
- CDN incluido por defecto en Netlify.
- Imágenes: WebP/AVIF con lazy loading.
- JS mínimo client-side: captura UTM, construcción de links de WhatsApp, scroll tracking con IntersectionObserver.

### 8.4 Potential challenges

- **Hipótesis no validada**: ventana de 60 días y métricas claras permiten decisión basada en datos.
- **Tracking incompleto**: Meta Pixel y GA4 aún no activos. Bloquea visibilidad de conversiones de ads.
- **Testimonios pendientes**: la sección existe con placeholders. Requiere selección de pacientes reales.
- **Foto del hero**: pendiente. Idealmente foto real de Alejandro o consulta (no stock).
- **Política de privacidad**: texto legal pendiente. Footer tiene link placeholder.
- **UTMs no aplicados en canales**: los links en bio de Instagram y TikTok aún no tienen UTMs. Bloquea trazabilidad.

## 9. Milestones & sequencing

### 9.1 Estado actual (v1.1)

Landing implementada y desplegada en GitHub. Pendiente de deploy en Netlify para URL pública.

### 9.2 Próximos pasos

1. Deploy en Netlify → URL pública disponible en móvil.
2. Activar GA4 (obtener Measurement ID y descomentar en `Layout.astro`).
3. Activar Meta Pixel (obtener Pixel ID y descomentar en `Layout.astro`).
4. Aplicar UTMs en links de bio (Instagram, TikTok) y en ManyChat.
5. Reemplazar testimonios placeholder con contenido real.
6. Agregar foto real al hero.
7. Completar política de privacidad.
8. Iniciar ventana de medición de 60 días.

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
  - El precio S/80 está visible sin hover ni click.
  - Se comunica que los S/80 se descuentan del primer mes si el paciente contrata un plan.
  - Se especifica duración (20–30 min) y que incluye diagnóstico + dirección clara.
  - El CTA dice "Primero quiero la Evaluación →" y abre WhatsApp con mensaje pre-llenado.

### 10.10 Ver los planes de forma informativa y elegir uno

- **ID**: US-010
- **Description**: Como visitante, quiero ver los 4 planes disponibles con sus precios, frecuencias y diferencias, para elegir el que encaja con mi caso antes de contactar al asesor.
- **Acceptance criteria**:
  - Los 4 planes están presentes: Básico (S/250), Acompañamiento (S/320), Constancia (S/440), Transformación (S/600).
  - Cada plan muestra nombre, tagline, precio, frecuencia de sesiones, features incluidas y no incluidas, y pricing de programas (3/6 meses donde aplique).
  - Cada plan tiene su propio CTA a WhatsApp con mensaje pre-llenado que menciona el nombre del plan.
  - El evento `whatsapp_click` se registra con `section_id=paquetes` y `package_name=<nombre del plan>`.

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
- **Description**: Como visitante decidido a contactar al asesor, quiero poder hacerlo desde múltiples puntos de la landing.
- **Acceptance criteria**:
  - CTAs a WhatsApp en: cada tarjeta de plan, sección de evaluación, sección "qué incluye", y footer.
  - El CTA del hero hace scroll a planes (no abre WhatsApp directamente).
  - Cada CTA con mensaje pre-llenado que incluye plan o evaluación de interés + UTM si está disponible.
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
  - Open Graph configurado: `og:title`, `og:description`, `og:image`.
  - Preview renderiza correctamente en WhatsApp, Facebook, Instagram DM y X/Twitter.
  - Imagen OG pendiente: requiere asset real en `/public/og-image.jpg`.

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
- **Description**: Como asesor comercial (Rodrigo), quiero recibir cada lead en WhatsApp con un mensaje pre-llenado que incluya el plan de interés y su fuente de origen.
- **Acceptance criteria**:
  - Mensaje pre-llenado incluye el plan específico cuando el lead hace clic en el CTA de un plan (ej: "Hola, me interesa el plan Constancia de AJL Nutrición.").
  - Mensaje incluye UTM de origen cuando está disponible.
  - Sin UTM, el mensaje va sin etiqueta de origen (no incluye "origen: directo").
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
