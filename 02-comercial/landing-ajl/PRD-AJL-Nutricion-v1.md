# PRD: AJL Nutrición Landing Page

## 1. Product overview

### 1.1 Document title and version

- PRD: AJL Nutrición Landing Page
- Version: 1.2
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
- **Administrador / equipo interno (futuro)**: En v1.0 no existe panel de admin. La edición de contenido se hace vía despliegue de código (GitHub Pages). Considerado para roadmap, no requisito de v1.0.

## 4. Functional requirements

### 4.1 Decisiones de diseño implementadas en v1.2

**Sistema de diseño:** mock-a-light-bento. Inspirado en Apple.com. Fondo `#F5F5F7`, cards `#FFFFFF`, tipografía Plus Jakarta Sans (headings) + Inter (body), sistema de bento grid de 6 columnas, acentos dorado `#C8973A`, rose `#FF6B8A`, verde `#34C77B`.

**H1 definitivo:** "Nutrición que se adapta a tu día a día." con subtítulo "Con un sistema personalizado para ti." El gradiente dorado-rose recae sobre "a tu día a día."

**Pilar 4 del método:** renombrado de "Backend calórico oculto" (técnico) a "Resultados precisos sin contar calorías" (lenguaje del paciente).

**Removidos en v1.2:**
- Tag "Aceptando nuevos pacientes · Lima, Perú" del hero (generaba ruido visual).
- Bloque "Tu parte en el proceso" de la sección método (reducía conversión).
- Cuadro rosado "La pregunta correcta" de la sección "Por qué fallaste" (redundante).
- Tags de plan (Básico, Acompañamiento, etc.) en las tarjetas de "¿Qué incluye cada plan?" (generaban demasiado color y complejidad visual).
- Estadística 93% y precio desde S/250 del bento de stats.

**Cambios de copy:**
- Sección "Por qué fallaste": título cambiado a "¿Cómo sé que esta vez va a funcionar si ya he fallado antes?"
- Banner diferencia + filosofía: fusionados en un único tile blanco span-6 con texto en gradiente metálico naranja-dorado.
- Planes: nombre del plan es el H3 principal; el subtítulo descriptivo (ej. "Para empezar") aparece en uppercase pequeño debajo.
- ¿Tienes dudas sobre qué plan elegir?: botón redirige a sección Evaluación (no a WhatsApp).
- Botón flotante WhatsApp: label "Inicia tu cambio aquí con nosotros". Mensaje automático: "Vi su página web y quiero iniciar mi cambio con ustedes."
- Botón de evaluación: "Agendar Evaluación por WhatsApp →" (más directo).

**Para quién sí/no:** convertido a dos columnas side-by-side (span-3 + span-3) dentro del bento del método.

---

### 4.2 Secciones y requisitos funcionales

- **Hero section** (Priority: High)
  - Titular: "Nutrición que se adapta a tu día a día." — diferenciador estructural.
  - Subtítulo: "Con un sistema personalizado para ti."
  - CTA primario visible above-the-fold que hace scroll a la sección de planes.
  - Sin pop-ups, sin formularios. Sin tag de disponibilidad.

- **Banner "La diferencia"** (Priority: High)
  - Tile blanco span-6 con texto principal en gradiente metálico naranja-dorado.
  - Comunica: estructura para vida real (Rappi, restaurantes, eventos).
  - Incluye filosofía integrada: "La restricción extrema no produce resultados sostenibles. La estructura inteligente para tu vida real, sí."

- **Sección "¿Cómo sé que esta vez va a funcionar si ya he fallado antes?"** (Priority: High)
  - Tabla "lo que el paciente dice" vs "el problema real" — texto a 19px para legibilidad.
  - Valida emocionalmente sin culpar al paciente.

- **Sección "Cómo funciona el método"** (Priority: High)
  - 6 pilares: (1) Estructura en tu vida real, (2) Planificación semanal, (3) Gestión de porciones visible, (4) Resultados precisos sin contar calorías, (5) Acompañamiento cercano, (6) Ajuste por adherencia real.
  - Títulos de pilares a 22px, descripciones a 15px.
  - Seguido de la sección "Para quién sí/no" en bento side-by-side.

- **Sección "Para quién sí / Para quién no"** (Priority: High — filtro pasivo central)
  - Dos tiles span-3 lado a lado.
  - Izquierda: "Este plan es para ti si:" con 5 checks verdes.
  - Derecha: "No es para ti si…" con 5 items en gris.
  - Sin descripciones extensas — solo el criterio en una línea.

- **Sección de planes** (Priority: High — producto principal)
  - 4 planes: Básico (S/250), Acompañamiento (S/320), Constancia (S/440 — destacado con fondo dorado claro), Transformación (S/600).
  - Nombre del plan = H3 principal. Tagline = uppercase pequeño debajo.
  - Cada plan tiene su propio CTA a WhatsApp con mensaje pre-llenado que incluye el nombre del plan.

