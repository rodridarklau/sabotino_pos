-- Ejecutar como propietario del esquema SABOTINO desde SQL*Plus o SQL Developer (modo script).
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE

@@01_acceso.sql
@@02_caja.sql
@@03_ventas.sql
@@04_productos_y_diagnostico.sql
@@05_compras_y_stock.sql
@@06_inventario.sql
@@07_vendedores.sql
@@08_inicio_e_imagenes.sql
@@09_reportes.sql

@@verificar.sql
