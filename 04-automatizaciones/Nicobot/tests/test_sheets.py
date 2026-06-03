import pytest
from unittest.mock import patch, MagicMock
from sheets import get_pacientes, PacienteRow

def test_get_pacientes_filtra_sin_entregado():
    mock_rows = [
        {"Nombre": "María", "Apellido": "García", "Número de WhatsApp": "51987654321",
         "Fecha de Entrega del Plan": "2026-06-01", "Estado": "Entregado"},
        {"Nombre": "Juan", "Apellido": "Pérez", "Número de WhatsApp": "51912345678",
         "Fecha de Entrega del Plan": "2026-06-01", "Estado": "Pendiente"},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert len(pacientes) == 1
    assert pacientes[0].nombre == "María García"
    assert pacientes[0].telefono == "51987654321"

def test_get_pacientes_ignora_sin_telefono():
    mock_rows = [
        {"Nombre": "María", "Apellido": "García", "Número de WhatsApp": "",
         "Fecha de Entrega del Plan": "2026-06-01", "Estado": "Entregado"},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert len(pacientes) == 0

def test_get_pacientes_ignora_sin_fecha():
    mock_rows = [
        {"Nombre": "Ana", "Apellido": "López", "Número de WhatsApp": "51999999999",
         "Fecha de Entrega del Plan": "", "Estado": "Entregado"},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert len(pacientes) == 0
