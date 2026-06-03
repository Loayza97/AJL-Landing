import requests
import config

class KapsoError(Exception):
    pass

def enviar_mensaje(telefono: str, texto: str) -> bool:
    url = f"{config.META_API_URL}/{config.PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {config.KAPSO_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "to": telefono,
        "type": "text",
        "text": {"body": texto},
    }
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code not in (200, 201):
        raise KapsoError(f"Error {response.status_code}: {response.text}")
    return True
