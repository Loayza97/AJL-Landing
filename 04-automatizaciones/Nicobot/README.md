# Nicobot — Agente de Seguimiento WhatsApp

Envía mensajes de seguimiento a los pacientes de Nicolás Borda 3 veces por semana
(Lun/Mié/Vie) durante 28 días desde la entrega de su plan, y reenvía las respuestas
al WhatsApp personal del nutricionista.

Ver `NICOBOT-SPEC.md` para la especificación completa.

---

## Componentes

| Archivo | Rol |
|---|---|
| `sender.py` | Lee el Sheet, filtra pacientes activos y envía el mensaje (corre vía launchd) |
| `receiver.py` | Servidor Flask que recibe respuestas y las reenvía a Nicolás |
| `sheets.py` | Helper de autenticación + lectura del Google Sheet |
| `kapso.py` | Helper de envío vía Meta WhatsApp Cloud API |
| `config.py` | Carga variables desde `.env` |

---

## Setup inicial (una vez)

### 1. Entorno Python

```bash
cd /Users/alejandroloayza/ailab/04-automatizaciones/Nicobot
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### 2. Variables de entorno

```bash
cp .env.example .env
```

Editar `.env` y completar `KAPSO_API_KEY` con el bearer token real de Kapso.
El resto de valores ya vienen configurados.

### 3. Service Account de Google (acceso al Sheet)

1. Ir a [console.cloud.google.com](https://console.cloud.google.com) con `nibordas03@gmail.com`
2. Crear proyecto → habilitar **Google Sheets API**
3. IAM → Service Accounts → Crear cuenta → descargar JSON
4. Guardar el JSON en `credentials/service_account.json`
5. Compartir el Sheet con el email de la service account (rol **Viewer**)

> La carpeta `credentials/` y `.env` están en `.gitignore` — nunca se commitean.

---

## Correr los tests

```bash
./venv/bin/pytest tests/ -v
```

---

## Sender — envío programado (launchd)

El sender corre a las **7:00 AM hora de Lima** (12:00 UTC) los Lun/Mié/Vie.

### Instalar el cron

```bash
cp nicobot-sender.plist ~/Library/LaunchAgents/com.nicobot.sender.plist
launchctl load ~/Library/LaunchAgents/com.nicobot.sender.plist
```

### Verificar que está registrado

```bash
launchctl list | grep nicobot
```

### Forzar una ejecución manual (test)

```bash
launchctl start com.nicobot.sender
sleep 3
cat /tmp/nicobot-sender.log
```

### Correr el sender a mano

```bash
./venv/bin/python sender.py
```

### Desinstalar el cron

```bash
launchctl unload ~/Library/LaunchAgents/com.nicobot.sender.plist
rm ~/Library/LaunchAgents/com.nicobot.sender.plist
```

---

## Receiver — recepción de respuestas (Flask + ngrok)

El receiver escucha en el puerto **5000** y reenvía cada respuesta a Nicolás.

### Levantar el servidor

```bash
./venv/bin/python receiver.py
```

### Exponer el webhook con ngrok

```bash
# Instalar ngrok si no lo tienes:
brew install ngrok

# Exponer el puerto 5000:
ngrok http 5000
```

Copiar la URL HTTPS generada (ej. `https://abc123.ngrok-free.app`).

### Configurar el webhook en Kapso

En el dashboard de Kapso, pegar como webhook URL:

```
https://abc123.ngrok-free.app/nicobot-recepcion
```

### Smoke test local

```bash
curl -X POST http://localhost:5000/nicobot-recepcion \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"51987654321","type":"text","text":{"body":"Hola!"}}],"contacts":[{"profile":{"name":"Test"}}]}}]}]}'
```

Respuesta esperada: `{"status": "ok"}` y log `[OK] Reenviado mensaje de...`.

---

## Notas

- **Idempotencia:** el sender no deduplica. Si se ejecuta dos veces el mismo día,
  Meta puede enviar el mensaje dos veces. Aceptado para Sprint 1.
- **Sprint 2 (pendiente):** deploy a VPS Contabo con systemd y URL de webhook
  definitiva con SSL. No implementado aún.
