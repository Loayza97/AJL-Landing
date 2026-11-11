// «Generar link de reserva» del panel (spec 2026-11-10): plan, duración y forma de pago con selectores.
// El link es el de siempre (/reservar/?plan=…&meses=…[&forma=mensual]) con el dominio de donde se abre el
// panel (en la versión de prueba, la de prueba). Generarlo no crea nada en Mercado Pago.
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
    return { p, d, puedeMensual, mensual };
  }

  function pintar() {
    const { p, d, puedeMensual, mensual } = eleccion();
    radio('mensual').disabled = !puedeMensual;
    radio('mensual').closest('label').classList.toggle('lk-op--off', !puedeMensual);
    if (!puedeMensual) radio('completo').checked = true;
    $('#gen-resumen').textContent = !d ? `${p.nombre} · ${p.precio} · un solo pago`
      : mensual ? `${p.nombre} · ${d.meses} meses · ${d.cuota} al mes × ${d.meses} (membresía, solo tarjeta)`
        : `${p.nombre} · ${d.meses === 1 ? '1 mes' : `${d.meses} meses`} · ${d.total} en un solo pago (tarjeta hasta 12 cuotas o Yape)`
          + (d.meses === 1 ? ' · el mes a mes no tiene pago mensual automático' : '');
    $('#gen-creado').hidden = true;
    $('#gen-copiar').textContent = 'Copiar';
  }

  $('#gen-plan').addEventListener('change', () => { llenarDuraciones(); pintar(); });
  $('#gen-meses').addEventListener('change', pintar);
  caja.querySelectorAll('input[name="gen-forma"]').forEach((r) => r.addEventListener('change', pintar));

  $('#gen-crear').addEventListener('click', () => {
    const { p, d, mensual } = eleccion();
    const url = location.origin + (d ? (mensual ? d.rutaMensual : d.ruta) : p.ruta);
    $('#gen-url').value = url;
    $('#gen-wa').href = `https://wa.me/?text=${encodeURIComponent(`Aquí puedes elegir tu hora y pagar tu plan de AJL Nutrición: ${url}\n\nPara que tu pago pase a la primera: hazlo desde tu celular, con tu wifi o tus datos, y si tienes cuenta de Mercado Pago entra con ella.`)}`;
    $('#gen-creado').hidden = false;
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
