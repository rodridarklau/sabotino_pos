-- Ejecutar como propietario en una sesión dedicada, con la API vigente instalada.
SET DEFINE OFF
SET SERVEROUTPUT ON
WHENEVER OSERROR EXIT FAILURE ROLLBACK
WHENEVER SQLERROR EXIT FAILURE ROLLBACK

DECLARE
  l_objetivos SYS.ODCIVARCHAR2LIST := SYS.ODCIVARCHAR2LIST(
    'SAB_BUSCAR_CREDENCIALES',
    'SAB_L_CATALOGO_VENTA',
    'SAB_UI_L_RESUMEN_VENTA',
    'SAB_UI_L_DETALLE_VENTA',
    'SAB_UI_L_PAGOS_VENTA'
  );
  l_presentes SYS.ODCIVARCHAR2LIST;
  l_total PLS_INTEGER;
  l_validos PLS_INTEGER;
  l_reemplazos PLS_INTEGER;
  l_bloqueado BOOLEAN := FALSE;
  l_patron VARCHAR2(256);
BEGIN
  IF USER IN ('SYS', 'SYSTEM') OR USER <> SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
     OR SYS_CONTEXT('USERENV', 'CON_NAME') IN ('CDB$ROOT', 'PDB$SEED')
     OR DBMS_TRANSACTION.LOCAL_TRANSACTION_ID IS NOT NULL THEN
    RAISE_APPLICATION_ERROR(-20795, 'Conecta como propietario en la PDB y usa una sesión sin transacción activa');
  END IF;

  SELECT OBJECT_NAME BULK COLLECT INTO l_presentes FROM USER_OBJECTS
  WHERE OBJECT_TYPE = 'PROCEDURE' AND OBJECT_NAME IN (SELECT COLUMN_VALUE FROM TABLE(l_objetivos))
  ORDER BY OBJECT_NAME;

  IF l_presentes.COUNT = 0 THEN
    DBMS_OUTPUT.PUT_LINE('Los cinco procedimientos sustituidos ya están ausentes.');
    RETURN;
  END IF;

  SELECT COUNT(*), COUNT(CASE WHEN STATUS = 'VALID' THEN 1 END)
  INTO l_total, l_validos
  FROM USER_OBJECTS
  WHERE OBJECT_TYPE = 'PROCEDURE' AND SUBSTR(OBJECT_NAME, 1, 4) = 'SAB_'
    AND OBJECT_NAME NOT IN (SELECT COLUMN_VALUE FROM TABLE(l_objetivos));

  SELECT COUNT(*) INTO l_reemplazos FROM USER_OBJECTS
  WHERE OBJECT_TYPE = 'PROCEDURE' AND STATUS = 'VALID' AND OBJECT_NAME IN (
    'SAB_API_CREDENCIALES', 'SAB_API_VENTA_CATALOGO', 'SAB_API_VENTA_CABECERA',
    'SAB_API_VENTA_DETALLE', 'SAB_API_VENTA_PAGOS'
  );
  IF l_total <> 149 OR l_validos <> 149 OR l_reemplazos <> 5 THEN
    RAISE_APPLICATION_ERROR(-20799, 'Antes del retiro deben estar válidos los 149 procedimientos vigentes y los cinco reemplazos');
  END IF;

  -- Examinar todos los objetivos antes del primer DDL.
  FOR objetivo IN (SELECT COLUMN_VALUE AS NOMBRE FROM TABLE(l_presentes)) LOOP
    l_patron := '(^|[^[:alnum:]_$#])' || objetivo.NOMBRE || '($|[^[:alnum:]_$#])';
    FOR bloqueo IN (
      SELECT 'dependencia ' || OWNER || '.' || NAME || ' (' || TYPE || ')' AS MOTIVO
      FROM ALL_DEPENDENCIES
      WHERE REFERENCED_OWNER = USER AND REFERENCED_TYPE = 'PROCEDURE'
        AND REFERENCED_NAME = objetivo.NOMBRE
        AND (OWNER <> USER OR NAME <> objetivo.NOMBRE OR TYPE <> 'PROCEDURE')
      UNION ALL
      SELECT 'sinónimo ' || OWNER || '.' || SYNONYM_NAME FROM ALL_SYNONYMS
      WHERE TABLE_OWNER = USER AND DB_LINK IS NULL AND TABLE_NAME = objetivo.NOMBRE
      UNION ALL
      SELECT 'permiso EXECUTE de ' || GRANTEE FROM USER_TAB_PRIVS_MADE
      WHERE TABLE_NAME = objetivo.NOMBRE AND PRIVILEGE = 'EXECUTE'
      UNION ALL
      SELECT 'referencia en ' || TYPE || ' ' || NAME || ', línea ' || LINE FROM USER_SOURCE
      WHERE (NAME <> objetivo.NOMBRE OR TYPE <> 'PROCEDURE') AND REGEXP_LIKE(TEXT, l_patron, 'i')
      UNION ALL
      SELECT 'tarea ' || JOB_NAME FROM USER_SCHEDULER_JOBS WHERE REGEXP_LIKE(JOB_ACTION, l_patron, 'i')
      UNION ALL
      SELECT 'programa ' || PROGRAM_NAME FROM USER_SCHEDULER_PROGRAMS WHERE REGEXP_LIKE(PROGRAM_ACTION, l_patron, 'i')
      UNION ALL
      SELECT 'tarea DBMS_JOB ' || JOB FROM USER_JOBS WHERE REGEXP_LIKE(WHAT, l_patron, 'i')
    ) LOOP
      DBMS_OUTPUT.PUT_LINE(objetivo.NOMBRE || ': ' || bloqueo.MOTIVO);
      l_bloqueado := TRUE;
    END LOOP;
  END LOOP;
  IF l_bloqueado THEN
    RAISE_APPLICATION_ERROR(-20796, 'Retiro cancelado: revisa las dependencias y referencias indicadas');
  END IF;

  FOR i IN 1 .. l_presentes.COUNT LOOP
    EXECUTE IMMEDIATE 'DROP PROCEDURE ' || l_presentes(i);
    DBMS_OUTPUT.PUT_LINE('Retirado: ' || l_presentes(i));
  END LOOP;
END;
/
