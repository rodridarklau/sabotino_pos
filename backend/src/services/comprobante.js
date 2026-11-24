const PDFDocument = require("pdfkit");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const logo = resolve(__dirname, "../../../frontend/public/branding/logo-sabotino.png");
const importe = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 2 });
const cantidad = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });
const ancho = 80 * 72 / 25.4;
const margen = 14;
const cuerpo = ancho - margen * 2;
const marron = "#65432A";
const tinta = "#33291E";
const secundario = "#665D52";
const dorado = "#C7A45B";
const nota = "Comprobante informativo no tributario.";
const nombrePdf = (id) => `SABOTINO_Comprobante_Venta_${String(id).padStart(6, "0")}.pdf`;

function diagramar(doc, { venta, detalles, pagos }, imprimir) {
  let y = margen;
  function texto(valor, { fuente = "Helvetica", size = 9, color = tinta, align = "left", width = cuerpo, x = margen } = {}) {
    doc.font(fuente).fontSize(size).fillColor(color);
    const alto = doc.heightOfString(String(valor), { width, lineGap: 1 });
    if (imprimir) doc.text(String(valor), x, y, { width, align, lineGap: 1 });
    return alto;
  }
  function linea(color = "#E7DFD1", espacio = 6) {
    y += espacio;
    if (imprimir) doc.strokeColor(color).lineWidth(0.6).moveTo(margen, y).lineTo(ancho - margen, y).stroke();
    y += espacio;
  }
  function par(etiqueta, valor, fuerte = false) {
    const fuente = fuerte ? "Helvetica-Bold" : "Helvetica";
    const size = fuerte ? 13 : 8.6;
    y += Math.max(texto(etiqueta, { width: 88, fuente, size, color: fuerte ? marron : secundario }),
      texto(valor, { x: margen + 88, width: cuerpo - 88, align: "right", fuente, size })) + 3;
  }

  if (imprimir) doc.image(logo, (ancho - 66) / 2, y, { width: 66 });
  y += 73;
  linea(dorado, 5);
  y += texto("COMPROBANTE DE COMPRA", { fuente: "Times-Bold", size: 13, align: "center", color: marron }) + 3;
  y += texto(`VENTA N.º ${venta.ID_VENTA}`, { fuente: "Helvetica-Bold", size: 9, align: "center", color: secundario }) + 8;
  par("Fecha y hora", venta.FECHA);
  par("Atendido por", venta.RESPONSABLE);
  par("Caja / turno", `${venta.NOMBRE_CAJA} / #${venta.ID_TURNO_CAJA}`);
  linea(dorado);
  y += texto("PRODUCTOS", { fuente: "Helvetica-Bold", size: 8, color: marron }) + 7;

  for (const lineaVenta of detalles) {
    y += texto(lineaVenta.NOMBRE_PRODUCTO, { fuente: "Helvetica-Bold" }) + 2;
    const unidades = `${cantidad.format(lineaVenta.CANTIDAD)} ${lineaVenta.CODIGO_UNIDAD} × ${importe.format(lineaVenta.PRECIO_UNITARIO_HISTORICO)}`;
    y += Math.max(texto(unidades, { width: cuerpo - 76, size: 8, color: secundario }),
      texto(importe.format(lineaVenta.SUBTOTAL_LINEA), { width: 74, x: ancho - margen - 74, align: "right", size: 8.5 }));
    linea("#E7DFD1", 4);
  }

  y += 3;
  par("Subtotal", importe.format(venta.TOTAL_VENTA));
  par("Total", importe.format(venta.TOTAL_VENTA), true);
  if (pagos.length) {
    linea(dorado);
    y += texto("PAGOS", { fuente: "Helvetica-Bold", size: 8, color: marron }) + 5;
    for (const pago of pagos) {
      par(pago.NOMBRE_METODO, importe.format(pago.MONTO_PAGADO));
      if (pago.CODIGO_COMPROBANTE) {
        y += texto(`Referencia: ${pago.CODIGO_COMPROBANTE}`, { size: 8, color: secundario }) + 3;
      }
    }
  }
  linea(dorado, 7);
  y += texto("Gracias por preferir SABOTINO.", { fuente: "Times-Bold", size: 10, align: "center", color: marron }) + 4;
  y += texto(nota, { size: 8, align: "center", color: secundario });
  return Math.ceil(y + margen + 3);
}

function generarPdf(datos) {
  const medidor = new PDFDocument({ size: [ancho, 14400], margin: 0 });
  const alto = diagramar(medidor, datos, false);
  medidor.resume();
  medidor.end();
  return new Promise((resolver, rechazar) => {
    const doc = new PDFDocument({
      size: [ancho, alto], margin: 0, lang: "es-CL",
      info: { Title: `SABOTINO | Venta ${datos.venta.ID_VENTA}`, CreationDate: new Date("2000-01-01T00:00:00Z") }
    });
    const trozos = [];
    doc.on("data", (trozo) => trozos.push(trozo));
    doc.on("error", rechazar);
    doc.on("end", () => resolver(Buffer.concat(trozos)));
    diagramar(doc, datos, true);
    doc.end();
  });
}

const escapar = (valor) => String(valor).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function correoComprobante(venta, pdf) {
  return {
    subject: `SABOTINO · Comprobante de compra #${venta.ID_VENTA}`,
    html: `<div style="background:#f8f5ec;padding:24px 12px;font:16px Arial,sans-serif;color:#33291e">
      <div style="max-width:500px;margin:auto;background:#fff;padding:24px;text-align:center;border-top:3px solid #c7a45b">
        <img src="cid:logo-sabotino" width="108" height="108" alt="SABOTINO Pastelería" style="display:block;margin:0 auto 20px">
        <h1 style="font:normal 26px Georgia,serif;color:#65432a">Comprobante de compra</h1>
        <p>Gracias por preferir SABOTINO.</p>
        <p>Venta #${escapar(venta.ID_VENTA)} · ${escapar(venta.FECHA)}</p>
        <p style="background:#f8f5ec;padding:14px;color:#65432a"><strong>Total ${escapar(importe.format(venta.TOTAL_VENTA))}</strong></p>
        <p>Encontrarás el comprobante en el PDF adjunto.</p>
        <p style="font-size:13px;color:#665d52">${nota}</p>
      </div></div>`,
    attachments: [
      { filename: nombrePdf(venta.ID_VENTA), content: pdf.toString("base64"), content_type: "application/pdf" },
      { filename: "logo-sabotino.png", content: readFileSync(logo).toString("base64"), content_type: "image/png", content_id: "logo-sabotino" }
    ]
  };
}

module.exports = { generarPdf, nombrePdf, correoComprobante };
