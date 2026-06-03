from datetime import date
from sheets import get_pacientes, PacienteRow
from kapso import enviar_template, KapsoError

DIAS_ENVIO = {0, 2, 4}  # lunes=0, miércoles=2, viernes=4


def debe_enviar_hoy(fecha_entrega: date) -> bool:
    hoy = date.today()
    dias_transcurridos = (hoy - fecha_entrega).days
    if dias_transcurridos < 1 or dias_transcurridos > 28:
        return False
    return hoy.weekday() in DIAS_ENVIO


def procesar_pacientes(pacientes: list[PacienteRow]):
    for p in pacientes:
        if not debe_enviar_hoy(p.fecha_entrega_plan):
            continue
        try:
            enviar_template(p.telefono, p.primer_nombre)
            print(f"[OK] Enviado a {p.nombre_completo} ({p.telefono})")
        except KapsoError as e:
            print(f"[ERROR] Fallo envío a {p.nombre_completo}: {e}")


if __name__ == "__main__":
    pacientes = get_pacientes()
    print(f"[INFO] {len(pacientes)} pacientes con Estado=Entregado")
    procesar_pacientes(pacientes)
