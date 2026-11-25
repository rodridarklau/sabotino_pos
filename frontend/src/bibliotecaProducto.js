export const normalizar = (valor) => valor.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();

export function sugerirImagen(biblioteca, nombre, categoriaProducto) {
  const coincidencias = nombre?.trim() ? biblioteca.filter((b) =>
    [b.nombre, ...b.sinonimos].some((valor) => normalizar(valor) === normalizar(nombre))) : [];
  return coincidencias.find((b) => categoriaProducto && normalizar(b.categoria) === normalizar(categoriaProducto))
    ?? (coincidencias.length === 1 ? coincidencias[0] : null);
}
