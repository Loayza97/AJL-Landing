import pytest
from unittest.mock import patch, MagicMock
from sheets import get_pacientes, PacienteRow


def test_get_pacientes_por_defecto_ignora_estado():
    # Por defecto (REQUIERE_ESTADO_ENTREGADO=False) el Estado no filtra:
    # basta con nombre + telefono + fecha válida.
    mock_rows = [
        {"Nombre": "María", "Apellido": "García", "Número de WhatsApp": "51987654321",
         "Fecha de Entrega del Plan": "2026-06-01", "Estado": "Entregado"},
        {"Nombre": "Juan", "Apellido": "Pérez", "Número de WhatsApp": "51912345678",
         "Fecha de Entrega del Plan": "2026-06-01", "Estado": "Pendiente"},
    ]
    with patch("sheets.config.REQUIERE_ESTADO_ENTREGADO", False), \
         patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert len(pacientes) == 2
    assert pacientes[0].nombre == "María"
    assert pacientes[0].apellido == "García"
    assert pacientes[0].primer_nombre == "María"
    assert pacientes[0].nombre_completo == "María García"
    assert pacientes[0].telefono == "51987654321"


def test_get_pacientes_filtra_por_estado_si_flag_activo():
    # Con el flag activado, vuelve a exigir Estado=="Entregado".
    mock_rows = [
        {"Nombre": "María", "Apellido": "García", "Número de WhatsApp": "51987654321",
         "Fecha de Entrega del Plan": "2026-06-01", "Estado": "Entregado"},
        {"Nombre": "Juan", "Apellido": "Pérez", "Número de WhatsApp": "51912345678",
         "Fecha de Entrega del Plan": "2026-06-01", "Estado": "Pendiente"},
    ]
    with patch("sheets.config.REQUIERE_ESTADO_ENTREGADO", True), \
         patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert len(pacientes) == 1
    assert pacientes[0].nombre == "María"


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


def test_primer_nombre_toma_primera_palabra():
    p = PacienteRow(nombre="Ana Lucía", apellido="Ríos", chapa="", telefono="51999999999",
                    fecha_entrega_plan=__import__("datetime").date(2026, 6, 1))
    assert p.primer_nombre == "Ana"


def test_nombre_saludo_usa_chapa():
    p = PacienteRow(nombre="Alejandro", apellido="Loayza", chapa="peladito",
                    telefono="51999999999",
                    fecha_entrega_plan=__import__("datetime").date(2026, 6, 1))
    assert p.nombre_saludo == "peladito"


def test_nombre_saludo_fallback_primer_nombre_si_chapa_vacia():
    p = PacienteRow(nombre="Ana Lucía", apellido="Ríos", chapa="",
                    telefono="51999999999",
                    fecha_entrega_plan=__import__("datetime").date(2026, 6, 1))
    assert p.nombre_saludo == "Ana"


def test_get_pacientes_tolera_encabezado_con_salto_de_linea():
    # El Sheet real tiene el encabezado "Número de \nWhatsApp" (con salto de línea).
    mock_rows = [
        {"Nombre": "Alejandro", "Apellido": "Loayza", "Chapa": "peladito",
         "Número de \nWhatsApp": "912846283", "Fecha de Entrega del Plan": "1/6/2026",
         "Estado": ""},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert len(pacientes) == 1
    assert pacientes[0].telefono == "51912846283"


def test_get_pacientes_lee_columna_chapa():
    mock_rows = [
        {"Nombre": "Alejandro", "Apellido": "Loayza", "Chapa": "peladito",
         "Número de WhatsApp": "912846283", "Fecha de Entrega del Plan": "1/6/2026",
         "Estado": ""},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert pacientes[0].chapa == "peladito"
    assert pacientes[0].nombre_saludo == "peladito"


def test_telefono_9_digitos_agrega_codigo_peru():
    mock_rows = [
        {"Nombre": "María", "Apellido": "García", "Número de WhatsApp": "987654321",
         "Fecha de Entrega del Plan": "2026-06-01", "Estado": "Entregado"},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert pacientes[0].telefono == "51987654321"


def test_telefono_con_codigo_no_se_duplica():
    mock_rows = [
        {"Nombre": "Juan", "Apellido": "Pérez", "Número de WhatsApp": "51987654321",
         "Fecha de Entrega del Plan": "2026-06-01", "Estado": "Entregado"},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert pacientes[0].telefono == "51987654321"


def test_telefono_con_simbolos_se_limpia():
    mock_rows = [
        {"Nombre": "Ana", "Apellido": "Ríos", "Número de WhatsApp": "+51 987-654-321",
         "Fecha de Entrega del Plan": "2026-06-01", "Estado": "Entregado"},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert pacientes[0].telefono == "51987654321"


def test_fecha_formato_peruano_barra():
    mock_rows = [
        {"Nombre": "María", "Apellido": "García", "Número de WhatsApp": "987654321",
         "Fecha de Entrega del Plan": "25/07/2026", "Estado": "Entregado"},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    import datetime
    assert pacientes[0].fecha_entrega_plan == datetime.date(2026, 7, 25)


def test_fecha_formato_iso_sigue_funcionando():
    mock_rows = [
        {"Nombre": "Juan", "Apellido": "Pérez", "Número de WhatsApp": "987654321",
         "Fecha de Entrega del Plan": "2026-07-25", "Estado": "Entregado"},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    import datetime
    assert pacientes[0].fecha_entrega_plan == datetime.date(2026, 7, 25)


def test_fecha_invalida_se_descarta():
    mock_rows = [
        {"Nombre": "Ana", "Apellido": "Ríos", "Número de WhatsApp": "987654321",
         "Fecha de Entrega del Plan": "no-es-fecha", "Estado": "Entregado"},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert len(pacientes) == 0


def test_apellido_vacio_permitido():
    mock_rows = [
        {"Nombre": "Carlos", "Apellido": "", "Número de WhatsApp": "51911111111",
         "Fecha de Entrega del Plan": "2026-06-01", "Estado": "Entregado"},
    ]
    with patch("sheets.get_all_records", return_value=mock_rows):
        pacientes = get_pacientes()
    assert len(pacientes) == 1
    assert pacientes[0].apellido == ""
    assert pacientes[0].nombre_completo == "Carlos"
