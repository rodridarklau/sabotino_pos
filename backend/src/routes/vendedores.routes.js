const express = require("express");
const argon2 = require("argon2");
const { autorizar, fallo, filas, idValido, procedimiento, salida } = require("../services/caja-ventas");

const router = express.Router();
const usuarios = `FROM USUARIO U JOIN ROL_USUARIO R ON R.ID_ROL = U.ID_ROL
  WHERE R.NOMBRE_ROL = 'VENDEDOR'`;
const dias = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];
const hora = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const errores = {
  1: [409, "El RUT o nombre de usuario ya está registrado"],
  2291: [409, "El vendedor o la caja ya no está disponible"],
  20001: [403, "Usuario inactivo"], 20002: [403, "Usuario no disponible"], 20003: [403, "Solo el dueño puede administrar vendedores"],
  20013: [404, "Vendedor no encontrado"], 20510: [409, "El rol VENDEDOR no está disponible"],
  20511: [403, "El rol debe ser VENDEDOR"], 20512: [403, "El rol del usuario es fijo"],
  20550: [409, "El vendedor debe estar activo"], 20551: [409, "La caja debe estar operativa"],
  20552: [404, "Horario no encontrado"], 20553: [404, "Horario no encontrado"],
  20554: [409, "El vendedor ya tiene un horario activo que se superpone"]
};

function gestionar(req, res, operacion, escritura = false) {
  res.set("Cache-Control", "no-store");
  return autorizar(req, res, async (c, { actorId, dueno }) => {
    if (!dueno) return fallo(res, 403, "Solo el dueño puede administrar vendedores");
    return operacion(c, actorId);
  }, escritura);
}

async function ejecutar(res, c, nombre, binds, respuesta, codigo = 200) {
  try {
    const valor = await procedimiento(c, nombre, binds);
    res.status(codigo).json(respuesta(valor));
  } catch (error) {
    const conocido = errores[error.errorNum];
    if (conocido) return fallo(res, ...conocido);
    return fallo(res, 503, "Resultado incierto. Actualiza la lista antes de repetir", { estado: "INCIERTO" });
  }
}

router.get("/", (req, res) => gestionar(req, res, async (c) => {
  const vendedores = await filas(c, `SELECT U.ID_USUARIO, U.RUT_USUARIO, U.NOMBRE_COMPLETO,
    U.USERNAME, U.ESTADO_USUARIO ${usuarios} ORDER BY U.NOMBRE_COMPLETO, U.ID_USUARIO`);
  const horarios = await filas(c, `SELECT H.ID_HORARIO, H.ID_USUARIO, H.ID_CAJA, C.NOMBRE_CAJA,
      H.DIA_SEMANA, H.HORA_INICIO, H.HORA_FIN, H.ESTADO_ACTIVO
    FROM HORARIO_VENDEDOR H JOIN CAJA_TERMINAL C ON C.ID_CAJA = H.ID_CAJA
    JOIN USUARIO U ON U.ID_USUARIO = H.ID_USUARIO JOIN ROL_USUARIO R ON R.ID_ROL = U.ID_ROL
    WHERE R.NOMBRE_ROL = 'VENDEDOR' ORDER BY H.HORA_INICIO, H.ID_HORARIO`);
  const cajas = await filas(c, "SELECT ID_CAJA, NOMBRE_CAJA FROM CAJA_TERMINAL WHERE ESTADO_OPERATIVO = 'S' ORDER BY NOMBRE_CAJA");
  res.json({ vendedores, horarios, cajas });
}));

function textoValido(valor, minimo, maximo) {
  return typeof valor === "string" && valor.trim().length >= minimo && Buffer.byteLength(valor.trim()) <= maximo;
}

