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
    call_kwargs = mock_post.call_args
    payload = call_kwargs.kwargs.get("json") or call_kwargs.args[1]
    assert payload["to"] == "51987654321"
    assert payload["type"] == "text"
    assert "Mensaje de prueba" in payload["text"]["body"]
