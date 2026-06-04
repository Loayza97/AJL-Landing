import pytest
import json
from unittest.mock import patch, MagicMock
from datetime import date, datetime, timedelta
import receiver
from receiver import app, buscar_nombre_por_telefono
from sheets import PacienteRow

NICO = "51941104459"  # config.NUMERO_NUTRICIONISTA


@pytest.fixture
def client(tmp_path):
    app.config["TESTING"] = True
    # Aislar el estado persistente en un archivo temporal por test.
    state_file = tmp_path / "state.json"
    with patch.object(receiver, "STATE_FILE", str(state_file)):
        with app.test_client() as c:
            yield c


def _payload(from_num, texto="Hola, todo bien!", tipo="text"):
    msg = {"from": from_num, "type": tipo}
    if tipo == "text":
        msg["text"] = {"body": texto}
    return {"entry": [{"changes": [{"value": {"messages": [msg]}}]}]}


PAYLOAD_WSP = _payload("51987654321")


def test_webhook_responde_200(client):
    with patch("receiver.get_pacientes", return_value=[]), \
         patch("receiver.enviar_mensaje"), \
         patch("receiver.enviar_template_aviso"):
        resp = client.post("/nicobot-recepcion",
                           data=json.dumps(PAYLOAD_WSP),
                           content_type="application/json")
    assert resp.status_code == 200


def test_webhook_ignora_no_texto(client):
    payload = _payload("51987654321", tipo="image")
    with patch("receiver.enviar_mensaje") as mock_envio, \
         patch("receiver.enviar_template_aviso") as mock_aviso:
        resp = client.post("/nicobot-recepcion",
                           data=json.dumps(payload),
                           content_type="application/json")
    assert resp.status_code == 200
    mock_envio.assert_not_called()
    mock_aviso.assert_not_called()


def test_buscar_nombre_por_telefono_exacto():
    pacientes = [PacienteRow("María", "García", "51987654321", date(2026, 6, 1))]
    assert buscar_nombre_por_telefono("51987654321", pacientes) == "María García"


def test_buscar_nombre_por_telefono_sin_codigo_pais():
    pacientes = [PacienteRow("Juan", "Pérez", "51987654321", date(2026, 6, 1))]
    assert buscar_nombre_por_telefono("987654321", pacientes) == "Juan Pérez"


def test_buscar_nombre_fallback():
    assert buscar_nombre_por_telefono("51000000000", []) == "Paciente"


def test_webhook_kapso_error_retorna_200(client):
    from kapso import KapsoError
    with patch("receiver.get_pacientes", return_value=[]), \
         patch("receiver.enviar_template_aviso", side_effect=KapsoError("timeout")), \
         patch("receiver.enviar_mensaje", side_effect=KapsoError("timeout")):
        resp = client.post("/nicobot-recepcion",
                           data=json.dumps(PAYLOAD_WSP),
                           content_type="application/json")
    assert resp.status_code == 200


# ---- Lógica anti-spam / anti-costo ----

def test_mensaje_desde_nico_no_se_reenvia_y_registra_ventana(client):
    ahora = datetime(2026, 6, 4, 12, 0, 0)
    payload = _payload(NICO, "consulta interna")
    with patch("receiver._ahora", return_value=ahora), \
         patch("receiver.get_pacientes", return_value=[]), \
         patch("receiver.enviar_mensaje") as mock_envio, \
         patch("receiver.enviar_template_aviso") as mock_aviso:
        resp = client.post("/nicobot-recepcion",
                           data=json.dumps(payload),
                           content_type="application/json")
    assert resp.status_code == 200
    mock_envio.assert_not_called()
    mock_aviso.assert_not_called()
    estado = receiver._cargar_estado()
    assert estado["nico_window_opened_at"] == ahora.isoformat()


def test_paciente_ventana_cerrada_usa_template_aviso(client):
    ahora = datetime(2026, 6, 4, 12, 0, 0)
    # Nico abrió la ventana hace 25h → cerrada.
    receiver._guardar_estado({
        "nico_window_opened_at": (ahora - timedelta(hours=25)).isoformat(),
        "patient_last_notified": {},
    })
    pac = PacienteRow("María", "García", "51987654321", date(2026, 6, 1))
    with patch("receiver._ahora", return_value=ahora), \
         patch("receiver.get_pacientes", return_value=[pac]), \
         patch("receiver.enviar_mensaje") as mock_envio, \
         patch("receiver.enviar_template_aviso") as mock_aviso:
        resp = client.post("/nicobot-recepcion",
                           data=json.dumps(_payload("51987654321")),
                           content_type="application/json")
    assert resp.status_code == 200
    mock_aviso.assert_called_once()
    mock_envio.assert_not_called()
    args = mock_aviso.call_args.args
    assert args[0] == "María García"
    assert "Hola, todo bien!" in args[1]


def test_paciente_ventana_abierta_usa_texto_libre(client):
    ahora = datetime(2026, 6, 4, 12, 0, 0)
    # Nico escribió hace 2h → ventana abierta.
    receiver._guardar_estado({
        "nico_window_opened_at": (ahora - timedelta(hours=2)).isoformat(),
        "patient_last_notified": {},
    })
    pac = PacienteRow("María", "García", "51987654321", date(2026, 6, 1))
    with patch("receiver._ahora", return_value=ahora), \
         patch("receiver.get_pacientes", return_value=[pac]), \
         patch("receiver.enviar_mensaje") as mock_envio, \
         patch("receiver.enviar_template_aviso") as mock_aviso:
        resp = client.post("/nicobot-recepcion",
                           data=json.dumps(_payload("51987654321")),
                           content_type="application/json")
    assert resp.status_code == 200
    mock_envio.assert_called_once()
    mock_aviso.assert_not_called()


def test_debounce_segundo_mensaje_no_se_reenvia(client):
    base = datetime(2026, 6, 4, 12, 0, 0)
    receiver._guardar_estado({
        "nico_window_opened_at": (base - timedelta(hours=2)).isoformat(),
        "patient_last_notified": {},
    })
    pac = PacienteRow("María", "García", "51987654321", date(2026, 6, 1))
    # Primer mensaje → se reenvía.
    with patch("receiver._ahora", return_value=base), \
         patch("receiver.get_pacientes", return_value=[pac]), \
         patch("receiver.enviar_mensaje") as mock_envio, \
         patch("receiver.enviar_template_aviso"):
        client.post("/nicobot-recepcion",
                    data=json.dumps(_payload("51987654321")),
                    content_type="application/json")
        assert mock_envio.call_count == 1
    # Segundo mensaje 3 min después (< DEBOUNCE_MINUTOS) → NO se reenvía.
    with patch("receiver._ahora", return_value=base + timedelta(minutes=3)), \
         patch("receiver.get_pacientes", return_value=[pac]), \
         patch("receiver.enviar_mensaje") as mock_envio2, \
         patch("receiver.enviar_template_aviso") as mock_aviso2:
        resp = client.post("/nicobot-recepcion",
                           data=json.dumps(_payload("51987654321", "otra vez")),
                           content_type="application/json")
    assert resp.status_code == 200
    mock_envio2.assert_not_called()
    mock_aviso2.assert_not_called()
