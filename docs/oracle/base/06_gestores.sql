/* Lo que hace el siguiente procedimiento es abrir un turno en una caja habilitada,
validar el efectivo inicial e impedir dos aperturas simultaneas de la misma caja.
Guarda el turno y un registro de auditoria de apertura. */
CREATE OR REPLACE PROCEDURE SAB_ABRIR_CAJA(
    p_actor_id NUMBER, p_caja_id NUMBER, p_efectivo_inicial NUMBER,
    p_turno_id OUT NUMBER
) IS
    CURSOR c_caja IS
        SELECT estado_operativo FROM CAJA_TERMINAL WHERE id_caja = p_caja_id FOR UPDATE;
    CURSOR c_abiertas IS
        SELECT id_turno_caja FROM TURNO_CAJA
        WHERE id_caja = p_caja_id AND estado_turno = 'ABIERTO';
    v_caja c_caja%ROWTYPE;
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    IF p_efectivo_inicial IS NULL OR p_efectivo_inicial < 0
       OR p_efectivo_inicial <> ROUND(p_efectivo_inicial, 2) THEN
        RAISE_APPLICATION_ERROR(-20101,'Monto inicial invalido');
    END IF;
    -- Bloqueo de la caja para impedir aperturas simultáneas.
    OPEN c_caja; FETCH c_caja INTO v_caja;
    IF c_caja%NOTFOUND THEN CLOSE c_caja; RAISE_APPLICATION_ERROR(-20102,'Caja no existe'); END IF;
    CLOSE c_caja;
    IF v_caja.estado_operativo <> 'S' THEN
        RAISE_APPLICATION_ERROR(-20103,'Caja fuera de servicio');
    END IF;
    FOR r IN c_abiertas LOOP
        RAISE_APPLICATION_ERROR(-20104,'Ya existe un turno abierto en la caja');
    END LOOP;
    INSERT INTO TURNO_CAJA(
        id_turno_caja, id_caja, id_usuario_apertura, fecha_hora_apertura,
        inicial_efectivo, inicial_tarjeta, inicial_transferencia, estado_turno
    ) VALUES (
        SEQ_TURNO_CAJA.NEXTVAL, p_caja_id, p_actor_id, SYSTIMESTAMP,
        p_efectivo_inicial, 0, 0, 'ABIERTO'
    ) RETURNING id_turno_caja INTO p_turno_id;
    INSERT INTO LOG_AUDITORIA_CAJA(
        id_log_caja, id_turno_caja, id_usuario, tipo_operacion, fecha_hora_registro,
        inicial_efectivo, inicial_tarjeta, inicial_transferencia
    ) VALUES (
        SEQ_LOG_AUDITORIA_CAJA.NEXTVAL, p_turno_id, p_actor_id, 'APERTURA', SYSTIMESTAMP,
        p_efectivo_inicial, 0, 0
    );
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Crea una venta en estado BORRADOR en un turno abierto sin descontar stock todavia. */
CREATE OR REPLACE PROCEDURE SAB_VENTA_INICIAR(
    p_actor_id NUMBER, p_turno_id NUMBER, p_venta_id OUT NUMBER
) IS
    CURSOR c_turno IS SELECT estado_turno FROM TURNO_CAJA
        WHERE id_turno_caja = p_turno_id FOR UPDATE;
    v_turno c_turno%ROWTYPE;
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN c_turno; FETCH c_turno INTO v_turno;
    IF c_turno%NOTFOUND THEN
        CLOSE c_turno;
        RAISE_APPLICATION_ERROR(-20110, 'Turno no existe');
    END IF;
    CLOSE c_turno;
    IF v_turno.estado_turno <> 'ABIERTO' THEN
        RAISE_APPLICATION_ERROR(-20111, 'Turno cerrado: no acepta ventas');
    END IF;
    INSERT INTO VENTA(
        id_venta, id_turno_caja, id_usuario,
        fecha_hora_venta, total_venta, estado_venta
    ) VALUES (
        SEQ_VENTA.NEXTVAL, p_turno_id, p_actor_id,
        SYSTIMESTAMP, 0, 'BORRADOR'
    ) RETURNING id_venta INTO p_venta_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es agregar un producto y su cantidad
a una venta BORRADOR del mismo usuario. Valida el producto, guarda el precio
y costo vigentes como valores historicos y calcula el subtotal de la linea. */
CREATE OR REPLACE PROCEDURE SAB_VENTA_AGREGAR_PRODUCTO(
    p_actor_id NUMBER, p_venta_id NUMBER, p_producto_id NUMBER,
    p_cantidad NUMBER, p_detalle_id OUT NUMBER
) IS
    CURSOR c_venta IS SELECT estado_venta, id_usuario FROM VENTA
         WHERE id_venta = p_venta_id FOR UPDATE;
    CURSOR c_producto IS SELECT estado_producto, precio_venta_actual, costo_produccion_actual
         FROM PRODUCTO WHERE id_producto = p_producto_id;
    v_venta c_venta%ROWTYPE;
    v_producto c_producto%ROWTYPE;
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    SAB_VALIDAR_CANTIDAD(p_producto_id, p_cantidad);
    OPEN c_venta; FETCH c_venta INTO v_venta;
    IF c_venta%NOTFOUND THEN CLOSE c_venta; RAISE_APPLICATION_ERROR(-20112,'Venta no existe'); END IF;
    CLOSE c_venta;
    IF v_venta.estado_venta <> 'BORRADOR' OR v_venta.id_usuario <> p_actor_id THEN
        RAISE_APPLICATION_ERROR(-20113,'No puede modificar este borrador');
    END IF;
    OPEN c_producto; FETCH c_producto INTO v_producto;
    IF c_producto%NOTFOUND THEN CLOSE c_producto; RAISE_APPLICATION_ERROR(-20114,'Producto no existe'); END IF;
    CLOSE c_producto;
    IF v_producto.estado_producto <> 'S' THEN
        RAISE_APPLICATION_ERROR(-20115,'Producto inactivo');
    END IF;
    INSERT INTO DETALLE_VENTA(
        id_detalle_venta,id_venta,id_producto,cantidad,
        costo_unitario_historico,precio_unitario_historico,subtotal_linea
    ) VALUES (
        SEQ_DETALLE_VENTA.NEXTVAL,p_venta_id,p_producto_id,p_cantidad,
        v_producto.costo_produccion_actual,v_producto.precio_venta_actual,
        ROUND(p_cantidad*v_producto.precio_venta_actual,2)
    ) RETURNING id_detalle_venta INTO p_detalle_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es agregar un pago a una venta BORRADOR
