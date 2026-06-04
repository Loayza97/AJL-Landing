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

CODIGO_PAIS = "51"  # Perú: números locales de 9 dígitos se completan con este prefijo


def normalizar_telefono(raw: str) -> str:
    """Deja solo dígitos; si quedan 9 (móvil peruano local), antepone el código de país."""
    digitos = "".join(filter(str.isdigit, raw))
    if len(digitos) == 9:
        return CODIGO_PAIS + digitos
    return digitos


def parsear_fecha(fecha_str: str) -> date:
    """Acepta día/mes/año (25/07/2026) o ISO (2026-07-25). Lanza ValueError si no calza."""
    fecha_str = fecha_str.strip()
    if "/" in fecha_str:
        dia, mes, anio = fecha_str.split("/")
        return date(int(anio), int(mes), int(dia))
    return date.fromisoformat(fecha_str)


def get_pacientes() -> list[PacienteRow]:
    rows = get_all_records()
    pacientes = []
    for row in rows:
        # Filtro por Estado: silenciado por defecto (config.REQUIERE_ESTADO_ENTREGADO).
        # La fecha de entrega ya implica que el plan se entregó.
        if config.REQUIERE_ESTADO_ENTREGADO:
            estado = str(row.get("Estado", "")).strip()
            if estado != "Entregado":
                continue
        nombre = str(row.get("Nombre", "")).strip()
        apellido = str(row.get("Apellido", "")).strip()
        telefono = normalizar_telefono(str(row.get("Número de WhatsApp", "")))
        fecha_str = str(row.get("Fecha de Entrega del Plan", "")).strip()
        if not telefono or not fecha_str or not nombre:
            continue
        try:
            fecha = parsear_fecha(fecha_str)
        except (ValueError, IndexError):
            print(f"[WARN] Fecha inválida para {nombre} {apellido}: '{fecha_str}' — skipping")
            continue
        pacientes.append(PacienteRow(nombre=nombre, apellido=apellido, telefono=telefono, fecha_entrega_plan=fecha))
    return pacientes
