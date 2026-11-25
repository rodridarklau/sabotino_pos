export function buscarProveedorPropio(proveedores) {
  return proveedores?.find((proveedor) =>
    proveedor.RAZON_SOCIAL?.trim().replace(/\s*[-–—]\s*/g, " — ")
      .localeCompare("SABOTINO — Producción propia", "es", { sensitivity: "base" }) === 0
  );
}