- **Sección "¿Qué incluye cada plan?"** (Priority: High)
  - Detalle de cada componente en tarjetas individuales sin badges de color.
  - Dos grupos: Sesiones individuales y Acompañamiento continuo.
  - Última tarjeta: fondo dorado claro (no negro). Botón redirige a #evaluacion.
  - Títulos de tarjetas a 18px.

- **Sección "Pacientes reales"** (Priority: Medium)
  - 3 testimonios placeholder (Carla, Diego, Valeria). Pendiente contenido real.

- **Sección "Evaluación Nutricional Personal — S/80"** (Priority: Medium — fallback indecisos)
  - Título a 40px. Posicionada después de testimonios.
  - CTA: "Agendar Evaluación por WhatsApp →" — abre WhatsApp directamente.
  - Los S/80 se descuentan del primer mes si contrata un plan.

- **FAQ** (Priority: Medium)
  - 6 preguntas en acordeón. Navegable por teclado. Animación max-height.

- **Botón flotante de WhatsApp** (Priority: High)
  - Label emergente al hover: "Inicia tu cambio aquí con nosotros".
  - Mensaje pre-llenado general: "Vi su página web y quiero iniciar mi cambio con ustedes."
  - Visible durante todo el scroll.

- **Tracking y UTMs** (Priority: High — pendiente de activación)
  - Captura de `utm_source`, `utm_medium`, `utm_campaign` desde la URL.
  - Mensaje pre-llenado incluye UTM cuando está disponible.
  - Meta Pixel: pendiente de activación.
  - GA4: pendiente de activación.

- **Pie de página** (Priority: Low)
  - Datos de contacto, links a redes, aviso legal mínimo.

## 5. User experience

### 5.1 Entry points & first-time user flow

- **Instagram (orgánico)**: Link en bio o sticker de stories. `utm_source=ig&utm_medium=bio`.
- **TikTok (orgánico)**: Link en bio. `utm_source=tt&utm_medium=bio`.
- **Meta Ads (pagado)**: `utm_source=meta&utm_medium=ads&utm_campaign=<nombre>`.
- **ManyChat**: Respuesta automática a comentarios. `utm_source=manychat&utm_medium=dm`.
- **Referidos**: Link compartido por paciente actual. `utm_source=referido`.
- **Directo / desconocido**: Sin UTM. Mensaje de WhatsApp va sin etiqueta de origen.

**Flujo principal:** Hero → Banner diferencia → Por qué fallaste → Método + Para quién → **Planes** → Qué incluye cada plan → Testimonios → Evaluación S/80 → FAQ → Footer. Botón flotante WhatsApp siempre visible.

### 5.2 Core experience

- **Aterrizaje en hero**: Titular reconoce el deseo de adaptación. CTA hace scroll a planes.
- **Diferenciación**: Banner dorado comunica la filosofía del método en un bloque visual limpio.
- **Diagnóstico del problema**: Tabla grande "por qué fallaste" con texto a 19px — fácil de leer.
- **Entendimiento del método**: 6 pilares con títulos grandes + para quién sí/no side-by-side actúan como filtro pasivo.
- **Elección de plan**: 4 planes con nombre prominente como H3. El visitante escribe al asesor mencionando el plan.
- **Si no se decide**: Tarjeta "¿Tienes dudas?" lleva a la Evaluación S/80 dentro de la misma página.
- **Evaluación como paso previo**: CTA directo a WhatsApp desde la sección de evaluación.

### 5.3 UI/UX highlights

- **Paleta**: fondo `#F5F5F7`, cards `#FFFFFF`, dorado `#C8973A`, rose `#FF6B8A`, verde `#34C77B`, negro `#1D1D1F`.
- **Tipografía**: Plus Jakarta Sans 400/500/600/700/800 (headings), Inter 400/500/600 (body).
- **Bento grid**: 6 columnas, gap 14px, border-radius 22px. Hover: translateY(-6px) + shadow.
- **Gradiente metálico**: `linear-gradient(135deg, #C8973A, #EFA05A, #E06030)` — usado en banner diferencia y número de pilar.
- **Gradiente hero**: `linear-gradient(135deg, #C8973A, #FF6B8A)` — usado en texto H1 y acentos.
- **Animaciones**: IntersectionObserver threshold 0.1, fadeUp 0.7s ease. Respeta `prefers-reduced-motion`.
- Mobile-first. La mayoría del tráfico viene de Instagram y TikTok en móvil.
- Sin pop-ups ni formularios de captura.

## 6. Narrative

Diego es un ingeniero de 38 años que ha intentado bajar grasa corporal durante los últimos tres años sin éxito sostenible. Probó keto, una app de conteo de calorías y dos nutricionistas distintos, y cada vez terminó en el mismo ciclo: tres meses de disciplina forzada, abandono, culpa y recuperación del peso perdido. Está cansado de planes que ignoran que almuerza fuera cuatro veces por semana y que no piensa renunciar a la cerveza con amigos los viernes. Lleva semanas viendo reels de AJL Nutrición en Instagram y le llama la atención que el discurso no le promete bajar diez kilos en treinta días. Entra a la landing desde el link en bio, lee el método, ve los planes y entiende qué nivel de acompañamiento necesita. Se identifica con el plan Constancia porque quiere revisiones quincenales sin comprometerse a algo semanal. Hace clic en "Quiero este plan", llega a WhatsApp con el mensaje "Hola, me interesa el plan Constancia de AJL Nutrición" y Rodrigo ya sabe cómo empezar la conversación.

