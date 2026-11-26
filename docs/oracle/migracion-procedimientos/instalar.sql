-- Ejecutar como propietario del esquema SABOTINO desde SQL*Plus o SQL Developer (modo script).
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

BEGIN
  IF USER IN ('SYS', 'SYSTEM') OR USER <> SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
     OR SYS_CONTEXT('USERENV', 'CON_NAME') IN ('CDB$ROOT', 'PDB$SEED')
     OR DBMS_TRANSACTION.LOCAL_TRANSACTION_ID IS NOT NULL THEN
    RAISE_APPLICATION_ERROR(-20795, 'Conecta como propietario en la PDB y usa una sesión sin transacción activa');
  END IF;
END;
/

@@../base/05_mantenedores.sql
@@../base/06_gestores.sql
@@instalar_api.sql
@@retirar_5_obsoletos.sql
@@verificar.sql
