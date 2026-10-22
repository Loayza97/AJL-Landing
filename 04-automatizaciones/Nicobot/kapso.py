import requests
import config

class KapsoError(Exception):
    pass

def enviar_mensaje(telefono: str, texto: str) -> bool:
    url = f"{config.KAPSO_API_URL}/{config.PHONE_NUMBER_ID}/messages"
    headers = {
        "X-API-Key": config.KAPSO_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": telefono,
        "type": "text",
        "text": {"body": texto},
    }
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code not in (200, 201):
        raise KapsoError(f"Error {response.status_code}: {response.text}")
    return True

def enviar_template_aviso(nombre_completo: str, mensaje: str) -> bool:
    """Reenvía a Nico la respuesta de un paciente vía template (fuera de la ventana
    de 24h). Dos parámetros con nombre: nombre_completo y mensaje."""
    url = f"{config.KAPSO_API_URL}/{config.PHONE_NUMBER_ID}/messages"
    headers = {
        "X-API-Key": config.KAPSO_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": config.NUMERO_NUTRICIONISTA,
        "type": "template",
        "template": {
            "name": config.TEMPLATE_AVISO_NAME,
            "language": {"code": config.TEMPLATE_LANG},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "parameter_name": "nombre_completo", "text": nombre_completo},
                        {"type": "text", "parameter_name": "mensaje", "text": mensaje},
                    ],
                }
            ],
        },
    }
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code not in (200, 201):
        raise KapsoError(f"Error {response.status_code}: {response.text}")
    return True

def enviar_template(telefono: str, primer_nombre: str) -> bool:
    url = f"{config.KAPSO_API_URL}/{config.PHONE_NUMBER_ID}/messages"
    headers = {
        "X-API-Key": config.KAPSO_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": telefono,
        "type": "template",
        "template": {
            "name": config.TEMPLATE_NAME,
            "language": {"code": config.TEMPLATE_LANG},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "parameter_name": "customer_name", "text": primer_nombre}
                    ],
                }
            ],
        },
    }
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code not in (200, 201):
        raise KapsoError(f"Error {response.status_code}: {response.text}")
    return True
