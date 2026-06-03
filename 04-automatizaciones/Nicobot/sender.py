from datetime import date
from sheets import get_pacientes, PacienteRow
from kapso import enviar_mensaje, KapsoError

DIAS_ENVIO = {0, 2, 4}  # lunes=0, miércoles=2, viernes=4


def debe_enviar_hoy(fecha_entrega: date) -> bool:
    hoy = date.today()
    dias_transcurridos = (hoy - fecha_entrega).days
    if dias_transcurridos < 1 or dias_transcurridos > 28:
        return False
    return hoy.weekday() in DIAS_ENVIO


def construir_mensaje(nombre: str) -> str:
    return (
        f"Hola {nombre} 👋 ¿Cómo te ha ido con tu alimentación estos días? "
        f"Cuéntame cómo te has sentido, si tuviste alguna dificultad o algo que quieras ajustar. "
        f"Estoy aquí para ayudarte 🥗"
    )


def procesar_pacientes(pacientes: list[PacienteRow]):
    for p in pacientes:
        if not debe_enviar_hoy(p.fecha_entrega_plan):
            continue
        mensaje = construir_mensaje(p.nombre)
        try:
            enviar_mensaje(p.telefono, mensaje)
            print(f"[OK] Enviado a {p.nombre} ({p.telefono})")
        except KapsoError as e:
            print(f"[ERROR] Fallo envío a {p.nombre}: {e}")


if __name__ == "__main__":
    pacientes = get_pacientes()
    print(f"[INFO] {len(pacientes)} pacientes con Estado=Entregado")
    procesar_pacientes(pacientes)
