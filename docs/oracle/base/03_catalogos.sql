-- Registros de referencia del sistema. No incluye cuentas de usuario.

INSERT INTO ROL_USUARIO (id_rol, nombre_rol, descripcion_rol, estado_activo)
VALUES (SEQ_ROL_USUARIO.NEXTVAL, 'DUENO', 'Acceso completo al sistema', 'S');
INSERT INTO ROL_USUARIO (id_rol, nombre_rol, descripcion_rol, estado_activo)
VALUES (SEQ_ROL_USUARIO.NEXTVAL, 'VENDEDOR', 'Ventas y apertura/cierre de caja', 'S');

INSERT INTO METODO_PAGO (id_metodo_pago, nombre_metodo, requiere_comprobante)
VALUES (SEQ_METODO_PAGO.NEXTVAL, 'EFECTIVO', 'N');
INSERT INTO METODO_PAGO (id_metodo_pago, nombre_metodo, requiere_comprobante)
VALUES (SEQ_METODO_PAGO.NEXTVAL, 'TARJETA', 'S');
INSERT INTO METODO_PAGO (id_metodo_pago, nombre_metodo, requiere_comprobante)
VALUES (SEQ_METODO_PAGO.NEXTVAL, 'TRANSFERENCIA', 'S');

INSERT INTO CATEGORIA_PRODUCTO (id_categoria, nombre_categoria, descripcion_categoria)
VALUES (SEQ_CATEGORIA_PRODUCTO.NEXTVAL, 'PAN', 'Panes por kilogramo o unidad');
INSERT INTO CATEGORIA_PRODUCTO (id_categoria, nombre_categoria, descripcion_categoria)
VALUES (SEQ_CATEGORIA_PRODUCTO.NEXTVAL, 'PASTELES', 'Pasteles vendidos por unidad');
INSERT INTO CATEGORIA_PRODUCTO (id_categoria, nombre_categoria, descripcion_categoria)
VALUES (SEQ_CATEGORIA_PRODUCTO.NEXTVAL, 'BEBIDAS', 'Bebidas vendidas por unidad');
INSERT INTO CATEGORIA_PRODUCTO (id_categoria, nombre_categoria, descripcion_categoria)
VALUES (SEQ_CATEGORIA_PRODUCTO.NEXTVAL, 'ABARROTES', 'Abarrotes vendidos por unidad');

INSERT INTO UNIDAD_MEDIDA (id_unidad, codigo_unidad, nombre_unidad, permite_decimales)
VALUES (SEQ_UNIDAD_MEDIDA.NEXTVAL, 'UN', 'UNIDAD', 'N');
INSERT INTO UNIDAD_MEDIDA (id_unidad, codigo_unidad, nombre_unidad, permite_decimales)
VALUES (SEQ_UNIDAD_MEDIDA.NEXTVAL, 'KG', 'KILOGRAMO', 'S');

INSERT INTO TIPO_AJUSTE_STOCK (id_tipo_ajuste, nombre_tipo_ajuste, factor_operacion)
VALUES (SEQ_TIPO_AJUSTE_STOCK.NEXTVAL, 'INGRESO_MANUAL', 1);
INSERT INTO TIPO_AJUSTE_STOCK (id_tipo_ajuste, nombre_tipo_ajuste, factor_operacion)
VALUES (SEQ_TIPO_AJUSTE_STOCK.NEXTVAL, 'MERMA', -1);

INSERT INTO MARCA (id_marca, nombre_marca, origen_elaboracion)
VALUES (SEQ_MARCA.NEXTVAL, 'SIN MARCA', 'SIN ESPECIFICAR');
INSERT INTO MARCA (id_marca, nombre_marca, origen_elaboracion)
VALUES (SEQ_MARCA.NEXTVAL, 'SABOTINO', 'ELABORACION PROPIA');

COMMIT;