del usuario, comprobando el monto y el metodo utilizado. Si el metodo exige
comprobante, obliga a informar su codigo. */
CREATE OR REPLACE PROCEDURE SAB_VENTA_AGREGAR_PAGO(
    p_actor_id NUMBER, p_venta_id NUMBER, p_metodo_id NUMBER,
    p_monto NUMBER, p_comprobante VARCHAR2, p_pago_id OUT NUMBER
) IS
    CURSOR c_venta IS SELECT estado_venta, id_usuario FROM VENTA
        WHERE id_venta=p_venta_id FOR UPDATE;
    CURSOR c_metodo IS SELECT requiere_comprobante FROM METODO_PAGO
        WHERE id_metodo_pago=p_metodo_id;
    v_venta c_venta%ROWTYPE;
    v_metodo c_metodo%ROWTYPE;
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    IF p_monto IS NULL OR p_monto <= 0 OR p_monto <> ROUND(p_monto,2) THEN
        RAISE_APPLICATION_ERROR(-20116,'Monto de pago invalido');
    END IF;
    OPEN c_venta; FETCH c_venta INTO v_venta;
    IF c_venta%NOTFOUND THEN CLOSE c_venta; RAISE_APPLICATION_ERROR(-20117,'Venta no existe'); END IF;
    CLOSE c_venta;
    IF v_venta.estado_venta <> 'BORRADOR' OR v_venta.id_usuario <> p_actor_id THEN
        RAISE_APPLICATION_ERROR(-20118,'No puede agregar pagos a esta venta');
    END IF;
    OPEN c_metodo; FETCH c_metodo INTO v_metodo;
    IF c_metodo%NOTFOUND THEN CLOSE c_metodo; RAISE_APPLICATION_ERROR(-20119,'Metodo no existe'); END IF;
    CLOSE c_metodo;
    IF v_metodo.requiere_comprobante='S' AND TRIM(p_comprobante) IS NULL THEN
        RAISE_APPLICATION_ERROR(-20120,'Se requiere codigo comprobante');
    END IF;
    INSERT INTO PAGO_VENTA(id_pago_venta,id_venta,id_metodo_pago,monto_pagado,codigo_comprobante)
    VALUES(SEQ_PAGO_VENTA.NEXTVAL,p_venta_id,p_metodo_id,p_monto,p_comprobante)
    RETURNING id_pago_venta INTO p_pago_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es confirmar una venta BORRADOR:
