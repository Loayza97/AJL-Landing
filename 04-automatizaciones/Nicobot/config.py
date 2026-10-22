import os
from dotenv import load_dotenv

load_dotenv()

KAPSO_API_KEY = os.getenv("KAPSO_API_KEY")
GOOGLE_SERVICE_ACCOUNT_JSON = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "./credentials/service_account.json")
SHEET_ID = os.getenv("SHEET_ID")
SHEET_NAME = os.getenv("SHEET_NAME", "Hoja 1")
NUMERO_NUTRICIONISTA = os.getenv("NUMERO_NUTRICIONISTA")
PHONE_NUMBER_ID = os.getenv("PHONE_NUMBER_ID")
KAPSO_API_URL = os.getenv("KAPSO_API_URL", "https://api.kapso.ai/meta/whatsapp/v22.0")
TEMPLATE_NAME = os.getenv("TEMPLATE_NAME", "seguimiento_x3")
TEMPLATE_LANG = os.getenv("TEMPLATE_LANG", "es")
TEMPLATE_AVISO_NAME = os.getenv("TEMPLATE_AVISO_NAME", "aviso_nico_v2")
DEBOUNCE_MINUTOS = int(os.getenv("DEBOUNCE_MINUTOS", "10"))

# Si es True, solo procesa filas con Estado=="Entregado".
# Por defecto False: basta con tener nombre + fecha válida (la fecha ya implica entrega).
REQUIERE_ESTADO_ENTREGADO = os.getenv("REQUIERE_ESTADO_ENTREGADO", "false").strip().lower() in ("1", "true", "yes", "si", "sí")
