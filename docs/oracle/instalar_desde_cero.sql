-- Conectarse como propietario de un esquema vacío en la PDB de destino.
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT FAILURE ROLLBACK

DECLARE
  l_objetos NUMBER;
BEGIN
  SELECT COUNT(*) INTO l_objetos FROM USER_OBJECTS;
  IF USER IN ('SYS', 'SYSTEM') OR USER <> SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
     OR SYS_CONTEXT('USERENV', 'CON_NAME') IN ('CDB$ROOT', 'PDB$SEED') OR l_objetos <> 0 THEN
    RAISE_APPLICATION_ERROR(-20791, 'Conéctate como propietario de un esquema vacío en una PDB de trabajo');
  END IF;
END;
/

@@base/01_tablas.sql
@@base/02_secuencias.sql
@@base/03_catalogos.sql
@@base/04_funciones_y_seguridad.sql
@@base/05_mantenedores.sql
@@base/06_gestores.sql
@@base/07_reportes.sql
@@base/08_triggers.sql
@@base/09_consultas_interfaz.sql

DECLARE
  l_invalidos NUMBER;
  l_tipo VARCHAR2(30);
  l_cantidad NUMBER;
  PROCEDURE contar(p_tipo IN VARCHAR2, p_esperados IN NUMBER) IS
  BEGIN
    l_tipo := p_tipo;
    SELECT COUNT(*) INTO l_cantidad FROM USER_OBJECTS WHERE OBJECT_TYPE = l_tipo;
    IF l_cantidad <> p_esperados THEN
      RAISE_APPLICATION_ERROR(-20792, p_tipo || ': ' || l_cantidad || ' de ' || p_esperados);
    END IF;
  END;
BEGIN
  contar('TABLE', 21);
  contar('SEQUENCE', 21);
  contar('PROCEDURE', 75);
  contar('FUNCTION', 2);
  contar('TRIGGER', 8);

  SELECT COUNT(*) INTO l_invalidos FROM USER_OBJECTS WHERE STATUS <> 'VALID';
  IF l_invalidos > 0 THEN
    FOR error IN (
      SELECT NAME, TYPE, LINE, POSITION, TEXT
      FROM USER_ERRORS WHERE ATTRIBUTE = 'ERROR'
      ORDER BY NAME, TYPE, SEQUENCE
    ) LOOP
      DBMS_OUTPUT.PUT_LINE(error.NAME || ':' || error.LINE || ':' || error.POSITION || ' ' || error.TEXT);
    END LOOP;
    RAISE_APPLICATION_ERROR(-20793, 'Objetos inválidos en el esquema base: ' || l_invalidos);
  END IF;
  DBMS_OUTPUT.PUT_LINE('Base válida: 21 tablas, 21 secuencias, 75 procedimientos, 2 funciones y 8 triggers.');
END;
/

@@migracion-procedimientos/instalar_api.sql