recorre sus productos, comprueba el stock, actualiza precios y costos historicos,
descuenta inventario y compara el total con los pagos. Si algo falla revierte todo. */
CREATE OR REPLACE PROCEDURE SAB_VENTA_CONFIRMAR(
    p_actor_id NUMBER, p_venta_id NUMBER, p_total OUT NUMBER
) IS
    CURSOR c_identidad IS SELECT id_turno_caja FROM VENTA WHERE id_venta=p_venta_id;
    CURSOR c_turno(p_turno NUMBER) IS SELECT estado_turno FROM TURNO_CAJA
        WHERE id_turno_caja=p_turno FOR UPDATE;
    CURSOR c_venta IS SELECT id_usuario, estado_venta FROM VENTA
        WHERE id_venta=p_venta_id FOR UPDATE;
    CURSOR c_detalles IS
        SELECT id_detalle_venta, id_producto, cantidad
        FROM DETALLE_VENTA WHERE id_venta=p_venta_id
        ORDER BY id_producto, id_detalle_venta;
    CURSOR c_producto(p_id NUMBER) IS
        SELECT stock_actual, precio_venta_actual, costo_produccion_actual, estado_producto
        FROM PRODUCTO WHERE id_producto=p_id FOR UPDATE;
    CURSOR c_suma_pagos IS SELECT NVL(SUM(monto_pagado),0) pagado
        FROM PAGO_VENTA WHERE id_venta=p_venta_id;
    v_identidad c_identidad%ROWTYPE;
    v_turno c_turno%ROWTYPE;
    v_venta c_venta%ROWTYPE;
    v_producto c_producto%ROWTYPE;
    v_n_lineas NUMBER:=0;
    v_total NUMBER(14,2):=0;
    v_subtotal NUMBER(14,2);
    v_pagado NUMBER(14,2):=0;
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN c_identidad; FETCH c_identidad INTO v_identidad;
    IF c_identidad%NOTFOUND THEN CLOSE c_identidad; RAISE_APPLICATION_ERROR(-20121,'Venta no existe'); END IF;
    CLOSE c_identidad;
    -- El turno se bloquea antes de la venta para coordinarse con el cierre de caja.
    OPEN c_turno(v_identidad.id_turno_caja); FETCH c_turno INTO v_turno;
    IF c_turno%NOTFOUND THEN CLOSE c_turno; RAISE_APPLICATION_ERROR(-20122,'Turno no existe'); END IF;
    CLOSE c_turno;
    IF v_turno.estado_turno <> 'ABIERTO' THEN RAISE_APPLICATION_ERROR(-20123,'Caja cerrada'); END IF;
    OPEN c_venta; FETCH c_venta INTO v_venta;
    IF c_venta%NOTFOUND THEN CLOSE c_venta; RAISE_APPLICATION_ERROR(-20124,'Venta no existe'); END IF;
    CLOSE c_venta;
    IF v_venta.id_usuario <> p_actor_id OR v_venta.estado_venta <> 'BORRADOR' THEN
        RAISE_APPLICATION_ERROR(-20125,'Venta no pertenece al usuario o no es borrador');
    END IF;
    FOR r IN c_detalles LOOP
        v_n_lineas := v_n_lineas + 1;
        SAB_VALIDAR_CANTIDAD(r.id_producto,r.cantidad);
        OPEN c_producto(r.id_producto); FETCH c_producto INTO v_producto;
        IF c_producto%NOTFOUND THEN CLOSE c_producto; RAISE_APPLICATION_ERROR(-20126,'Producto no existe'); END IF;
        CLOSE c_producto;
        IF v_producto.estado_producto <> 'S' THEN
            RAISE_APPLICATION_ERROR(-20127,'Producto desactivado');
        END IF;
        IF v_producto.stock_actual < r.cantidad THEN
            RAISE_APPLICATION_ERROR(-20128,'Stock insuficiente en producto '||r.id_producto);
        END IF;
        v_subtotal := ROUND(v_producto.precio_venta_actual * r.cantidad, 2);
        v_total := v_total + v_subtotal;
        UPDATE DETALLE_VENTA SET
            costo_unitario_historico = v_producto.costo_produccion_actual,
            precio_unitario_historico = v_producto.precio_venta_actual,
            subtotal_linea = v_subtotal
        WHERE id_detalle_venta = r.id_detalle_venta;
        UPDATE PRODUCTO SET stock_actual=stock_actual-r.cantidad WHERE id_producto=r.id_producto;
        SAB_LOG_CAMBIO_PRODUCTO(p_actor_id,r.id_producto,'VENTA',
            v_producto.costo_produccion_actual,v_producto.costo_produccion_actual,
            v_producto.precio_venta_actual,v_producto.precio_venta_actual,
            v_producto.stock_actual,v_producto.stock_actual-r.cantidad);
    END LOOP;
    IF v_n_lineas = 0 THEN RAISE_APPLICATION_ERROR(-20129,'Venta sin productos'); END IF;
    FOR r IN c_suma_pagos LOOP v_pagado := r.pagado; END LOOP;
    IF v_total <> v_pagado THEN
        RAISE_APPLICATION_ERROR(-20130,'Pago no cuadra. Total '||v_total||', pagado '||v_pagado);
    END IF;
    UPDATE VENTA SET total_venta=v_total, estado_venta='CONFIRMADA',
        fecha_hora_venta=SYSTIMESTAMP WHERE id_venta=p_venta_id;
    p_total := v_total;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es anular una venta que aun esta en
BORRADOR, siempre que pertenezca al usuario o este actue como DUENO. Elimina
sus detalles y pagos y cambia su estado a ANULADA. */
CREATE OR REPLACE PROCEDURE SAB_VENTA_CANCELAR(p_actor_id NUMBER,p_venta_id NUMBER) IS
    CURSOR c_venta IS SELECT id_usuario,estado_venta FROM VENTA
        WHERE id_venta=p_venta_id FOR UPDATE;
    v_venta c_venta%ROWTYPE;
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN c_venta; FETCH c_venta INTO v_venta;
    IF c_venta%NOTFOUND THEN CLOSE c_venta; RAISE_APPLICATION_ERROR(-20131,'Venta no existe'); END IF;
    CLOSE c_venta;
    IF v_venta.estado_venta <> 'BORRADOR' OR
       (v_venta.id_usuario <> p_actor_id AND SAB_F_ES_DUENO(p_actor_id)<>1) THEN
       RAISE_APPLICATION_ERROR(-20132,'No se puede anular esta venta');
    END IF;
    DELETE FROM PAGO_VENTA WHERE id_venta=p_venta_id;
    DELETE FROM DETALLE_VENTA WHERE id_venta=p_venta_id;
    UPDATE VENTA SET estado_venta='ANULADA' WHERE id_venta=p_venta_id;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es cerrar un turno abierto si no tiene
