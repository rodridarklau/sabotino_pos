const express = require("express");
const { autorizar, centavos, fallo, filas, idValido, procedimiento, salida } = require("../services/caja-ventas");

const router = express.Router();
const turnosSql = `SELECT T.ID_TURNO_CAJA, T.ID_CAJA, C.NOMBRE_CAJA, T.ESTADO_TURNO,
    TO_CHAR(T.FECHA_HORA_APERTURA, 'DD/MM/YYYY HH24:MI:SS') AS APERTURA,
    TO_CHAR(T.FECHA_HORA_CIERRE, 'DD/MM/YYYY HH24:MI:SS') AS CIERRE,
    A.NOMBRE_COMPLETO AS RESPONSABLE_APERTURA, B.NOMBRE_COMPLETO AS RESPONSABLE_CIERRE,
    T.INICIAL_EFECTIVO, T.INICIAL_TARJETA, T.INICIAL_TRANSFERENCIA,
    T.CIERRE_SISTEMA_EFECTIVO, T.CIERRE_SISTEMA_TARJETA, T.CIERRE_SISTEMA_TRANSFERENCIA,
    T.CIERRE_REAL_EFECTIVO, T.CIERRE_REAL_TARJETA, T.CIERRE_REAL_TRANSFERENCIA
  FROM TURNO_CAJA T JOIN CAJA_TERMINAL C ON C.ID_CAJA = T.ID_CAJA
  JOIN USUARIO A ON A.ID_USUARIO = T.ID_USUARIO_APERTURA
  LEFT JOIN USUARIO B ON B.ID_USUARIO = T.ID_USUARIO_CIERRE
  WHERE (:dueno = 1 OR T.ESTADO_TURNO = 'ABIERTO'
    OR :actorId IN (T.ID_USUARIO_APERTURA, T.ID_USUARIO_CIERRE))`;

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
  return autorizar(req, res, async (c, { actorId }) => {
    const { cajaId, efectivoInicial } = req.body ?? {};
    if (!idValido(cajaId) || !Number.isFinite(centavos(efectivoInicial))) {
      return fallo(res, 400, "Selecciona una caja y un importe inicial válido");
    }
    await ejecutar(res, c, "SAB_ABRIR_CAJA", { actorId, cajaId, efectivoInicial, resultado: salida },
      201, (turnoId) => ({ turnoId }));
  }, true);
}

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/", (req, res) => autorizar(req, res, async (c, actor) => {
  const cajas = await filas(c, `SELECT C.ID_CAJA, C.NOMBRE_CAJA, C.UBICACION, C.ESTADO_OPERATIVO,
      (SELECT COUNT(*) FROM TURNO_CAJA T WHERE T.ID_CAJA = C.ID_CAJA) AS TOTAL_TURNOS
    FROM CAJA_TERMINAL C
    WHERE :dueno = 1 OR C.ESTADO_OPERATIVO = 'S' OR EXISTS (
      SELECT 1 FROM TURNO_CAJA T WHERE T.ID_CAJA = C.ID_CAJA AND T.ESTADO_TURNO = 'ABIERTO'
    ) ORDER BY C.NOMBRE_CAJA, C.ID_CAJA`, { dueno: actor.dueno });
  const activos = await filas(c, `${turnosSql} AND T.ESTADO_TURNO = 'ABIERTO'
    ORDER BY C.NOMBRE_CAJA, T.ID_TURNO_CAJA`, actor);
  res.json({ cajas, activos });
}));

router.get("/turnos", (req, res) => autorizar(req, res, async (c, actor) => {
  const pagina = Number(req.query.pagina ?? 1);
  const cajaId = req.query.cajaId === undefined ? null : Number(req.query.cajaId);
  if (!idValido(pagina) || pagina > 1000000 || (cajaId !== null && !idValido(cajaId))) {
    return fallo(res, 400, "Filtros de historial inválidos");
  }
  const turnos = await filas(c, `${turnosSql} AND T.ESTADO_TURNO = 'CERRADO'
    AND (:cajaId IS NULL OR T.ID_CAJA = :cajaId)
    ORDER BY T.FECHA_HORA_CIERRE DESC, T.ID_TURNO_CAJA DESC
    OFFSET :desplazamiento ROWS FETCH NEXT 26 ROWS ONLY`,
  { ...actor, cajaId, desplazamiento: (pagina - 1) * 25 });
  res.json({ turnos: turnos.slice(0, 25), hayMas: turnos.length > 25 });
}));

