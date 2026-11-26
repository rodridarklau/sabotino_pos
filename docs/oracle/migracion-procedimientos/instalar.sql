-- Ejecutar como propietario del esquema SABOTINO desde SQL*Plus o SQL Developer (modo script).
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE

@@../base/05_mantenedores.sql
@@../base/06_gestores.sql
@@instalar_api.sql
