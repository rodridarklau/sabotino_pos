-- 08 TRIGGERS

-- Restricciones adicionales para preservar la integridad histórica.

/* Lo que hace el siguiente trigger es comprobar automaticamente, antes de guardar
un producto, que su stock actual y critico sean cantidades enteras cuando la
unidad de medida no permite decimales. */
CREATE OR REPLACE TRIGGER SAB_TRG_PRODUCTO_UNIDAD
BEFORE INSERT OR UPDATE OF stock_actual,stock_critico,id_unidad ON PRODUCTO
FOR EACH ROW
DECLARE
    v_decimales UNIDAD_MEDIDA.permite_decimales%TYPE;
BEGIN
    SELECT permite_decimales INTO v_decimales FROM UNIDAD_MEDIDA
    WHERE id_unidad=:NEW.id_unidad;
    IF v_decimales='N' AND
       (:NEW.stock_actual <> TRUNC(:NEW.stock_actual)
        OR :NEW.stock_critico <> TRUNC(:NEW.stock_critico)) THEN
        RAISE_APPLICATION_ERROR(-20301,'Stock por unidad requiere enteros');
    END IF;
END;
/

/* Lo que hace el siguiente trigger es impedir que una venta CONFIRMADA o ANULADA
sea modificada o eliminada. Protege la informacion historica de las ventas
una vez finalizadas. */
CREATE OR REPLACE TRIGGER SAB_TRG_VENTA_INMUTABLE
BEFORE UPDATE OR DELETE ON VENTA
FOR EACH ROW
BEGIN
    IF :OLD.estado_venta IN ('CONFIRMADA','ANULADA') THEN
        RAISE_APPLICATION_ERROR(-20302,'Venta finalizada no puede alterarse');
    END IF;
END;
/

/* Lo que hace el siguiente trigger es permitir agregar, actualizar o eliminar
detalles solo cuando la venta esta en BORRADOR. Tambien impide trasladar
un detalle de una venta a otra. */
CREATE OR REPLACE TRIGGER SAB_TRG_DETALLE_INMUTABLE
BEFORE INSERT OR UPDATE OR DELETE ON DETALLE_VENTA
FOR EACH ROW
DECLARE
    v_venta_id VENTA.id_venta%TYPE;
    v_estado VENTA.estado_venta%TYPE;
BEGIN
    IF DELETING THEN v_venta_id:=:OLD.id_venta;
    ELSE v_venta_id:=:NEW.id_venta; END IF;
    IF UPDATING AND :OLD.id_venta<>:NEW.id_venta THEN
        RAISE_APPLICATION_ERROR(-20303,'No cambiar detalle de venta a otra venta');
    END IF;
    SELECT estado_venta INTO v_estado FROM VENTA WHERE id_venta=v_venta_id;
    IF v_estado<>'BORRADOR' THEN
        RAISE_APPLICATION_ERROR(-20304,'Detalle solo editable en borradores');
    END IF;
END;
/

/* Lo que hace el siguiente trigger es permitir cambios de pagos unicamente
mientras la venta esta en BORRADOR. Tambien impide mover un pago a otra venta,
para conservar el historial de las ventas terminadas. */
CREATE OR REPLACE TRIGGER SAB_TRG_PAGO_INMUTABLE
BEFORE INSERT OR UPDATE OR DELETE ON PAGO_VENTA
FOR EACH ROW
DECLARE
    v_venta_id VENTA.id_venta%TYPE;
    v_estado VENTA.estado_venta%TYPE;
BEGIN
    IF DELETING THEN v_venta_id:=:OLD.id_venta;
    ELSE v_venta_id:=:NEW.id_venta; END IF;
    IF UPDATING AND :OLD.id_venta<>:NEW.id_venta THEN
        RAISE_APPLICATION_ERROR(-20305,'No cambiar pago de venta a otra venta');
    END IF;
    SELECT estado_venta INTO v_estado FROM VENTA WHERE id_venta=v_venta_id;
    IF v_estado<>'BORRADOR' THEN
        RAISE_APPLICATION_ERROR(-20306,'Pago solo editable en borradores');
    END IF;
END;
/

/* Lo que hace el siguiente trigger es impedir modificaciones o eliminaciones
de turnos de caja que ya estan CERRADOS, protegiendo sus saldos y registros
historicos. */
CREATE OR REPLACE TRIGGER SAB_TRG_TURNO_INMUTABLE
BEFORE UPDATE OR DELETE ON TURNO_CAJA
FOR EACH ROW
BEGIN
    IF :OLD.estado_turno='CERRADO' THEN
        RAISE_APPLICATION_ERROR(-20307,'Un turno cerrado no puede modificarse');
    END IF;
END;
/

-- Impide cambiar el tipo de un método asociado a pagos registrados.
/* Lo que hace el siguiente trigger es impedir crear, modificar o eliminar
metodos de pago. EFECTIVO, TARJETA y TRANSFERENCIA forman un catalogo fijo
que se utiliza para calcular correctamente el cierre de caja. */
CREATE OR REPLACE TRIGGER SAB_TRG_METODO_HISTORICO
BEFORE INSERT OR UPDATE OR DELETE ON METODO_PAGO
BEGIN
    RAISE_APPLICATION_ERROR(-20541,
        'Los metodos EFECTIVO, TARJETA y TRANSFERENCIA son fijos');
END;
/
-- Impide cambiar el signo de un ajuste ya utilizado.
/* Lo que hace el siguiente trigger es impedir cambiar el factor de un tipo de
ajuste de inventario cuando ya fue usado. Asi los movimientos historicos
conservan el mismo sentido de aumento o disminucion de stock. */
CREATE OR REPLACE TRIGGER SAB_TRG_TIPO_AJUSTE_HISTORICO
BEFORE UPDATE OF factor_operacion ON TIPO_AJUSTE_STOCK
FOR EACH ROW
DECLARE
    v_usos NUMBER;
BEGIN
    IF :OLD.factor_operacion<>:NEW.factor_operacion THEN
        SELECT COUNT(*) INTO v_usos FROM AJUSTE_INVENTARIO
        WHERE id_tipo_ajuste=:OLD.id_tipo_ajuste;
        IF v_usos>0 THEN
            RAISE_APPLICATION_ERROR(-20309,'Tipo de ajuste usado: factor inmutable');
        END IF;
    END IF;
END;
/

/* Lo que hace el siguiente trigger es impedir que alguien agregue,
modifique o elimine cargos directamente en ROL_USUARIO. El catalogo queda
fijo con DUENO y VENDEDOR, cargados durante la instalacion. */
CREATE OR REPLACE TRIGGER SAB_TRG_ROLES_FIJOS
BEFORE INSERT OR UPDATE OR DELETE ON ROL_USUARIO
BEGIN
    RAISE_APPLICATION_ERROR(-20520, 'Los cargos DUENO y VENDEDOR son fijos');
END;
/
