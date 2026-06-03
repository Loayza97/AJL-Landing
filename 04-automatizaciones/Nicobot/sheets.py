from dataclasses import dataclass
from datetime import date
import gspread
from google.oauth2.service_account import Credentials
import config

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

@dataclass
class PacienteRow:
    nombre: str
    telefono: str
    fecha_entrega_plan: date

def _get_worksheet():
    creds = Credentials.from_service_account_file(
        config.GOOGLE_SERVICE_ACCOUNT_JSON, scopes=SCOPES
    )
    client = gspread.authorize(creds)
    sheet = client.open_by_key(config.SHEET_ID)
    return sheet.worksheet(config.SHEET_NAME)

def get_all_records():
    ws = _get_worksheet()
    return ws.get_all_records()

def get_pacientes() -> list[PacienteRow]:
    rows = get_all_records()
    pacientes = []
    for row in rows:
        estado = str(row.get("Estado", "")).strip()
        if estado != "Entregado":
            continue
        nombre = f"{row.get('Nombre', '').strip()} {row.get('Apellido', '').strip()}".strip()
        telefono = str(row.get("Número de WhatsApp", "")).strip()
        fecha_str = str(row.get("Fecha de Entrega del Plan", "")).strip()
        if not telefono or not fecha_str or not nombre:
            continue
        try:
            fecha = date.fromisoformat(fecha_str)
        except ValueError:
            print(f"[WARN] Fecha inválida para {nombre}: '{fecha_str}' — skipping")
            continue
        pacientes.append(PacienteRow(nombre=nombre, telefono=telefono, fecha_entrega_plan=fecha))
    return pacientes
