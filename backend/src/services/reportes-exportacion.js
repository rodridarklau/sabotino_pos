const PDFDocument = require("pdfkit");
const { resolve } = require("node:path");

const logo = resolve(__dirname, "../../../frontend/public/branding/logo-sabotino.png");
const moneda = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numero = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });
const instante = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
const titulos = {
  resumen: "Resumen del negocio", ventas: "Ventas", productos: "Productos más vendidos",
  pagos: "Métodos de pago", compras: "Compras y abastecimiento", inventario: "Inventario actual",
  movimientos: "Ingresos y mermas", caja: "Caja y turnos", vendedores: "Actividad por vendedor"
};
const etiquetas = {
  ID: "ID", PRECIO_MIN: "Precio histórico mínimo", PRECIO_MAX: "Precio histórico máximo", COSTO: "Costo unitario",
  STOCK_ACTUAL: "Stock actual", STOCK_CRITICO: "Stock crítico", TICKET: "Ticket promedio", DIAS_ACTIVOS: "Días con ventas registradas",
  REAL_EFECTIVO: "Contado efectivo", REAL_TARJETA: "Declarado tarjeta", REAL_TRANSFERENCIA: "Declarado transferencia",
  ESP_EFECTIVO: "Esperado efectivo", ESP_TARJETA: "Esperado tarjeta", ESP_TRANSFERENCIA: "Esperado transferencia"
};
const etiqueta = (clave) => etiquetas[clave] || clave.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const monetario = (clave) => /^(INGRESOS|GASTOS|TICKET|IMPORTE|COSTO|PRECIO_|DESCUADRE|REAL_|ESP_|INICIAL_|TOTAL_PAGOS)/.test(clave);

function celdaCsv(valor) {
  if (valor == null) return '""';
  if (typeof valor === "number") return String(valor).replace(".", ",");
  const texto = String(valor);
  const segura = /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/u.test(texto) ? "'" + texto : texto;
  return '"' + segura.replaceAll('"', '""') + '"';
}

function csv(filas) {
  const columnas = Object.keys(filas[0] ?? {});
  return "\ufeff" + [columnas.map((c) => celdaCsv(etiqueta(c))).join(";"), ...filas.map((r) =>
    columnas.map((c) => celdaCsv(r[c])).join(";"))].join("\r\n");
}