## 7. Success metrics

### 7.1 User-centric metrics

- **Tasa de clic en CTA WhatsApp**: >15% del total de visitantes.
- **Distribución de clics por sección**: hero, planes, qué incluye, evaluación, footer, flotante.
- **Distribución de clics por plan**: qué plan específico genera más conversaciones.
- **Tasa de scroll profundo**: >50% llegan a la sección de planes.
- **Tasa de rebote en hero**: <50%.

### 7.2 Business metrics

- **Calidad del lead**: % de conversaciones que terminan agendando o contratando. Objetivo: >25% vs ~3.5% actual.
- **Volumen de planes contratados desde la landing / mes**.
- **Volumen de evaluaciones de S/80 agendadas desde la landing / mes**.
- **Distribución de origen del lead (por UTM)**: % por canal.
- **Ventana de medición**: 60 días de tráfico estable post-lanzamiento.

### 7.3 Technical metrics

- Lighthouse Performance (mobile): >85.
- Lighthouse Accessibility: >90.
- Lighthouse SEO: >90.
- LCP <2.5s, CLS <0.1.
- Tiempo de carga en 3G: <4s.

## 8. Technical considerations

### 8.1 Integration points

- **WhatsApp**: `https://wa.me/51919151237?text=<mensaje>`. Mensaje incluye nombre del plan o evaluación + UTM si está disponible.
- **Meta Pixel**: Pendiente de activación. Pixel ID requerido.
- **Google Analytics 4**: Pendiente de activación. Measurement ID requerido.
- **UTM parameters**: Convención definida en sección 5.1. Pendiente de aplicar en cada canal.
- **Hosting**: GitHub Pages. Repo: `Loayza97/AJL-Landing`. URL: `https://loayza97.github.io/AJL-Landing/02-comercial/landing-ajl/demos/landing-prd.html`.

### 8.2 Data storage & privacy

- No se almacenan datos personales en v1.0. Todo viaja en el mensaje pre-llenado de WhatsApp.
- Política de privacidad: placeholder en footer, pendiente de texto legal definitivo.
- HTTPS garantizado vía GitHub Pages.

### 8.3 Scalability & performance

- Sitio estático: escalabilidad ilimitada para el volumen esperado.
- CDN incluido por defecto en GitHub Pages.
- JS mínimo client-side: captura UTM, construcción de links de WhatsApp, FAQ accordion con max-height, reveal animations con IntersectionObserver.

### 8.4 Potential challenges

- **Hipótesis no validada**: ventana de 60 días y métricas claras permiten decisión basada en datos.
- **Tracking incompleto**: Meta Pixel y GA4 aún no activos. Bloquea visibilidad de conversiones de ads.
- **Testimonios pendientes**: la sección existe con placeholders (Carla, Diego, Valeria). Requiere selección de pacientes reales.
- **Política de privacidad**: texto legal pendiente. Footer tiene link placeholder.
- **UTMs no aplicados en canales**: los links en bio de Instagram y TikTok aún no tienen UTMs. Bloquea trazabilidad.
- **URL larga de GitHub Pages**: considerar dominio propio o Netlify para URL limpia en producción.

## 9. Milestones & sequencing

### 9.1 Estado actual (v1.2 — Mayo 2026)

- Landing implementada en HTML estático (archivo: `landing-prd.html`).
- Subida al repo `Loayza97/AJL-Landing` en GitHub.
- GitHub Pages activado. URL: `https://loayza97.github.io/AJL-Landing/02-comercial/landing-ajl/demos/landing-prd.html`.
- Diseño bento completo, todas las secciones implementadas, UTM capture funcional, WhatsApp pre-filled messages operativos.

### 9.2 Próximos pasos

1. Conectar dominio propio o migrar a Netlify para URL limpia (ej. `nutricion.ajl.pe`).
2. Activar GA4 (obtener Measurement ID).
3. Activar Meta Pixel (obtener Pixel ID).
4. Aplicar UTMs en links de bio (Instagram, TikTok) y en ManyChat.
5. Reemplazar testimonios placeholder con contenido real.
6. Completar política de privacidad.
7. Iniciar ventana de medición de 60 días.

## 10. User stories

### 10.1 Aterrizar desde Instagram orgánico
- **ID**: US-001
- **Description**: Como paciente tibio que llega desde el link en bio de Instagram, quiero aterrizar en una landing que cargue rápido y comunique de inmediato de qué se trata.
- **Acceptance criteria**: `utm_source=ig` registrado. LCP <2.5s. Titular visible above-the-fold en 375px. Botón flotante visible desde el primer segundo.

