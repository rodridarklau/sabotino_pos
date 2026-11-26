-- Modelo de datos de Sabotino (21 tablas, 3FN Oracle).
-- Cantidades admiten hasta tres decimales; montos, hasta dos.

CREATE TABLE ROL_USUARIO (
    id_rol NUMBER(10),
    nombre_rol VARCHAR2(50) NOT NULL,
    descripcion_rol VARCHAR2(200),
    estado_activo CHAR(1) NOT NULL,
    CONSTRAINT PK_ROL_USUARIO PRIMARY KEY (id_rol),
    CONSTRAINT UQ_ROL_USUARIO_nombre_rol UNIQUE (nombre_rol),
    CONSTRAINT CK_ROL_USUARIO_estado_activo CHECK (estado_activo IN ('S','N')),
    CONSTRAINT CK_ROL_USUARIO_CARGOS_FIJOS CHECK (nombre_rol IN ('DUENO','VENDEDOR') AND estado_activo='S')
);

CREATE TABLE USUARIO (
    id_usuario NUMBER(10),
    id_rol NUMBER(10) NOT NULL,
    rut_usuario VARCHAR2(12) NOT NULL,
    nombre_completo VARCHAR2(100) NOT NULL,
    username VARCHAR2(50) NOT NULL,
    password_hash VARCHAR2(255) NOT NULL,
    estado_usuario CHAR(1) NOT NULL,
    CONSTRAINT PK_USUARIO PRIMARY KEY (id_usuario),
    CONSTRAINT UQ_USUARIO_rut_usuario UNIQUE (rut_usuario),
    CONSTRAINT UQ_USUARIO_username UNIQUE (username),
    CONSTRAINT FK_USUARIO_id_rol FOREIGN KEY (id_rol) REFERENCES ROL_USUARIO(id_rol),
    CONSTRAINT CK_USUARIO_estado_usuario CHECK (estado_usuario IN ('S','N'))
);

CREATE TABLE CAJA_TERMINAL (
    id_caja NUMBER(10),
    nombre_caja VARCHAR2(50) NOT NULL,
    ubicacion VARCHAR2(100),
    estado_operativo CHAR(1) NOT NULL,
    CONSTRAINT PK_CAJA_TERMINAL PRIMARY KEY (id_caja),
    CONSTRAINT UQ_CAJA_TERMINAL_nombre_caja UNIQUE (nombre_caja),
    CONSTRAINT CK_CAJA_TERMINAL_estado_operativo CHECK (estado_operativo IN ('S','N'))
);

CREATE TABLE METODO_PAGO (
    id_metodo_pago NUMBER(10),
    nombre_metodo VARCHAR2(50) NOT NULL,
    requiere_comprobante CHAR(1) NOT NULL,
    CONSTRAINT PK_METODO_PAGO PRIMARY KEY (id_metodo_pago),
    CONSTRAINT UQ_METODO_PAGO_nombre_metodo UNIQUE (nombre_metodo),
    CONSTRAINT CK_METODO_PAGO_nombre CHECK (nombre_metodo IN ('EFECTIVO','TARJETA','TRANSFERENCIA')),
    CONSTRAINT CK_METODO_PAGO_requiere_comprobante CHECK (requiere_comprobante IN ('S','N'))
);

CREATE TABLE CATEGORIA_PRODUCTO (
    id_categoria NUMBER(10),
    nombre_categoria VARCHAR2(50) NOT NULL,
    descripcion_categoria VARCHAR2(200),
    CONSTRAINT PK_CATEGORIA_PRODUCTO PRIMARY KEY (id_categoria),
    CONSTRAINT UQ_CATEGORIA_PRODUCTO_nombre_categoria UNIQUE (nombre_categoria)
);

CREATE TABLE UNIDAD_MEDIDA (
    id_unidad NUMBER(10),
    codigo_unidad VARCHAR2(10) NOT NULL,
    nombre_unidad VARCHAR2(50) NOT NULL,
    permite_decimales CHAR(1) NOT NULL,
    CONSTRAINT PK_UNIDAD_MEDIDA PRIMARY KEY (id_unidad),
    CONSTRAINT UQ_UNIDAD_MEDIDA_codigo_unidad UNIQUE (codigo_unidad),
    CONSTRAINT CK_UNIDAD_MEDIDA_permite_decimales CHECK (permite_decimales IN ('S','N'))
);