ventas pendientes. Calcula lo esperado por cada medio de pago, lo compara
con los montos reales y registra el descuadre y la auditoria de cierre. */
CREATE OR REPLACE PROCEDURE SAB_CERRAR_CAJA(
    p_actor_id NUMBER, p_turno_id NUMBER,
    p_real_efectivo NUMBER, p_real_tarjeta NUMBER, p_real_transferencia NUMBER,
    p_descuadre OUT NUMBER
) IS
    CURSOR c_turno IS SELECT * FROM TURNO_CAJA
        WHERE id_turno_caja=p_turno_id FOR UPDATE;
    CURSOR c_pendientes IS SELECT id_venta FROM VENTA
        WHERE id_turno_caja=p_turno_id AND estado_venta='BORRADOR';
    CURSOR c_pagos IS
        SELECT NVL(SUM(CASE WHEN mp.nombre_metodo='EFECTIVO' THEN pv.monto_pagado ELSE 0 END),0) efectivo,
               NVL(SUM(CASE WHEN mp.nombre_metodo='TARJETA' THEN pv.monto_pagado ELSE 0 END),0) tarjeta,
               NVL(SUM(CASE WHEN mp.nombre_metodo='TRANSFERENCIA' THEN pv.monto_pagado ELSE 0 END),0) transferencia
        FROM VENTA v JOIN PAGO_VENTA pv ON pv.id_venta=v.id_venta
          JOIN METODO_PAGO mp ON mp.id_metodo_pago=pv.id_metodo_pago
        WHERE v.id_turno_caja=p_turno_id AND v.estado_venta='CONFIRMADA';
    v_turno c_turno%ROWTYPE;
    v_pagos c_pagos%ROWTYPE;
    v_esperado_ef NUMBER(14,2);
    v_esperado_ta NUMBER(14,2);
    v_esperado_tr NUMBER(14,2);
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    IF p_real_efectivo IS NULL OR p_real_tarjeta IS NULL OR p_real_transferencia IS NULL
       OR p_real_efectivo<0 OR p_real_tarjeta<0 OR p_real_transferencia<0
       OR p_real_efectivo<>ROUND(p_real_efectivo,2)
       OR p_real_tarjeta<>ROUND(p_real_tarjeta,2)
       OR p_real_transferencia<>ROUND(p_real_transferencia,2) THEN
        RAISE_APPLICATION_ERROR(-20140,'Montos reales de cierre invalidos');
    END IF;
    OPEN c_turno; FETCH c_turno INTO v_turno;
    IF c_turno%NOTFOUND THEN CLOSE c_turno; RAISE_APPLICATION_ERROR(-20141,'Turno no encontrado'); END IF;
    CLOSE c_turno;
    IF v_turno.estado_turno <> 'ABIERTO' THEN RAISE_APPLICATION_ERROR(-20142,'Turno cerrado'); END IF;
    FOR r IN c_pendientes LOOP
        RAISE_APPLICATION_ERROR(-20143,'No cerrar con ventas borrador. Confirme o anule la venta '||r.id_venta);
    END LOOP;
    OPEN c_pagos; FETCH c_pagos INTO v_pagos; CLOSE c_pagos;
    v_esperado_ef := v_turno.inicial_efectivo + v_pagos.efectivo;
    v_esperado_ta := v_turno.inicial_tarjeta + v_pagos.tarjeta;
    v_esperado_tr := v_turno.inicial_transferencia + v_pagos.transferencia;
    p_descuadre := (p_real_efectivo-v_esperado_ef)
                 + (p_real_tarjeta-v_esperado_ta)
                 + (p_real_transferencia-v_esperado_tr);
    UPDATE TURNO_CAJA SET
      id_usuario_cierre=p_actor_id, fecha_hora_cierre=SYSTIMESTAMP,
      cierre_sistema_efectivo=v_esperado_ef,
      cierre_sistema_tarjeta=v_esperado_ta,
      cierre_sistema_transferencia=v_esperado_tr,
      cierre_real_efectivo=p_real_efectivo,
      cierre_real_tarjeta=p_real_tarjeta,
      cierre_real_transferencia=p_real_transferencia,
      estado_turno='CERRADO'
    WHERE id_turno_caja=p_turno_id;
    INSERT INTO LOG_AUDITORIA_CAJA(
      id_log_caja,id_turno_caja,id_usuario,tipo_operacion,fecha_hora_registro,
      inicial_efectivo,inicial_tarjeta,inicial_transferencia,
      cierre_sistema_efectivo,cierre_real_efectivo,
      cierre_sistema_tarjeta,cierre_real_tarjeta,
      cierre_sistema_transferencia,cierre_real_transferencia,descuadre_total
    ) VALUES (
      SEQ_LOG_AUDITORIA_CAJA.NEXTVAL,p_turno_id,p_actor_id,'CIERRE',SYSTIMESTAMP,
      v_turno.inicial_efectivo,v_turno.inicial_tarjeta,v_turno.inicial_transferencia,
      v_esperado_ef,p_real_efectivo,v_esperado_ta,p_real_tarjeta,
      v_esperado_tr,p_real_transferencia,p_descuadre
    );
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es permitir al DUENO aumentar o disminuir
el stock de un producto segun un tipo de ajuste. Impide existencias negativas
y registra el movimiento y su auditoria. */
CREATE OR REPLACE PROCEDURE SAB_AJUSTAR_STOCK(
    p_actor_id NUMBER, p_producto_id NUMBER, p_tipo_id NUMBER,
    p_cantidad NUMBER, p_observacion VARCHAR2, p_ajuste_id OUT NUMBER
) IS
    CURSOR c_tipo IS SELECT factor_operacion FROM TIPO_AJUSTE_STOCK WHERE id_tipo_ajuste=p_tipo_id;
    CURSOR c_prod IS SELECT stock_actual,costo_produccion_actual,precio_venta_actual,estado_producto
        FROM PRODUCTO WHERE id_producto=p_producto_id FOR UPDATE;
    v_tipo c_tipo%ROWTYPE;
    v_prod c_prod%ROWTYPE;
    v_nuevo NUMBER(12,3);
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    SAB_VALIDAR_CANTIDAD(p_producto_id,p_cantidad);
    OPEN c_tipo; FETCH c_tipo INTO v_tipo;
    IF c_tipo%NOTFOUND THEN CLOSE c_tipo; RAISE_APPLICATION_ERROR(-20150,'Tipo de ajuste no existe'); END IF;
    CLOSE c_tipo;
    OPEN c_prod; FETCH c_prod INTO v_prod;
    IF c_prod%NOTFOUND THEN CLOSE c_prod; RAISE_APPLICATION_ERROR(-20151,'Producto no existe'); END IF;
    CLOSE c_prod;
    IF v_prod.estado_producto <> 'S' THEN RAISE_APPLICATION_ERROR(-20152,'Producto inactivo'); END IF;
    v_nuevo := v_prod.stock_actual+p_cantidad*v_tipo.factor_operacion;
    IF v_nuevo<0 THEN RAISE_APPLICATION_ERROR(-20153,'El ajuste dejaria stock negativo'); END IF;
    UPDATE PRODUCTO SET stock_actual=v_nuevo WHERE id_producto=p_producto_id;
    INSERT INTO AJUSTE_INVENTARIO(id_ajuste,id_producto,id_usuario,id_tipo_ajuste,
             fecha_hora_ajuste,cantidad_ajustada,observacion)
    VALUES(SEQ_AJUSTE_INVENTARIO.NEXTVAL,p_producto_id,p_actor_id,p_tipo_id,
             SYSTIMESTAMP,p_cantidad,p_observacion)
    RETURNING id_ajuste INTO p_ajuste_id;
    SAB_LOG_CAMBIO_PRODUCTO(p_actor_id,p_producto_id,'AJUSTE_STOCK',
      v_prod.costo_produccion_actual,v_prod.costo_produccion_actual,
      v_prod.precio_venta_actual,v_prod.precio_venta_actual,v_prod.stock_actual,v_nuevo);
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Lo que hace el siguiente procedimiento es registrar una compra a proveedor y
aumentar el stock del producto. Guarda el costo de compra del abastecimiento
y su auditoria, sin cambiar el costo de produccion del producto. */
CREATE OR REPLACE PROCEDURE SAB_ABASTECER_CORE(
    p_actor_id NUMBER, p_producto_id NUMBER, p_proveedor_id NUMBER,
    p_cantidad NUMBER, p_costo_compra NUMBER, p_abastecimiento_id OUT NUMBER
) IS
    CURSOR c_prod IS SELECT stock_actual,costo_produccion_actual,precio_venta_actual,estado_producto
        FROM PRODUCTO WHERE id_producto=p_producto_id FOR UPDATE;
    v_prod c_prod%ROWTYPE;
    v_nuevo NUMBER(12,3);
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    SAB_VALIDAR_CANTIDAD(p_producto_id,p_cantidad);
    IF p_costo_compra IS NULL OR p_costo_compra<0
       OR p_costo_compra<>ROUND(p_costo_compra,2) THEN
        RAISE_APPLICATION_ERROR(-20160,'Costo de compra invalido');
    END IF;
    OPEN c_prod; FETCH c_prod INTO v_prod;
    IF c_prod%NOTFOUND THEN CLOSE c_prod; RAISE_APPLICATION_ERROR(-20161,'Producto no existe'); END IF;
    CLOSE c_prod;
    IF v_prod.estado_producto <> 'S' THEN RAISE_APPLICATION_ERROR(-20162,'Producto inactivo'); END IF;
    v_nuevo := v_prod.stock_actual+p_cantidad;
    UPDATE PRODUCTO SET stock_actual=v_nuevo WHERE id_producto=p_producto_id;
    INSERT INTO ABASTECIMIENTO_PROVEEDOR(id_abastecimiento,id_proveedor,id_producto,id_usuario,
        fecha_compra,cantidad_comprada,costo_unitario_compra)
    VALUES(SEQ_ABASTECIMIENTO_PROVEEDOR.NEXTVAL,p_proveedor_id,p_producto_id,p_actor_id,
        SYSTIMESTAMP,p_cantidad,p_costo_compra)
    RETURNING id_abastecimiento INTO p_abastecimiento_id;
    -- El costo de compra se conserva en el abastecimiento sin alterar el costo de producción.
    SAB_LOG_CAMBIO_PRODUCTO(p_actor_id,p_producto_id,'ABASTECIMIENTO',
      v_prod.costo_produccion_actual,v_prod.costo_produccion_actual,
      v_prod.precio_venta_actual,v_prod.precio_venta_actual,v_prod.stock_actual,v_nuevo);