router.get("/turnos/:id", (req, res) => autorizar(req, res, async (c, actor) => {
  const turnoId = Number(req.params.id);
  const pagina = Number(req.query.pagina ?? 1);
  if (!idValido(turnoId) || !idValido(pagina) || pagina > 1000000) {
    return fallo(res, 400, "Identificador o página inválidos");
  }
  const [turno] = await filas(c, `${turnosSql} AND T.ID_TURNO_CAJA = :turnoId`, { ...actor, turnoId });
  if (!turno) return fallo(res, 404, "Turno no encontrado");
  const pagos = await filas(c, `SELECT M.NOMBRE_METODO, NVL(SUM(P.MONTO_PAGADO), 0) AS TOTAL
    FROM METODO_PAGO M LEFT JOIN (
      SELECT P.ID_METODO_PAGO, P.MONTO_PAGADO FROM PAGO_VENTA P
      JOIN VENTA V ON V.ID_VENTA = P.ID_VENTA
      WHERE V.ID_TURNO_CAJA = :turnoId AND V.ESTADO_VENTA = 'CONFIRMADA'
    ) P ON P.ID_METODO_PAGO = M.ID_METODO_PAGO
    GROUP BY M.NOMBRE_METODO ORDER BY M.NOMBRE_METODO`, { turnoId });
  const ventas = await filas(c, `SELECT V.ID_VENTA, U.NOMBRE_COMPLETO AS RESPONSABLE, V.ESTADO_VENTA,
      V.TOTAL_VENTA, TO_CHAR(V.FECHA_HORA_VENTA, 'DD/MM/YYYY HH24:MI:SS') AS FECHA
    FROM VENTA V JOIN USUARIO U ON U.ID_USUARIO = V.ID_USUARIO
    WHERE V.ID_TURNO_CAJA = :turnoId AND (:dueno = 1 OR V.ID_USUARIO = :actorId)
    ORDER BY V.FECHA_HORA_VENTA DESC, V.ID_VENTA DESC
    OFFSET :desplazamiento ROWS FETCH NEXT 26 ROWS ONLY`,
  { ...actor, turnoId, desplazamiento: (pagina - 1) * 25 });
  const [pendientes] = await filas(c, `SELECT COUNT(*) AS BORRADORES FROM VENTA
    WHERE ID_TURNO_CAJA = :turnoId AND ESTADO_VENTA = 'BORRADOR'`, { turnoId });
  const auditoria = await filas(c, `SELECT L.ID_LOG_CAJA, L.TIPO_OPERACION, L.DESCUADRE_TOTAL,
      U.NOMBRE_COMPLETO AS RESPONSABLE, TO_CHAR(L.FECHA_HORA_REGISTRO, 'DD/MM/YYYY HH24:MI:SS') AS FECHA
    FROM LOG_AUDITORIA_CAJA L JOIN USUARIO U ON U.ID_USUARIO = L.ID_USUARIO
    WHERE L.ID_TURNO_CAJA = :turnoId ORDER BY L.ID_LOG_CAJA`, { turnoId });
  res.json({ turno, pagos, ventas: ventas.slice(0, 25), hayMas: ventas.length > 25,
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

function guardarCaja(req, res) {
  return autorizar(req, res, async (c, { actorId, dueno }) => {
    if (!dueno) return fallo(res, 403, "Solo el dueño puede administrar cajas");
    const editar = req.params.id !== undefined;
    const cajaId = Number(req.params.id);
    const { nombre, ubicacion, estado } = req.body ?? {};
    if ((editar && !idValido(cajaId)) || typeof nombre !== "string" || !nombre.trim()
        || Buffer.byteLength(nombre.trim(), "utf8") > 50
        || (ubicacion != null && (typeof ubicacion !== "string" || Buffer.byteLength(ubicacion.trim(), "utf8") > 100))
        || !["S", "N"].includes(estado)) {
      return fallo(res, 400, "Revisa el nombre, la ubicación y el estado de la caja");
    }
    const datos = { nombre: nombre.trim(), ubicacion: ubicacion?.trim() || null, estado };
    if (editar) {
      await ejecutar(res, c, "SAB_U_CAJA_TERMINAL", { actorId, cajaId, ...datos }, 200, () => ({ cajaId }));
    } else {
      await ejecutar(res, c, "SAB_C_CAJA_TERMINAL", { actorId, ...datos, resultado: salida }, 201, (id) => ({ cajaId: id }));
    }
  }, true);
}

router.post("/terminales", guardarCaja);
router.put("/terminales/:id", guardarCaja);
router.delete("/terminales/:id", (req, res) => autorizar(req, res, async (c, { actorId, dueno }) => {
  if (!dueno) return fallo(res, 403, "Solo el dueño puede administrar cajas");
  const cajaId = Number(req.params.id);
  if (!idValido(cajaId)) return fallo(res, 400, "Identificador inválido");
  await ejecutar(res, c, "SAB_D_CAJA_TERMINAL", { actorId, cajaId }, 200, () => ({ cajaId }));
}, true));

module.exports = { router, abrirTurno };