### 10.2 Aterrizar desde Meta Ads
- **ID**: US-002
- **Description**: Como paciente frío que llega desde un anuncio de Meta, quiero ver un mensaje que reconozca mi frustración previa.
- **Acceptance criteria**: UTMs registrados e incluidos en mensaje WhatsApp. Meta Pixel registra PageView (pendiente activación).

### 10.3 Aterrizar desde TikTok
- **ID**: US-003
- **Acceptance criteria**: `utm_source=tt` registrado. Todos los elementos tap-friendly (44×44px mínimo). Sin scroll horizontal en mobile.

### 10.4 Aterrizar desde ManyChat
- **ID**: US-004
- **Acceptance criteria**: `utm_source=manychat` registrado y aparece en mensaje WhatsApp pre-llenado.

### 10.5 Aterrizar como referido
- **ID**: US-005
- **Acceptance criteria**: `utm_source=referido` registrado. Botón flotante visible desde inicio. CTA hero lleva a planes.

### 10.6 Aterrizar sin UTM
- **ID**: US-006
- **Acceptance criteria**: Visita registrada en analytics sin UTM. Mensaje WhatsApp va sin etiqueta de origen. Flujo idéntico.

### 10.7 Comprender por qué puede funcionar esta vez
- **ID**: US-007
- **Description**: Como visitante que ha fallado con dietas antes, quiero leer una explicación honesta de por qué esta vez es diferente.
- **Acceptance criteria**: Sección "¿Cómo sé que esta vez va a funcionar si ya he fallado antes?" visible al hacer scroll. Tabla "lo que el paciente dice" vs "el problema real" a 19px. Valida sin culpar.

### 10.8 Comprender el método de los 6 pilares
- **ID**: US-008
- **Acceptance criteria**: 6 pilares presentes: (1) Estructura en tu vida real, (2) Planificación semanal, (3) Gestión de porciones visible, (4) Resultados precisos sin contar calorías, (5) Acompañamiento cercano, (6) Ajuste por adherencia real. Títulos 22px. Descripciones 15px. Legible en mobile.

### 10.9 Autoidentificarme como cliente ideal o no ideal
- **ID**: US-009
- **Description**: Como visitante, quiero leer criterios claros sobre para quién sí y para quién no es este método.
- **Acceptance criteria**: Dos columnas side-by-side. "Este plan es para ti si:" con 5 checks verdes. "No es para ti si…" con 5 items grises. Sin descripciones extensas.

### 10.10 Ver y elegir un plan
- **ID**: US-010
- **Acceptance criteria**: 4 planes presentes con nombre como H3 principal y tagline en uppercase pequeño. Precios visibles. CTA a WhatsApp por plan con mensaje pre-llenado. Plan Constancia destacado con fondo dorado claro.

### 10.11 Entender en detalle qué incluye cada plan
- **ID**: US-010b
- **Acceptance criteria**: Sección "¿Qué incluye cada plan?" con dos grupos. Tarjetas sin badges de color. Última tarjeta fondo dorado claro, botón redirige a sección Evaluación. Títulos 18px.

### 10.12 Conocer la Evaluación Nutricional Personal de S/80
- **ID**: US-011
- **Acceptance criteria**: Título a 40px. Precio S/80 visible. Los S/80 se descuentan del primer mes. CTA "Agendar Evaluación por WhatsApp →" abre WhatsApp con mensaje pre-llenado. Posicionada después de testimonios.

### 10.13 Resolver dudas vía FAQ
- **ID**: US-012
- **Acceptance criteria**: 6 preguntas en acordeón. Navegable por teclado. Animación max-height suave. Cubre: modalidad, evaluación, por qué no es gratis, diferencias entre planes, tiempo para resultados, restaurantes/delivery.

### 10.14 Contactar desde cualquier sección
- **ID**: US-013
- **Acceptance criteria**: CTAs a WhatsApp en cada plan, evaluación, y footer. CTA del hero hace scroll a planes. Mensajes pre-llenados por plan y evaluación.

### 10.15 Usar el botón flotante en cualquier momento
- **ID**: US-014
- **Acceptance criteria**: Botón flotante visible en todo el scroll. Label "Inicia tu cambio aquí con nosotros" al hover. Mensaje: "Vi su página web y quiero iniciar mi cambio con ustedes." + UTM si disponible.

### 10.16 Recibir leads como asesor con contexto
- **ID**: US-015
- **Acceptance criteria**: Mensaje incluye plan específico cuando el lead hace clic en CTA de un plan. Incluye UTM cuando disponible. Mensaje natural, en primera persona, <200 caracteres. Editable antes de enviar.

---

## 11. Implementation Reference — Todo para generar la landing desde cero

Esta sección contiene el copy exacto, estructura de secciones y sistema de diseño necesarios para regenerar `landing-prd.html` desde cero sin referirse al archivo HTML.

---

### 11.1 Sistema de diseño

**Fuentes (Google Fonts):**
```
Plus Jakarta Sans: 400, 500, 600, 700, 800 — headings, botones, eyebrows
Inter: 400, 500, 600 — body, descripciones
```