CREATE TABLE MARCA (
    id_marca NUMBER(10),
    nombre_marca VARCHAR2(80) NOT NULL,
    origen_elaboracion VARCHAR2(50) NOT NULL,
    CONSTRAINT PK_MARCA PRIMARY KEY (id_marca),
    CONSTRAINT UQ_MARCA_nombre_marca UNIQUE (nombre_marca)
);

CREATE TABLE PRODUCTO (
    id_producto NUMBER(10),
    id_categoria NUMBER(10) NOT NULL,
    id_unidad NUMBER(10) NOT NULL,
    id_marca NUMBER(10) NOT NULL,
    codigo_barra VARCHAR2(50) NOT NULL,
    nombre_producto VARCHAR2(100) NOT NULL,
    costo_produccion_actual NUMBER(14,2) NOT NULL,
    precio_venta_actual NUMBER(14,2) NOT NULL,
    stock_actual NUMBER(12,3) NOT NULL,
    stock_critico NUMBER(12,3) NOT NULL,
    estado_producto CHAR(1) NOT NULL,
    CONSTRAINT PK_PRODUCTO PRIMARY KEY (id_producto),
    CONSTRAINT UQ_PRODUCTO_codigo_barra UNIQUE (codigo_barra),
    CONSTRAINT FK_PRODUCTO_id_categoria FOREIGN KEY (id_categoria) REFERENCES CATEGORIA_PRODUCTO(id_categoria),
    CONSTRAINT FK_PRODUCTO_id_unidad FOREIGN KEY (id_unidad) REFERENCES UNIDAD_MEDIDA(id_unidad),
    CONSTRAINT FK_PRODUCTO_id_marca FOREIGN KEY (id_marca) REFERENCES MARCA(id_marca),
    CONSTRAINT CK_PRODUCTO_costo_produccion_actual CHECK (costo_produccion_actual >= 0),
    CONSTRAINT CK_PRODUCTO_precio_venta_actual CHECK (precio_venta_actual >= 0),
    CONSTRAINT CK_PRODUCTO_stock_actual CHECK (stock_actual >= 0),
    CONSTRAINT CK_PRODUCTO_stock_critico CHECK (stock_critico >= 0),
    CONSTRAINT CK_PRODUCTO_estado_producto CHECK (estado_producto IN ('S','N'))
);

CREATE TABLE TIPO_AJUSTE_STOCK (
    id_tipo_ajuste NUMBER(10),
    nombre_tipo_ajuste VARCHAR2(60) NOT NULL,
    factor_operacion NUMBER(2) NOT NULL,
    CONSTRAINT PK_TIPO_AJUSTE_STOCK PRIMARY KEY (id_tipo_ajuste),
    CONSTRAINT UQ_TIPO_AJUSTE_STOCK_nombre_tipo_ajuste UNIQUE (nombre_tipo_ajuste),
    CONSTRAINT CK_TIPO_AJUSTE_STOCK_factor_operacion CHECK (factor_operacion IN (-1,1))
);

CREATE TABLE PROVEEDOR (
    id_proveedor NUMBER(10),
    rut_proveedor VARCHAR2(12) NOT NULL,
    razon_social VARCHAR2(120) NOT NULL,
    telefono VARCHAR2(20),
    email_contacto VARCHAR2(100),
    CONSTRAINT PK_PROVEEDOR PRIMARY KEY (id_proveedor),
    CONSTRAINT UQ_PROVEEDOR_rut_proveedor UNIQUE (rut_proveedor)
);

CREATE TABLE INSUMO (
    id_insumo NUMBER(10),
    id_unidad NUMBER(10) NOT NULL,
    id_proveedor NUMBER(10) NOT NULL,
    nombre_insumo VARCHAR2(100) NOT NULL,
    costo_unitario NUMBER(14,2) NOT NULL,
    stock_actual NUMBER(12,3) NOT NULL,
    stock_critico NUMBER(12,3) NOT NULL,
    estado_activo CHAR(1) NOT NULL,
    CONSTRAINT PK_INSUMO PRIMARY KEY (id_insumo),
    CONSTRAINT UQ_INSUMO_nombre UNIQUE (nombre_insumo),
    CONSTRAINT FK_INSUMO_id_unidad FOREIGN KEY (id_unidad) REFERENCES UNIDAD_MEDIDA(id_unidad),
    CONSTRAINT FK_INSUMO_id_proveedor FOREIGN KEY (id_proveedor) REFERENCES PROVEEDOR(id_proveedor),
    CONSTRAINT CK_INSUMO_costo CHECK (costo_unitario >= 0),
    CONSTRAINT CK_INSUMO_stock CHECK (stock_actual >= 0),
    CONSTRAINT CK_INSUMO_stock_critico CHECK (stock_critico >= 0),
    CONSTRAINT CK_INSUMO_estado CHECK (estado_activo IN ('S','N'))
);

