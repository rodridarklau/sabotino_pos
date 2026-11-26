-- 04 FUNCIONES SEGURIDAD

-- Validaciones de acceso y procedimientos auxiliares.

/* Lo que hace la siguiente funcion es comprobar si el usuario recibido como parametro
tiene el rol DUENO, esta activo y su rol tambien esta activo. Devuelve 1 si
cumple las condiciones y 0 en los demas casos, incluido si no existe. */
CREATE OR REPLACE FUNCTION SAB_F_ES_DUENO(p_actor_id NUMBER)
RETURN NUMBER IS
    CURSOR c_rol IS
        SELECT r.nombre_rol, r.estado_activo, u.estado_usuario
        FROM USUARIO u JOIN ROL_USUARIO r ON r.id_rol = u.id_rol
        WHERE u.id_usuario = p_actor_id;
BEGIN
    FOR r IN c_rol LOOP
        IF r.nombre_rol = 'DUENO' AND r.estado_activo = 'S'
           AND r.estado_usuario = 'S' THEN
            RETURN 1;
        END IF;
    END LOOP;
    RETURN 0;
END;
/

/* Lo que hace el siguiente procedimiento es comprobar que el usuario exista,
este activo y tenga uno de los dos roles fijos habilitados: DUENO o VENDEDOR.
Si no existe o esta inactivo, impide que continue la operacion. */
CREATE OR REPLACE PROCEDURE SAB_VALIDAR_USUARIO(p_actor_id NUMBER) IS
    CURSOR c_usuario IS
        SELECT u.estado_usuario, r.estado_activo, r.nombre_rol
          FROM USUARIO u
          JOIN ROL_USUARIO r ON r.id_rol = u.id_rol
         WHERE u.id_usuario = p_actor_id;
BEGIN
    FOR r IN c_usuario LOOP
        IF r.estado_usuario = 'S' AND r.estado_activo = 'S'
           AND r.nombre_rol IN ('DUENO', 'VENDEDOR') THEN
            RETURN;
        END IF;
        RAISE_APPLICATION_ERROR(-20001, 'Usuario o rol inactivo');
    END LOOP;
    RAISE_APPLICATION_ERROR(-20002, 'Usuario no existe');
END;
/
/* Lo que hace el siguiente procedimiento es validar primero que el usuario pueda
operar en el sistema y despues comprobar que sea DUENO. Se usa en funciones
reservadas a la administracion del negocio. */
CREATE OR REPLACE PROCEDURE SAB_VALIDAR_DUENO(p_actor_id NUMBER) IS
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    IF SAB_F_ES_DUENO(p_actor_id) <> 1 THEN
        RAISE_APPLICATION_ERROR(-20003, 'Acceso solo para el dueno');
    END IF;
END;
/

/* Lo que hace el siguiente procedimiento es comprobar que la cantidad indicada sea
mayor que cero, no supere el limite y tenga como maximo tres decimales. Tambien
consulta la unidad del producto para exigir enteros cuando corresponde. */
CREATE OR REPLACE PROCEDURE SAB_VALIDAR_CANTIDAD(
    p_producto_id NUMBER, p_cantidad NUMBER
) IS
    CURSOR c_unidad IS
        SELECT um.permite_decimales
          FROM PRODUCTO p JOIN UNIDAD_MEDIDA um ON um.id_unidad = p.id_unidad
         WHERE p.id_producto = p_producto_id;
BEGIN
    IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_cantidad > 999999999.999
       OR p_cantidad <> ROUND(p_cantidad, 3) THEN
        RAISE_APPLICATION_ERROR(-20004, 'Cantidad invalida: maximo 3 decimales y mayor que cero');
    END IF;
    FOR r IN c_unidad LOOP
        IF r.permite_decimales = 'N' AND p_cantidad <> TRUNC(p_cantidad) THEN
            RAISE_APPLICATION_ERROR(-20005, 'El producto se vende en unidades enteras');
        END IF;
        RETURN;
    END LOOP;
    RAISE_APPLICATION_ERROR(-20006, 'Producto no existe');