**Paleta de colores:**
```css
--bg: #F5F5F7          /* fondo general */
--card: #FFFFFF        /* fondo de tiles/cards */
--ink: #1D1D1F         /* texto principal */
--ink-soft: #6E6E73    /* texto secundario/muted */
--line: #E8E8EC        /* bordes, separadores */
--gold: #C8973A        /* acento principal */
--gold-soft: #FDF4E3   /* fondo suave dorado */
--green: #34C77B       /* checks "para ti" */
--green-soft: #E1F8EB
--blue: #5B6CFF        /* plan Acompañamiento */
--blue-soft: #EAEDFF
--rose: #FF6B8A        /* acento secundario, plan Transformación */
--rose-soft: #FFE5EC
--sage: #6B9E7A        /* plan Básico */
--sage-soft: #EBF4ED
```

**Gradientes clave:**
```css
/* Hero H1 — "a tu día a día" */
background: linear-gradient(135deg, #C8973A 0%, #FF6B8A 100%);

/* Banner diferencia — texto h3 y cita */
background: linear-gradient(135deg, #C8973A 0%, #EFA05A 50%, #E06030 100%);

/* Número de pilar */
background: linear-gradient(135deg, #C8973A, #EFA05A);

/* Hero tile planes (fondo naranja) */
background: linear-gradient(145deg, #F5C96A 0%, #EFA05A 45%, #F0826A 100%);

/* Plan Constancia (featured, fondo dorado claro) */
background: linear-gradient(145deg, #FFFBEF, #FEF5D5, #FDF0BA);

/* Tarjeta "¿Tienes dudas?" */
background: linear-gradient(145deg, #FEFAF2, #FDF6E3, #FDF2CC);
```

**Bento grid:**
```css
display: grid;
grid-template-columns: repeat(6, 1fr);
grid-auto-rows: minmax(180px, auto);
gap: 14px;
```
Clases de span: `.span-2`, `.span-3`, `.span-4`, `.span-6`, `.row-2`

**Tiles:**
```css
border-radius: 22px;
padding: 28px;
border: 1px solid var(--line);
transition: transform 0.4s cubic-bezier(.2,.8,.2,1), box-shadow 0.4s;
/* hover: translateY(-6px) + shadow 0 24px 48px rgba(0,0,0,0.09) */
```

**Animaciones:**
```css
/* Reveal on scroll — IntersectionObserver threshold 0.1 */
.reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.7s ease, transform 0.7s ease; }
.reveal.in { opacity: 1; transform: translateY(0); }
```

---

### 11.2 Estructura de secciones y copy exacto

#### NAV
- Logo: "A" (logo-mark dorado) + "AJL Nutrición"
- Links: Método | Planes | Qué incluye | Evaluación | FAQ
- CTA nav: "Ver planes →" (fondo negro, hover dorado, border-radius 999px)
- Sticky top, glassmorphism: `background: rgba(245,245,247,0.85); backdrop-filter: saturate(180%) blur(20px);`

---

#### HERO
- **H1:** "Nutrición que se adapta / **a tu día a día.**"
  - "a tu día a día." en gradiente dorado → rose
  - font-size: clamp(52px, 8.5vw, 108px), font-weight: 800
- **Subtítulo:** "Con un sistema personalizado para ti."
  - font-size: 18px, color: var(--ink-soft)
- **CTAs:**
  - Primario: "Ver planes y precios →" → scroll a #planes
  - Secundario: "Cómo funciona" → scroll a #metodo

---

#### BANNER "LA DIFERENCIA"
- Tile blanco, span-6, padding: 44px 52px
- **Eyebrow:** "La diferencia" (dot dorado)
- **H3 en gradiente metálico:** "Estructura para tu vida real, no para la ideal."
  - font-size: clamp(28px, 3.5vw, 44px), font-weight: 800
- **Párrafo:** "Diseñamos el plan sobre lo que realmente comes, dónde comes y con quién. Si usas Rappi 4 veces por semana, el plan lo contempla desde el día uno. No hay una vida ideal que seguir: hay tu vida, y la trabajamos con ella."
- **Separador dorado** (border-top: 1px solid rgba(200,151,58,0.2))
- **Label "FILOSOFÍA"** (11px uppercase)
- **Cita en gradiente:** "La restricción extrema no produce resultados sostenibles. La estructura inteligente para tu vida real, sí."
  - font-size: clamp(18px, 2.2vw, 26px), font-weight: 700
- **Atribución:** "— Alejandro Loayza, Nutricionista AJL"

---

#### SECCIÓN "¿CÓMO SÉ QUE ESTA VEZ VA A FUNCIONAR SI YA HE FALLADO ANTES?"
- **H2:** "¿Cómo sé que esta vez va a funcionar / si ya he fallado antes?"
- **Subtítulo:** "No fallaste porque te faltó fuerza de voluntad. Fallaste porque los planes que seguiste nunca fueron diseñados para tu vida real."

**Tile tabla (span-6):**
- Eyebrow: "La verdad que nadie te dijo" (dot rose)
- Headers: "Lo que el paciente dice" / "El problema real" (gold)
- font-size de celdas: 19px, padding de fila: 20px 0

