import { useEffect, useRef, useState } from "react";

const colores = ["#26374f", "#9a651f", "#39736d", "#775686", "#63703c", "#a45155"];

export function Serie({ series, etiquetas, formato, tooltip = formato, tipo = "linea", nombre }) {
  const lienzo = useRef(null);
  const [encima, setEncima] = useState(null);
  const titulo = tipo === "barra" ? "Ingresos por período" : nombre;
  useEffect(() => {
    const canvas = lienzo.current;
    const dibujar = () => {
      const ancho = canvas.clientWidth;
      const alto = canvas.clientHeight;
      if (!ancho || !alto) return;
      const escala = window.devicePixelRatio || 1;
      canvas.width = ancho * escala;
      canvas.height = alto * escala;
      const ctx = canvas.getContext("2d");
      ctx.scale(escala, escala);
      ctx.font = "11px system-ui";
      const valores = series.flatMap((s) => s.valores).filter(Number.isFinite);
      const minimo = Math.min(0, ...valores);
      const maximo = Math.max(0, ...valores) || (minimo === 0 ? 1 : 0);
      const ticks = Array.from({ length: 5 }, (_, i) => minimo + (maximo - minimo) * i / 4);
      const izquierda = Math.max(...ticks.map((v) => ctx.measureText(formato(v)).width)) + 10;
      const derecha = ancho - 12;
      const base = alto - 27;
      const escalaY = (v) => base - (v - minimo) / (maximo - minimo) * (base - 12);
      const paso = (derecha - izquierda) / Math.max(etiquetas.length, 1);
      const ejeX = (i) => izquierda + paso * (i + 0.5);
      ctx.textBaseline = "middle";
      for (const valor of ticks) {
        const y = escalaY(valor);
        ctx.strokeStyle = "#e9dfd4";
        ctx.beginPath(); ctx.moveTo(izquierda, y); ctx.lineTo(derecha, y); ctx.stroke();
        ctx.fillStyle = "#66554b";
        ctx.fillText(formato(valor), 0, y);
      }
      ctx.textAlign = "center";
      const salto = Math.max(1, Math.ceil(etiquetas.length / Math.max(2, Math.floor((derecha - izquierda) / 84))));
      etiquetas.forEach((texto, i) => {
        if (i % salto === 0) ctx.fillText(texto, ejeX(i), alto - 9);
      });
      if (encima !== null && encima < etiquetas.length) {
        ctx.strokeStyle = "#a58a73";
        ctx.beginPath(); ctx.moveTo(ejeX(encima), 12); ctx.lineTo(ejeX(encima), base); ctx.stroke();
      }
      series.forEach((s, j) => {
        ctx.strokeStyle = ctx.fillStyle = colores[j % colores.length];
        if (tipo === "barra") {
          const anchoBarra = Math.min(20, paso * 0.78 / series.length);
          s.valores.forEach((v, i) => ctx.fillRect(
            ejeX(i) + (j - series.length / 2) * anchoBarra,
            Math.min(escalaY(v), escalaY(0)), Math.max(1, anchoBarra - 1), Math.abs(escalaY(v) - escalaY(0))
          ));
        } else {
          ctx.lineWidth = j ? 1.7 : 2.4;
          ctx.setLineDash(j ? [5, 4] : []);
          ctx.beginPath();
          s.valores.forEach((v, i) => i ? ctx.lineTo(ejeX(i), escalaY(v)) : ctx.moveTo(ejeX(i), escalaY(v)));
          ctx.stroke();
          ctx.setLineDash([]);
          if (s.valores.length === 1) {
            ctx.beginPath(); ctx.arc(ejeX(0), escalaY(s.valores[0]), 3, 0, Math.PI * 2); ctx.fill();
          }
        }
      });
      canvas.dataset.plotStart = String(izquierda);
      canvas.dataset.plotStep = String(paso);
    };
    const observador = new ResizeObserver(dibujar);
    observador.observe(canvas);
    dibujar();
    return () => observador.disconnect();
  }, [series, etiquetas, formato, tipo, encima]);

  return <section className="reportes-grafico">
    <h3>{titulo}</h3>
    <div className="reportes-leyenda">{series.map((s, i) => <span key={s.nombre}><i style={{ background: colores[i % colores.length] }} />{s.nombre}</span>)}</div>
    <canvas ref={lienzo} role="img" aria-label={`${titulo}. Usa las flechas izquierda y derecha para consultar los valores.`}
      tabIndex={0} onKeyDown={(evento) => {
        if (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight") return;
        evento.preventDefault();
        setEncima((actual) => actual === null ? 0 : Math.max(0,
          Math.min(etiquetas.length - 1, actual + (evento.key === "ArrowRight" ? 1 : -1))));
      }} onPointerMove={(evento) => {
      const rect = evento.currentTarget.getBoundingClientRect();
      const inicio = Number(evento.currentTarget.dataset.plotStart);
      const paso = Number(evento.currentTarget.dataset.plotStep);
      setEncima(Math.max(0, Math.min(etiquetas.length - 1, Math.floor((evento.clientX - rect.left - inicio) / paso))));
    }} onPointerLeave={() => setEncima(null)} />
    <p className="reportes-punto" aria-live="polite">{encima !== null && etiquetas[encima]
      ? `${etiquetas[encima]} · ${series.filter((s) => s.valores[encima] !== undefined).map((s) => `${s.nombre}: ${tooltip(s.valores[encima])}`).join(" · ")}`
      : "Usa el cursor, el tacto o las flechas para ver los valores."}</p>
  </section>;
}

export function Barras({ filas, etiqueta, valor, formato, titulo }) {
  if (!filas.length) return null;
  const maximo = Math.max(1, ...filas.map((r) => Number(r[valor])));
  return <section className="reportes-grafico">
    <h3>{titulo}</h3>
    <ol className="reportes-barras">{filas.map((r, i) => <li key={i}>
      <span>{r[etiqueta]}</span><strong>{formato(r[valor])}{valor === "CANTIDAD" ? ` ${r.UNIDAD}` : ""}</strong>
      <div aria-hidden="true"><i style={{ width: `${Number(r[valor]) / maximo * 100}%` }} /></div>
    </li>)}</ol>
  </section>;
}

export function Dona({ metodos, total, moneda }) {
  if (!total) return null;
  const segmentos = metodos.map((m, i) => {
    const inicio = 100 * metodos.slice(0, i).reduce((suma, fila) => suma + fila.IMPORTE, 0) / total;
    const fin = inicio + 100 * m.IMPORTE / total;
    return `${colores[i % colores.length]} ${inicio}% ${fin}%`;
  });
  return <section className="reportes-grafico">
    <h3>Distribución de pagos</h3>
    <div className="reportes-dona-panel">
      <div aria-hidden="true" className="reportes-dona" style={{ background: `conic-gradient(${segmentos.join(",")})` }}><span>{moneda(total)}</span></div>
      <ul className="reportes-leyenda">{metodos.map((m, i) => <li key={m.METODO}><i style={{ background: colores[i % colores.length] }} />
        {m.METODO} · {m.PARTICIPACION.toLocaleString("es-CL")}% · {moneda(m.IMPORTE)}</li>)}</ul>
    </div>
  </section>;
}