CREATE TABLE HORARIO_VENDEDOR (
    id_horario NUMBER(10),
    id_usuario NUMBER(10) NOT NULL,
    id_caja NUMBER(10) NOT NULL,
    dia_semana VARCHAR2(15) NOT NULL,
    hora_inicio VARCHAR2(5) NOT NULL,
    hora_fin VARCHAR2(5) NOT NULL,
    estado_activo CHAR(1) NOT NULL,
    CONSTRAINT PK_HORARIO_VENDEDOR PRIMARY KEY (id_horario),
    CONSTRAINT FK_HORARIO_VEND_id_usuario FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario),
    CONSTRAINT FK_HORARIO_VEND_id_caja FOREIGN KEY (id_caja) REFERENCES CAJA_TERMINAL(id_caja),
    CONSTRAINT CK_HORARIO_VEND_dia CHECK (dia_semana IN ('LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO')),
    CONSTRAINT CK_HORARIO_VEND_hora_ini CHECK (REGEXP_LIKE(hora_inicio, '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
    CONSTRAINT CK_HORARIO_VEND_hora_fin CHECK (REGEXP_LIKE(hora_fin, '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
    CONSTRAINT CK_HORARIO_VEND_rango CHECK (hora_fin > hora_inicio),
    CONSTRAINT CK_HORARIO_VEND_estado CHECK (estado_activo IN ('S','N'))
);

CREATE TABLE TURNO_CAJA (
    id_turno_caja NUMBER(12),
    id_caja NUMBER(10) NOT NULL,
    id_usuario_apertura NUMBER(10) NOT NULL,
    id_usuario_cierre NUMBER(10),
    fecha_hora_apertura TIMESTAMP NOT NULL,
    fecha_hora_cierre TIMESTAMP,
    inicial_efectivo NUMBER(14,2) NOT NULL,
    inicial_tarjeta NUMBER(14,2) NOT NULL,
    inicial_transferencia NUMBER(14,2) NOT NULL,
    cierre_sistema_efectivo NUMBER(14,2),
    cierre_sistema_tarjeta NUMBER(14,2),
    cierre_sistema_transferencia NUMBER(14,2),
    cierre_real_efectivo NUMBER(14,2),
    cierre_real_tarjeta NUMBER(14,2),
    cierre_real_transferencia NUMBER(14,2),
    estado_turno VARCHAR2(20) NOT NULL,
    CONSTRAINT PK_TURNO_CAJA PRIMARY KEY (id_turno_caja),
    CONSTRAINT FK_TURNO_CAJA_id_caja FOREIGN KEY (id_caja) REFERENCES CAJA_TERMINAL(id_caja),
    CONSTRAINT FK_TURNO_CAJA_id_usuario_apertura FOREIGN KEY (id_usuario_apertura) REFERENCES USUARIO(id_usuario),
    CONSTRAINT FK_TURNO_CAJA_id_usuario_cierre FOREIGN KEY (id_usuario_cierre) REFERENCES USUARIO(id_usuario),
    CONSTRAINT CK_TURNO_CAJA_estado CHECK (estado_turno IN ('ABIERTO','CERRADO')),
    CONSTRAINT CK_TURNO_CAJA_inicial CHECK (inicial_efectivo >= 0 AND inicial_tarjeta >= 0 AND inicial_transferencia >= 0),
    CONSTRAINT CK_TURNO_CAJA_cierre CHECK (
       (estado_turno = 'ABIERTO' AND fecha_hora_cierre IS NULL AND id_usuario_cierre IS NULL)
       OR (estado_turno = 'CERRADO' AND fecha_hora_cierre IS NOT NULL AND id_usuario_cierre IS NOT NULL))
);

CREATE TABLE VENTA (
    id_venta NUMBER(15),
    id_turno_caja NUMBER(12) NOT NULL,
    id_usuario NUMBER(10) NOT NULL,
    fecha_hora_venta TIMESTAMP NOT NULL,
    total_venta NUMBER(14,2) NOT NULL,
    estado_venta VARCHAR2(20) NOT NULL,
    CONSTRAINT PK_VENTA PRIMARY KEY (id_venta),
    CONSTRAINT FK_VENTA_id_turno_caja FOREIGN KEY (id_turno_caja) REFERENCES TURNO_CAJA(id_turno_caja),
    CONSTRAINT FK_VENTA_id_usuario FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario),
    CONSTRAINT CK_VENTA_total_venta CHECK (total_venta >= 0),
    CONSTRAINT CK_VENTA_estado CHECK (estado_venta IN ('BORRADOR','CONFIRMADA','ANULADA'))
);

CREATE TABLE PAGO_VENTA (
    id_pago_venta NUMBER(15),
    id_venta NUMBER(15) NOT NULL,
    id_metodo_pago NUMBER(10) NOT NULL,
    monto_pagado NUMBER(14,2) NOT NULL,
    codigo_comprobante VARCHAR2(50),
    CONSTRAINT PK_PAGO_VENTA PRIMARY KEY (id_pago_venta),
    CONSTRAINT FK_PAGO_VENTA_id_venta FOREIGN KEY (id_venta) REFERENCES VENTA(id_venta),
    CONSTRAINT FK_PAGO_VENTA_id_metodo_pago FOREIGN KEY (id_metodo_pago) REFERENCES METODO_PAGO(id_metodo_pago),
    CONSTRAINT CK_PAGO_VENTA_monto_pagado CHECK (monto_pagado > 0)
);

CREATE TABLE DETALLE_VENTA (
    id_detalle_venta NUMBER(15),
    id_venta NUMBER(15) NOT NULL,
    id_producto NUMBER(10) NOT NULL,
    cantidad NUMBER(12,3) NOT NULL,
    costo_unitario_historico NUMBER(14,2) NOT NULL,
    precio_unitario_historico NUMBER(14,2) NOT NULL,
    subtotal_linea NUMBER(14,2) NOT NULL,
    CONSTRAINT PK_DETALLE_VENTA PRIMARY KEY (id_detalle_venta),
    CONSTRAINT FK_DETALLE_VENTA_id_venta FOREIGN KEY (id_venta) REFERENCES VENTA(id_venta),
    CONSTRAINT FK_DETALLE_VENTA_id_producto FOREIGN KEY (id_producto) REFERENCES PRODUCTO(id_producto),
    CONSTRAINT CK_DETALLE_VENTA_cantidad CHECK (cantidad > 0),
    CONSTRAINT CK_DETALLE_VENTA_costo_unitario_historico CHECK (costo_unitario_historico >= 0),
    CONSTRAINT CK_DETALLE_VENTA_precio_unitario_historico CHECK (precio_unitario_historico >= 0),
    CONSTRAINT CK_DETALLE_VENTA_subtotal_linea CHECK (subtotal_linea >= 0)
);

CREATE TABLE AJUSTE_INVENTARIO (
    id_ajuste NUMBER(12),
    id_producto NUMBER(10) NOT NULL,
    id_usuario NUMBER(10) NOT NULL,
    id_tipo_ajuste NUMBER(10) NOT NULL,
    fecha_hora_ajuste TIMESTAMP NOT NULL,
    cantidad_ajustada NUMBER(12,3) NOT NULL,
    observacion VARCHAR2(250),
    CONSTRAINT PK_AJUSTE_INVENTARIO PRIMARY KEY (id_ajuste),
    CONSTRAINT FK_AJUSTE_INVENTARIO_id_producto FOREIGN KEY (id_producto) REFERENCES PRODUCTO(id_producto),
    CONSTRAINT FK_AJUSTE_INVENTARIO_id_usuario FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario),
    CONSTRAINT FK_AJUSTE_INVENTARIO_id_tipo_ajuste FOREIGN KEY (id_tipo_ajuste) REFERENCES TIPO_AJUSTE_STOCK(id_tipo_ajuste),
    CONSTRAINT CK_AJUSTE_INVENTARIO_cantidad_ajustada CHECK (cantidad_ajustada > 0)
);

CREATE TABLE ABASTECIMIENTO_PROVEEDOR (
    id_abastecimiento NUMBER(12),
    id_proveedor NUMBER(10) NOT NULL,
    id_producto NUMBER(10) NOT NULL,
    id_usuario NUMBER(10) NOT NULL,
    fecha_compra TIMESTAMP NOT NULL,
    cantidad_comprada NUMBER(12,3) NOT NULL,
    costo_unitario_compra NUMBER(14,2) NOT NULL,
    CONSTRAINT PK_ABASTECIMIENTO_PROVEEDOR PRIMARY KEY (id_abastecimiento),
    CONSTRAINT FK_ABASTECIMIENTO_PROVEEDOR_id_proveedor FOREIGN KEY (id_proveedor) REFERENCES PROVEEDOR(id_proveedor),
    CONSTRAINT FK_ABASTECIMIENTO_PROVEEDOR_id_producto FOREIGN KEY (id_producto) REFERENCES PRODUCTO(id_producto),
    CONSTRAINT FK_ABASTECIMIENTO_PROVEEDOR_id_usuario FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario),
    CONSTRAINT CK_ABASTECIMIENTO_PROVEEDOR_cantidad_comprada CHECK (cantidad_comprada > 0),
    CONSTRAINT CK_ABASTECIMIENTO_PROVEEDOR_costo_unitario_compra CHECK (costo_unitario_compra >= 0)
);

