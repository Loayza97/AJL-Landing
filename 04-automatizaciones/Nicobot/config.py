import os
from dotenv import load_dotenv

load_dotenv()

KAPSO_API_KEY = os.getenv("KAPSO_API_KEY")
GOOGLE_SERVICE_ACCOUNT_JSON = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "./credentials/service_account.json")
SHEET_ID = os.getenv("SHEET_ID")
SHEET_NAME = os.getenv("SHEET_NAME", "Hoja 1")
NUMERO_NUTRICIONISTA = os.getenv("NUMERO_NUTRICIONISTA")
PHONE_NUMBER_ID = os.getenv("PHONE_NUMBER_ID")
KAPSO_API_URL = os.getenv("KAPSO_API_URL", "https://api.kapso.ai/meta/whatsapp")