END;
/

/* Lo que hace el siguiente procedimiento es insertar un registro de auditoria
con el usuario responsable, la accion, los valores anteriores y nuevos de
costo, precio y stock, y la fecha del cambio. */
CREATE OR REPLACE PROCEDURE SAB_LOG_CAMBIO_PRODUCTO(
    p_actor_id NUMBER, p_producto_id NUMBER, p_accion VARCHAR2,
    p_costo_antes NUMBER, p_costo_despues NUMBER,
    p_precio_antes NUMBER, p_precio_despues NUMBER,
    p_stock_antes NUMBER, p_stock_despues NUMBER
) IS
BEGIN
    INSERT INTO LOG_CAMBIO_PRODUCTO (
        id_log_producto, id_producto, id_usuario_responsable, accion_realizada,
        costo_anterior, costo_nuevo, precio_anterior, precio_nuevo,
        stock_anterior, stock_nuevo, fecha_hora_cambio
    ) VALUES (
        SEQ_LOG_CAMBIO_PRODUCTO.NEXTVAL, p_producto_id, p_actor_id, p_accion,
        p_costo_antes, p_costo_despues, p_precio_antes, p_precio_despues,
        p_stock_antes, p_stock_despues, SYSTIMESTAMP
    );
END;
/

/* Lo que hace la siguiente funcion es calcular el margen bruto de una venta
confirmada sumando, por cada detalle, la diferencia entre precio y costo
historicos multiplicada por la cantidad. Solo permite consultarlo al DUENO. */
CREATE OR REPLACE FUNCTION SAB_F_GANANCIA_VENTA(
    p_actor_id NUMBER, p_venta_id NUMBER
) RETURN NUMBER IS
    CURSOR c_ganancia IS
        SELECT ROUND(NVL(SUM((precio_unitario_historico - costo_unitario_historico) * cantidad), 0), 2) utilidad
        FROM DETALLE_VENTA d JOIN VENTA v ON v.id_venta = d.id_venta
        WHERE d.id_venta = p_venta_id AND v.estado_venta = 'CONFIRMADA';
    v_utilidad NUMBER(14,2) := 0;
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    FOR r IN c_ganancia LOOP
        v_utilidad := r.utilidad;
    END LOOP;
    RETURN v_utilidad;
END;
/

/* Lo que hace el siguiente procedimiento es registrar un LOGIN, LOGOUT o
LOGIN_FALLIDO para un usuario existente. Valida el tipo de evento, registra
la fecha y el detalle, y confirma o revierte el registro segun corresponda. */
CREATE OR REPLACE PROCEDURE SAB_REGISTRAR_SESION(
    p_actor_id NUMBER,
    p_evento VARCHAR2,
    p_detalle VARCHAR2 DEFAULT NULL
) IS
    CURSOR c_usuario_existente IS
        SELECT id_usuario
          FROM USUARIO
         WHERE id_usuario = p_actor_id;
    v_existe BOOLEAN := FALSE;
BEGIN
    IF p_evento IS NULL OR p_evento NOT IN ('LOGIN', 'LOGOUT', 'LOGIN_FALLIDO') THEN
        RAISE_APPLICATION_ERROR(-20007, 'Evento de sesion invalido');
    END IF;

    IF p_evento = 'LOGIN_FALLIDO' THEN
        FOR r IN c_usuario_existente LOOP
            v_existe := TRUE;
            EXIT;
        END LOOP;
        IF NOT v_existe THEN
            RAISE_APPLICATION_ERROR(-20002, 'Usuario no existe');
        END IF;
    ELSE
        SAB_VALIDAR_USUARIO(p_actor_id);
    END IF;

    INSERT INTO LOG_SESION_USUARIO (
        id_log_sesion, id_usuario, tipo_evento,
        fecha_hora_evento, detalle_acceso
    ) VALUES (
        SEQ_LOG_SESION_USUARIO.NEXTVAL,
        p_actor_id, p_evento, SYSTIMESTAMP, p_detalle
    );
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/

