-- SQL Developer: ejecutar por bloques o como script (F5).
-- Sustituir REEMPLAZAR por el propietario confirmado, con la grafía del diccionario.
-- Los comandos DEFINE, SET y PROMPT son del cliente. Las sentencias SQL son SELECT.
DEFINE propietario = REEMPLAZAR
SET LONG 2000000
SET LONGCHUNKSIZE 32767

PROMPT 01 Contexto de la sesion e identificacion del propietario
SELECT sys_context('USERENV','SESSION_USER') AS usuario,
       sys_context('USERENV','CURRENT_SCHEMA') AS esquema,
       sys_context('USERENV','CON_NAME') AS contenedor,
       sys_context('USERENV','CURRENT_EDITION_NAME') AS edicion
FROM dual;

SELECT owner, object_name, object_type
FROM all_objects
WHERE object_name IN ('PRODUCTO','SAB_COMPRA_MULTIPLE','SAB_REGISTRAR_DUENO_INICIAL')
ORDER BY owner, object_name, object_type;

PROMPT 02 Inventario y modelo de datos
SELECT owner, object_type, object_name, subobject_name, status, last_ddl_time
FROM all_objects WHERE owner = '&propietario'
ORDER BY object_type, object_name, subobject_name;

SELECT table_name, temporary, duration, partitioned, iot_type
FROM all_tables WHERE owner = '&propietario' ORDER BY table_name;

SELECT table_name, column_id, internal_column_id, column_name, data_type, data_type_owner,
       data_length, data_precision, data_scale, char_used, char_length, nullable,
       hidden_column, virtual_column, identity_column, default_on_null, data_default
FROM all_tab_cols WHERE owner = '&propietario'
ORDER BY table_name, internal_column_id;

SELECT * FROM all_tab_identity_cols WHERE owner = '&propietario' ORDER BY table_name;
SELECT * FROM all_tab_comments WHERE owner = '&propietario' ORDER BY table_name;
SELECT * FROM all_col_comments WHERE owner = '&propietario' ORDER BY table_name, column_name;

PROMPT 03 Restricciones y correspondencia de columnas de cada FK
SELECT c.owner, c.table_name, c.constraint_name, c.constraint_type,
       cc.position, cc.column_name, c.r_owner, c.r_constraint_name,
       p.table_name AS tabla_referenciada, pc.column_name AS columna_referenciada,
       c.delete_rule, c.status, c.validated, c.deferrable, c.deferred,
       c.rely, c.search_condition_vc, c.index_owner, c.index_name
FROM all_constraints c
LEFT JOIN all_cons_columns cc
  ON cc.owner = c.owner AND cc.constraint_name = c.constraint_name
LEFT JOIN all_constraints p
  ON p.owner = c.r_owner AND p.constraint_name = c.r_constraint_name
LEFT JOIN all_cons_columns pc
  ON pc.owner = p.owner AND pc.constraint_name = p.constraint_name AND pc.position = cc.position
WHERE c.owner = '&propietario' OR c.r_owner = '&propietario'
ORDER BY c.owner, c.table_name, c.constraint_name, cc.position;

SELECT table_name, constraint_name, search_condition
FROM all_constraints WHERE owner = '&propietario' AND constraint_type = 'C'
ORDER BY table_name, constraint_name;

SELECT * FROM all_indexes WHERE owner = '&propietario' OR table_owner = '&propietario'
ORDER BY owner, index_name;
SELECT * FROM all_ind_columns WHERE index_owner = '&propietario' OR table_owner = '&propietario'
ORDER BY index_owner, index_name, column_position;
SELECT * FROM all_ind_expressions WHERE index_owner = '&propietario' OR table_owner = '&propietario'
ORDER BY index_owner, index_name, column_position;

PROMPT 04 Triggers, secuencias, rutinas y definiciones
SELECT owner, trigger_name, trigger_type, triggering_event, base_object_type,
       table_owner, table_name, status, when_clause
FROM all_triggers WHERE owner = '&propietario' OR table_owner = '&propietario'
ORDER BY owner, trigger_name;

SELECT * FROM all_sequences WHERE sequence_owner = '&propietario' ORDER BY sequence_name;

SELECT owner, object_name, procedure_name, object_type, subprogram_id, overload,
       authid, deterministic, pipelined, parallel
FROM all_procedures WHERE owner = '&propietario'
ORDER BY object_name, subprogram_id;

SELECT * FROM all_arguments WHERE owner = '&propietario'
ORDER BY package_name, object_name, subprogram_id, sequence;

SELECT owner, name, type, line, text FROM all_source
WHERE owner = '&propietario' ORDER BY name, type, line;

SELECT owner, name, type, sequence, line, position, attribute, text FROM all_errors
WHERE owner = '&propietario' ORDER BY name, type, sequence;

-- Exportar los CLOB completos. El resultado es texto de DDL para revisar.
SELECT object_type, object_name,
       dbms_metadata.get_ddl(
           CASE object_type WHEN 'MATERIALIZED VIEW' THEN 'MATERIALIZED_VIEW' ELSE object_type END,
           object_name, owner
       ) AS ddl
FROM all_objects
WHERE owner = '&propietario'
  AND object_type IN ('TABLE','VIEW','MATERIALIZED VIEW','TRIGGER','SEQUENCE')
  AND generated = 'N'
ORDER BY object_type, object_name;

PROMPT 05 Dependencias, resolución de nombres y automatizaciones
SELECT product, version_full, status FROM product_component_version ORDER BY product;

SELECT * FROM all_dependencies
WHERE owner = '&propietario' OR referenced_owner = '&propietario'
ORDER BY owner, name, type, referenced_owner, referenced_name;