END;
/


/* API original: abastecimiento individual. Mantiene COMMIT/ROLLBACK igual que antes.
   La logica de negocio compartida reside en SAB_ABASTECER_CORE. */
CREATE OR REPLACE PROCEDURE SAB_ABASTECER(
    p_actor_id NUMBER, p_producto_id NUMBER, p_proveedor_id NUMBER,
    p_cantidad NUMBER, p_costo_compra NUMBER, p_abastecimiento_id OUT NUMBER
) IS
BEGIN
    SAB_ABASTECER_CORE(p_actor_id, p_producto_id, p_proveedor_id,
                       p_cantidad, p_costo_compra, p_abastecimiento_id);
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/

/* Elimina una linea puntual de DETALLE_VENTA mientras la venta sigue en BORRADOR y pertenece al actor. */
CREATE OR REPLACE PROCEDURE SAB_VENTA_QUITAR_PRODUCTO(
    p_actor_id NUMBER, p_venta_id NUMBER, p_detalle_id NUMBER
) IS
    CURSOR c_venta IS SELECT estado_venta, id_usuario FROM VENTA
        WHERE id_venta = p_venta_id FOR UPDATE;
    v_venta c_venta%ROWTYPE;
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN c_venta; FETCH c_venta INTO v_venta;
    IF c_venta%NOTFOUND THEN
        CLOSE c_venta;
        RAISE_APPLICATION_ERROR(-20112, 'Venta no existe');
    END IF;
    CLOSE c_venta;
    IF v_venta.estado_venta <> 'BORRADOR' OR v_venta.id_usuario <> p_actor_id THEN
        RAISE_APPLICATION_ERROR(-20113, 'No puede modificar este borrador');
    END IF;
    DELETE FROM DETALLE_VENTA
    WHERE id_detalle_venta = p_detalle_id
      AND id_venta = p_venta_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20116, 'Linea de detalle no encontrada en esta venta');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Permite al DUENO aumentar (+1) o reducir (-1) el stock de un insumo (consumo en produccion, merma o conteo) impidiendo stock negativo. */
