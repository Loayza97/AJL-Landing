import pytest
from datetime import date
from unittest.mock import patch, MagicMock
from sheets import PacienteRow
from sender import debe_enviar_hoy, procesar_pacientes


def test_debe_enviar_dia_1_lunes():
    with patch("sender.date") as mock_date:
        mock_date.today.return_value = date(2026, 6, 8)  # lunes
        mock_date.fromisoformat = date.fromisoformat
        assert debe_enviar_hoy(date(2026, 6, 7)) is True


def test_no_debe_enviar_dia_0():
    with patch("sender.date") as mock_date:
        mock_date.today.return_value = date(2026, 6, 9)
        mock_date.fromisoformat = date.fromisoformat
        assert debe_enviar_hoy(date(2026, 6, 9)) is False


def test_no_debe_enviar_dia_29():
    with patch("sender.date") as mock_date:
        mock_date.today.return_value = date(2026, 7, 8)
        mock_date.fromisoformat = date.fromisoformat
        assert debe_enviar_hoy(date(2026, 6, 9)) is False


def test_no_debe_enviar_martes():
    with patch("sender.date") as mock_date:
        mock_date.today.return_value = date(2026, 6, 9)  # martes
        mock_date.fromisoformat = date.fromisoformat
        assert debe_enviar_hoy(date(2026, 6, 8)) is False


def test_procesar_pacientes_envia_template_a_activos():
    pacientes = [
        PacienteRow("María", "García", "51987654321", date(2026, 6, 7)),
    ]
    with patch("sender.debe_enviar_hoy", return_value=True), \
         patch("sender.enviar_template") as mock_envio:
        procesar_pacientes(pacientes)
    mock_envio.assert_called_once_with("51987654321", "María")


def test_procesar_pacientes_usa_chapa_en_template():
    pacientes = [
        PacienteRow("Alejandro", "Loayza", "51912846283", date(2026, 6, 7), chapa="peladito"),
    ]
    with patch("sender.debe_enviar_hoy", return_value=True), \
         patch("sender.enviar_template") as mock_envio:
        procesar_pacientes(pacientes)
    mock_envio.assert_called_once_with("51912846283", "peladito")


def test_procesar_pacientes_no_envia_a_inactivos():
    pacientes = [
        PacienteRow("Juan", "Pérez", "51912345678", date(2026, 1, 1)),
    ]
    with patch("sender.debe_enviar_hoy", return_value=False), \
         patch("sender.enviar_template") as mock_envio:
        procesar_pacientes(pacientes)
    mock_envio.assert_not_called()
