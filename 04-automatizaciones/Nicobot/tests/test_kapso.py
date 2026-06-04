import pytest
from unittest.mock import patch, MagicMock
from kapso import enviar_mensaje, enviar_template, enviar_template_aviso, KapsoError


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
    assert url.startswith("https://api.kapso.ai/meta/whatsapp/")
    assert "graph.facebook.com" not in url
    assert headers["X-API-Key"]
    assert "Authorization" not in headers


# ---- enviar_template tests ----

def test_enviar_template_exitoso():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {}
    with patch("kapso.requests.post", return_value=mock_response):
        result = enviar_template("51987654321", "María")
    assert result is True


def test_enviar_template_falla_api():
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.text = '{"error": "template not found"}'
    with patch("kapso.requests.post", return_value=mock_response):
        with pytest.raises(KapsoError):
            enviar_template("51987654321", "María")


def test_enviar_template_payload_shape():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {}
    with patch("kapso.requests.post", return_value=mock_response) as mock_post:
        enviar_template("51987654321", "María")
    payload = mock_post.call_args.kwargs["json"]
    assert payload["messaging_product"] == "whatsapp"
    assert payload["to"] == "51987654321"
    assert payload["type"] == "template"
    tmpl = payload["template"]
    assert tmpl["name"] == "seguimiento_x3"
    assert tmpl["language"]["code"] == "es"
    components = tmpl["components"]
    assert len(components) == 1
    assert components[0]["type"] == "body"
    params = components[0]["parameters"]
    assert len(params) == 1
    assert params[0]["parameter_name"] == "customer_name"
    assert params[0]["text"] == "María"


def test_enviar_template_usa_endpoint_y_auth_kapso():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {}
    with patch("kapso.requests.post", return_value=mock_response) as mock_post:
        enviar_template("51987654321", "Juan")
    call = mock_post.call_args
    url = call.args[0]
    headers = call.kwargs["headers"]
    assert url.startswith("https://api.kapso.ai/meta/whatsapp/")
    assert headers["X-API-Key"]
    assert "Authorization" not in headers


# ---- enviar_template_aviso tests ----

def test_enviar_template_aviso_payload_shape():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {}
    with patch("kapso.requests.post", return_value=mock_response) as mock_post:
        enviar_template_aviso("María García", "Hola, todo bien!")
    payload = mock_post.call_args.kwargs["json"]
    assert payload["messaging_product"] == "whatsapp"
    assert payload["to"] == "51941104459"  # NUMERO_NUTRICIONISTA
    assert payload["type"] == "template"
    tmpl = payload["template"]
    assert tmpl["name"] == "aviso_nico_v2"
    assert tmpl["language"]["code"] == "es"
    components = tmpl["components"]
    assert len(components) == 1
    assert components[0]["type"] == "body"
    params = components[0]["parameters"]
    assert len(params) == 2
    assert params[0]["parameter_name"] == "nombre_completo"
    assert params[0]["text"] == "María García"
    assert params[1]["parameter_name"] == "mensaje"
    assert params[1]["text"] == "Hola, todo bien!"


def test_enviar_template_aviso_usa_endpoint_y_auth_kapso():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {}
    with patch("kapso.requests.post", return_value=mock_response) as mock_post:
        enviar_template_aviso("Juan Pérez", "Mensaje")
    call = mock_post.call_args
    url = call.args[0]
    headers = call.kwargs["headers"]
    assert url.startswith("https://api.kapso.ai/meta/whatsapp/")
    assert "graph.facebook.com" not in url
    assert headers["X-API-Key"]
    assert "Authorization" not in headers


def test_enviar_template_aviso_falla_api():
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.text = '{"error": "template not found"}'
    with patch("kapso.requests.post", return_value=mock_response):
        with pytest.raises(KapsoError):
            enviar_template_aviso("María García", "Hola")