function pdf(seccion, f, datos, subtitulo = "") {
  return new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 38, bufferPages: true, lang: "es-CL",
      info: { Title: `SABOTINO | ${titulos[seccion]}` } });
    const trozos = [];
    doc.on("data", (trozo) => trozos.push(trozo));
    doc.on("error", rechazar);
    doc.on("end", () => resolver(Buffer.concat(trozos)));
    const margen = 38;
    const ancho = doc.page.width - margen * 2;
    const borde = doc.page.height - margen - 18;
    const marino = "#26344d";
    const oro = "#C7A45B";
    const texto = (valor, x, y, anchoCol, tam = 9, fuerte = false) => doc
      .font(fuerte ? "Helvetica-Bold" : "Helvetica").fontSize(tam).fillColor(marino)
      .text(String(valor), x, y, { width: anchoCol, lineGap: 1 });
    doc.image(logo, margen, margen, { width: 54 });
    texto("SABOTINO PASTELERÍA", margen + 68, margen + 3, ancho - 68, 10, true);
    texto(titulos[seccion], margen + 68, margen + 18, ancho - 68, 23, true);
    texto(seccion === "inventario" ? "Existencias al momento de la consulta" : `Período ${f.desde} al ${f.hasta}`,
      margen + 68, margen + 48, ancho - 68);
    texto(`Generado ${instante.format(new Date())} · hora de Chile`, margen + 68, margen + 62, ancho - 68);
    let y = margen + 84;
    if (subtitulo) {
      texto(subtitulo, margen, y, ancho);
      y = doc.y + 12;
    }
    const formatear = (k, v) => v == null ? "—" : typeof v !== "number" || k === "ID" ? v
      : k === "PARTICIPACION" ? `${numero.format(v)}%` : (monetario(k) ? moneda : numero).format(v);
    const medir = (valores, anchoCol, tam, fuerte = false) => {
      doc.font(fuerte ? "Helvetica-Bold" : "Helvetica").fontSize(tam);
      return Math.max(...valores.map((v) => doc.heightOfString(String(v), { width: anchoCol, lineGap: 1 })));
    };
    const reservar = (alto) => {
      if (y + alto > borde) { doc.addPage(); y = margen; }
    };
    const tituloSeccion = (titulo, alto) => {
      doc.strokeColor(oro).moveTo(margen, y).lineTo(margen + ancho, y).stroke();
      texto(titulo, margen, y + 10, ancho, 12, true);
      y += alto;
    };
    for (const [nombre, dataset] of Object.entries(datos)) {
      if (nombre === "hayMas" || !dataset) continue;
      const titulo = nombre === "tabla" ? "Detalle" : etiqueta(nombre);
      const registros = Array.isArray(dataset) ? dataset : Object.entries(dataset).map(([k, v]) =>
        ({ INDICADOR: etiqueta(k), VALOR: formatear(k, v) }));
      if (!registros.length) {
        const mensaje = "Sin datos para los filtros seleccionados.";
        const altoTitulo = medir([titulo], ancho, 12, true) + 18;
        const altoMensaje = medir([mensaje], ancho, 9) + 10;
        reservar(altoTitulo + altoMensaje);
        tituloSeccion(titulo, altoTitulo);
        texto(mensaje, margen, y, ancho);
        y += altoMensaje;
        continue;
      }
      const columnas = Object.keys(registros[0]);
      // Arqueos tienen 18 columnas. Dividir la tabla conserva tamaño y las identidades de cada fila.
      const grupos = columnas.length > 10
        ? [columnas.slice(0, 10), [columnas[0], ...columnas.slice(10)]] : [columnas];
      for (const [indice, grupo] of grupos.entries()) {
        const rotulo = indice ? `${titulo} (continuación)` : titulo;
        const colAncho = ancho / grupo.length;
        const encabezados = grupo.map(etiqueta);
        const altoTitulo = medir([rotulo], ancho, 12, true) + 18;
        const altoCabecera = Math.max(30, medir(encabezados, colAncho - 8, 8, true) + 8);
        const valoresFila = (registro) => grupo.map((c) => formatear(c, registro[c]));
        const medirFila = (valores) => medir(valores, colAncho - 8, 8.5) + 10;
        const cabecera = () => {
          doc.rect(margen, y, ancho, altoCabecera).fill("#F8F5EC");
          encabezados.forEach((c, i) => texto(c, margen + i * colAncho + 4, y + 4, colAncho - 8, 8, true));
          y += altoCabecera + 2;
        };
        reservar(altoTitulo + altoCabecera + 2 + medirFila(valoresFila(registros[0])));
        tituloSeccion(rotulo, altoTitulo);
        cabecera();
        for (const registro of registros) {
          const valores = valoresFila(registro);
          const altura = medirFila(valores);
          if (y + altura > borde) { doc.addPage(); y = margen; cabecera(); }
          valores.forEach((v, i) => texto(v, margen + i * colAncho + 4, y + 3, colAncho - 8, 8.5));
          y += altura;
          doc.strokeColor("#E7E2D7").lineWidth(0.5).moveTo(margen, y).lineTo(margen + ancho, y).stroke();
        }
        y += 13;
      }
    }
    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(8).fillColor(marino).text(
        `SABOTINO  ·  ${i + 1} / ${paginas.count}`, margen, doc.page.height - margen - 12, { width: ancho, align: "right", lineBreak: false }
      );
    }
    doc.end();
  });
}

module.exports = { csv, pdf, titulos };