| Lo que el paciente dice | El problema real |
|------------------------|-----------------|
| "Me faltó disciplina" | El plan ignoró tu contexto social y laboral |
| "Comí algo que no debía y lo arruiné todo" | No había estructura para situaciones reales fuera de lo planeado |
| "Los fines de semana lo eché todo a perder" | No tenías herramientas para navegar días flexibles sin culpa |
| "Recuperé todo lo que bajé" | El plan nunca fue sostenible por diseño: era demasiado rígido |
| "El nutricionista me daba una dieta genérica" | No contemplaba tus hábitos reales, gustos ni vida social |

---

#### SECCIÓN "CÓMO FUNCIONA EL MÉTODO"
- **H2:** "Cómo funciona el método"
- **Subtítulo:** "6 pilares que hacen que esta vez sea diferente a todo lo que probaste antes."
- **Botón derecho:** "Ver planes →" (btn-ghost btn-sm)

**Tile 6 pilares (span-6):**
- Eyebrow: "Los 6 pilares" (dot dorado)
- Grid 3×2 de steps. Cada step: fondo var(--bg), border-radius 14px, padding 20px

| # | Título (22px, 800) | Descripción (15px) |
|---|-------------------|-------------------|
| 01 | Estructura en tu vida real | Lo construimos sobre lo que realmente comes, dónde y con quién. Rappi, restaurantes, eventos: todo entra. |
| 02 | Planificación semanal | Cada semana se ajusta a lo que viviste. La semana siguiente siempre es mejor que la anterior. |
| 03 | Gestión de porciones visible | Aprendes a medir sin báscula: palma, taza, puño. Funciona en cualquier restaurante del mundo. |
| 04 | Resultados precisos sin contar calorías | Tú ves decisiones simples. Nosotros hacemos los cálculos para garantizar el déficit calórico preciso. |
| 05 | Acompañamiento cercano | Canal directo para dudas del día a día. "¿Qué pido en este matrimonio?" es una pregunta válida. |
| 06 | Ajuste por adherencia real | El plan evoluciona con tus datos reales. Si algo no funciona, no te culpamos: lo cambiamos. |

---

#### PARA QUIÉN SÍ / NO (dentro del mismo bento del método)

**Tile izquierdo (span-3) — verde**
- Eyebrow: "Este plan es para ti si:" (dot verde)
1. Comes fuera de casa frecuentemente y no quieres renunciar a eso
2. Ya probaste planes rígidos y no te funcionaron a largo plazo
3. Estás dispuesto a registrar tu alimentación las primeras semanas
4. Buscas resultados sostenibles en el tiempo, no una solución de 30 días
5. Puedes comprometerte a asistir a revisiones regulares

**Tile derecho (span-3) — gris/bg**
- Eyebrow: "No es para ti si…" (dot ink-soft)
1. Buscas que te digan qué comer cada día sin involucrarte en el proceso
2. Esperas bajar X kilos en 30 días sin cambios de hábito reales
3. Crees que el azúcar o los carbohidratos son "el enemigo" y no estás dispuesto a cuestionarlo
4. No puedes comprometerte a asistir a revisiones ni a registrar datos
5. Buscas una dieta mágica rápida, no un cambio sostenible

---

#### SECCIÓN "ELIGE TU PLAN" (id="planes")
- **H2:** "Elige tu plan"
- **Subtítulo:** "4 niveles de acompañamiento. Sin permanencias. Todos incluyen planificación personalizada."

**Hero tile (span-2, row-2) — fondo naranja gradient:**
- Eyebrow: "4 planes"
- H3: "El plan correcto para cada momento de tu vida."
- P: "Básico · Acompañamiento · Constancia · Transformación. Desde S/250 hasta S/600/mes. Sin permanencias."

**4 plan tiles (span-2 cada uno):**

