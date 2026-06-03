import pytest
import json
from unittest.mock import patch, MagicMock
from receiver import app, buscar_nombre_por_telefono
from sheets import PacienteRow
from datetime import date

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c

PAYLOAD_WSP = {
    "entry": [{
        "changes": [{
            "value": {
                "messages": [{"from": "51987654321", "type": "text", "text": {"body": "Hola, todo bien!"}}],
                "contacts": [{"profile": {"name": "María"}}]
            }
        }]
    }]
}

def test_webhook_responde_200(client):
    with patch("receiver.get_pacientes", return_value=[]), \
         patch("receiver.enviar_mensaje"):
        resp = client.post("/nicobot-recepcion",
                           data=json.dumps(PAYLOAD_WSP),
                           content_type="application/json")
    assert resp.status_code == 200

def test_webhook_ignora_no_texto(client):
    payload = {"entry": [{"changes": [{"value": {"messages": [{"from": "51987654321", "type": "image"}]}}]}]}
    with patch("receiver.enviar_mensaje") as mock_envio:
        resp = client.post("/nicobot-recepcion",
                           data=json.dumps(payload),
                           content_type="application/json")
    assert resp.status_code == 200
    mock_envio.assert_not_called()

def test_buscar_nombre_por_telefono_exacto():
    pacientes = [PacienteRow("María García", "51987654321", date(2026, 6, 1))]
    assert buscar_nombre_por_telefono("51987654321", pacientes) == "María García"

def test_buscar_nombre_por_telefono_sin_codigo_pais():
    pacientes = [PacienteRow("Juan Pérez", "51987654321", date(2026, 6, 1))]
    assert buscar_nombre_por_telefono("987654321", pacientes) == "Juan Pérez"

def test_buscar_nombre_fallback():
    assert buscar_nombre_por_telefono("51000000000", []) == "Paciente"
