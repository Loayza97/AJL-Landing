// «Generar link de reserva» del panel (spec 2026-11-10): plan, duración y forma de pago con selectores.
// «Un solo pago» y «Mensual automático» dan el link de siempre (/reservar/?plan=…&meses=…[&forma=mensual]) con
// el dominio de donde se abre el panel; generarlo no crea nada en Mercado Pago. «Mensual, ya tiene cita»
// (2026-11-11, antes el módulo «Cobrar con suscripción») crea un link de un solo uso a nombre del paciente
// (/suscribirse/?l=…, vence en 7 días) que cobra mes a mes sin agendar: para quien ya tiene su cita.
const caja = document.getElementById('gen-link');
if (caja) {
  const $ = (s) => caja.querySelector(s);
  const planes = JSON.parse(caja.dataset.planes);
  let mensualAbierto = true;
  // «Mensual automático» solo mientras el pago mensual esté abierto; apagado, el link con &forma=mensual no sirve.
  fetch('/api/reservas/opciones', { cache: 'no-store' }).then((r) => r.json()).then((d) => d?.suscripciones === true).catch(() => false)
    .then((abiertas) => { mensualAbierto = abiertas; pintar(); });

  const plan = () => planes.find((p) => p.id === $('#gen-plan').value);
  const radio = (v) => caja.querySelector(`input[name="gen-forma"][value="${v}"]`);

  function llenarDuraciones() {
    const p = plan();
    const sel = $('#gen-meses');
    sel.replaceChildren(...(p.duraciones ?? []).map((d) => new Option(d.meses === 1 ? '1 mes (mes a mes)' : `${d.meses} meses`, String(d.meses))));
    if (p.duraciones) sel.value = p.duraciones.some((d) => d.meses === 3) ? '3' : String(p.duraciones[0].meses);
    sel.disabled = !p.duraciones;
  }

  // La elección actual: duración y si va con pago mensual (se apaga en 1 mes, en las sueltas y si está cerrado).
  function eleccion() {
    const p = plan();
    const d = p.duraciones?.find((x) => String(x.meses) === $('#gen-meses').value) ?? null;
    const puedeMensual = Boolean(mensualAbierto && d?.rutaMensual);
    const mensual = puedeMensual && radio('mensual').checked;
    const sinCita = puedeMensual && radio('sin-cita').checked;
    return { p, d, puedeMensual, mensual, sinCita };
  }

  function pintar() {
    const { p, d, puedeMensual, mensual, sinCita } = eleccion();
    for (const v of ['mensual', 'sin-cita']) {
      radio(v).disabled = !puedeMensual;
      radio(v).closest('label').classList.toggle('lk-op--off', !puedeMensual);
    }
    if (!puedeMensual) radio('completo').checked = true;
    $('#gen-nombre-campo').hidden = !sinCita;
    $('#gen-resumen').textContent = !d ? `${p.nombre} · ${p.precio} · un solo pago`
      : sinCita ? `${p.nombre} · ${d.meses} meses · ${d.cuota} al mes × ${d.meses} (membresía, solo tarjeta) · si cancela antes, paga la diferencia con el mes a mes · no agenda cita · el link sirve una vez y vence en 7 días`
        : mensual ? `${p.nombre} · ${d.meses} meses · ${d.cuota} al mes × ${d.meses} (membresía, solo tarjeta)`
          : `${p.nombre} · ${d.meses === 1 ? '1 mes' : `${d.meses} meses`} · ${d.total} en un solo pago (tarjeta hasta 12 cuotas o Yape)`
            + (d.meses === 1 ? ' · el mes a mes no tiene pago mensual automático' : '');
    $('#gen-crear').textContent = sinCita ? 'Crear link de un solo uso' : 'Generar link';
    revisar();
    $('#gen-creado').hidden = true;
    $('#gen-copiar').textContent = 'Copiar';
  }

  // Con «ya tiene cita» hace falta el nombre: el link va a su nombre y así aparece en Suscripciones.
  function revisar() {
    const { sinCita } = eleccion();
    $('#gen-crear').disabled = sinCita && !$('#gen-nombre').value.trim();
  }

  const CONSEJO = 'Para que tu pago pase a la primera: hazlo desde tu celular, con tu wifi o tus datos, y si tienes cuenta de Mercado Pago entra con ella.';
  function mostrar(url, texto) {
    $('#gen-url').value = url;
    $('#gen-wa').href = `https://wa.me/?text=${encodeURIComponent(`${texto} ${url}\n\n${CONSEJO}`)}`;
    $('#gen-copiar').textContent = 'Copiar';
    $('#gen-creado').hidden = false;
  }

  $('#gen-plan').addEventListener('change', () => { llenarDuraciones(); pintar(); });
  $('#gen-meses').addEventListener('change', pintar);
  $('#gen-nombre').addEventListener('input', () => { revisar(); $('#gen-creado').hidden = true; });
  caja.querySelectorAll('input[name="gen-forma"]').forEach((r) => r.addEventListener('change', pintar));

  $('#gen-crear').addEventListener('click', async () => {
    const { p, d, mensual, sinCita } = eleccion();
    if (!sinCita) {
      mostrar(location.origin + (d ? (mensual ? d.rutaMensual : d.ruta) : p.ruta), 'Aquí puedes elegir tu hora y pagar tu plan de AJL Nutrición:');
      return;
    }
    const b = $('#gen-crear');
    b.disabled = true;
    const r = await fetch('/api/equipo/suscripciones', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: $('#gen-nombre').value, producto: p.id, meses: d.meses }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    revisar();
    if (!j?.ok) { alert(j?.error || 'No se pudo crear el link. Intenta de nuevo.'); return; }
    mostrar(j.url, 'Activa tu plan de AJL Nutrición aquí (sirve una sola vez):');
    $('#gen-nombre').value = '';
    revisar();
  });

  $('#gen-copiar').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#gen-url').value);
      $('#gen-copiar').textContent = 'Copiado';
    } catch {
      $('#gen-url').select();
    }
  });

  llenarDuraciones();
  pintar();
}
