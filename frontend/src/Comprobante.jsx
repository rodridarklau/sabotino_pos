import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./Comprobante.css";

const importe = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 2 });
const cantidad = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });

export default function Comprobante({ ventaId, cerrar }) {
  const dialogo = useRef(null);
  const enviando = useRef(false);
  const intentoCorreo = useRef(null);
  const [resultado, setResultado] = useState(null);
  const [destinatario, setDestinatario] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [estadoCorreo, setEstadoCorreo] = useState(null);
  const ruta = `/api/ventas/${ventaId}/comprobante`;

  useEffect(() => {
    const elemento = dialogo.current;
    elemento.showModal();
    return () => elemento.close();
  }, []);

  useEffect(() => {
    const c = new AbortController();
    fetch(ruta, { signal: c.signal }).then(async (r) => {
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.mensaje);
      if (!c.signal.aborted) setResultado({ datos });
    }).catch((error) => {
      if (!c.signal.aborted) setResultado({ error: error.message });
    });
    return () => c.abort();
  }, [ruta]);

  async function enviar(e) {
    e.preventDefault();
    if (enviando.current) return;
    enviando.current = true;
    setOcupado(true);
    setEstadoCorreo(null);
    try {
      const direccion = destinatario.trim();
      if (intentoCorreo.current?.direccion !== direccion.toLowerCase()) {
        intentoCorreo.current = { direccion: direccion.toLowerCase(), id: crypto.randomUUID() };
      }
      const r = await fetch(`${ruta}/correo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinatario: direccion, intento: intentoCorreo.current.id })
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.mensaje);
      setEstadoCorreo({ mensaje: datos.mensaje });
      intentoCorreo.current = null;
      setDestinatario("");
    } catch (error) {
      setEstadoCorreo({ error: error.message || "No se pudo confirmar el envío" });
    } finally {
      enviando.current = false;
      setOcupado(false);
    }
  }

  const datos = resultado?.datos;
  return createPortal(<dialog ref={dialogo} className="comprobante-dialogo" aria-label="Vista previa del comprobante"
    onCancel={(e) => { e.preventDefault(); cerrar(); }}>
    <div className="comprobante-controles">
      <button type="button" onClick={cerrar}>Cerrar vista previa</button>
      {datos && <><a href={`${ruta}/pdf`}>Descargar PDF</a>
        <button type="button" onClick={() => window.print()}>Imprimir</button></>}
    </div>
    {!resultado && <p role="status">Preparando comprobante…</p>}
    {resultado?.error && <p role="alert">{resultado.error}</p>}
    {datos && <>
      <article className="comprobante-ticket">
        <header>
          <img src="/branding/logo-sabotino.png" width="88" height="88" alt="SABOTINO Pastelería" />
          <h2>Comprobante de compra</h2>
          <p>Venta N.º {datos.venta.ID_VENTA}</p>
        </header>
        <dl>
          <dt>Fecha y hora</dt><dd>{datos.venta.FECHA}</dd>
          <dt>Atendido por</dt><dd>{datos.venta.RESPONSABLE}</dd>
          <dt>Caja / turno</dt><dd>{datos.venta.NOMBRE_CAJA} / #{datos.venta.ID_TURNO_CAJA}</dd>
        </dl>
        <h3>Productos</h3>
        <ul>{datos.detalles.map((d) => <li key={d.ID_DETALLE_VENTA}>
          <strong>{d.NOMBRE_PRODUCTO}</strong>
          <div><span>{cantidad.format(d.CANTIDAD)} {d.CODIGO_UNIDAD} × {importe.format(d.PRECIO_UNITARIO_HISTORICO)}</span>
            <span>{importe.format(d.SUBTOTAL_LINEA)}</span></div>
        </li>)}</ul>
        <dl><dt>Subtotal</dt><dd>{importe.format(datos.venta.TOTAL_VENTA)}</dd>
          <dt className="comprobante-total">Total</dt><dd className="comprobante-total">{importe.format(datos.venta.TOTAL_VENTA)}</dd></dl>
        {datos.pagos.length > 0 && <><h3>Pagos</h3>
          <dl>{datos.pagos.map((p) => <div className="comprobante-pago" key={p.ID_PAGO_VENTA}>
            <dt>{p.NOMBRE_METODO}{p.CODIGO_COMPROBANTE && <small>Referencia: {p.CODIGO_COMPROBANTE}</small>}</dt>
            <dd>{importe.format(p.MONTO_PAGADO)}</dd>
          </div>)}</dl></>}
        <footer><strong>Gracias por preferir SABOTINO.</strong><small>Comprobante informativo no tributario.</small></footer>
      </article>
      <form className="comprobante-correo" onSubmit={enviar}>
        <label>Correo del cliente (opcional)<input type="email" required maxLength={254} value={destinatario}
          disabled={ocupado} onChange={(e) => setDestinatario(e.target.value)} /></label>
        <button disabled={ocupado}>{ocupado ? "Enviando…" : "Enviar comprobante"}</button>
        {estadoCorreo?.mensaje && <p role="status">{estadoCorreo.mensaje}</p>}
        {estadoCorreo?.error && <p role="alert">{estadoCorreo.error}</p>}
      </form>
    </>}
  </dialog>, document.body);
}
