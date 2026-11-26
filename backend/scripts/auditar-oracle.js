const { readdirSync, readFileSync } = require("node:fs");
const { extname, join, relative, resolve } = require("node:path");

const backend = resolve(__dirname, "..");
const adaptador = "src/config/procedimientos.js";
const pool = "src/config/database.js";
const invocacion = 'conexion.execute("BEGIN " + nombre + "(" + argumentos + "); END;", binds, opciones)';
const sqlDirecto = /\b(?:SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|MERGE\s+INTO)\b/i;
const operacionesDriver = /\b(?:execute|executeMany|queryStream|getStatementInfo)\b/g;

function archivosJs(carpeta) {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosJs(ruta);
    return [".js", ".cjs", ".mjs"].includes(extname(ruta)) ? [ruta] : [];
  });
}

const archivos = [join(backend, "server.js"), ...archivosJs(join(backend, "src"))];
const errores = [];
for (const archivo of archivos) {
  const ruta = relative(backend, archivo).replaceAll("\\", "/");
  const fuente = readFileSync(archivo, "utf8");
  if (sqlDirecto.test(fuente)) errores.push(ruta + " contiene SQL directo");
  if (ruta !== adaptador && ruta !== pool && /\boracledb\b/.test(fuente)) {
    errores.push(ruta + " accede al driver fuera de la capa Oracle");
  }
  const usos = [...fuente.matchAll(operacionesDriver)];
  if (ruta === adaptador) {
    if (usos.length !== 1 || !fuente.includes(invocacion)) {
      errores.push(ruta + " debe tener una única llamada que construya el bloque de procedimiento");
    }
  } else if (usos.length) {
    errores.push(ruta + " usa una operación directa del driver");
  }
}

if (errores.length) {
  console.error(errores.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Auditoría Oracle aprobada en ${archivos.length} archivos de ejecución. Única llamada al driver en la capa de procedimientos.`);
}