CREATE TABLE LOG_SESION_USUARIO (
    id_log_sesion NUMBER(15),
    id_usuario NUMBER(10) NOT NULL,
    tipo_evento VARCHAR2(20) NOT NULL,
    fecha_hora_evento TIMESTAMP NOT NULL,
    detalle_acceso VARCHAR2(150),
    CONSTRAINT PK_LOG_SESION_USUARIO PRIMARY KEY (id_log_sesion),
    CONSTRAINT FK_LOG_SESION_USUARIO_id_usuario FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario),
    CONSTRAINT CK_LOG_SESION_USUARIO_tipo CHECK (tipo_evento IN ('LOGIN','LOGOUT','LOGIN_FALLIDO'))
);

CREATE TABLE LOG_AUDITORIA_CAJA (
    id_log_caja NUMBER(15),
    id_turno_caja NUMBER(12) NOT NULL,
    id_usuario NUMBER(10) NOT NULL,
    tipo_operacion VARCHAR2(20) NOT NULL,
    fecha_hora_registro TIMESTAMP NOT NULL,
    inicial_efectivo NUMBER(14,2) NOT NULL,
    inicial_tarjeta NUMBER(14,2) NOT NULL,
    inicial_transferencia NUMBER(14,2) NOT NULL,
    cierre_sistema_efectivo NUMBER(14,2),
    cierre_real_efectivo NUMBER(14,2),
    cierre_sistema_tarjeta NUMBER(14,2),
    cierre_real_tarjeta NUMBER(14,2),
    cierre_sistema_transferencia NUMBER(14,2),
    cierre_real_transferencia NUMBER(14,2),
    descuadre_total NUMBER(14,2),
    CONSTRAINT PK_LOG_AUDITORIA_CAJA PRIMARY KEY (id_log_caja),
    CONSTRAINT FK_LOG_AUDITORIA_CAJA_id_turno_caja FOREIGN KEY (id_turno_caja) REFERENCES TURNO_CAJA(id_turno_caja),
    CONSTRAINT FK_LOG_AUDITORIA_CAJA_id_usuario FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario),
    CONSTRAINT CK_LOG_AUDITORIA_CAJA_tipo CHECK (tipo_operacion IN ('APERTURA','CIERRE'))
);

CREATE TABLE LOG_CAMBIO_PRODUCTO (
    id_log_producto NUMBER(15),
    id_producto NUMBER(10) NOT NULL,
    id_usuario_responsable NUMBER(10) NOT NULL,
    accion_realizada VARCHAR2(30) NOT NULL,
    costo_anterior NUMBER(14,2),
    costo_nuevo NUMBER(14,2),
    precio_anterior NUMBER(14,2),
    precio_nuevo NUMBER(14,2),
    stock_anterior NUMBER(12,3),
    stock_nuevo NUMBER(12,3),
    fecha_hora_cambio TIMESTAMP NOT NULL,
    CONSTRAINT PK_LOG_CAMBIO_PRODUCTO PRIMARY KEY (id_log_producto),
    CONSTRAINT FK_LOG_CAMBIO_PRODUCTO_id_producto FOREIGN KEY (id_producto) REFERENCES PRODUCTO(id_producto),
    CONSTRAINT FK_LOG_CAMBIO_PRODUCTO_id_usuario_responsable FOREIGN KEY (id_usuario_responsable) REFERENCES USUARIO(id_usuario)
);
