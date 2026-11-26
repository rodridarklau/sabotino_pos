# Retiro de cinco procedimientos sustituidos

La versión `acdb89e` instalaba 154 procedimientos. La versión vigente instala **149**. De estos, **70** son base, incluidos los **42** del módulo de mantenedores, y **79** son de la API. El inventario conserva los diez candidatos sin uso que quedaron fuera de este retiro. La comparación con `acdb89e` confirmó que el cuerpo y la firma de cada procedimiento conservado coinciden con la versión anterior. [Inventario vigente](inventario_procedimientos.csv) · [Auditoría histórica de candidatos](AUDITORIA_CURSORES.md)

| Procedimiento retirado | Reemplazo que usa Express | Módulo original |
| --- | --- | --- |
| `SAB_BUSCAR_CREDENCIALES` | `SAB_API_CREDENCIALES` | [Seguridad](base/04_funciones_y_seguridad.sql) |
| `SAB_L_CATALOGO_VENTA` | `SAB_API_VENTA_CATALOGO` | [Reportes base](base/07_reportes.sql) |
| `SAB_UI_L_RESUMEN_VENTA` | `SAB_API_VENTA_CABECERA` | [Consultas de interfaz](base/09_consultas_interfaz.sql) |
| `SAB_UI_L_DETALLE_VENTA` | `SAB_API_VENTA_DETALLE` | [Consultas de interfaz](base/09_consultas_interfaz.sql) |
| `SAB_UI_L_PAGOS_VENTA` | `SAB_API_VENTA_PAGOS` | [Consultas de interfaz](base/09_consultas_interfaz.sql) |

En `acdb89e` los nombres retirados solo aparecían en sus definiciones y en documentación. La instalación de esa versión en QA confirmó la ausencia de dependencias estáticas, referencias en fuentes y tareas, permisos `EXECUTE` concedidos y sinónimos visibles. Autenticación y Ventas ya llaman a los reemplazos de la tabla, con sus contratos actuales de actor, sesión y visibilidad. [Ruta de autenticación](../../backend/src/routes/auth.routes.js) · [Ruta de ventas](../../backend/src/routes/ventas.routes.js)

## Instalación y migración

La instalación desde cero verifica los 70 procedimientos base y, después de cargar la API, comprueba los 149 en estado `VALID`. El instalador incremental actualiza los módulos de mantenedores y gestores, instala la API, ejecuta el retiro y repite esa verificación. [Instalación desde cero](instalar_desde_cero.sql) · [Instalador incremental](migracion-procedimientos/instalar.sql) · [Verificador](migracion-procedimientos/verificar.sql)

Antes del primer `DROP PROCEDURE`, el script de retiro verifica que los 149 procedimientos vigentes, incluidos los cinco reemplazos, estén válidos. Busca dependencias visibles, referencias en fuentes y tareas, permisos `EXECUTE` y sinónimos para todos los objetivos presentes. Si encuentra alguno, informa el motivo y cancela todos los `DROP`. Una segunda ejecución omite los cinco procedimientos ausentes. [Script de retiro](migracion-procedimientos/retirar_5_obsoletos.sql) · [Visibilidad de `ALL_DEPENDENCIES` en Oracle](https://docs.oracle.com/en/database/oracle/oracle-database/21/refrn/ALL_DEPENDENCIES.html)

## Evidencia en QA

Los recorridos se ejecutaron en esquemas temporales aislados en Oracle XE 21c `21.3.0.0.0` (`XEPDB1`). Los esquemas de prueba se eliminaron al finalizar.

| Comprobación | Resultado |
| --- | --- |
| Instalación limpia | 70 procedimientos base y 79 de la API, todos `VALID`. Los cinco retirados quedaron ausentes. |
| Migración y reinstalación incremental | La instalación exacta de `acdb89e` partió con 154 procedimientos `VALID` y se pobló con el flujo HTTP de QA. La migración y su repetición dejaron 149 `VALID`, sin errores de compilación y con cero de los cinco retirados. La huella de las 59 filas de prueba en las 21 tablas, columnas, restricciones, secuencias, triggers y firmas conservadas coincidió en las tres versiones del esquema. |
| Dependencia deliberada | Una función de prueba con dependencia sobre `SAB_UI_L_RESUMEN_VENTA` produjo `ORA-20796`. Los cinco objetivos siguieron presentes antes de quitar la función y reintentar. |
| Diez mantenedores en React | Se verificaron altas, lecturas, ediciones y bajas. Hubo borrado físico en Proveedores, Insumos, Usuarios vendedores, Horarios, Terminales de caja, Categorías, Unidades de medida, Marcas y Tipos de ajuste, y baja lógica en Productos. Las FK se comprobaron en React para registros referenciados de Categorías, Proveedores y Vendedores. |
| Gestores y dashboards en React | Pasaron asignación de horarios, compra, ajuste de stock, apertura y cierre de caja, venta y comprobante. Los dashboards de Ventas, Productos y Compras mostraron los datos del esquema QA. |
| Concurrencia con dos conexiones Oracle | Pasaron alta/alta, edición/edición y alta/reasignación de horarios con espera y rechazo `20554` del solape. En Compras se verificó el orden de bloqueo por tipo e ID, confirmaron dos lotes en orden inverso y se comprobó el rollback de un lote inválido. |
| Comandos de validación | Pasaron las 53 pruebas de backend, `npm run oracle:auditar` sobre 22 archivos de ejecución, el flujo HTTP real de QA, lint y build del frontend. |

[Flujo HTTP de QA](../../backend/test/flujo-oracle.js) · [Pruebas de concurrencia](../../backend/test/concurrencia-oracle.js) · [Matriz ES3 y evidencia por mantenedor](../AUDITORIA_ES3_INF324.md)

### Actualización controlada del esquema operativo

1. Respalda el esquema y guarda el DDL de los cinco procedimientos. Programa una ventana de mantenimiento y suspende despliegues y tareas que puedan cambiar sus dependencias durante la actualización.
2. Confirma con el administrador la PDB y el esquema propietario. Revisa dependencias de otros esquemas en `DBA_DEPENDENCIES` y verifica tareas, integraciones y llamadas dinámicas externas que queden fuera del diccionario visible desde el propietario.
3. Desde `docs/oracle/migracion-procedimientos`, abre SQL*Plus en una sesión dedicada como propietario en la PDB. Comprueba usuario, esquema y contenedor antes de iniciar. La sesión debe estar libre de transacciones pendientes. Ejecuta `@instalar.sql` y guarda la salida.
4. Confirma la salida `Total SABOTINO: 149 procedimientos VALID (70 base + 79 API).` Comprueba desde la aplicación inicio de sesión, catálogo, cabecera, detalle y pagos de venta, y vista previa de un comprobante. Después, reanuda el servicio.

Oracle confirma el DDL de cada `DROP`. Si la sesión se interrumpe durante el retiro, revisa los nombres pendientes y vuelve a ejecutar el instalador después de corregir la causa. Si necesitas restaurar la versión anterior, recompila las cinco definiciones respaldadas o sus definiciones de `acdb89e` en sus respectivos módulos. [Semántica de `DROP PROCEDURE`](https://docs.oracle.com/en/database/oracle/oracle-database/21/sqlrf/DROP-PROCEDURE.html)
