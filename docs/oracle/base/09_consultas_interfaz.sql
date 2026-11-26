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