CREATE OR REPLACE PROCEDURE SAB_AJUSTAR_STOCK_INSUMO(
    p_actor_id NUMBER,
    p_insumo_id NUMBER,
    p_tipo_id NUMBER,
    p_cantidad NUMBER,
    p_nuevo_stock OUT NUMBER
) IS
    CURSOR c_tipo IS SELECT factor_operacion FROM TIPO_AJUSTE_STOCK WHERE id_tipo_ajuste = p_tipo_id;
    CURSOR c_ins IS
        SELECT i.stock_actual, i.estado_activo, u.permite_decimales
        FROM INSUMO i
        JOIN UNIDAD_MEDIDA u ON u.id_unidad = i.id_unidad
        WHERE i.id_insumo = p_insumo_id
        FOR UPDATE OF i.stock_actual;
    v_tipo c_tipo%ROWTYPE;
    v_ins c_ins%ROWTYPE;
    v_nuevo NUMBER(12,3);
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_cantidad <> ROUND(p_cantidad, 3) THEN
        RAISE_APPLICATION_ERROR(-20170, 'Cantidad invalida para ajuste de insumo');
    END IF;
    OPEN c_tipo; FETCH c_tipo INTO v_tipo;
    IF c_tipo%NOTFOUND THEN
        CLOSE c_tipo;
        RAISE_APPLICATION_ERROR(-20150, 'Tipo de ajuste no existe');
    END IF;
    CLOSE c_tipo;
    OPEN c_ins; FETCH c_ins INTO v_ins;
    IF c_ins%NOTFOUND THEN
        CLOSE c_ins;
        RAISE_APPLICATION_ERROR(-20171, 'Insumo no existe');
    END IF;
    CLOSE c_ins;
    IF v_ins.estado_activo <> 'S' THEN
        RAISE_APPLICATION_ERROR(-20172, 'Insumo inactivo');
    END IF;
    IF v_ins.permite_decimales = 'N' AND p_cantidad <> TRUNC(p_cantidad) THEN
        RAISE_APPLICATION_ERROR(-20173, 'La unidad de este insumo no permite decimales');
    END IF;
    v_nuevo := v_ins.stock_actual + p_cantidad * v_tipo.factor_operacion;
    IF v_nuevo < 0 THEN
        RAISE_APPLICATION_ERROR(-20174, 'El ajuste dejaria stock de insumo negativo');
    END IF;
    UPDATE INSUMO SET stock_actual = v_nuevo WHERE id_insumo = p_insumo_id;
    p_nuevo_stock := v_nuevo;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/

/* Registra el ingreso de insumos comprados a un proveedor, aumenta el stock y actualiza su costo unitario si se informa (solo DUENO). */
CREATE OR REPLACE PROCEDURE SAB_ABASTECER_INSUMO_CORE(
    p_actor_id NUMBER,
    p_insumo_id NUMBER,
    p_proveedor_id NUMBER,
    p_cantidad NUMBER,
    p_costo_unitario NUMBER DEFAULT NULL,
    p_nuevo_stock OUT NUMBER
) IS
    CURSOR c_prov IS SELECT id_proveedor FROM PROVEEDOR WHERE id_proveedor = p_proveedor_id;
    CURSOR c_ins IS
        SELECT i.stock_actual, i.costo_unitario, i.estado_activo, u.permite_decimales
        FROM INSUMO i
        JOIN UNIDAD_MEDIDA u ON u.id_unidad = i.id_unidad
        WHERE i.id_insumo = p_insumo_id
        FOR UPDATE OF i.stock_actual, i.costo_unitario, i.id_proveedor;
    v_prov_id NUMBER;
    v_ins c_ins%ROWTYPE;
    v_nuevo NUMBER(12,3);
    v_costo NUMBER(14,2);
BEGIN
    SAB_VALIDAR_DUENO(p_actor_id);
    IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_cantidad <> ROUND(p_cantidad, 3) THEN
        RAISE_APPLICATION_ERROR(-20180, 'Cantidad invalida para abastecimiento de insumo');
    END IF;
    IF p_costo_unitario IS NOT NULL AND (p_costo_unitario < 0 OR p_costo_unitario <> ROUND(p_costo_unitario, 2)) THEN
        RAISE_APPLICATION_ERROR(-20181, 'Costo unitario invalido');
    END IF;
    OPEN c_prov; FETCH c_prov INTO v_prov_id;
    IF c_prov%NOTFOUND THEN
        CLOSE c_prov;
        RAISE_APPLICATION_ERROR(-20182, 'Proveedor no existe');
    END IF;
    CLOSE c_prov;
    OPEN c_ins; FETCH c_ins INTO v_ins;
    IF c_ins%NOTFOUND THEN
        CLOSE c_ins;
        RAISE_APPLICATION_ERROR(-20183, 'Insumo no existe');
    END IF;
    CLOSE c_ins;
    IF v_ins.estado_activo <> 'S' THEN
        RAISE_APPLICATION_ERROR(-20184, 'Insumo inactivo');
    END IF;
    IF v_ins.permite_decimales = 'N' AND p_cantidad <> TRUNC(p_cantidad) THEN
        RAISE_APPLICATION_ERROR(-20185, 'La unidad de este insumo no permite decimales');
    END IF;
    v_nuevo := v_ins.stock_actual + p_cantidad;
    v_costo := NVL(p_costo_unitario, v_ins.costo_unitario);
    UPDATE INSUMO
    SET stock_actual = v_nuevo,
        costo_unitario = v_costo,
        id_proveedor = p_proveedor_id
    WHERE id_insumo = p_insumo_id;
    p_nuevo_stock := v_nuevo;