function guardarUsuario(req, res) {
  return gestionar(req, res, async (c, actorId) => {
    const editar = req.params.id !== undefined;
    const id = Number(req.params.id);
    const { rut, nombre, usuario, password, estado } = req.body ?? {};
    const cambiarPassword = !editar || (password != null && password !== "");
    if ((editar && !idValido(id)) || !textoValido(rut, 3, 12) || !textoValido(nombre, 3, 100)
      || !textoValido(usuario, 3, 50) || !["S", "N"].includes(estado)
      || (cambiarPassword && (typeof password !== "string" || password.length < 12 || password.length > 128))) {
      return fallo(res, 400, "Revisa los datos. La contraseña debe tener de 12 a 128 caracteres");
    }
    let rolId = null;
    if (editar) {
      const [vendedor] = await filas(c, `SELECT U.ID_ROL ${usuarios} AND U.ID_USUARIO = :id`, { id });
      if (!vendedor) return fallo(res, 404, "Vendedor no encontrado");
      rolId = vendedor.ID_ROL;
    }
    const [duplicado] = await filas(c, `SELECT ID_USUARIO FROM USUARIO
      WHERE UPPER(USERNAME) = UPPER(:usuario) AND (:id IS NULL OR ID_USUARIO <> :id)
      FETCH FIRST 1 ROW ONLY`, { usuario: usuario.trim(), id: editar ? id : null });
    if (duplicado) return fallo(res, 409, "El nombre de usuario ya está registrado");
    const hash = cambiarPassword ? await argon2.hash(password, { type: argon2.argon2id }) : null;
    const datos = { rolId, rut: rut.trim(), nombre: nombre.trim(), usuario: usuario.trim(), hash, estado };
    return editar
      ? ejecutar(res, c, "SAB_U_USUARIO", { actorId, id, ...datos }, () => ({ id }))
      : ejecutar(res, c, "SAB_C_USUARIO", { actorId, ...datos, resultado: salida }, (nuevo) => ({ id: nuevo }), 201);
  }, true);
}

async function horarioVendedor(c, id) {
  const [horario] = await filas(c, `SELECT H.ID_HORARIO FROM HORARIO_VENDEDOR H
    JOIN USUARIO U ON U.ID_USUARIO = H.ID_USUARIO JOIN ROL_USUARIO R ON R.ID_ROL = U.ID_ROL
    WHERE H.ID_HORARIO = :id AND R.NOMBRE_ROL = 'VENDEDOR'`, { id });
  return horario;
}

function guardarHorario(req, res) {
  return gestionar(req, res, async (c, actorId) => {
    const editar = req.params.id !== undefined;
    const id = Number(req.params.id);
    const { vendedorId, cajaId, dia, inicio, fin, estado } = req.body ?? {};
    if ((editar && !idValido(id)) || !idValido(vendedorId) || !idValido(cajaId) ||
      !dias.includes(dia) || typeof inicio !== "string" || typeof fin !== "string" ||
      !hora.test(inicio) || !hora.test(fin) || fin <= inicio || !["S", "N"].includes(estado)) {
      return fallo(res, 400, "Selecciona vendedor, caja y un intervalo válido dentro del mismo día");
    }
    const [vendedor] = await filas(c, `SELECT U.ID_USUARIO ${usuarios} AND U.ID_USUARIO = :vendedorId`, { vendedorId });
    if (!vendedor || (editar && !await horarioVendedor(c, id))) return fallo(res, 404, "Vendedor u horario no encontrado");
    const datos = { vendedorId, cajaId, dia, inicio, fin, estado };
    return editar
      ? ejecutar(res, c, "SAB_U_HORARIO_VENDEDOR", { actorId, id, ...datos }, () => ({ id }))
      : ejecutar(res, c, "SAB_C_HORARIO_VENDEDOR", { actorId, ...datos, resultado: salida }, (nuevo) => ({ id: nuevo }), 201);
  }, true);
}

router.post("/", guardarUsuario);
router.put("/:id", guardarUsuario);
router.post("/horarios", guardarHorario);
router.put("/horarios/:id", guardarHorario);
router.delete("/horarios/:id", (req, res) => gestionar(req, res, async (c, actorId) => {
  const id = Number(req.params.id);
  if (!idValido(id)) return fallo(res, 400, "Horario inválido");
  if (!await horarioVendedor(c, id)) return fallo(res, 404, "Horario no encontrado");
  await ejecutar(res, c, "SAB_D_HORARIO_VENDEDOR", { actorId, id }, () => ({ id }));
}, true));

module.exports = router;