-- La autenticación y comparación de contraseñas se realiza en el servidor de la aplicación.
/* Lo que hace el siguiente procedimiento es buscar un usuario por su nombre de
acceso y entregar su ID, hash de contrasena, rol y estado mediante parametros
OUT. El backend verifica la contrasena; este procedimiento solo consulta datos. */
CREATE OR REPLACE PROCEDURE SAB_BUSCAR_CREDENCIALES(
    p_username VARCHAR2, p_usuario_id OUT NUMBER,
    p_hash OUT VARCHAR2, p_rol OUT VARCHAR2, p_habilitado OUT CHAR
) IS
    CURSOR c_login IS
       SELECT u.id_usuario,u.password_hash,r.nombre_rol,
              CASE WHEN u.estado_usuario='S' AND r.estado_activo='S' THEN 'S' ELSE 'N' END habilitado
       FROM USUARIO u JOIN ROL_USUARIO r ON r.id_rol=u.id_rol
       WHERE u.username=p_username;
BEGIN
    p_usuario_id:=NULL;
    p_hash:=NULL;
    p_rol:=NULL;
    p_habilitado:='N';
    FOR r IN c_login LOOP
        p_usuario_id:=r.id_usuario;
        p_hash:=r.password_hash;
        p_rol:=r.nombre_rol;
        p_habilitado:=r.habilitado;
    END LOOP;
END;
/

/* Registra el unico usuario DUENO inicial en una instalacion limpia.
Si ya existe un DUENO creado, bloquea el registro para mantener el control de acceso. */
CREATE OR REPLACE PROCEDURE SAB_REGISTRAR_DUENO_INICIAL(
    p_rut_usuario VARCHAR2,
    p_nombre_completo VARCHAR2,
    p_username VARCHAR2,
    p_password_hash VARCHAR2,
    p_nuevo_id OUT NUMBER
) IS
    CURSOR c_rol_dueno IS
        SELECT id_rol
          FROM ROL_USUARIO
         WHERE nombre_rol = 'DUENO' AND estado_activo = 'S'
         FOR UPDATE;
    CURSOR c_dueno_existente(p_id_rol NUMBER) IS
        SELECT id_usuario
          FROM USUARIO
         WHERE id_rol = p_id_rol;
    v_rol_dueno NUMBER;
BEGIN
    IF TRIM(p_rut_usuario) IS NULL OR TRIM(p_nombre_completo) IS NULL
       OR TRIM(p_username) IS NULL OR TRIM(p_password_hash) IS NULL THEN
        RAISE_APPLICATION_ERROR(-20515, 'Datos obligatorios incompletos para el dueno inicial');
    END IF;

    OPEN c_rol_dueno;
    FETCH c_rol_dueno INTO v_rol_dueno;
    IF c_rol_dueno%NOTFOUND THEN
        CLOSE c_rol_dueno;
        RAISE_APPLICATION_ERROR(-20513, 'Rol DUENO no configurado');
    END IF;
    CLOSE c_rol_dueno;

    FOR r IN c_dueno_existente(v_rol_dueno) LOOP
        RAISE_APPLICATION_ERROR(-20514, 'Ya existe un dueno inicial registrado');
    END LOOP;

    INSERT INTO USUARIO (
        id_usuario, id_rol, rut_usuario, nombre_completo,
        username, password_hash, estado_usuario
    ) VALUES (
        SEQ_USUARIO.NEXTVAL, v_rol_dueno, TRIM(p_rut_usuario),
        TRIM(p_nombre_completo), TRIM(p_username), p_password_hash, 'S'
    ) RETURNING id_usuario INTO p_nuevo_id;
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/
