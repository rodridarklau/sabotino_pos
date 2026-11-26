const express = require("express");
const rateLimit = require("express-rate-limit");
const { consultarProcedimiento } = require("../config/procedimientos");
const { autorizar, fallo, idValido } = require("../services/caja-ventas");
const { almacen, optimizarFoto, maxBytes, imagenes, fotoValida, presentar } = require("../services/imagenes-productos");

function crearRouter(archivo = almacen) {
  const router = express.Router();
  let procesando = false;
  const limiteFotos = rateLimit({
    windowMs: 60_000, limit: 12, standardHeaders: "draft-8", legacyHeaders: false,
    message: { estado: "ERROR", mensaje: "Demasiadas cargas. Intenta en un minuto" }
  });
  function exigirDueno(req, res, next) {
    if (!req.session?.usuario) return fallo(res, 401, "Debes iniciar sesión");
    if (req.session.usuario.rol !== "DUENO") return fallo(res, 403, "Solo el dueño administra imágenes");
    next();
  }
  function editar(req, res, operacion) {
    return autorizar(req, res, async (conexion, { actorId, dueno }) => {
      if (!dueno) return fallo(res, 403, "Solo el dueño administra imágenes");
      const id = Number(req.params.id);
      if (!idValido(id)) return fallo(res, 400, "Producto inválido");
      const [producto] = await consultarProcedimiento(conexion, "SAB_API_IMAGEN_PRODUCTO", { actorId, id });
      if (!producto) return fallo(res, 404, "Producto no encontrado");
      await operacion(id);
    }, true);
  }

  router.get("/", exigirDueno, (req, res) => autorizar(req, res, async (_, { dueno }) => {
    if (!dueno) return fallo(res, 403, "Solo el dueño administra imágenes");
    res.json(Object.fromEntries(Object.entries(await archivo.leer()).map(([id, dato]) => [id, presentar(dato)])));
  }));
  router.get("/fotos/:nombre", (req, res) => {
    if (!req.session?.usuario) return fallo(res, 401, "Debes iniciar sesión");
    if (!fotoValida.test(req.params.nombre)) return fallo(res, 404, "Foto no encontrada");
    res.set("X-Content-Type-Options", "nosniff").type("webp");
    res.sendFile(req.params.nombre, { root: archivo.fotos, cacheControl: false, dotfiles: "deny",
      headers: { "Cache-Control": "private, max-age=86400, immutable" } }, (error) => {
      if (error && !res.headersSent) res.status(error.statusCode === 404 ? 404 : 500).end();
    });
  });
  function confirmar(res, nuevo) {
    return nuevo ? res.json(presentar(nuevo))
      : fallo(res, 409, "Otra edición cambió la imagen. Recarga el producto antes de guardar");
  }
  router.put("/:id", exigirDueno, (req, res) => editar(req, res, async (id) => {
    const { imagen, favorito, revision } = req.body ?? {};
    if (typeof favorito !== "boolean" || !Number.isSafeInteger(revision) || revision < 0 ||
      (imagen !== undefined && imagen !== null && !imagenes.has(imagen))) {
      return fallo(res, 400, "Selecciona una imagen válida de la biblioteca");
    }
    const cambios = imagen === undefined ? { favorito } : { favorito, imagen, foto: null };
    confirmar(res, await archivo.guardar(id, cambios, revision));
  }));
  router.post("/:id/foto", exigirDueno, limiteFotos, express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: maxBytes }),
    (req, res) => editar(req, res, async (id) => {
      const valorRevision = req.query.revision;
      const revision = typeof valorRevision === "string" && /^\d+$/.test(valorRevision) ? Number(valorRevision) : NaN;
      const { favorito } = req.query;
      if (!Number.isSafeInteger(revision) || revision < 0 || !["true", "false"].includes(favorito)) {
        return fallo(res, 400, "Preferencias de imagen inválidas");
      }
      if (procesando) return fallo(res, 429, "Hay una fotografía en proceso. Intenta de nuevo");
      procesando = true;
      let bytes;
      try {
        bytes = await optimizarFoto(req.body, req.get("Content-Type")?.split(";")[0]);
      } catch {
        return fallo(res, 400, "La fotografía es inválida. Usa JPG, PNG o WebP, hasta 5 MB y 16 megapíxeles");
      } finally {
        procesando = false;
      }
      const foto = await archivo.subir(bytes);
      confirmar(res, await archivo.guardar(id, { foto, imagen: null, favorito: favorito === "true" }, revision));
    }));
  router.use((error, req, res, next) => {
    if (error.type === "entity.too.large") return fallo(res, 413, "La fotografía supera el límite de 5 MB");
    next(error);
  });
  return router;
}

module.exports = { router: crearRouter(), crearRouter };