END;
/


/* API original: abastecimiento individual. Mantiene COMMIT/ROLLBACK igual que antes.
   La logica de negocio compartida reside en SAB_ABASTECER_INSUMO_CORE. */
CREATE OR REPLACE PROCEDURE SAB_ABASTECER_INSUMO(
    p_actor_id NUMBER,
    p_insumo_id NUMBER,
    p_proveedor_id NUMBER,
    p_cantidad NUMBER,
    p_costo_unitario NUMBER DEFAULT NULL,
    p_nuevo_stock OUT NUMBER
) IS
BEGIN
    SAB_ABASTECER_INSUMO_CORE(p_actor_id, p_insumo_id, p_proveedor_id,
                              p_cantidad, p_costo_unitario, p_nuevo_stock);
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
        RAISE;
END;
/


/* COMPRA MULTIPLE ATOMICA (Oracle 21c): recibe un arreglo JSON de articulos.
   Cada linea contiene: tipo ('PRODUCTO' o 'INSUMO'), id_articulo,
   id_proveedor, cantidad, costo_unitario.

   Reutiliza la misma logica de SAB_ABASTECER y SAB_ABASTECER_INSUMO,
   pero confirma TODOS los articulos con un solo COMMIT. Si cualquier linea
   falla, revierte TODO con ROLLBACK. Sin tablas nuevas.

   IMPORTANTE: ejecutar en una conexion dedicada sin transacciones pendientes.
   El p_actor_id debe provenir de la sesion autenticada del backend. */
CREATE OR REPLACE PROCEDURE SAB_COMPRA_MULTIPLE(
    p_actor_id NUMBER,
    p_articulos_json CLOB,
    p_cantidad_lineas OUT NUMBER,
    p_total_compra OUT NUMBER
) IS
    TYPE t_linea IS RECORD (
        tipo VARCHAR2(20), id_articulo NUMBER, id_proveedor NUMBER,
        cantidad NUMBER, costo_unitario NUMBER
    );
    TYPE t_lineas IS TABLE OF t_linea INDEX BY PLS_INTEGER;
    v_lineas          t_lineas;
    v_linea           t_linea;
    v_articulos       JSON_ARRAY_T;
    v_articulo        JSON_OBJECT_T;
    v_elemento        JSON_ELEMENT_T;
    v_claves          JSON_ARRAY_T := JSON_ARRAY_T();
    v_clave           JSON_ARRAY_T;
    v_claves_json     CLOB;
    v_id_abastec      NUMBER;
    v_nuevo_stock     NUMBER;

    CURSOR c_claves IS
        SELECT DISTINCT j.tipo, j.id_articulo
        FROM JSON_TABLE(v_claves_json, '$[*]' COLUMNS (
            tipo NUMBER PATH '$[0]', id_articulo NUMBER PATH '$[1]'
        )) j
        ORDER BY j.tipo, j.id_articulo;
    CURSOR c_producto(p_id NUMBER) IS
        SELECT id_producto FROM PRODUCTO WHERE id_producto = p_id FOR UPDATE;
    CURSOR c_insumo(p_id NUMBER) IS
        SELECT id_insumo FROM INSUMO WHERE id_insumo = p_id FOR UPDATE;

    -- Detecta campos numericos faltantes o de tipo incorrecto.
    FUNCTION numero_obligatorio(p_obj JSON_OBJECT_T, p_campo VARCHAR2)
        RETURN NUMBER
    IS
        v_valor JSON_ELEMENT_T;
    BEGIN
        v_valor := p_obj.get(p_campo);
        IF v_valor IS NULL THEN
            RAISE_APPLICATION_ERROR(-20210, 'Falta el campo: ' || p_campo);
        END IF;
        IF NOT v_valor.is_number THEN
            RAISE_APPLICATION_ERROR(-20211, 'El campo debe ser numerico: ' || p_campo);
        END IF;
        RETURN p_obj.get_number(p_campo);
    END;
