import pytest
from unittest.mock import patch, MagicMock
from kapso import enviar_mensaje, KapsoError

def test_enviar_mensaje_exitoso():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"messages": [{"id": "wamid.123"}]}
    with patch("kapso.requests.post", return_value=mock_response):
        result = enviar_mensaje("51987654321", "Hola test 👋")
    assert result is True

def test_enviar_mensaje_falla_api():
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.text = '{"error": "invalid phone"}'
    with patch("kapso.requests.post", return_value=mock_response):
        with pytest.raises(KapsoError):
            enviar_mensaje("123", "Hola")

def test_enviar_mensaje_construye_payload_correcto():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {}
    with patch("kapso.requests.post", return_value=mock_response) as mock_post:
        enviar_mensaje("51987654321", "Mensaje de prueba")
    call = mock_post.call_args
    payload = call.kwargs["json"]
    assert payload["messaging_product"] == "whatsapp"
    assert payload["to"] == "51987654321"
    assert payload["type"] == "text"
    assert "Mensaje de prueba" in payload["text"]["body"]


def test_enviar_mensaje_usa_endpoint_y_auth_kapso():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {}
    with patch("kapso.requests.post", return_value=mock_response) as mock_post:
        enviar_mensaje("51987654321", "Hola")
    call = mock_post.call_args
    url = call.args[0]
    headers = call.kwargs["headers"]
    # Kapso, no Graph API directo
    assert url.startswith("https://api.kapso.ai/meta/whatsapp/")
    assert "graph.facebook.com" not in url
    # Auth via X-API-Key, no Bearer
    assert headers["X-API-Key"]
    assert "Authorization" not in headers
