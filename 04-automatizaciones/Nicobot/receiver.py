from flask import Flask, request, jsonify
from sheets import get_pacientes, PacienteRow
from kapso import enviar_mensaje, KapsoError
import config

app = Flask(__name__)

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
        pacientes = get_pacientes()
        nombre = buscar_nombre_por_telefono(telefono, pacientes)
        mensaje_nico = f"📩 *{nombre}* respondió:\n\"{texto}\""
        enviar_mensaje(config.NUMERO_NUTRICIONISTA, mensaje_nico)
        print(f"[OK] Reenviado mensaje de {nombre} a Nicolás")
    except KapsoError as e:
        print(f"[ERROR] Fallo al reenviar a Nicolás: {e}")
    except (KeyError, IndexError, TypeError) as e:
        print(f"[WARN] Payload inesperado: {e}")
    return jsonify({"status": "ok"}), 200

if __name__ == "__main__":
    app.run(port=5000, debug=False)
