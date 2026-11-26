-- 07 REPORTES

-- Consultas del catálogo operativo y reportes de gestión.

-- Catálogo para la venta sin información de costos.
/* Lo que hace el siguiente procedimiento es listar los productos activos con su
nombre, categoria, unidad, precio y stock. Lo puede usar un usuario habilitado
y no muestra costos de produccion. */
CREATE OR REPLACE PROCEDURE SAB_L_CATALOGO_VENTA(p_actor_id NUMBER,p_resultado OUT SYS_REFCURSOR) IS
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN p_resultado FOR
        SELECT p.id_producto,p.codigo_barra,p.nombre_producto,
               cat.nombre_categoria,u.codigo_unidad,p.precio_venta_actual,
               p.stock_actual,p.stock_critico
        FROM PRODUCTO p
        JOIN CATEGORIA_PRODUCTO cat ON cat.id_categoria=p.id_categoria
        JOIN UNIDAD_MEDIDA u ON u.id_unidad=p.id_unidad
        WHERE p.estado_producto='S'
        ORDER BY cat.nombre_categoria,p.nombre_producto;
END;
/

-- Ventas agrupadas por hora para un período.
/* Lo que hace el siguiente procedimiento es agrupar las ventas confirmadas por
hora del dia dentro de un rango de fechas y calcular cantidad e ingresos
de cada horario. Solo permite consultar el reporte al DUENO. */
CREATE OR REPLACE PROCEDURE SAB_R_HORAS_VENTA(
    p_actor_id NUMBER,p_desde DATE,p_hasta DATE,p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
        RAISE_APPLICATION_ERROR(-20201,'Rango de fechas invalido');
    END IF;
    OPEN p_resultado FOR
        SELECT EXTRACT(HOUR FROM v.fecha_hora_venta) hora,
               COUNT(*) numero_ventas,ROUND(SUM(v.total_venta),2) monto_ventas
        FROM VENTA v
        WHERE v.estado_venta='CONFIRMADA'
          AND v.fecha_hora_venta >= CAST(TRUNC(p_desde) AS TIMESTAMP)
          AND v.fecha_hora_venta < CAST(TRUNC(p_hasta)+1 AS TIMESTAMP)
        GROUP BY EXTRACT(HOUR FROM v.fecha_hora_venta)
        ORDER BY monto_ventas DESC, hora;
END;
/

-- Diez productos de mayor ingreso, con cantidades por unidad de medida.
-- Incluye costos históricos y margen bruto; acceso exclusivo del dueño.
/* Lo que hace el siguiente procedimiento es mostrar los diez productos con mayores
ingresos en un periodo, incluyendo cantidades, costos historicos y margen bruto.
El reporte requiere permisos de DUENO. */
CREATE OR REPLACE PROCEDURE SAB_R_TOP_PRODUCTOS(
    p_actor_id NUMBER,p_desde DATE,p_hasta DATE,p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
        RAISE_APPLICATION_ERROR(-20202,'Rango de fechas invalido');
    END IF;
    OPEN p_resultado FOR
        SELECT * FROM (
            SELECT p.id_producto,p.nombre_producto,u.codigo_unidad,
                   SUM(d.cantidad) cantidad_vendida,
                   ROUND(SUM(d.subtotal_linea),2) ingreso,
                   ROUND(SUM(d.cantidad*d.costo_unitario_historico),2) costo_estimado,
                   ROUND(SUM(d.cantidad*(d.precio_unitario_historico-d.costo_unitario_historico)),2) margen_bruto
            FROM VENTA v
            JOIN DETALLE_VENTA d ON d.id_venta=v.id_venta
            JOIN PRODUCTO p ON p.id_producto=d.id_producto
            JOIN UNIDAD_MEDIDA u ON u.id_unidad=p.id_unidad
            WHERE v.estado_venta='CONFIRMADA'
              AND v.fecha_hora_venta >= CAST(TRUNC(p_desde) AS TIMESTAMP)
              AND v.fecha_hora_venta < CAST(TRUNC(p_hasta)+1 AS TIMESTAMP)
            GROUP BY p.id_producto,p.nombre_producto,u.codigo_unidad
            ORDER BY ingreso DESC,p.nombre_producto
        ) WHERE ROWNUM <= 10;
END;
/

-- Diferencias de caja por método de pago y turno cerrado.
/* Lo que hace el siguiente procedimiento es consultar turnos cerrados y mostrar
la diferencia entre los montos reales y los esperados de efectivo, tarjeta y
transferencia, ademas del descuadre total. Solo lo consulta el DUENO. */
CREATE OR REPLACE PROCEDURE SAB_R_DESCUADRES_CAJA(
    p_actor_id NUMBER,p_desde DATE,p_hasta DATE,p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN
        RAISE_APPLICATION_ERROR(-20203,'Rango de fechas invalido');
    END IF;
    OPEN p_resultado FOR
        SELECT t.id_turno_caja,c.nombre_caja,t.fecha_hora_apertura,t.fecha_hora_cierre,
               t.cierre_real_efectivo-t.cierre_sistema_efectivo diferencia_efectivo,
               t.cierre_real_tarjeta-t.cierre_sistema_tarjeta diferencia_tarjeta,
               t.cierre_real_transferencia-t.cierre_sistema_transferencia diferencia_transferencia,
               (t.cierre_real_efectivo-t.cierre_sistema_efectivo)+
               (t.cierre_real_tarjeta-t.cierre_sistema_tarjeta)+
               (t.cierre_real_transferencia-t.cierre_sistema_transferencia) descuadre_total
        FROM TURNO_CAJA t JOIN CAJA_TERMINAL c ON c.id_caja=t.id_caja
        WHERE t.estado_turno='CERRADO'
          AND t.fecha_hora_cierre >= CAST(TRUNC(p_desde) AS TIMESTAMP)
          AND t.fecha_hora_cierre < CAST(TRUNC(p_hasta)+1 AS TIMESTAMP)
        ORDER BY t.fecha_hora_cierre DESC;
END;
/
