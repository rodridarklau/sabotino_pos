/* Lo que hace el siguiente procedimiento es entregar al backend la lista de
cajas habilitadas, con sus identificadores, nombres y ubicaciones, para
que un usuario activo pueda seleccionar donde operar. */
CREATE OR REPLACE PROCEDURE SAB_UI_L_CAJAS(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_caja, nombre_caja, ubicacion
        FROM CAJA_TERMINAL
        WHERE estado_operativo = 'S'
        ORDER BY nombre_caja;
END;
/

/* Lo que hace el siguiente procedimiento es entregar al backend los metodos de
pago disponibles y si requieren comprobante, para que el usuario elija el
medio adecuado al registrar un pago. */
CREATE OR REPLACE PROCEDURE SAB_UI_L_METODOS_PAGO(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_metodo_pago, nombre_metodo, requiere_comprobante
        FROM METODO_PAGO
        ORDER BY nombre_metodo;
END;
/

/* Lo que hace el siguiente procedimiento es listar los turnos de caja que siguen
ABIERTOS, indicando caja, usuario responsable y saldo inicial. Sirve para
seleccionar el turno al comenzar una venta. */
CREATE OR REPLACE PROCEDURE SAB_UI_L_TURNOS_ABIERTOS(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN p_resultado FOR
        SELECT t.id_turno_caja, t.id_caja, c.nombre_caja,
               t.id_usuario_apertura, t.fecha_hora_apertura, t.inicial_efectivo
        FROM TURNO_CAJA t
        JOIN CAJA_TERMINAL c ON c.id_caja = t.id_caja
        WHERE t.estado_turno = 'ABIERTO'
        ORDER BY c.nombre_caja, t.fecha_hora_apertura;
END;
/

/* Consulta los datos generales de una venta para el DUENO o su vendedor responsable. */
CREATE OR REPLACE PROCEDURE SAB_UI_L_RESUMEN_VENTA(
    p_actor_id NUMBER, p_venta_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
    CURSOR c_venta IS
        SELECT id_usuario FROM VENTA WHERE id_venta = p_venta_id;
    v_venta c_venta%ROWTYPE;
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN c_venta;
    FETCH c_venta INTO v_venta;
    IF c_venta%NOTFOUND THEN
        CLOSE c_venta;
        RAISE_APPLICATION_ERROR(-20301, 'Venta no encontrada');
    END IF;
    CLOSE c_venta;
    IF v_venta.id_usuario <> p_actor_id AND SAB_F_ES_DUENO(p_actor_id) <> 1 THEN
        RAISE_APPLICATION_ERROR(-20302, 'Acceso denegado a la venta');
    END IF;
    OPEN p_resultado FOR
        SELECT v.id_venta, v.id_turno_caja, v.id_usuario, v.fecha_hora_venta,
               v.total_venta, v.estado_venta
        FROM VENTA v
        WHERE v.id_venta = p_venta_id;
END;
/

/* Lo que hace el siguiente procedimiento es entregar los productos, cantidades,
precios y subtotales de una venta al DUENO o a su vendedor responsable. No
incluye los costos historicos para proteger esa informacion. */
CREATE OR REPLACE PROCEDURE SAB_UI_L_DETALLE_VENTA(
    p_actor_id NUMBER, p_venta_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
    CURSOR c_venta IS
        SELECT id_usuario FROM VENTA WHERE id_venta = p_venta_id;
    v_venta c_venta%ROWTYPE;
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN c_venta;
    FETCH c_venta INTO v_venta;
    IF c_venta%NOTFOUND THEN
        CLOSE c_venta;
        RAISE_APPLICATION_ERROR(-20303, 'Venta no encontrada');
    END IF;
    CLOSE c_venta;
    IF v_venta.id_usuario <> p_actor_id AND SAB_F_ES_DUENO(p_actor_id) <> 1 THEN
        RAISE_APPLICATION_ERROR(-20304, 'Acceso denegado al detalle');
    END IF;
    OPEN p_resultado FOR
        SELECT d.id_detalle_venta, d.id_venta, d.id_producto,
               p.nombre_producto, um.codigo_unidad, d.cantidad,
               d.precio_unitario_historico, d.subtotal_linea
        FROM DETALLE_VENTA d
        JOIN PRODUCTO p ON p.id_producto = d.id_producto
        JOIN UNIDAD_MEDIDA um ON um.id_unidad = p.id_unidad
        WHERE d.id_venta = p_venta_id
        ORDER BY d.id_detalle_venta;
END;
/

/* Lo que hace el siguiente procedimiento es consultar los pagos de una venta,
con metodo, monto y comprobante. Solo puede verlos el DUENO o el usuario
responsable de esa venta. */
CREATE OR REPLACE PROCEDURE SAB_UI_L_PAGOS_VENTA(
    p_actor_id NUMBER, p_venta_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
    CURSOR c_venta IS
        SELECT id_usuario FROM VENTA WHERE id_venta = p_venta_id;
    v_venta c_venta%ROWTYPE;
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN c_venta;
    FETCH c_venta INTO v_venta;
    IF c_venta%NOTFOUND THEN
        CLOSE c_venta;
        RAISE_APPLICATION_ERROR(-20305, 'Venta no encontrada');
    END IF;
    CLOSE c_venta;
    IF v_venta.id_usuario <> p_actor_id AND SAB_F_ES_DUENO(p_actor_id) <> 1 THEN
        RAISE_APPLICATION_ERROR(-20306, 'Acceso denegado a pagos');
    END IF;
    OPEN p_resultado FOR
        SELECT pv.id_pago_venta, pv.id_venta, pv.id_metodo_pago,
               mp.nombre_metodo, pv.monto_pagado, pv.codigo_comprobante
        FROM PAGO_VENTA pv
        JOIN METODO_PAGO mp ON mp.id_metodo_pago = pv.id_metodo_pago
        WHERE pv.id_venta = p_venta_id
        ORDER BY pv.id_pago_venta;
END;
/