SELECT * FROM all_synonyms
WHERE owner = '&propietario' OR table_owner = '&propietario'
ORDER BY owner, synonym_name;

SELECT owner, db_link FROM all_db_links
WHERE owner IN ('&propietario', 'PUBLIC') ORDER BY owner, db_link;

SELECT owner, job_name, job_type, program_owner, program_name, job_action,
       schedule_owner, schedule_name, repeat_interval, enabled, state
FROM all_scheduler_jobs WHERE owner = '&propietario' ORDER BY job_name;
SELECT * FROM all_scheduler_programs WHERE owner = '&propietario' ORDER BY program_name;
SELECT * FROM all_scheduler_program_args WHERE owner = '&propietario' ORDER BY program_name, argument_position;
SELECT * FROM all_scheduler_job_args WHERE owner = '&propietario' ORDER BY job_name, argument_position;
SELECT * FROM all_scheduler_schedules WHERE owner = '&propietario' ORDER BY schedule_name;
SELECT * FROM all_scheduler_chain_steps WHERE owner = '&propietario' ORDER BY chain_name, step_name;
SELECT * FROM all_scheduler_chain_rules WHERE owner = '&propietario' ORDER BY chain_name, rule_name;
SELECT job, log_user, priv_user, schema_user, broken, what, interval
FROM all_jobs WHERE schema_user = '&propietario' OR priv_user = '&propietario' ORDER BY job;

PROMPT 06 Permisos visibles y politicas
SELECT * FROM all_tab_privs
WHERE table_schema = '&propietario' OR grantee = '&propietario'
ORDER BY table_schema, table_name, grantee, privilege;
SELECT * FROM all_col_privs
WHERE table_schema = '&propietario' OR grantee = '&propietario'
ORDER BY table_schema, table_name, column_name, grantee, privilege;
SELECT * FROM all_policies WHERE object_owner = '&propietario' ORDER BY object_name, policy_name;
SELECT * FROM user_code_role_privs ORDER BY object_name, object_type, role;

-- Ejecutar también estas consultas de sesión con la cuenta que usa el backend,
-- si es distinta. La cuenta propietaria tiene permisos inherentes sobre sus objetos.
SELECT * FROM user_role_privs ORDER BY granted_role;
SELECT * FROM user_sys_privs ORDER BY privilege;
SELECT * FROM session_roles ORDER BY role;
SELECT * FROM session_privs ORDER BY privilege;
SELECT * FROM role_role_privs ORDER BY role, granted_role;
SELECT * FROM role_sys_privs ORDER BY role, privilege;
SELECT * FROM role_tab_privs WHERE owner = '&propietario' ORDER BY role, table_name, privilege;

PROMPT 07 Candidatos para revision transaccional y SQL dinamico
-- Los resultados son un indice. Contrastar con el fuente completo de la seccion 04.
SELECT owner, name, type, line, text FROM all_source
WHERE owner = '&propietario'
  AND regexp_like(text,
      'COMMIT|ROLLBACK|SAVEPOINT|AUTONOMOUS_TRANSACTION|FOR[[:space:]]+UPDATE|EXECUTE[[:space:]]+IMMEDIATE|DBMS_SQL|SET[[:space:]]+TRANSACTION|RAISE_APPLICATION_ERROR|WHEN[[:space:]]+OTHERS', 'i')
ORDER BY name, type, line;

-- Complemento para un DBA con acceso existente al diccionario, en la misma PDB.
-- Descomentar solo los SELECT necesarios y sustituir REEMPLAZAR_CUENTA.
/*
SELECT * FROM dba_dependencies
WHERE owner = '&propietario' OR referenced_owner = '&propietario'
ORDER BY owner, name, type, referenced_owner, referenced_name;

SELECT * FROM dba_constraints WHERE r_owner = '&propietario'
ORDER BY owner, table_name, constraint_name;

SELECT * FROM dba_cons_columns cc
WHERE EXISTS (
    SELECT 1 FROM dba_constraints c
    WHERE c.owner = cc.owner AND c.constraint_name = cc.constraint_name
      AND (c.owner = '&propietario' OR c.r_owner = '&propietario')
)
ORDER BY owner, constraint_name, position;

SELECT grantee, granted_role, admin_option, default_role
FROM dba_role_privs
START WITH grantee IN ('&propietario', 'REEMPLAZAR_CUENTA', 'PUBLIC')
CONNECT BY NOCYCLE PRIOR granted_role = grantee;

SELECT * FROM dba_sys_privs
WHERE grantee IN ('&propietario', 'REEMPLAZAR_CUENTA', 'PUBLIC')
   OR grantee IN (
       SELECT granted_role FROM dba_role_privs
       START WITH grantee IN ('&propietario', 'REEMPLAZAR_CUENTA', 'PUBLIC')
       CONNECT BY NOCYCLE PRIOR granted_role = grantee
   )
ORDER BY grantee, privilege;

SELECT * FROM dba_tab_privs
WHERE owner = '&propietario'
   OR grantee IN ('&propietario', 'REEMPLAZAR_CUENTA', 'PUBLIC')
   OR grantee IN (
       SELECT granted_role FROM dba_role_privs
       START WITH grantee IN ('&propietario', 'REEMPLAZAR_CUENTA', 'PUBLIC')
       CONNECT BY NOCYCLE PRIOR granted_role = grantee
   )
ORDER BY owner, table_name, grantee, privilege;

SELECT * FROM dba_col_privs WHERE owner = '&propietario'
ORDER BY table_name, column_name, grantee, privilege;
*/

UNDEFINE propietario
