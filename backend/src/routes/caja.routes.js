const express = require("express");
const { consultarProcedimiento } = require("../config/procedimientos");
const { autorizar, buscarCajaPrincipal, centavos, fallo, idValido, nombreCajaPrincipal, procedimiento, salida } = require("../services/caja-ventas");

const router = express.Router();
const errores = new Map([
  [1, [409, "Ya existe una caja con ese nombre"]],
  [60, [409, "Conflicto con otra operación. Actualiza Caja"]],
  [1438, [422, "Un importe excede la precisión de Oracle"]],
  [6502, [422, "Un valor excede la precisión de Oracle"]],
  [12899, [400, "Un texto excede el tamaño permitido"]],
  [2292, [409, "La caja tiene turnos u horarios asociados. Puedes marcarla fuera de servicio"]],
  [20001, [403, "Usuario o rol inactivo"]],
  [20002, [403, "El usuario ya no existe"]],
  [20003, [403, "Solo el dueño puede administrar cajas"]],
  [20013, [404, "La caja no existe"]],
  [20016, [404, "La caja no existe"]],
  [20101, [400, "Monto inicial inválido"]],
  [20102, [404, "La caja no existe"]],
  [20103, [409, "Caja fuera de servicio"]],
  [20104, [409, "La caja ya tiene un turno abierto"]],
  [20140, [400, "Montos de arqueo inválidos"]],
  [20141, [404, "El turno no existe"]],
  [20142, [409, "El turno ya está cerrado"]],
  [20143, [409, "El turno tiene ventas en borrador. Deben confirmarse o anularse antes del cierre"]],
  [20307, [409, "Un turno cerrado no puede modificarse"]]
]);

async function ejecutar(res, c, nombre, binds, codigo, respuesta) {
  try {
    const resultado = await procedimiento(c, nombre, binds);
    res.status(codigo).json(respuesta(resultado));
  } catch (error) {
    const conocido = errores.get(error.errorNum);
    if (conocido) return fallo(res, ...conocido);
    console.error("Resultado incierto en Caja:", nombre, error.code);
    fallo(res, 503, "No se pudo confirmar el resultado. Actualiza Caja y verifica el estado antes de repetir", { estado: "INCIERTO" });
  }
}

function abrirTurno(req, res) {
  return autorizar(req, res, async (c, { actorId, dueno }) => {
    const { cajaId, efectivoInicial } = req.body ?? {};
    if (!Number.isFinite(centavos(efectivoInicial)) || (cajaId !== undefined && !idValido(cajaId))) {
      return fallo(res, 400, "Ingresa un importe inicial válido");
    }
    let caja = await buscarCajaPrincipal(c, actorId);
    if (cajaId !== undefined && cajaId !== caja?.ID_CAJA) {
      return fallo(res, 409, "Solo se puede abrir la Caja Principal");
    }
    if (!caja) {
      if (!dueno) return fallo(res, 409, "El dueño debe abrir la Caja Principal por primera vez");
      try {
        await procedimiento(c, "SAB_C_CAJA_TERMINAL", {
          actorId, nombre: nombreCajaPrincipal, ubicacion: null, estado: "S", resultado: salida
        });
      } catch (error) {
        // Consultar por el nombre ?nico tambi?n cubre una creaci?n concurrente o una respuesta perdida.
        caja = await buscarCajaPrincipal(c, actorId);
        if (!caja) {
          console.error("Error inicializando Caja Principal:", error.code);
          return fallo(res, 503, "No se pudo preparar la Caja Principal. Actualiza Caja y vuelve a consultar");
        }
      }
      caja ??= await buscarCajaPrincipal(c, actorId);
    }
    if (!caja || caja.ESTADO_OPERATIVO !== "S") {
      return fallo(res, 409, "La Caja Principal está fuera de servicio o no está disponible");
    }
    await ejecutar(res, c, "SAB_ABRIR_CAJA", { actorId, cajaId: caja.ID_CAJA, efectivoInicial, resultado: salida },
      201, (turnoId) => ({ turnoId }));
  }, true);
}

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/", (req, res) => autorizar(req, res, async (c, actor) => {
  const caja = await buscarCajaPrincipal(c, actor.actorId);
  const activos = caja ? await consultarProcedimiento(c, "SAB_API_CAJA_ABIERTOS", { ...actor, cajaId: caja.ID_CAJA }) : [];
  let resumenDia = { CANTIDAD: 0, TOTAL: 0 };
  if (caja) {
    const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format();
    const [resumen] = await consultarProcedimiento(c, "SAB_API_CAJA_RESUMEN_DIA",
      { actorId: actor.actorId, cajaId: caja.ID_CAJA, hoy });
    resumenDia = resumen ?? resumenDia;
  }
  res.json({ caja, activos, resumenDia });
}));

