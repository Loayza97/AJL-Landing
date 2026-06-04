import os
import json
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from sheets import get_pacientes, PacienteRow
from kapso import enviar_mensaje, enviar_template_aviso, KapsoError
import config

app = Flask(__name__)

# Estado persistente (no versionado, ver .gitignore).
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state.json")

VENTANA_24H = timedelta(hours=24)


def _ahora() -> datetime:
    """Indirección sobre datetime.now() para que los tests puedan parchear el tiempo."""
    return datetime.now()


def _cargar_estado() -> dict:
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            estado = json.load(f)
    except (FileNotFoundError, ValueError):
        estado = {}
    estado.setdefault("nico_window_opened_at", None)
    estado.setdefault("patient_last_notified", {})
    return estado


def _guardar_estado(estado: dict) -> None:
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=2)


def buscar_nombre_por_telefono(telefono: str, pacientes: list[PacienteRow]) -> str:
    tel_limpio = "".join(filter(str.isdigit, telefono))
    for p in pacientes:
        tel_p = "".join(filter(str.isdigit, p.telefono))
        if tel_p == tel_limpio or tel_limpio.endswith(tel_p) or tel_p.endswith(tel_limpio):
            return p.nombre_completo
    return "Paciente"


@app.route("/nicobot-recepcion", methods=["POST"])
def recibir():
    body = request.get_json(silent=True) or {}
    try:
        entry = body["entry"][0]
        value = entry["changes"][0]["value"]
        message = value["messages"][0]
        if message.get("type") != "text":
            return jsonify({"status": "ignored"}), 200

        telefono = message["from"]
        texto = message["text"]["body"]
        ahora = _ahora()
        estado = _cargar_estado()

        # 1. Mensaje DESDE Nico al número de negocio: abre/renueva su ventana de 24h.
        #    No se reenvía (no tiene sentido reenviarle sus propios mensajes).
        if telefono == config.NUMERO_NUTRICIONISTA:
            estado["nico_window_opened_at"] = ahora.isoformat()
            _guardar_estado(estado)
            return jsonify({"status": "ventana_nico"}), 200

        # 2. Mensaje de un paciente.
        #    a. Debounce: si ya se avisó por este teléfono hace < DEBOUNCE_MINUTOS, ignorar.
        last = estado["patient_last_notified"].get(telefono)
        if last:
            try:
                last_dt = datetime.fromisoformat(last)
                if ahora - last_dt < timedelta(minutes=config.DEBOUNCE_MINUTOS):
                    return jsonify({"status": "debounced"}), 200
            except ValueError:
                pass

        # b. Resolver nombre.
        pacientes = get_pacientes()
        nombre = buscar_nombre_por_telefono(telefono, pacientes)

        # c. Decidir canal según la ventana de 24h de Nico.
        ventana_abierta = False
        opened = estado.get("nico_window_opened_at")
        if opened:
            try:
                ventana_abierta = (ahora - datetime.fromisoformat(opened)) < VENTANA_24H
            except ValueError:
                ventana_abierta = False

        if ventana_abierta:
            mensaje_nico = f"📩 *{nombre}* respondió:\n\"{texto}\""
            enviar_mensaje(config.NUMERO_NUTRICIONISTA, mensaje_nico)
        else:
            enviar_template_aviso(nombre, texto)

        # d. Registrar debounce.
        estado["patient_last_notified"][telefono] = ahora.isoformat()
        _guardar_estado(estado)
        print(f"[OK] Reenviado mensaje de {nombre} a Nicolás (ventana_abierta={ventana_abierta})")
    except KapsoError as e:
        print(f"[ERROR] Fallo al reenviar a Nicolás: {e}")
    except (KeyError, IndexError, TypeError) as e:
        print(f"[WARN] Payload inesperado: {e}")
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    app.run(port=5000, debug=False)
