const express = require("express");
const { consultarProcedimiento, ejecutarProcedimiento, numeroSalida } = require("../config/procedimientos");
const { autorizar, fallo, idValido } = require("../services/caja-ventas");
const { responderErrorMantenedor } = require("../services/mantenedores");

const router = express.Router();
const mantenedores = {
  terminales: {
    listar: "SAB_L_CAJA_TERMINAL", crear: "SAB_C_CAJA_TERMINAL", editar: "SAB_U_CAJA_TERMINAL", eliminar: "SAB_D_CAJA_TERMINAL",
    campos: [["nombre", 50], ["ubicacion", 100, true], ["estado", ["S", "N"]]],
    referencias: "La caja tiene turnos u horarios asociados"
  },
  categorias: {
    listar: "SAB_L_CATEGORIA_PRODUCTO", crear: "SAB_C_CATEGORIA_PRODUCTO", editar: "SAB_U_CATEGORIA_PRODUCTO", eliminar: "SAB_D_CATEGORIA_PRODUCTO",
    campos: [["nombre", 50], ["descripcion", 200, true]],
    referencias: "La categoría tiene productos asociados"
  },
  unidades: {
    listar: "SAB_L_UNIDAD_MEDIDA", crear: "SAB_C_UNIDAD_MEDIDA", editar: "SAB_U_UNIDAD_MEDIDA", eliminar: "SAB_D_UNIDAD_MEDIDA",
    campos: [["codigo", 10], ["nombre", 50], ["decimales", ["S", "N"]]],
    referencias: "La unidad tiene productos o insumos asociados"
  },
  marcas: {
    listar: "SAB_L_MARCA", crear: "SAB_C_MARCA", editar: "SAB_U_MARCA", eliminar: "SAB_D_MARCA",
    campos: [["nombre", 80], ["origen", 50]],
    referencias: "La marca tiene productos asociados"
  },
  "tipos-ajuste": {
    listar: "SAB_L_TIPO_AJUSTE_STOCK", crear: "SAB_C_TIPO_AJUSTE_STOCK", editar: "SAB_U_TIPO_AJUSTE_STOCK", eliminar: "SAB_D_TIPO_AJUSTE_STOCK",
    campos: [["nombre", 60], ["factor", [1, -1]]],
    referencias: "El tipo tiene ajustes de inventario asociados"
  }
};

function camposValidados(campos, cuerpo) {
  const datos = {};
  for (const [campo, regla, opcional] of campos) {
    const valor = typeof cuerpo?.[campo] === "string" ? cuerpo[campo].trim() : cuerpo?.[campo];
    if (Array.isArray(regla)) {
      if (!regla.includes(valor)) return null;
    } else if (!(opcional && (valor == null || valor === ""))) {
      if (typeof valor !== "string" || !valor || Buffer.byteLength(valor) > regla) return null;
    }
    datos[campo] = valor === "" || valor === undefined ? null : valor;
  }
  return datos;
}

function gestionar(operacion, escritura = false) {
  return (req, res) => {
    res.set("Cache-Control", "no-store");
    return autorizar(req, res, async (conexion, { actorId, dueno }) => {
      if (!dueno) return fallo(res, 403, "Solo el dueño puede administrar los catálogos");
      const { entidad } = req.params;
      if (!Object.hasOwn(mantenedores, entidad)) return fallo(res, 404, "Mantenedor no encontrado");
      const mantenedor = mantenedores[entidad];
      try {
        await operacion(req, res, conexion, actorId, mantenedor);
      } catch (error) {
        responderErrorMantenedor(res, error, { 2292: `No se puede eliminar. ${mantenedor.referencias}.` });
      }
    }, escritura);
  };
}

router.get("/:entidad", gestionar(async (req, res, conexion, actorId, { listar }) => {
  const registros = await consultarProcedimiento(conexion, listar, { actorId });
  res.json({ registros });
}));

router.post("/:entidad", gestionar(async (req, res, conexion, actorId, { crear, campos }) => {
  const datos = camposValidados(campos, req.body);
  if (!datos) return fallo(res, 400, "Revisa los campos del registro");
  if (req.params.entidad === "terminales" && datos.nombre.toUpperCase() === "MAIN") {
    return fallo(res, 409, "La Caja Principal se crea al abrir el primer turno en Caja");
  }
  const { resultado: id } = await ejecutarProcedimiento(conexion, crear, { actorId, ...datos, resultado: numeroSalida });
  res.status(201).json({ id });
}, true));

router.put("/:entidad/:id", gestionar(async (req, res, conexion, actorId, { editar, campos }) => {
  const id = Number(req.params.id);
  const datos = camposValidados(campos, req.body);
  if (!idValido(id) || !datos) return fallo(res, 400, "Revisa los campos del registro");
  await ejecutarProcedimiento(conexion, editar, { actorId, id, ...datos });
  res.json({ id });
}, true));

router.delete("/:entidad/:id", gestionar(async (req, res, conexion, actorId, { eliminar }) => {
  const id = Number(req.params.id);
  if (!idValido(id)) return fallo(res, 400, "Identificador inválido");
  await ejecutarProcedimiento(conexion, eliminar, { actorId, id });
  res.json({ id });
}, true));

module.exports = router;