router.get("/turnos", (req, res) => autorizar(req, res, async (c, actor) => {
  const pagina = Number(req.query.pagina ?? 1);
  const cajaId = req.query.cajaId === undefined ? null : Number(req.query.cajaId);
  if (!idValido(pagina) || pagina > 1000000 || (cajaId !== null && !idValido(cajaId))) {
    return fallo(res, 400, "Filtros de historial inválidos");
  }
  const turnos = await consultarProcedimiento(c, "SAB_API_CAJA_HISTORIAL",
  { ...actor, cajaId, desplazamiento: (pagina - 1) * 25 });
  res.json({ turnos: turnos.slice(0, 25), hayMas: turnos.length > 25 });
}));

router.get("/turnos/:id", (req, res) => autorizar(req, res, async (c, actor) => {
  const turnoId = Number(req.params.id);
  const pagina = Number(req.query.pagina ?? 1);
  if (!idValido(turnoId) || !idValido(pagina) || pagina > 1000000) {
    return fallo(res, 400, "Identificador o página inválidos");
  }
  const [turno] = await consultarProcedimiento(c, "SAB_API_CAJA_TURNO", { ...actor, turnoId });
  if (!turno) return fallo(res, 404, "Turno no encontrado");
  const alcanceTurno = { actorId: actor.actorId, turnoId };
  const pagos = await consultarProcedimiento(c, "SAB_API_CAJA_TURNO_PAGOS", alcanceTurno);
  const ventas = await consultarProcedimiento(c, "SAB_API_CAJA_TURNO_VENTAS",
  { ...actor, turnoId, desplazamiento: (pagina - 1) * 25 });
  const [resumen] = await consultarProcedimiento(c, "SAB_API_CAJA_TURNO_RESUMEN", alcanceTurno);
  const [pendientes] = await consultarProcedimiento(c, "SAB_API_CAJA_TURNO_BORRADORES", alcanceTurno);
  if (!resumen || !pendientes) return fallo(res, 404, "Turno no encontrado");
  const auditoria = await consultarProcedimiento(c, "SAB_API_CAJA_TURNO_EVENTOS", alcanceTurno);
  res.json({ turno, pagos, resumen, ventas: ventas.slice(0, 25), hayMas: ventas.length > 25,
    borradores: pendientes.BORRADORES, auditoria });
}));

router.post("/turnos", abrirTurno);

router.post("/turnos/:id/cierre", (req, res) => autorizar(req, res, async (c, { actorId }) => {
  const turnoId = Number(req.params.id);
  const { efectivo, tarjeta, transferencia } = req.body ?? {};
  if (!idValido(turnoId) || ![efectivo, tarjeta, transferencia].every((monto) => Number.isFinite(centavos(monto)))) {
    return fallo(res, 400, "Ingresa importes válidos para efectivo, tarjeta y transferencia");
  }
  await ejecutar(res, c, "SAB_CERRAR_CAJA", { actorId, turnoId, efectivo, tarjeta, transferencia, resultado: salida },
    200, (descuadre) => ({ turnoId, descuadre }));
}, true));

module.exports = { router, abrirTurno };
