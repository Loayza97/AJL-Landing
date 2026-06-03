from dataclasses import dataclass
from datetime import date
import gspread
from google.oauth2.service_account import Credentials
import config

SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

@dataclass
class PacienteRow:
    nombre: str        # raw "Nombre" column (may contain multiple words)
    apellido: str      # raw "Apellido" column (may be empty)
    telefono: str
    fecha_entrega_plan: date

    @property
    def primer_nombre(self) -> str:
        partes = self.nombre.split()
        return partes[0] if partes else self.nombre

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombre} {self.apellido}".strip()

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
        nombre = str(row.get("Nombre", "")).strip()
        apellido = str(row.get("Apellido", "")).strip()
        telefono = str(row.get("Número de WhatsApp", "")).strip()
        fecha_str = str(row.get("Fecha de Entrega del Plan", "")).strip()
        if not telefono or not fecha_str or not nombre:
            continue
        try:
            fecha = date.fromisoformat(fecha_str)
        except ValueError:
            print(f"[WARN] Fecha inválida para {nombre} {apellido}: '{fecha_str}' — skipping")
            continue
        pacientes.append(PacienteRow(nombre=nombre, apellido=apellido, telefono=telefono, fecha_entrega_plan=fecha))
    return pacientes
