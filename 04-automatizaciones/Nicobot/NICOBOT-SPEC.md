# Nicobot — Agente de Seguimiento WhatsApp para Nicolás Borda

**Fecha:** 2026-06-03
**Estado:** Spec aprobada, pendiente implementación

---

## Contexto

Nicobot es una automatización que envía mensajes de seguimiento a pacientes de Nicolás Borda (nutricionista) 3 veces por semana (Lun/Mié/Vie) durante 28 días desde la entrega de su plan nutricional. Cuando el paciente responde, el mensaje se reenvía al número personal de Nicolás.

---

## Stack

| Componente | Tecnología |
|---|---|
| Lenguaje | Python 3.x |
| Base de datos | Google Sheets (cuenta nibordas03@gmail.com) |
| WhatsApp API | Meta WhatsApp Cloud API via Kapso |
| Webhook server | Flask |
| Scheduler Sprint 1 | launchd (Mac) |
| Scheduler Sprint 2 | systemd (VPS Contabo) |
| Autenticación Sheets | Google Service Account (JSON) |

---

## Credenciales y configuración

### Variables de entorno (.env — no commitear)

```env
KAPSO_API_KEY=<bearer token de Kapso>
GOOGLE_SERVICE_ACCOUNT_JSON=./credentials/service_account.json
SHEET_ID=1BsZioAx9M-7z_KL7ycNSHWlOH1BO1u5mK-jAMW8VqEg
SHEET_NAME=Hoja 1
NUMERO_NUTRICIONISTA=51941104459
PHONE_NUMBER_ID=1098236290048691
META_API_URL=https://graph.facebook.com/v19.0
```

### Service Account (setup manual una vez)

1. Ir a [console.cloud.google.com](https://console.cloud.google.com) con nibordas03@gmail.com
2. Crear proyecto → habilitar Google Sheets API
3. IAM → Service Accounts → Crear cuenta → descargar JSON
4. Compartir el Sheet con el email de la service account (rol Viewer)
5. Guardar el JSON en `Nicobot/credentials/service_account.json`

---

## Estructura de archivos

```
04-automatizaciones/Nicobot/
├── sender.py              # Script de envío (corre via cron)
├── receiver.py            # Servidor Flask para recibir respuestas
├── sheets.py              # Helper: autenticación + lectura Sheet
├── kapso.py               # Helper: envío de mensajes via Meta API
├── config.py              # Carga variables desde .env
├── .env                   # Secrets (en .gitignore)
├── .env.example           # Template sin valores reales
├── requirements.txt       # Dependencias Python
├── credentials/           # Carpeta en .gitignore
│   └── service_account.json
└── README.md
```

---

## Estructura del Google Sheet

Hoja: `Hoja 1`

| Columna | Campo | Notas |
|---|---|---|
| A | Nombre | Se concatena con Apellido para el saludo |
| B | Apellido | Se concatena con Nombre: "{Nombre} {Apellido}" |
| E | Número de WhatsApp | Sin +, formato internacional (ej. 51987654321) |
| F | Fecha de Entrega del Plan | Formato ISO: YYYY-MM-DD |
| M | Estado | Filtro: solo procesar si valor == "Entregado" |

> Las demás columnas (DNI, correo, tipo, etc.) son ignoradas.

---

## sender.py — Lógica de envío

### Flujo

```
cron dispara sender.py
  → leer todas las filas del Sheet
  → filtrar: Estado == "Entregado"
  → para cada paciente:
      calcular días transcurridos desde fecha_entrega_plan
      si hoy es Lun/Mié/Vie AND 1 <= días_transcurridos <= 28:
          enviar mensaje via Meta API
      else:
          skip silencioso
  → log de envíos exitosos y errores
```

### Mensaje enviado al paciente

```
Hola {nombre} 👋 ¿Cómo te ha ido con tu alimentación estos días? 
Cuéntame cómo te has sentido, si tuviste alguna dificultad o algo 
que quieras ajustar. Estoy aquí para ayudarte 🥗
```

### Consideraciones

- Si `fecha_entrega_plan` está vacía o malformada → skip con log de advertencia
- Si `telefono` está vacío → skip con log de advertencia
- Errores de API (4xx, 5xx) → log detallado, no detener el resto de envíos
- El script es idempotente: si se ejecuta dos veces el mismo día, Meta API puede duplicar. Se acepta para Sprint 1. Sprint 2 puede agregar un log de envíos para deduplicar.

---

## receiver.py — Webhook de recepción

### Flujo

```
Flask escucha POST en /nicobot-recepcion
  → parsear payload WhatsApp Cloud API
  → ignorar si no es mensaje de tipo "text"
  → extraer: telefono_remitente, texto
  → buscar nombre en Sheet cruzando telefono_remitente con columna E
  → si no encuentra: usar "Paciente" como nombre fallback
  → reenviar a Nicolás (51941104459):
      "📩 *{nombre}* respondió:\n"{texto}""
  → responder 200 OK a Kapso (siempre, para evitar reintentos)
```

### Consideraciones

- Comparación de teléfono flexible: ignora dígitos no numéricos, acepta con/sin código de país
- Mensajes no-texto (imagen, audio, sticker) → ignorar silenciosamente, responder 200 OK
- El servidor corre en puerto 5000 por defecto

---

## Configuración cron — Sprint 1 (Mac con launchd)

El sender corre a las 9:00 AM hora de Lima (PET, UTC-5) los Lun/Mié/Vie.

Archivo plist: `~/Library/LaunchAgents/com.nicobot.sender.plist`

```xml
<key>StartCalendarInterval</key>
<array>
  <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>12</integer><key>Minute</key><integer>0</integer></dict>
  <dict><key>Weekday</key><integer>3</integer><key>Hour</key><integer>12</integer><key>Minute</key><integer>0</integer></dict>
  <dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>12</integer><key>Minute</key><integer>0</integer></dict>
</array>
```

> Hora 12 UTC = 7 AM Lima (UTC-5)

Para exponer el webhook en Sprint 1: `ngrok http 5000` → pegar URL en Kapso.

---

## Deploy Sprint 2 (VPS Contabo)

- Dos servicios systemd: `nicobot-sender.timer` + `nicobot-receiver.service`
- SSL resuelto en Contabo antes del deploy
- URL webhook definitiva: `https://app-n8n-nico.ajlnutricion.com/nicobot-recepcion` (o dominio equivalente)
- Configuración de Kapso: apuntar webhook a URL de producción

---

## Dependencias Python

```
gspread>=5.0
google-auth>=2.0
flask>=3.0
requests>=2.31
python-dotenv>=1.0
```

---

## Out of scope (Sprint 1)

- Deduplicación de envíos (log anti-doble-envío)
- Templates aprobados por Meta (actualmente texto libre / sandbox)
- Dashboard de seguimiento
- Manejo de opt-out de pacientes
- Reintentos automáticos en fallo de API