BEGIN
    p_cantidad_lineas := 0;
    p_total_compra := 0;

    SAB_VALIDAR_DUENO(p_actor_id);

    IF p_articulos_json IS NULL THEN
        RAISE_APPLICATION_ERROR(-20200, 'Debe proporcionar los articulos de la compra');
    END IF;

    BEGIN
        v_articulos := JSON_ARRAY_T.parse(p_articulos_json);
    EXCEPTION
        WHEN OTHERS THEN
            RAISE_APPLICATION_ERROR(-20201, 'La compra debe ser un arreglo JSON valido');
    END;

    IF v_articulos.get_size() = 0 THEN
        RAISE_APPLICATION_ERROR(-20202, 'La compra no puede estar vacia');
    END IF;

    FOR i IN 0 .. v_articulos.get_size() - 1 LOOP
        v_elemento := v_articulos.get(i);
        IF NOT v_elemento.is_object THEN
            RAISE_APPLICATION_ERROR(-20203, 'Cada articulo debe ser un objeto JSON');
        END IF;
        v_articulo := TREAT(v_elemento AS JSON_OBJECT_T);
        v_elemento := v_articulo.get('tipo');
        IF v_elemento IS NULL THEN
            RAISE_APPLICATION_ERROR(-20204, 'Falta tipo de articulo');
        END IF;
        IF NOT v_elemento.is_string THEN
            RAISE_APPLICATION_ERROR(-20205, 'Tipo de articulo invalido');
        END IF;
        v_linea.tipo := UPPER(TRIM(v_articulo.get_string('tipo')));
        IF v_linea.tipo IS NULL OR v_linea.tipo NOT IN ('PRODUCTO','INSUMO') THEN
            RAISE_APPLICATION_ERROR(-20206, 'Tipo debe ser PRODUCTO o INSUMO');
        END IF;

        v_linea.id_articulo := numero_obligatorio(v_articulo, 'id_articulo');
        v_linea.id_proveedor := numero_obligatorio(v_articulo, 'id_proveedor');
        v_linea.cantidad := numero_obligatorio(v_articulo, 'cantidad');
        v_linea.costo_unitario := numero_obligatorio(v_articulo, 'costo_unitario');

        IF v_linea.id_articulo IS NULL OR v_linea.id_articulo <= 0
           OR v_linea.id_articulo <> TRUNC(v_linea.id_articulo)
           OR v_linea.id_proveedor IS NULL OR v_linea.id_proveedor <= 0
           OR v_linea.id_proveedor <> TRUNC(v_linea.id_proveedor) THEN
            RAISE_APPLICATION_ERROR(-20207, 'Los IDs deben ser enteros positivos');
        END IF;
        IF v_linea.cantidad IS NULL OR v_linea.cantidad <= 0
           OR v_linea.cantidad <> ROUND(v_linea.cantidad, 3) THEN
            RAISE_APPLICATION_ERROR(-20208, 'Cantidad invalida');
        END IF;
        IF v_linea.costo_unitario IS NULL OR v_linea.costo_unitario < 0
           OR v_linea.costo_unitario <> ROUND(v_linea.costo_unitario, 2) THEN
            RAISE_APPLICATION_ERROR(-20209, 'Costo unitario invalido');
        END IF;

        v_lineas(i) := v_linea;
        v_clave := JSON_ARRAY_T();
        v_clave.append(CASE WHEN v_linea.tipo = 'PRODUCTO' THEN 1 ELSE 2 END);
        v_clave.append(v_linea.id_articulo);
        v_claves.append(v_clave);
    END LOOP;

    -- Cada OPEN bloquea una sola fila. Los productos se bloquean en el mismo
    -- orden que en Ventas, seguidos de los insumos. CLOSE conserva el bloqueo.
    v_claves_json := v_claves.to_clob();
    FOR clave IN c_claves LOOP
        IF clave.tipo = 1 THEN
            OPEN c_producto(clave.id_articulo);
            CLOSE c_producto;
        ELSE
            OPEN c_insumo(clave.id_articulo);
            CLOSE c_insumo;
        END IF;
    END LOOP;

    -- Las escrituras conservan el orden recibido, incluso para un insumo repetido.
    FOR i IN 0 .. v_lineas.COUNT - 1 LOOP
        v_linea := v_lineas(i);
        IF v_linea.tipo = 'PRODUCTO' THEN
            SAB_ABASTECER_CORE(p_actor_id, v_linea.id_articulo, v_linea.id_proveedor,
                               v_linea.cantidad, v_linea.costo_unitario, v_id_abastec);
        ELSE
            SAB_ABASTECER_INSUMO_CORE(p_actor_id, v_linea.id_articulo, v_linea.id_proveedor,
                                      v_linea.cantidad, v_linea.costo_unitario, v_nuevo_stock);
        END IF;

        p_cantidad_lineas := p_cantidad_lineas + 1;
        p_total_compra := p_total_compra + (v_linea.cantidad * v_linea.costo_unitario);
    END LOOP;

    p_total_compra := ROUND(p_total_compra, 2);
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        IF c_producto%ISOPEN THEN CLOSE c_producto; END IF;
        IF c_insumo%ISOPEN THEN CLOSE c_insumo; END IF;
        ROLLBACK;
        p_cantidad_lineas := 0;
        p_total_compra := 0;
        RAISE;
END;
/

/* Elimina un pago puntual de PAGO_VENTA mientras la venta sigue en BORRADOR y pertenece al actor. */
CREATE OR REPLACE PROCEDURE SAB_VENTA_QUITAR_PAGO(
    p_actor_id NUMBER, p_venta_id NUMBER, p_pago_id NUMBER
) IS
    CURSOR c_venta IS SELECT estado_venta, id_usuario FROM VENTA
        WHERE id_venta = p_venta_id FOR UPDATE;
    v_venta c_venta%ROWTYPE;
BEGIN
    SAB_VALIDAR_USUARIO(p_actor_id);
    OPEN c_venta; FETCH c_venta INTO v_venta;
    IF c_venta%NOTFOUND THEN
        CLOSE c_venta;
        RAISE_APPLICATION_ERROR(-20117, 'Venta no existe');
    END IF;
    CLOSE c_venta;
    IF v_venta.estado_venta <> 'BORRADOR' OR v_venta.id_usuario <> p_actor_id THEN
        RAISE_APPLICATION_ERROR(-20118, 'No puede modificar pagos de esta venta');
    END IF;
    DELETE FROM PAGO_VENTA
    WHERE id_pago_venta = p_pago_id
      AND id_venta = p_venta_id;
    IF SQL%ROWCOUNT = 0 THEN
        RAISE_APPLICATION_ERROR(-20133, 'Pago no encontrado en esta venta');
    END IF;
    COMMIT;
EXCEPTION WHEN OTHERS THEN ROLLBACK; RAISE;
END;
/
