const { readFile, writeFile, mkdir, rename, unlink } = require("node:fs/promises");
const { resolve } = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const sharp = require("sharp");
const biblioteca = require("../../../frontend/public/productos-base/manifiesto.json");

const imagenes = new Map(biblioteca.map((imagen) => [imagen.id, imagen]));
const fotoValida = /^[a-f0-9]{64}\.webp$/;
const formatos = new Map([["image/jpeg", "jpeg"], ["image/png", "png"], ["image/webp", "webp"]]);
const maxBytes = 5 * 1024 * 1024;

function crearAlmacen(carpeta) {
  const datos = resolve(carpeta, "productos.json");
  const fotos = resolve(carpeta, "fotos");
  let pendiente = Promise.resolve();
  async function leer() {
    try {
      return JSON.parse(await readFile(datos, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }
  function guardar(id, cambios, revision) {
    const operacion = pendiente.then(async () => {
      const registros = await leer();
      const anterior = registros[id] ?? { revision: 0, imagen: null, foto: null };
      if (anterior.revision !== revision) return null;
      const nuevo = { ...anterior, ...cambios, revision: revision + 1 };
      registros[id] = nuevo;
      await mkdir(carpeta, { recursive: true });
      const temporal = resolve(carpeta, `${randomUUID()}.tmp`);
      await writeFile(temporal, JSON.stringify(registros, null, 2) + "\n", { flag: "wx" });
      try {
        await rename(temporal, datos);
      } catch (error) {
        await unlink(temporal).catch(() => {});
        throw error;
      }
      return nuevo;
    });
    pendiente = operacion.catch(() => {});
    return operacion;
  }
  async function subir(imagen) {
    const nombre = `${createHash("sha256").update(imagen).digest("hex")}.webp`;
    await mkdir(fotos, { recursive: true });
    const temporal = resolve(fotos, `${randomUUID()}.tmp`);
    await writeFile(temporal, imagen, { flag: "wx" });
    try {
      await rename(temporal, resolve(fotos, nombre));
    } catch (error) {
      await unlink(temporal).catch(() => {});
      throw error;
    }
    return nombre;
  }
  return { leer, guardar, subir, fotos };
}

async function optimizarFoto(bytes, mime) {
  if (!formatos.has(mime) || !Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxBytes) {
    throw new Error("Usa una fotografía JPG, PNG o WebP de hasta 5 MB");
  }
  const imagen = sharp(bytes, { failOn: "warning", limitInputPixels: 16000000 });
  const { format, pages } = await imagen.metadata();
  if (format !== formatos.get(mime) || (pages ?? 1) > 1) throw new Error("Formato de imagen no admitido");
  return imagen.rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
}

function presentar(registro) {
  const base = imagenes.get(registro?.imagen);
  return {
    imagen: base?.id ?? null,
    ruta: fotoValida.test(registro?.foto ?? "") ? `/api/productos-imagenes/fotos/${registro.foto}` : base?.ruta ?? null,
    favorito: registro?.favorito === true,
    revision: registro?.revision ?? 0
  };
}

const almacen = crearAlmacen(resolve(__dirname, "../../datos-locales/imagenes-productos"));
module.exports = { almacen, crearAlmacen, optimizarFoto, maxBytes, imagenes, fotoValida, presentar };
