/* Lo que hace el siguiente procedimiento es mostrar al DUENO los dos
cargos fijos, DUENO y VENDEDOR. Solo consulta; no permite crear o editarlos. */
CREATE OR REPLACE PROCEDURE SAB_L_ROL_USUARIO(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_rol, nombre_rol, descripcion_rol, estado_activo FROM ROL_USUARIO ORDER BY id_rol;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO crear nuevas
cuentas de empleados con el rol VENDEDOR de forma automatica. No permite crear
otros duenos desde el mantenedor. Devuelve el ID del usuario registrado. */
CREATE OR REPLACE PROCEDURE SAB_C_USUARIO(
    p_actor_id NUMBER,
    p_id_rol NUMBER,
    p_rut_usuario VARCHAR2,
    p_nombre_completo VARCHAR2,
    p_username VARCHAR2,
    p_password_hash VARCHAR2,
    p_estado_usuario CHAR,
    p_nuevo_id OUT NUMBER
) IS
    CURSOR c_vendedor IS
        SELECT id_rol FROM ROL_USUARIO
         WHERE nombre_rol = 'VENDEDOR' AND estado_activo = 'S';
    v_rol_vendedor NUMBER;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    FOR r IN c_vendedor LOOP
        v_rol_vendedor := r.id_rol;
    END LOOP;
    IF v_rol_vendedor IS NULL THEN
        RAISE_APPLICATION_ERROR(-20510, 'Rol VENDEDOR no configurado');
    END IF;
    IF p_id_rol IS NOT NULL AND p_id_rol <> v_rol_vendedor THEN
        RAISE_APPLICATION_ERROR(-20511, 'Solo se pueden crear usuarios VENDEDOR');
    END IF;
    INSERT INTO USUARIO (
        id_usuario, id_rol, rut_usuario, nombre_completo,
        username, password_hash, estado_usuario
    ) VALUES (
        SEQ_USUARIO.NEXTVAL, v_rol_vendedor, p_rut_usuario,
        p_nombre_completo, p_username, p_password_hash, p_estado_usuario
    ) RETURNING id_usuario INTO p_nuevo_id;
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO listar los usuarios
con su rol, nombre, RUT y estado. Devuelve los datos necesarios para el
mantenedor sin mostrar el hash de sus contrasenas. */
CREATE OR REPLACE PROCEDURE SAB_L_USUARIO(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_usuario, id_rol, rut_usuario, nombre_completo, username, estado_usuario FROM USUARIO ORDER BY id_usuario;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO actualizar
los datos de un usuario, pero sin cambiar su cargo original. De esta forma
un VENDEDOR no puede convertirse en DUENO desde el mantenedor. */
CREATE OR REPLACE PROCEDURE SAB_U_USUARIO(
    p_actor_id NUMBER,
    p_id NUMBER,
    p_id_rol NUMBER,
    p_rut_usuario VARCHAR2,
    p_nombre_completo VARCHAR2,
    p_username VARCHAR2,
    p_password_hash VARCHAR2,
    p_estado_usuario CHAR
) IS
    CURSOR c_usuario_actual IS
        SELECT id_rol FROM USUARIO WHERE id_usuario = p_id FOR UPDATE;
    v_encontrado NUMBER := 0;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    FOR r IN c_usuario_actual LOOP
        v_encontrado := 1;
        IF p_id_rol IS NULL OR p_id_rol <> r.id_rol THEN
            RAISE_APPLICATION_ERROR(-20512, 'No se permite cambiar el cargo de un usuario');
        END IF;
    END LOOP;
    IF v_encontrado = 0 THEN
        RAISE_APPLICATION_ERROR(-20013, 'Registro no encontrado en USUARIO');
    END IF;
    UPDATE USUARIO SET
        rut_usuario = p_rut_usuario,
        nombre_completo = p_nombre_completo,
        username = p_username,
        password_hash = NVL(p_password_hash, password_hash),
        estado_usuario = p_estado_usuario
    WHERE id_usuario = p_id;
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO eliminar un usuario
por su identificador, pero impide que elimine su propia cuenta. Las relaciones
con movimientos historicos pueden bloquear la eliminacion. */
CREATE OR REPLACE PROCEDURE SAB_D_USUARIO(p_actor_id NUMBER, p_id NUMBER) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    IF p_id = p_actor_id THEN RAISE_APPLICATION_ERROR(-20015, 'No eliminar su propio usuario'); END IF;
    DELETE FROM USUARIO
    WHERE id_usuario = p_id
      AND id_rol IN (SELECT id_rol FROM ROL_USUARIO WHERE nombre_rol = 'VENDEDOR');
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20016, 'Vendedor no encontrado');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Registra una materia prima/insumo validando unidad, proveedor, costo y decimales permitidos en stock (solo DUENO). */
CREATE OR REPLACE PROCEDURE SAB_C_INSUMO(
    p_actor_id NUMBER,
    p_id_unidad NUMBER,
    p_id_proveedor NUMBER,
    p_nombre_insumo VARCHAR2,
    p_costo_unitario NUMBER,
    p_stock_actual NUMBER,
    p_stock_critico NUMBER,
    p_estado_activo CHAR DEFAULT 'S',
    p_nuevo_id OUT NUMBER
) IS
    CURSOR c_uni IS
        SELECT permite_decimales FROM UNIDAD_MEDIDA WHERE id_unidad = p_id_unidad FOR UPDATE;
    CURSOR c_prov IS SELECT id_proveedor FROM PROVEEDOR WHERE id_proveedor = p_id_proveedor;
    v_permite_dec CHAR(1);
    v_tmp NUMBER;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    IF p_costo_unitario IS NULL OR p_costo_unitario < 0 OR p_costo_unitario <> ROUND(p_costo_unitario, 2) THEN
        RAISE_APPLICATION_ERROR(-20544, 'Costo unitario invalido');
    END IF;
    IF p_stock_actual IS NULL OR p_stock_actual < 0 OR p_stock_actual <> ROUND(p_stock_actual, 3)
       OR p_stock_critico IS NULL OR p_stock_critico < 0 OR p_stock_critico <> ROUND(p_stock_critico, 3) THEN
        RAISE_APPLICATION_ERROR(-20545, 'Stock actual o critico invalido');
    END IF;
    OPEN c_uni; FETCH c_uni INTO v_permite_dec;
    IF c_uni%NOTFOUND THEN
        CLOSE c_uni;
        RAISE_APPLICATION_ERROR(-20540, 'Unidad de medida no existe');
    END IF;
    CLOSE c_uni;
    IF v_permite_dec = 'N' AND (p_stock_actual <> TRUNC(p_stock_actual) OR p_stock_critico <> TRUNC(p_stock_critico)) THEN
        RAISE_APPLICATION_ERROR(-20546, 'La unidad seleccionada no permite decimales en stock');
    END IF;
    OPEN c_prov; FETCH c_prov INTO v_tmp;
    IF c_prov%NOTFOUND THEN
        CLOSE c_prov;
        RAISE_APPLICATION_ERROR(-20541, 'Proveedor no existe');
    END IF;
    CLOSE c_prov;
    INSERT INTO INSUMO (
        id_insumo, id_unidad, id_proveedor, nombre_insumo,
        costo_unitario, stock_actual, stock_critico, estado_activo
    ) VALUES (
        SEQ_INSUMO.NEXTVAL, p_id_unidad, p_id_proveedor, TRIM(p_nombre_insumo),
        p_costo_unitario, p_stock_actual, p_stock_critico, p_estado_activo
    ) RETURNING id_insumo INTO p_nuevo_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lista el inventario de insumos con su unidad, proveedor, costo unitario y stock (solo DUENO). */
CREATE OR REPLACE PROCEDURE SAB_L_INSUMO(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT i.id_insumo,
               i.nombre_insumo,
               i.id_unidad,
               u.codigo_unidad,
               i.id_proveedor,
               p.razon_social,
               i.costo_unitario,
               i.stock_actual,
               i.stock_critico,
               i.estado_activo
        FROM INSUMO i
        JOIN UNIDAD_MEDIDA u ON u.id_unidad = i.id_unidad
        JOIN PROVEEDOR p ON p.id_proveedor = i.id_proveedor
        ORDER BY i.id_insumo;
END;
/

/* Actualiza un insumo validando unidad, proveedor, costo y coherencia de decimales en stock (solo DUENO). */
CREATE OR REPLACE PROCEDURE SAB_U_INSUMO(
    p_actor_id NUMBER,
    p_id NUMBER,
    p_id_unidad NUMBER,
    p_id_proveedor NUMBER,
    p_nombre_insumo VARCHAR2,
    p_costo_unitario NUMBER,
    p_stock_actual NUMBER,
    p_stock_critico NUMBER,
    p_estado_activo CHAR
) IS
    CURSOR c_uni IS
        SELECT permite_decimales FROM UNIDAD_MEDIDA WHERE id_unidad = p_id_unidad FOR UPDATE;
    CURSOR c_prov IS SELECT id_proveedor FROM PROVEEDOR WHERE id_proveedor = p_id_proveedor;
    CURSOR c_actual IS
        SELECT stock_actual, id_unidad FROM INSUMO WHERE id_insumo = p_id FOR UPDATE;
    v_permite_dec CHAR(1);
    v_tmp NUMBER;
    v_stock NUMBER;
    v_unidad NUMBER;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    IF p_costo_unitario IS NULL OR p_costo_unitario < 0 OR p_costo_unitario <> ROUND(p_costo_unitario, 2) THEN
        RAISE_APPLICATION_ERROR(-20544, 'Costo unitario invalido');
    END IF;
    IF p_stock_actual < 0 OR p_stock_actual <> ROUND(p_stock_actual, 3)
       OR p_stock_critico IS NULL OR p_stock_critico < 0 OR p_stock_critico <> ROUND(p_stock_critico, 3) THEN
        RAISE_APPLICATION_ERROR(-20545, 'Stock actual o critico invalido');
    END IF;
    OPEN c_uni; FETCH c_uni INTO v_permite_dec;
    IF c_uni%NOTFOUND THEN
        CLOSE c_uni;
        RAISE_APPLICATION_ERROR(-20540, 'Unidad de medida no existe');
    END IF;
    CLOSE c_uni;
    OPEN c_prov; FETCH c_prov INTO v_tmp;
    IF c_prov%NOTFOUND THEN
        CLOSE c_prov;
        RAISE_APPLICATION_ERROR(-20541, 'Proveedor no existe');
    END IF;
    CLOSE c_prov;
    OPEN c_actual; FETCH c_actual INTO v_stock, v_unidad;
    IF c_actual%NOTFOUND THEN
        RAISE_APPLICATION_ERROR(-20542, 'Registro no encontrado en INSUMO');
    END IF;
    CLOSE c_actual;
    -- La ficha web envía NULL para conservar las existencias bajo bloqueo.
    IF p_stock_actual IS NULL AND v_stock <> 0 AND p_id_unidad <> v_unidad THEN
        RAISE_APPLICATION_ERROR(-20558, 'No cambiar la unidad de un insumo con existencias');
    END IF;
    v_stock := NVL(p_stock_actual, v_stock);
    IF v_permite_dec = 'N' AND (v_stock <> TRUNC(v_stock) OR p_stock_critico <> TRUNC(p_stock_critico)) THEN
        RAISE_APPLICATION_ERROR(-20546, 'La unidad seleccionada no permite decimales en stock');
    END IF;
    UPDATE INSUMO SET
        id_unidad = p_id_unidad,
        id_proveedor = p_id_proveedor,
        nombre_insumo = TRIM(p_nombre_insumo),
        costo_unitario = p_costo_unitario,
        stock_actual = v_stock,
        stock_critico = p_stock_critico,
        estado_activo = p_estado_activo
    WHERE id_insumo = p_id;
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF c_actual%ISOPEN THEN CLOSE c_actual; END IF;
        IF c_uni%ISOPEN THEN CLOSE c_uni; END IF;
        IF c_prov%ISOPEN THEN CLOSE c_prov; END IF;
        ROLLBACK;
        RAISE;
END;
/

/* Elimina un insumo por su identificador (solo DUENO). */
CREATE OR REPLACE PROCEDURE SAB_D_INSUMO(
    p_actor_id NUMBER, p_id NUMBER
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    DELETE FROM INSUMO WHERE id_insumo = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20543, 'Registro no encontrado en INSUMO');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Asigna un bloque horario y caja a un usuario activo; permite multiples horarios no solapados por vendedor (solo DUENO). */
CREATE OR REPLACE PROCEDURE SAB_C_HORARIO_VENDEDOR(
    p_actor_id NUMBER,
    p_id_usuario NUMBER,
    p_id_caja NUMBER,
    p_dia_semana VARCHAR2,
    p_hora_inicio VARCHAR2,
    p_hora_fin VARCHAR2,
    p_estado_activo CHAR DEFAULT 'S',
    p_nuevo_id OUT NUMBER
) IS
    v_dia VARCHAR2(15) := UPPER(TRIM(p_dia_semana));
    v_ini VARCHAR2(5) := TRIM(p_hora_inicio);
    v_fin VARCHAR2(5) := TRIM(p_hora_fin);
    CURSOR c_usr IS
        SELECT u.estado_usuario FROM USUARIO u
        JOIN ROL_USUARIO r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = p_id_usuario AND r.nombre_rol = 'VENDEDOR' AND r.estado_activo = 'S'
        FOR UPDATE OF u.estado_usuario;
    CURSOR c_caja IS SELECT estado_operativo FROM CAJA_TERMINAL WHERE id_caja = p_id_caja;
    CURSOR c_solape IS
        SELECT id_horario FROM HORARIO_VENDEDOR
        WHERE id_usuario = p_id_usuario
          AND dia_semana = v_dia
          AND estado_activo = 'S'
          AND v_ini < hora_fin
          AND v_fin > hora_inicio;
    v_est_usr CHAR(1);
    v_est_caja CHAR(1);
    v_id_solape NUMBER;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN c_usr; FETCH c_usr INTO v_est_usr;
    IF c_usr%NOTFOUND OR v_est_usr <> 'S' THEN
        CLOSE c_usr;
        RAISE_APPLICATION_ERROR(-20550, 'Usuario no existe o esta inactivo');
    END IF;
    CLOSE c_usr;
    OPEN c_caja; FETCH c_caja INTO v_est_caja;
    IF c_caja%NOTFOUND OR v_est_caja <> 'S' THEN
        CLOSE c_caja;
        RAISE_APPLICATION_ERROR(-20551, 'Caja no existe o no esta operativa');
    END IF;
    CLOSE c_caja;
    IF p_estado_activo = 'S' THEN
        OPEN c_solape; FETCH c_solape INTO v_id_solape;
        IF c_solape%FOUND THEN
            CLOSE c_solape;
            RAISE_APPLICATION_ERROR(-20554, 'El vendedor ya tiene un horario activo solapado en ese dia');
        END IF;
        CLOSE c_solape;
    END IF;
    INSERT INTO HORARIO_VENDEDOR (
        id_horario, id_usuario, id_caja, dia_semana, hora_inicio, hora_fin, estado_activo
    ) VALUES (
        SEQ_HORARIO_VENDEDOR.NEXTVAL, p_id_usuario, p_id_caja, v_dia,
        v_ini, v_fin, p_estado_activo
    ) RETURNING id_horario INTO p_nuevo_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lista todos los horarios asignados a vendedores (activos e historicos) con su caja (solo DUENO). */
CREATE OR REPLACE PROCEDURE SAB_L_HORARIO_VENDEDOR(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT h.id_horario,
               h.id_usuario,
               u.nombre_completo,
               h.id_caja,
               c.nombre_caja,
               h.dia_semana,
               h.hora_inicio,
               h.hora_fin,
               h.estado_activo
        FROM HORARIO_VENDEDOR h
        JOIN USUARIO u ON u.id_usuario = h.id_usuario
        JOIN CAJA_TERMINAL c ON c.id_caja = h.id_caja
        ORDER BY h.id_usuario, h.dia_semana, h.hora_inicio, h.id_horario;
END;
/

/* Actualiza o desactiva un horario asignado a un vendedor validando solapamientos activos (solo DUENO). */
CREATE OR REPLACE PROCEDURE SAB_U_HORARIO_VENDEDOR(
    p_actor_id NUMBER,
    p_id NUMBER,
    p_id_usuario NUMBER,
    p_id_caja NUMBER,
    p_dia_semana VARCHAR2,
    p_hora_inicio VARCHAR2,
    p_hora_fin VARCHAR2,
    p_estado_activo CHAR
) IS
    v_dia VARCHAR2(15) := UPPER(TRIM(p_dia_semana));
    v_ini VARCHAR2(5) := TRIM(p_hora_inicio);
    v_fin VARCHAR2(5) := TRIM(p_hora_fin);
    CURSOR c_usr IS
        SELECT u.estado_usuario FROM USUARIO u
        JOIN ROL_USUARIO r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = p_id_usuario AND r.nombre_rol = 'VENDEDOR' AND r.estado_activo = 'S'
        FOR UPDATE OF u.estado_usuario;
    CURSOR c_caja IS SELECT estado_operativo FROM CAJA_TERMINAL WHERE id_caja = p_id_caja;
    CURSOR c_solape IS
        SELECT id_horario FROM HORARIO_VENDEDOR
        WHERE id_usuario = p_id_usuario
          AND id_horario <> p_id
          AND dia_semana = v_dia
          AND estado_activo = 'S'
          AND v_ini < hora_fin
          AND v_fin > hora_inicio;
    v_est_usr CHAR(1);
    v_est_caja CHAR(1);
    v_id_solape NUMBER;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN c_usr; FETCH c_usr INTO v_est_usr;
    IF c_usr%NOTFOUND OR v_est_usr <> 'S' THEN
        CLOSE c_usr;
        RAISE_APPLICATION_ERROR(-20550, 'Usuario no existe o esta inactivo');
    END IF;
    CLOSE c_usr;
    OPEN c_caja; FETCH c_caja INTO v_est_caja;
    IF c_caja%NOTFOUND OR v_est_caja <> 'S' THEN
        CLOSE c_caja;
        RAISE_APPLICATION_ERROR(-20551, 'Caja no existe o no esta operativa');
    END IF;
    CLOSE c_caja;
    IF p_estado_activo = 'S' THEN
        OPEN c_solape; FETCH c_solape INTO v_id_solape;
        IF c_solape%FOUND THEN
            CLOSE c_solape;
            RAISE_APPLICATION_ERROR(-20554, 'El vendedor ya tiene un horario activo solapado en ese dia');
        END IF;
        CLOSE c_solape;
    END IF;
    UPDATE HORARIO_VENDEDOR SET
        id_usuario = p_id_usuario,
        id_caja = p_id_caja,
        dia_semana = v_dia,
        hora_inicio = v_ini,
        hora_fin = v_fin,
        estado_activo = p_estado_activo
    WHERE id_horario = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20552, 'Registro no encontrado en HORARIO_VENDEDOR');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Elimina un horario de vendedor por su identificador (solo DUENO). */
CREATE OR REPLACE PROCEDURE SAB_D_HORARIO_VENDEDOR(
    p_actor_id NUMBER, p_id NUMBER
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    DELETE FROM HORARIO_VENDEDOR WHERE id_horario = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20553, 'Registro no encontrado en HORARIO_VENDEDOR');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO registrar una caja del local
con sus datos correspondientes (nombre, ubicacion y estado operativo). Genera un identificador mediante
una secuencia y lo devuelve al programa que realizo la llamada. */
CREATE OR REPLACE PROCEDURE SAB_C_CAJA_TERMINAL(
    p_actor_id NUMBER,
    p_nombre_caja VARCHAR2,
    p_ubicacion VARCHAR2,
    p_estado_operativo CHAR,
    p_nuevo_id OUT NUMBER
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    IF UPPER(TRIM(p_nombre_caja)) = 'MAIN'
       AND (p_nombre_caja <> 'MAIN' OR p_estado_operativo <> 'S') THEN
        RAISE_APPLICATION_ERROR(-20555, 'La Caja Principal usa el nombre MAIN y debe estar operativa');
    END IF;
    INSERT INTO CAJA_TERMINAL (id_caja, nombre_caja, ubicacion, estado_operativo)
    VALUES (SEQ_CAJA_TERMINAL.NEXTVAL, p_nombre_caja, p_ubicacion, p_estado_operativo)
    RETURNING id_caja INTO p_nuevo_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO consultar
las cajas del local. Devuelve sus registros ordenados mediante un cursor de resultados
para que puedan mostrarse en la aplicacion. */
CREATE OR REPLACE PROCEDURE SAB_L_CAJA_TERMINAL(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_caja, nombre_caja, ubicacion, estado_operativo FROM CAJA_TERMINAL ORDER BY id_caja;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO modificar
nombre, ubicacion y estado operativo de una caja del local. Busca el registro por su identificador y genera
un error si no existe. */
CREATE OR REPLACE PROCEDURE SAB_U_CAJA_TERMINAL(
    p_actor_id NUMBER,
    p_id NUMBER,
    p_nombre_caja VARCHAR2,
    p_ubicacion VARCHAR2,
    p_estado_operativo CHAR
) IS
    CURSOR c_caja IS
        SELECT nombre_caja FROM CAJA_TERMINAL WHERE id_caja = p_id FOR UPDATE;
    v_nombre CAJA_TERMINAL.NOMBRE_CAJA%TYPE;
    v_turnos_abiertos NUMBER;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN c_caja; FETCH c_caja INTO v_nombre;
    IF c_caja%NOTFOUND THEN
        RAISE_APPLICATION_ERROR(-20013, 'Registro no encontrado en CAJA_TERMINAL');
    END IF;
    CLOSE c_caja;
    IF (v_nombre = 'MAIN' AND (p_nombre_caja <> 'MAIN' OR p_estado_operativo <> 'S'))
       OR (v_nombre <> 'MAIN' AND UPPER(TRIM(p_nombre_caja)) = 'MAIN') THEN
        RAISE_APPLICATION_ERROR(-20555, 'No se puede renombrar ni desactivar la Caja Principal');
    END IF;
    IF p_estado_operativo = 'N' THEN
        SELECT COUNT(*) INTO v_turnos_abiertos FROM TURNO_CAJA
        WHERE id_caja = p_id AND estado_turno = 'ABIERTO';
        IF v_turnos_abiertos > 0 THEN
            RAISE_APPLICATION_ERROR(-20556, 'Cierra el turno abierto antes de desactivar la caja');
        END IF;
    END IF;
    UPDATE CAJA_TERMINAL SET
        nombre_caja = p_nombre_caja, ubicacion = p_ubicacion, estado_operativo = p_estado_operativo
    WHERE id_caja = p_id;
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF c_caja%ISOPEN THEN CLOSE c_caja; END IF;
        ROLLBACK;
        RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO intentar
eliminar una caja del local mediante su identificador. Comprueba que exista y
las restricciones de la base impiden borrar datos con referencias protegidas. */
CREATE OR REPLACE PROCEDURE SAB_D_CAJA_TERMINAL(p_actor_id NUMBER, p_id NUMBER) IS
    v_principal NUMBER;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    DELETE FROM CAJA_TERMINAL WHERE id_caja = p_id AND nombre_caja <> 'MAIN';
    IF SQL%ROWCOUNT = 0 THEN
        SELECT COUNT(*) INTO v_principal FROM CAJA_TERMINAL WHERE id_caja = p_id AND nombre_caja = 'MAIN';
        IF v_principal > 0 THEN
            RAISE_APPLICATION_ERROR(-20555, 'No se puede eliminar la Caja Principal');
        END IF;
        RAISE_APPLICATION_ERROR(-20016, 'Registro no encontrado en CAJA_TERMINAL');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO consultar
los metodos de pago. Devuelve sus registros ordenados mediante un cursor de resultados
para que puedan mostrarse en la aplicacion. */
CREATE OR REPLACE PROCEDURE SAB_L_METODO_PAGO(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_metodo_pago, nombre_metodo, requiere_comprobante FROM METODO_PAGO ORDER BY id_metodo_pago;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO registrar una categoria de producto
con sus datos correspondientes (nombre y descripcion). Genera un identificador mediante
una secuencia y lo devuelve al programa que realizo la llamada. */
CREATE OR REPLACE PROCEDURE SAB_C_CATEGORIA_PRODUCTO(
    p_actor_id NUMBER,
    p_nombre_categoria VARCHAR2,
    p_descripcion_categoria VARCHAR2,
    p_nuevo_id OUT NUMBER
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    INSERT INTO CATEGORIA_PRODUCTO (id_categoria, nombre_categoria, descripcion_categoria)
    VALUES (SEQ_CATEGORIA_PRODUCTO.NEXTVAL, p_nombre_categoria, p_descripcion_categoria)
    RETURNING id_categoria INTO p_nuevo_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO consultar
las categorias de producto. Devuelve sus registros ordenados mediante un cursor de resultados
para que puedan mostrarse en la aplicacion. */
CREATE OR REPLACE PROCEDURE SAB_L_CATEGORIA_PRODUCTO(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_categoria, nombre_categoria, descripcion_categoria FROM CATEGORIA_PRODUCTO ORDER BY id_categoria;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO modificar
nombre y descripcion de una categoria de producto. Busca el registro por su identificador y genera
un error si no existe. */
CREATE OR REPLACE PROCEDURE SAB_U_CATEGORIA_PRODUCTO(
    p_actor_id NUMBER,
    p_id NUMBER,
    p_nombre_categoria VARCHAR2,
    p_descripcion_categoria VARCHAR2
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    UPDATE CATEGORIA_PRODUCTO SET
        nombre_categoria = p_nombre_categoria, descripcion_categoria = p_descripcion_categoria
    WHERE id_categoria = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20013, 'Registro no encontrado en CATEGORIA_PRODUCTO');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO intentar
eliminar una categoria de producto mediante su identificador. Comprueba que exista y
las restricciones de la base impiden borrar datos con referencias protegidas. */
CREATE OR REPLACE PROCEDURE SAB_D_CATEGORIA_PRODUCTO(p_actor_id NUMBER, p_id NUMBER) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    DELETE FROM CATEGORIA_PRODUCTO WHERE id_categoria = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20016, 'Registro no encontrado en CATEGORIA_PRODUCTO');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO registrar una unidad de medida
con sus datos correspondientes (codigo, nombre y permiso para decimales). Genera un identificador mediante
una secuencia y lo devuelve al programa que realizo la llamada. */
CREATE OR REPLACE PROCEDURE SAB_C_UNIDAD_MEDIDA(
    p_actor_id NUMBER,
    p_codigo_unidad VARCHAR2,
    p_nombre_unidad VARCHAR2,
    p_permite_decimales CHAR,
    p_nuevo_id OUT NUMBER
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    INSERT INTO UNIDAD_MEDIDA (id_unidad, codigo_unidad, nombre_unidad, permite_decimales)
    VALUES (SEQ_UNIDAD_MEDIDA.NEXTVAL, p_codigo_unidad, p_nombre_unidad, p_permite_decimales)
    RETURNING id_unidad INTO p_nuevo_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO consultar
las unidades de medida. Devuelve sus registros ordenados mediante un cursor de resultados
para que puedan mostrarse en la aplicacion. */
CREATE OR REPLACE PROCEDURE SAB_L_UNIDAD_MEDIDA(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_unidad, codigo_unidad, nombre_unidad, permite_decimales FROM UNIDAD_MEDIDA ORDER BY id_unidad;
END;
/

/* Lo que hace el siguiente procedimiento es actualizar el codigo, nombre o
permiso para decimales de una unidad de medida. Los productos relacionados
dependen de esta configuracion, por lo que sus cambios requieren cuidado. */
CREATE OR REPLACE PROCEDURE SAB_U_UNIDAD_MEDIDA(
    p_actor_id NUMBER,
    p_id NUMBER,
    p_codigo_unidad VARCHAR2,
    p_nombre_unidad VARCHAR2,
    p_permite_decimales CHAR
) IS
    CURSOR c_unidad IS
        SELECT permite_decimales FROM UNIDAD_MEDIDA WHERE id_unidad = p_id FOR UPDATE;
    v_decimales UNIDAD_MEDIDA.PERMITE_DECIMALES%TYPE;
    v_en_uso NUMBER;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN c_unidad; FETCH c_unidad INTO v_decimales;
    IF c_unidad%NOTFOUND THEN
        RAISE_APPLICATION_ERROR(-20013, 'Registro no encontrado en UNIDAD_MEDIDA');
    END IF;
    CLOSE c_unidad;
    -- Las altas y cambios de unidad de artículos usan el mismo bloqueo.
    IF v_decimales <> p_permite_decimales THEN
        SELECT COUNT(*) INTO v_en_uso FROM DUAL
        WHERE EXISTS (SELECT 1 FROM PRODUCTO WHERE id_unidad = p_id)
           OR EXISTS (SELECT 1 FROM INSUMO WHERE id_unidad = p_id);
        IF v_en_uso > 0 THEN
            RAISE_APPLICATION_ERROR(-20557, 'No se puede cambiar la regla de decimales de una unidad en uso');
        END IF;
    END IF;
    UPDATE UNIDAD_MEDIDA SET
        codigo_unidad = p_codigo_unidad, nombre_unidad = p_nombre_unidad, permite_decimales = p_permite_decimales
    WHERE id_unidad = p_id;
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF c_unidad%ISOPEN THEN CLOSE c_unidad; END IF;
        ROLLBACK;
        RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO intentar
eliminar una unidad de medida mediante su identificador. Comprueba que exista y
las restricciones de la base impiden borrar datos con referencias protegidas. */
CREATE OR REPLACE PROCEDURE SAB_D_UNIDAD_MEDIDA(p_actor_id NUMBER, p_id NUMBER) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    DELETE FROM UNIDAD_MEDIDA WHERE id_unidad = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20016, 'Registro no encontrado en UNIDAD_MEDIDA');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO registrar una marca
con sus datos correspondientes (nombre y origen de elaboracion). Genera un identificador mediante
una secuencia y lo devuelve al programa que realizo la llamada. */
CREATE OR REPLACE PROCEDURE SAB_C_MARCA(
    p_actor_id NUMBER,
    p_nombre_marca VARCHAR2,
    p_origen_elaboracion VARCHAR2,
    p_nuevo_id OUT NUMBER
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    INSERT INTO MARCA (id_marca, nombre_marca, origen_elaboracion)
    VALUES (SEQ_MARCA.NEXTVAL, p_nombre_marca, p_origen_elaboracion)
    RETURNING id_marca INTO p_nuevo_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO consultar
las marcas. Devuelve sus registros ordenados mediante un cursor de resultados
para que puedan mostrarse en la aplicacion. */
CREATE OR REPLACE PROCEDURE SAB_L_MARCA(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_marca, nombre_marca, origen_elaboracion FROM MARCA ORDER BY id_marca;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO modificar
nombre y origen de elaboracion de una marca. Busca el registro por su identificador y genera
un error si no existe. */
CREATE OR REPLACE PROCEDURE SAB_U_MARCA(
    p_actor_id NUMBER,
    p_id NUMBER,
    p_nombre_marca VARCHAR2,
    p_origen_elaboracion VARCHAR2
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    UPDATE MARCA SET
        nombre_marca = p_nombre_marca, origen_elaboracion = p_origen_elaboracion
    WHERE id_marca = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20013, 'Registro no encontrado en MARCA');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO intentar
eliminar una marca mediante su identificador. Comprueba que exista y
las restricciones de la base impiden borrar datos con referencias protegidas. */
CREATE OR REPLACE PROCEDURE SAB_D_MARCA(p_actor_id NUMBER, p_id NUMBER) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    DELETE FROM MARCA WHERE id_marca = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20016, 'Registro no encontrado en MARCA');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO crear un producto
con su categoria, unidad, marca, costo, precio y stock critico. Inicia el stock
en cero y registra la creacion en la auditoria de productos. */
CREATE OR REPLACE PROCEDURE SAB_C_PRODUCTO(
    p_actor_id NUMBER,
    p_id_categoria NUMBER,
    p_id_unidad NUMBER,
    p_id_marca NUMBER,
    p_codigo_barra VARCHAR2,
    p_nombre_producto VARCHAR2,
    p_costo_produccion_actual NUMBER,
    p_precio_venta_actual NUMBER,
    p_stock_critico NUMBER,
    p_estado_producto CHAR,
    p_nuevo_id OUT NUMBER
) IS
    CURSOR c_unidad IS SELECT id_unidad FROM UNIDAD_MEDIDA WHERE id_unidad = p_id_unidad FOR UPDATE;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN c_unidad;
    CLOSE c_unidad;
    INSERT INTO PRODUCTO (id_producto, id_categoria, id_unidad, id_marca, codigo_barra, nombre_producto, costo_produccion_actual, precio_venta_actual, stock_actual, stock_critico, estado_producto)
    VALUES (SEQ_PRODUCTO.NEXTVAL, p_id_categoria, p_id_unidad, p_id_marca, p_codigo_barra, p_nombre_producto, p_costo_produccion_actual, p_precio_venta_actual, 0, p_stock_critico, p_estado_producto)
    RETURNING id_producto INTO p_nuevo_id;
    SAB_LOG_CAMBIO_PRODUCTO(p_actor_id, p_nuevo_id, 'CREACION',
        NULL, p_costo_produccion_actual, NULL, p_precio_venta_actual, NULL, 0);
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF c_unidad%ISOPEN THEN CLOSE c_unidad; END IF;
        ROLLBACK;
        RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO consultar el
listado de productos con sus datos de catalogo, precios, costos y stock.
Esta consulta administrativa no es el catalogo publico para vender. */
CREATE OR REPLACE PROCEDURE SAB_L_PRODUCTO(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_producto, id_categoria, id_unidad, id_marca, codigo_barra, nombre_producto, costo_produccion_actual, precio_venta_actual, stock_actual, stock_critico, estado_producto FROM PRODUCTO ORDER BY id_producto;
END;
/

/* Lo que hace el siguiente procedimiento es actualizar un producto sin cambiar
su stock manualmente. Bloquea el registro, impide cambiar la unidad si tiene
stock o historial y registra los valores anteriores y nuevos en auditoria. */
CREATE OR REPLACE PROCEDURE SAB_U_PRODUCTO(
    p_actor_id NUMBER,
    p_id NUMBER,
    p_id_categoria NUMBER,
    p_id_unidad NUMBER,
    p_id_marca NUMBER,
    p_codigo_barra VARCHAR2,
    p_nombre_producto VARCHAR2,
    p_costo_produccion_actual NUMBER,
    p_precio_venta_actual NUMBER,
    p_stock_critico NUMBER,
    p_estado_producto CHAR
) IS
    CURSOR c_actual IS SELECT costo_produccion_actual, precio_venta_actual, stock_actual, id_unidad
                          FROM PRODUCTO WHERE id_producto = p_id FOR UPDATE;
    CURSOR c_unidad IS SELECT id_unidad FROM UNIDAD_MEDIDA WHERE id_unidad = p_id_unidad FOR UPDATE;
    v_anterior c_actual%ROWTYPE;
    v_vinculos NUMBER;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN c_actual;
    FETCH c_actual INTO v_anterior;
    IF c_actual%NOTFOUND THEN
        CLOSE c_actual;
        RAISE_APPLICATION_ERROR(-20011, 'Producto no encontrado');
    END IF;
    CLOSE c_actual;
    IF p_id_unidad <> v_anterior.id_unidad THEN
        SELECT (SELECT COUNT(*) FROM DETALLE_VENTA WHERE id_producto=p_id) +
               (SELECT COUNT(*) FROM AJUSTE_INVENTARIO WHERE id_producto=p_id) +
               (SELECT COUNT(*) FROM ABASTECIMIENTO_PROVEEDOR WHERE id_producto=p_id)
          INTO v_vinculos FROM DUAL;
        IF v_vinculos > 0 OR v_anterior.stock_actual <> 0 THEN
            RAISE_APPLICATION_ERROR(-20012, 'No cambiar unidad con movimientos de stock/historial');
        END IF;
        OPEN c_unidad;
        CLOSE c_unidad;
    END IF;
    UPDATE PRODUCTO SET
        id_categoria = p_id_categoria, id_unidad = p_id_unidad, id_marca = p_id_marca, codigo_barra = p_codigo_barra, nombre_producto = p_nombre_producto, costo_produccion_actual = p_costo_produccion_actual, precio_venta_actual = p_precio_venta_actual, stock_critico = p_stock_critico, estado_producto = p_estado_producto
    WHERE id_producto = p_id;
    SAB_LOG_CAMBIO_PRODUCTO(p_actor_id, p_id, 'MODIFICACION',
        v_anterior.costo_produccion_actual, p_costo_produccion_actual,
        v_anterior.precio_venta_actual, p_precio_venta_actual,
        v_anterior.stock_actual, v_anterior.stock_actual);
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF c_actual%ISOPEN THEN CLOSE c_actual; END IF;
        IF c_unidad%ISOPEN THEN CLOSE c_unidad; END IF;
        ROLLBACK;
        RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es desactivar un producto sin borrarlo
de la tabla. Cambia su estado a N y registra la desactivacion para conservar
las ventas y los movimientos historicos vinculados. */
CREATE OR REPLACE PROCEDURE SAB_D_PRODUCTO(p_actor_id NUMBER, p_id NUMBER) IS
    CURSOR c_prod IS SELECT costo_produccion_actual, precio_venta_actual, stock_actual
                     FROM PRODUCTO WHERE id_producto=p_id FOR UPDATE;
    v_prod c_prod%ROWTYPE;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN c_prod; FETCH c_prod INTO v_prod;
    IF c_prod%NOTFOUND THEN CLOSE c_prod; RAISE_APPLICATION_ERROR(-20014,'Producto no existe'); END IF;
    CLOSE c_prod;
    UPDATE PRODUCTO SET estado_producto = 'N' WHERE id_producto = p_id;
    SAB_LOG_CAMBIO_PRODUCTO(p_actor_id, p_id, 'DESACTIVACION',
      v_prod.costo_produccion_actual, v_prod.costo_produccion_actual,
      v_prod.precio_venta_actual, v_prod.precio_venta_actual,
      v_prod.stock_actual, v_prod.stock_actual);
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO crear un tipo de
ajuste de inventario, indicando su nombre y el factor que determina si una
operacion suma o resta cantidades al stock. */
CREATE OR REPLACE PROCEDURE SAB_C_TIPO_AJUSTE_STOCK(
    p_actor_id NUMBER,
    p_nombre_tipo_ajuste VARCHAR2,
    p_factor_operacion NUMBER,
    p_nuevo_id OUT NUMBER
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    INSERT INTO TIPO_AJUSTE_STOCK (id_tipo_ajuste, nombre_tipo_ajuste, factor_operacion)
    VALUES (SEQ_TIPO_AJUSTE_STOCK.NEXTVAL, p_nombre_tipo_ajuste, p_factor_operacion)
    RETURNING id_tipo_ajuste INTO p_nuevo_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO consultar
los tipos de ajuste de inventario. Devuelve sus registros ordenados mediante un cursor de resultados
para que puedan mostrarse en la aplicacion. */
CREATE OR REPLACE PROCEDURE SAB_L_TIPO_AJUSTE_STOCK(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_tipo_ajuste, nombre_tipo_ajuste, factor_operacion FROM TIPO_AJUSTE_STOCK ORDER BY id_tipo_ajuste;
END;
/

/* Lo que hace el siguiente procedimiento es actualizar el nombre o factor de un
tipo de ajuste existente. El trigger impide cambiar su factor si ya fue usado
en movimientos de inventario. */
CREATE OR REPLACE PROCEDURE SAB_U_TIPO_AJUSTE_STOCK(
    p_actor_id NUMBER,
    p_id NUMBER,
    p_nombre_tipo_ajuste VARCHAR2,
    p_factor_operacion NUMBER
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    UPDATE TIPO_AJUSTE_STOCK SET
        nombre_tipo_ajuste = p_nombre_tipo_ajuste, factor_operacion = p_factor_operacion
    WHERE id_tipo_ajuste = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20013, 'Registro no encontrado en TIPO_AJUSTE_STOCK');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO eliminar un tipo
de ajuste por su identificador. Las referencias a movimientos ya registrados
impiden borrar un tipo que tenga historial. */
CREATE OR REPLACE PROCEDURE SAB_D_TIPO_AJUSTE_STOCK(p_actor_id NUMBER, p_id NUMBER) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    DELETE FROM TIPO_AJUSTE_STOCK WHERE id_tipo_ajuste = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20016, 'Registro no encontrado en TIPO_AJUSTE_STOCK');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO registrar un proveedor
con sus datos correspondientes (RUT, razon social, telefono y correo). Genera un identificador mediante
una secuencia y lo devuelve al programa que realizo la llamada. */
CREATE OR REPLACE PROCEDURE SAB_C_PROVEEDOR(
    p_actor_id NUMBER,
    p_rut_proveedor VARCHAR2,
    p_razon_social VARCHAR2,
    p_telefono VARCHAR2,
    p_email_contacto VARCHAR2,
    p_nuevo_id OUT NUMBER
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    INSERT INTO PROVEEDOR (id_proveedor, rut_proveedor, razon_social, telefono, email_contacto)
    VALUES (SEQ_PROVEEDOR.NEXTVAL, p_rut_proveedor, p_razon_social, p_telefono, p_email_contacto)
    RETURNING id_proveedor INTO p_nuevo_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO consultar
los proveedores. Devuelve sus registros ordenados mediante un cursor de resultados
para que puedan mostrarse en la aplicacion. */
CREATE OR REPLACE PROCEDURE SAB_L_PROVEEDOR(
    p_actor_id NUMBER, p_resultado OUT SYS_REFCURSOR
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    OPEN p_resultado FOR
        SELECT id_proveedor, rut_proveedor, razon_social, telefono, email_contacto FROM PROVEEDOR ORDER BY id_proveedor;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO modificar
RUT, razon social, telefono y correo de un proveedor. Busca el registro por su identificador y genera
un error si no existe. */
CREATE OR REPLACE PROCEDURE SAB_U_PROVEEDOR(
    p_actor_id NUMBER,
    p_id NUMBER,
    p_rut_proveedor VARCHAR2,
    p_razon_social VARCHAR2,
    p_telefono VARCHAR2,
    p_email_contacto VARCHAR2
) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    UPDATE PROVEEDOR SET
        rut_proveedor = p_rut_proveedor, razon_social = p_razon_social, telefono = p_telefono, email_contacto = p_email_contacto
    WHERE id_proveedor = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20013, 'Registro no encontrado en PROVEEDOR');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO intentar
eliminar un proveedor mediante su identificador. Comprueba que exista y
las restricciones de la base impiden borrar datos con referencias protegidas. */
CREATE OR REPLACE PROCEDURE SAB_D_PROVEEDOR(p_actor_id NUMBER, p_id NUMBER) IS
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    DELETE FROM PROVEEDOR WHERE id_proveedor = p_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20016, 'Registro no encontrado en PROVEEDOR');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/