| Plan | Color | H3 | Tagline | Features | Precio |
|------|-------|-----|---------|----------|--------|
| Básico | sage (#6B9E7A) | Básico | PARA EMPEZAR | 1 sesión/mes · Plan personalizado · Soporte WhatsApp | S/250/mes |
| Acompañamiento | blue (#5B6CFF) | Acompañamiento | MÁS GUÍA | 2 sesiones/mes · Plan personalizado · Soporte prioritario · Revisión quincenal | S/320/mes |
| Constancia | gold (#C8973A) — FEATURED | Constancia | EL BALANCE | Revisiones quinc. · Plan adaptativo · Soporte 24/7 · Comunidad · Ajuste real | S/440/mes (desde S/1,100/trimestre) |
| Transformación | rose (#FF6B8A) | Transformación | MÁXIMO NIVEL | Revisiones semanales · Composición corp. · Acceso prioritario · Estrategia 6 meses | S/600/mes (desde S/1,500/trimestre) |

- Constancia tiene badge "Más elegido" (top right, fondo dorado)
- Cada CTA: "Quiero este →" → `openWsp('NombrePlan', event)`
- CTA message: `Hola, me interesa el plan ${plan} de AJL Nutrición.`

---

#### SECCIÓN "¿QUÉ INCLUYE CADA PLAN?" (id="incluye")
- **H2:** "¿Qué incluye cada plan?"
- Grid 3 columnas, sin badges de plan en las tarjetas (font-size nombre: 18px)

**Grupo 1: Sesiones individuales**
1. Sesión de evaluación inicial — Primera sesión donde se construye el plan sobre tu vida real, hábitos, trabajo y contexto social. La base de todo.
2. Revisión mensual (1 sesión) — Revisión del mes, ajuste del plan según lo que viviste y calibración de metas para el siguiente período.
3. Revisión quincenal (2 sesiones) — Revisión cada dos semanas. Ideal para quienes quieren feedback frecuente sin comprometerse a sesiones semanales.
4. Revisión semanal (4 sesiones) — Sesión semanal intensiva. Máximo nivel de seguimiento y ajuste.
5. Análisis de composición corporal — Medición de masa grasa, músculo y agua corporal para ajustar metas de forma precisa más allá del peso en la balanza.
6. Estrategia nutricional a 6 meses — Hoja de ruta de largo plazo: fases, metas progresivas y criterios de ajuste para los próximos 6 meses.

**Grupo 2: Acompañamiento continuo**
1. Plan nutricional personalizado — Plan adaptado a tu contexto: restaurantes habituales, hábitos familiares, gustos, intolerancias y vida social. No es un template.
2. Soporte por WhatsApp — Canal directo para dudas del día a día: "¿qué pido en este restaurante?", "¿cómo manejo la cena de hoy?". Respuesta real, no genérica.
3. Soporte prioritario 24/7 — Acceso a respuesta prioritaria en cualquier momento. Para momentos críticos, dudas urgentes y situaciones imprevistas.
4. Ajuste por adherencia real — El plan evoluciona con tus datos reales: si algo no funcionó, lo ajustamos en la siguiente revisión. Sin culpa, con datos.
5. Acceso a comunidad privada — Grupo de pacientes activos de AJL. Apoyo entre pares, recetas, tips y motivación de quienes están en el mismo proceso.
6. **¿Tienes dudas sobre qué plan elegir?** (tarjeta especial, fondo dorado claro gradient) — "Puedes agendar una sesión de evaluación." — Botón "Agendar evaluación →" hace scroll a #evaluacion.

---

#### TESTIMONIOS (id="testimonios")
- **H2:** "Pacientes reales"
- **Subtítulo:** "Personas reales que cambiaron su relación con la comida."
- Grid 3 columnas

| Avatar | Nombre | Contexto | Testimonio |
|--------|--------|----------|------------|
| C | Carla M. | Gerente de marketing · Plan Constancia | "Siempre pensé que yo era el problema. Que me faltaba fuerza de voluntad. Alejandro fue el primero en explicarme que el plan anterior simplemente ignoraba que yo almuerzo fuera de casa todos los días. Ahora tengo estructura y como rico." |
| D | Diego R. | Ingeniero · Plan Acompañamiento | "Lo que más me sorprendió es que nunca me pidieron que dejara de salir con amigos ni de tomar mi cerveza del viernes. Me enseñaron a comer dentro de esos contextos. Llevo 8 meses y no he rebotado." |
| V | Valeria T. | Abogada · Plan Transformación | "Venía de dos nutricionistas que me daban la misma dieta genérica. Aquí el plan fue completamente distinto desde el inicio. Lo más valioso fue aprender a comer en restaurantes sin ansiedad. Eso cambió todo." |

**Nota:** Todos placeholders. Requiere contenido real del equipo.

---

#### EVALUACIÓN NUTRICIONAL PERSONAL (id="evaluacion")

**Tile principal (span-4):**
- Eyebrow: "¿Todavía no te decides?"
- **H3 (40px):** "Evaluación Nutricional Personal — **S/80**" (S/80 en dorado)
- P: "Un primer paso de bajo riesgo para quienes aún no saben qué plan elegir. 20–30 minutos de diagnóstico real y dirección clara sobre cuál es tu siguiente paso."
- Nota: "**Los S/80 se descuentan del primer mes** si luego contratas un plan mensual."
- **CTA:** "Agendar Evaluación por WhatsApp →" → `openWsp('Evaluación S/80', event)`
- Message: `Hola, quiero agendar la Evaluación Nutricional Personal de S/80.`

**Tile incluye (span-2, fondo gold-soft):**
- Diagnóstico real de tu situación nutricional actual
- Dirección clara: qué plan te conviene y por qué
- Revisión de historial y contexto de vida real
- Los S/80 se descuentan si luego contratas un plan
- Badge: "Duración: 20–30 minutos · Virtual o presencial"

---

#### FAQ (id="faq")
- **H2:** "Preguntas frecuentes"
- **Subtítulo:** "Respuestas honestas a las dudas más comunes antes de escribirnos."
- Acordeón max-width 800px, animación max-height

| Pregunta | Respuesta |
|----------|-----------|
| ¿Las consultas son presenciales o virtuales? | Ambas modalidades están disponibles. La mayoría de nuestros pacientes prefieren la modalidad virtual por la comodidad, pero también atendemos de forma presencial en Lima. Indícanos tu preferencia al escribirnos. |
| ¿Qué pasa después de la Evaluación de S/80? | Recibes un diagnóstico claro de tu situación y una recomendación del plan que mejor encaja con tus metas y contexto. Si decides contratar un plan, los S/80 se descuentan del primer mes. No hay ninguna obligación de contratar. |
| ¿Por qué la evaluación no es gratis? | Porque es una consulta real con diagnóstico real, no una reunión de ventas. En 20–30 minutos hacemos un análisis completo de tu situación. El costo de S/80 también asegura que la persona que llega tiene intención genuina de cambiar. |
| ¿Cuál es la diferencia concreta entre los planes? | La diferencia principal está en la frecuencia de revisión y el nivel de soporte. Básico: 1 sesión/mes. Acompañamiento: 2 sesiones/mes. Constancia: revisiones quincenales + comunidad + ajuste por adherencia. Transformación: revisiones semanales + composición corporal + estrategia a 6 meses. Todos incluyen plan personalizado y soporte WhatsApp. |
| ¿Cuánto tiempo tarda en verse resultados? | Los primeros cambios en cómo te sientes suelen aparecer en las primeras 2–3 semanas. Los cambios en composición corporal visibles requieren al menos 6–8 semanas de adherencia consistente. No prometemos tiempos específicos, pero sí un plan diseñado para que los resultados sean sostenibles. |
| ¿Puedo seguir yendo a restaurantes y usando delivery? | Sí, y eso es parte del diseño del plan, no una excepción. Aprender a comer en restaurantes, pedir por Rappi, navegar menús de trabajo y cenas sociales es parte del método. Si dejar todo eso fuera el requisito, el plan no sería sostenible. |

---

#### CTA FINAL
- Fondo negro con radial gradients dorado y rose
- **H2:** "¿Listo para empezar?"
- **P:** "Escríbenos por WhatsApp. Sin presiones, sin formularios. Solo una conversación honesta sobre si somos el match correcto."
- Botones: "Ver planes →" (blanco) | "Escribir al WhatsApp" (transparente con borde)

---

#### FOOTER
- Logo + "Clínica de nutrición de precisión en Lima, Perú. Método para vida real. Sin restricciones absurdas."
- Columna Navegación: Cómo funciona | Planes | Qué incluye | Evaluación S/80 | FAQ
- Columna Contacto: WhatsApp +51 919 151 237 | alejandro.loayza.jordan@gmail.com | Instagram | TikTok
- Copyright: "© 2026 AJL Nutrición · Lima, Perú · Todos los derechos reservados"

---

#### BOTÓN FLOTANTE WHATSAPP
- Posición: fixed bottom-right (24px, 24px)
- Color: #25D366, border-radius 16px, 54×54px
- **Label hover:** "Inicia tu cambio aquí con nosotros" (aparece a la izquierda con animación opacity)
- **Mensaje general:** "Vi su página web y quiero iniciar mi cambio con ustedes."

---

### 11.3 JavaScript — Lógica de WhatsApp y UTMs

```javascript
// Captura UTMs
const params = new URLSearchParams(window.location.search);
const utm = {
  source:   params.get('utm_source')   || '',
  medium:   params.get('utm_medium')   || '',
  campaign: params.get('utm_campaign') || ''
};

// Builder de URL WhatsApp
function buildWspUrl(plan) {
  const BASE = 'https://wa.me/51919151237';
  let msg = '';
  if (plan === 'general') {
    msg = 'Vi su página web y quiero iniciar mi cambio con ustedes.';
  } else if (plan === 'Evaluación S/80') {
    msg = 'Hola, quiero agendar la Evaluación Nutricional Personal de S/80.';
  } else {
    msg = `Hola, me interesa el plan ${plan} de AJL Nutrición.`;
  }
  const utmParts = [utm.source, utm.medium, utm.campaign].filter(Boolean);
  if (utmParts.length) msg += ` (${utmParts.join(' · ')})`;
  return `${BASE}?text=${encodeURIComponent(msg)}`;
}

function openWsp(plan, event) {
  if (event) event.preventDefault();
  window.open(buildWspUrl(plan), '_blank', 'noopener');
}
```

**Planes para llamar en CTAs:** `'Básico'` | `'Acompañamiento'` | `'Constancia'` | `'Transformación'` | `'Evaluación S/80'` | `'general'`

---

### 11.4 Contacto y datos del negocio

- **WhatsApp:** +51 919 151 237
- **Email:** alejandro.loayza.jordan@gmail.com
- **Instagram:** @alejandrojloayza
- **TikTok:** @alejandrojloayza
- **Ciudad:** Lima, Perú
- **Repo GitHub:** `Loayza97/AJL-Landing`
- **URL Pages:** `https://loayza97.github.io/AJL-Landing/02-comercial/landing-ajl/demos/landing-prd.html`
