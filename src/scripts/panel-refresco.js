// Recarga conjunta del panel /panel/links/. Lo que cambia la base (crear,
// reactivar o borrar un link, o un paciente que agenda en otra pestaña) mueve las
// dos tablas: si solo se recargara la de links, Agendados quedaría vieja y diría
// «No hay citas» con el link ya «Agendado». Al volver a la pestaña se recargan
// las dos. links() devuelve false sin sesión y entonces no se pide Agendados.
export function montarRefresco(doc, { links, agendados }) {
  const refrescar = async () => { if (await links()) await agendados(); };
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') refrescar(); });
  return refrescar;
}
