const oracledb = require("oracledb");
const { obtenerConexion } = require("../config/database");

const opciones = { outFormat: oracledb.OUT_FORMAT_OBJECT };
const operaciones = new Set();
const salida = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
const maximo = 99999999999999;
const idValido = (id) => Number.isSafeInteger(id) && id > 0;
const unidades = (valor, escala, limite) => {
  if (typeof valor !== "number") return NaN;
  const entero = Math.round(valor * escala);
  return valor === entero / escala &&
    entero >= 0 && entero <= limite ? entero : NaN;
};
const centavos = (valor) => unidades(valor, 100, maximo);


function fallo(res, codigo, mensaje, datos = {}) {
  return res.status(codigo).json({ estado: "ERROR", mensaje, ...datos });
}

async function filas(c, sql, binds = {}) {
  return (await c.execute(sql, binds, opciones)).rows;
}

async function autorizar(req, res, operacion, escritura = false) {
  const usuario = req.session?.usuario;
  if (!idValido(usuario?.id)) return fallo(res, 401, "Debes iniciar sesión");
  if (!["DUENO", "VENDEDOR"].includes(usuario.rol)) return fallo(res, 403, "Acceso denegado");
  const actorId = usuario.id;
  if (escritura && operaciones.has(actorId)) {
    return fallo(res, 409, "Ya hay una operación en curso. Revisa el historial antes de volver a enviarla", { estado: "INCIERTO" });
  }
  if (escritura) operaciones.add(actorId);
  let c;
  try {
    c = await obtenerConexion();
    const [actor] = await filas(c, `SELECT R.NOMBRE_ROL FROM USUARIO U
      JOIN ROL_USUARIO R ON R.ID_ROL = U.ID_ROL
      WHERE U.ID_USUARIO = :actorId AND U.ESTADO_USUARIO = 'S' AND R.ESTADO_ACTIVO = 'S'`, { actorId });
    if (actor?.NOMBRE_ROL !== usuario.rol) return fallo(res, 403, "La sesión ya no tiene acceso a Caja o Ventas");
    await operacion(c, { actorId, dueno: Number(usuario.rol === "DUENO") });
  } catch (error) {
    console.error("Error preparando o consultando Caja o Ventas:", error.code);
    fallo(res, 500, "No se pudo completar la consulta u operación");
  } finally {
    try {
      if (c) await c.close();
    } catch (error) {
      console.error("Error cerrando conexión de Caja o Ventas:", error.code);
    } finally {
      if (escritura) operaciones.delete(actorId);
    }
  }
}

async function procedimiento(c, nombre, binds) {
  const parametros = Object.keys(binds).map((parametro) => `:${parametro}`).join(", ");
  const resultado = await c.execute(`BEGIN ${nombre}(${parametros}); END;`, binds);
  const valor = resultado.outBinds?.resultado;
  if (binds.resultado && !Number.isFinite(valor)) throw new Error("Salida de Oracle no disponible");
  return valor;
}

module.exports = { autorizar, centavos, fallo, filas, idValido, maximo, procedimiento, salida, unidades };
