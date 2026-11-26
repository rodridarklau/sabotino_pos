const errores = new Map([
  [1, [409, "Ya existe un registro con esos datos"]],
  [60, [409, "La operación se revirtió por un conflicto. Actualiza el listado antes de volver a intentarlo"]],
  [2291, [409, "Una referencia del registro ya no está disponible"]],
  [2292, [409, "No se puede eliminar porque hay registros relacionados"]],
  [1400, [400, "Completa los campos obligatorios"]],
  [1438, [422, "Un valor excede la precisión permitida"]],
  [2290, [400, "Un valor no cumple las reglas del registro"]],
  [6502, [400, "Un valor excede el tamaño permitido"]],
  [12899, [400, "Un texto excede el tamaño permitido"]],
  [20001, [403, "El usuario o su rol está inactivo"]],
  [20002, [403, "El usuario de la sesión ya no existe"]],
  [20003, [403, "Solo el dueño puede administrar estos registros"]],
  [20013, [404, "El registro no existe"]],
  [20015, [403, "No puedes eliminar tu propia cuenta"]],
  [20016, [404, "El registro no existe"]],
  [20309, [409, "Un tipo utilizado en ajustes históricos no puede cambiar de factor"]],
  [20540, [409, "La unidad seleccionada ya no existe"]],
  [20541, [409, "El proveedor seleccionado ya no existe"]],
  [20542, [404, "El insumo no existe"]],
  [20543, [404, "El insumo no existe"]],
  [20544, [400, "El costo unitario no es válido"]],
  [20545, [400, "Las existencias o el stock crítico no son válidos"]],
  [20546, [409, "La unidad seleccionada requiere existencias enteras"]],
  [20555, [409, "La Caja Principal debe conservar el nombre MAIN y mantenerse operativa"]],
  [20556, [409, "Cierra el turno abierto antes de desactivar la caja"]],
  [20557, [409, "Una unidad en uso no puede cambiar su regla de decimales"]],
  [20558, [409, "No se puede cambiar de unidad mientras el insumo tenga existencias"]]
]);

function responderErrorMantenedor(res, error, mensajes = {}) {
  const conocido = errores.get(error.errorNum);
  if (conocido) {
    const [codigo, mensaje] = conocido;
    return res.status(codigo).json({ estado: "ERROR", mensaje: mensajes[error.errorNum] ?? mensaje });
  }
  console.error("Error ejecutando un mantenedor:", error.code);
  return res.status(503).json({
    estado: "INCIERTO", mensaje: "No se pudo confirmar la operación. Actualiza el listado antes de volver a intentarlo"
  });
}

module.exports = { responderErrorMantenedor };
