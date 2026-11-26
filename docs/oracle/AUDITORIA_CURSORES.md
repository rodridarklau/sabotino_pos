# Auditoría de cursores y uso de procedimientos de SABOTINO

**26 de noviembre de 2026.** La revisión abarcó los 154 procedimientos del SQL modularizado. Se convirtieron las lecturas con bloqueo de edición y baja de productos a cursores explícitos. Los 154 nombres y firmas se conservaron, incluidos los 42 mantenedores de la rúbrica y las 98 salidas `OUT SYS_REFCURSOR`. [Inventario final por procedimiento](inventario_procedimientos.csv)

## Base de trabajo y alcance

El árbol local partía de `f4fdf0f`. La rama `main` remota, en `073bbfe`, agrega el README principal a ese mismo árbol versionado. La base operativa de la revisión fue la migración modular y el backend que ya estaban en el árbol local. Los 154 nombres coincidieron con los del CSV adjunto y con los de Oracle. Al comparar las fuentes de procedimientos, funciones y triggers locales con `USER_SOURCE` del esquema operativo, las dos conversiones de esta revisión fueron las únicas diferencias en las definiciones. El plan adjunto y sus recomendaciones preliminares se usaron como antecedentes de la solicitud.

Se cruzaron las llamadas de `backend/server.js` y `backend/src` con los scripts, las pruebas y las dependencias estáticas de los módulos PL/SQL, incluidas funciones y triggers. Las dependencias entrantes de procedimiento coincidieron con `USER_DEPENDENCIES`. También se revisaron los grants `EXECUTE` concedidos por el propietario y los trabajos y programas registrados en el esquema. El alcance cubre el repositorio y el esquema consultado. Las invocaciones manuales por la cuenta propietaria y los clientes externos al repositorio quedan fuera de la evidencia.

| Uso detectado | Procedimientos | De ellos, mantenedores |
| --- | ---: | ---: |
| Llamados por Node.js | 103 | 12 |
| Alcanzados indirectamente por PL/SQL | 8 | 2 |
| Sin referencias ejecutables detectadas | 43 | 28 |
| Total | 154 | 42 |

## Cambios de cursores

| Mecanismo | Antes | Después |
| --- | ---: | ---: |
| Cursor interno explícito | 29 | 31 |
| Salida `OUT SYS_REFCURSOR` | 98 | 98 |
| Ambos mecanismos | 3 | 3 |
| Ninguno de los dos | 30 | 28 |

- `SAB_API_EDITAR_PRODUCTO` y `SAB_API_BAJA_PRODUCTO` bloquean la fila por la clave primaria `PRODUCTO.ID_PRODUCTO`. Ambas rutinas usan `OPEN`, `FETCH`, `%NOTFOUND` y `CLOSE`, con `%ISOPEN` en el manejador de excepciones. Conservan la validación de dueño, los errores por fila inexistente (`-20011` y `-20014`) e inactiva (`-20701` y `-20702`), y delegan en `SAB_U_PRODUCTO` y `SAB_D_PRODUCTO`, respectivamente. El cierre del cursor libera sus recursos y el bloqueo de fila dura hasta el `COMMIT` o `ROLLBACK`. [Módulo Productos y diagnóstico](migracion-procedimientos/04_productos_y_diagnostico.sql), [PL/SQL Static SQL de Oracle 21c](https://docs.oracle.com/en/database/oracle/oracle-database/21/lnpls/static-sql.html)
- Los recorridos existentes sobre cursores declarados conservan el `FOR ... IN cursor`, que cierra el cursor incluso si el ciclo sale antes de tiempo o lanza una excepción. Se revisaron las aperturas, lecturas y cierres de los cursores manuales existentes. Las comprobaciones de existencia cierran el cursor al terminar la lectura o antes de propagar el error previsto. [Cursor FOR LOOP de Oracle 21c](https://docs.oracle.com/en/database/oracle/oracle-database/21/lnpls/cursor-FOR-LOOP-statement.html)
- `SAB_U_PRODUCTO` conserva su cursor de bloqueo y el único `SELECT INTO` interno restante. Esta consulta suma tres conteos en una sola fila de `DUAL` al cambiar la unidad. El recorrido de `SAB_COMPRA_MULTIPLE` sigue operando sobre un arreglo JSON y delega los bloqueos a los dos gestores `CORE`. Las operaciones de DML puro conservan sus sentencias y las lecturas que devuelven filas conservan su cursor de salida. [Mantenedores](base/05_mantenedores.sql), [Gestores](base/06_gestores.sql)

## Revisión de los 15 candidatos fuera de CRUD

En cada uno de los 15 casos se comprobó la ausencia de llamadas ejecutables en Node.js, otros procedimientos, funciones, triggers, scripts y pruebas del repositorio. El diccionario del esquema tampoco registró dependencias entrantes ni grants `EXECUTE` sobre ellos. «Reemplazado funcionalmente» indica que la API actual cubre el flujo de la aplicación. Las diferencias de contrato se detallan por procedimiento. El análisis de permisos describe los roles de la aplicación y las validaciones PL/SQL. Las rutinas comparadas se definen con derechos del propietario.

### Seguridad y sesiones

| Procedimiento | Clasificación y alternativa | Diferencias | Recomendación |
| --- | --- | --- | --- |
| `SAB_BUSCAR_CREDENCIALES` | Reemplazado funcionalmente por `SAB_API_CREDENCIALES`. | Ambos reciben `p_username` y se usan antes de que haya un actor autenticado. El original compara el nombre exacto y devuelve cuatro escalares OUT (ID, hash, rol y habilitado), con estado `N` para cuentas deshabilitadas o ausentes. La API compara mediante `UPPER`, filtra cuenta y rol activos y devuelve ID, username, nombre, hash, versión de cuenta y rol en un refcursor. Node.js exige exactamente una fila y verifica la contraseña con Argon2id. | Evaluar retiro posterior si se descartan consumidores del contrato escalar. El login vigente usa la API. |
| `SAB_REGISTRAR_SESION` | Necesario para administración si se requiere auditoría de sesiones en Oracle. Sin sustituto para la escritura. | Recibe actor, evento y detalle opcional. Para `LOGIN` y `LOGOUT` exige un usuario habilitado. Para `LOGIN_FALLIDO` exige que exista, aunque esté inactivo. Inserta en `LOG_SESION_USUARIO` y gestiona su propia transacción. Express gestiona la sesión y `SAB_API_VERSION_SESION` comprueba vigencia con actor y rol y devuelve la versión por cursor. Ese procedimiento es una lectura. | Conservar y reutilizar si se requiere el registro de login, logout e intentos fallidos en Oracle. |

[Seguridad base](base/04_funciones_y_seguridad.sql), [Procedimientos de acceso](migracion-procedimientos/01_acceso.sql), [Ruta de autenticación](../../backend/src/routes/auth.routes.js), [Validación de sesiones](../../backend/src/services/seguridad-sesion.js)

### Gestores

| Procedimiento | Clasificación y alternativa | Diferencias | Recomendación |
| --- | --- | --- | --- |
| `SAB_ABASTECER` | Parcialmente reemplazado por `SAB_COMPRA_MULTIPLE` con `SAB_ABASTECER_CORE`. | El original recibe dueño, producto, proveedor, cantidad y costo, y entrega ID de abastecimiento. La API vigente recibe dueño y un CLOB JSON y devuelve cantidad de líneas y total, incluso con una sola línea. Ambos usan el mismo gestor, que valida cantidad, costo y producto activo, bloquea stock y registra compra y auditoría. El original confirma una compra individual y la API confirma el lote completo. | Conservar para administración que necesite el ID generado por artículo. Usar la compra múltiple para el flujo web. |
| `SAB_ABASTECER_INSUMO` | Parcialmente reemplazado por `SAB_COMPRA_MULTIPLE` con `SAB_ABASTECER_INSUMO_CORE`. | El original recibe dueño, insumo, proveedor, cantidad y costo opcional. Con costo nulo mantiene el costo previo y devuelve el stock nuevo. El lote exige costo numérico por línea y devuelve cantidad de líneas y total. Ambos comparten validaciones de dueño, proveedor, insumo activo y decimales, y la actualización bajo bloqueo del stock, costo y proveedor. | Conservar para abastecimiento individual sin cambio de costo o cuando se necesita el saldo devuelto. |
| `SAB_VENTA_QUITAR_PAGO` | Sin equivalente. `SAB_VENTA_CANCELAR` es una operación relacionada. | Recibe actor, venta e ID del pago. Bloquea la venta, exige usuario activo y borrador propio, elimina un pago de esa venta y confirma. Informa venta inexistente, borrador ajeno o no editable y pago ausente (`-20117`, `-20118` y `-20133`). Cancelar recibe actor y venta, borra todos los pagos y detalles y marca la venta `ANULADA`. PL/SQL permite al dueño cancelar un borrador ajeno, mientras la ruta de recuperación exige borrador propio. | Conservar para reutilizar si la aplicación permite editar pagos en un borrador persistido. |
| `SAB_VENTA_QUITAR_PRODUCTO` | Sin equivalente. `SAB_VENTA_CANCELAR` es una operación relacionada. | Recibe actor, venta e ID de detalle. Bloquea la venta, exige usuario activo y borrador propio, elimina una línea y confirma. Informa venta inexistente, borrador ajeno o no editable y línea ausente (`-20112`, `-20113` y `-20116`). Cancelar opera sobre todo el borrador con el alcance descrito arriba. | Conservar para reutilizar si se agrega edición de líneas en un borrador persistido. |

[Gestores base](base/06_gestores.sql), [Ruta de Compras](../../backend/src/routes/compras.routes.js), [Ruta de Ventas](../../backend/src/routes/ventas.routes.js)

### Reportes originales

| Procedimiento | Clasificación y alternativa | Diferencias | Recomendación |
| --- | --- | --- | --- |
| `SAB_L_CATALOGO_VENTA` | Reemplazado funcionalmente por `SAB_API_VENTA_CATALOGO`. | Ambos requieren un dueño o vendedor activo y devuelven productos activos con precio, unidad y stock, sin costos. El original recibe actor, devuelve ocho columnas y ordena por categoría y nombre. La API recibe también `p_dueno`, que debe coincidir con el rol real, y agrega ID de categoría, permiso de decimales y ventas confirmadas de los últimos 30 días. La cuenta de ventas del vendedor se limita a las propias. El orden es por nombre e ID. | Evaluar retiro posterior si alcanza el catálogo vigente y se descartan consumidores de la proyección y orden originales. |
| `SAB_R_DESCUADRES_CAJA` | Parcialmente reemplazado por `SAB_API_REP_CAJA_TABLA`, `SAB_API_REP_CAJA_SERIE` y `SAB_API_REP_RESUMEN_CAJA`. | Todos exigen dueño. El original recibe dos `DATE`, valida el rango y devuelve turnos cerrados, fechas, diferencias de efectivo, tarjeta y transferencia como columnas y descuadre total. La API usa fechas ISO y filtros de caja y vendedor. La tabla paginada incluye turnos abiertos y separa importes esperados y reales por método. La serie y el resumen agregan descuadres. | Conservar para reportes que requieren las tres diferencias calculadas por turno cerrado. |
| `SAB_R_HORAS_VENTA` | Sin equivalente. La alternativa más próxima es `SAB_API_REP_VENTAS_ACTIVIDAD`. | Ambos exigen dueño. El original valida dos `DATE` y devuelve hora, número de ventas confirmadas e importe por hora del día, ordenados por importe. Actividad recibe fechas ISO, período previo y filtros opcionales, y devuelve días extremos con número de transacciones. `SAB_API_REP_VENTAS_SERIE` agrupa por día, semana, mes o año. | Conservar para reutilizar en un reporte de actividad por hora. |
| `SAB_R_TOP_PRODUCTOS` | Parcialmente reemplazado por `SAB_API_REP_PRODUCTOS_TABLA`. | Ambos exigen dueño y usan ventas confirmadas. El original valida dos `DATE` y devuelve diez productos con ID, nombre, unidad, cantidad, ingresos, costo histórico estimado y margen bruto. La API usa fechas ISO, filtros, paginación y orden por cantidad o ingresos. Devuelve nombre, categoría, unidad, cantidad, ingresos, transacciones y precios mínimo y máximo. | Conservar mientras el reporte de margen y costos históricos siga siendo útil. |

[Reportes base](base/07_reportes.sql), [Catálogo de Ventas](migracion-procedimientos/03_ventas.sql), [Reportes de la API](migracion-procedimientos/09_reportes.sql), [Consultas que usa Node.js](../../backend/src/services/reportes.js)

### Consultas de interfaz

| Procedimiento | Clasificación y alternativa | Diferencias | Recomendación |
| --- | --- | --- | --- |
| `SAB_UI_L_CAJAS` | Parcialmente reemplazado por `SAB_API_CAJA_POR_NOMBRE`. | Ambos validan usuario activo. El original recibe actor y lista cajas operativas con ID, nombre y ubicación. La API recibe actor y nombre, solo admite `MAIN` y devuelve ID, nombre y estado operativo sin ubicación. El mantenedor `SAB_L_CAJA_TERMINAL` lista todas las cajas y exige dueño. | Conservar para selección de cajas operativas por vendedores si se habilitan varias cajas. |
| `SAB_UI_L_DETALLE_VENTA` | Reemplazado funcionalmente por `SAB_API_VENTA_DETALLE`. | Ambos reciben actor y venta, permiten dueño o responsable y omiten costos. El original incluye IDs de venta y producto, identifica venta inexistente o ajena con `-20303` y `-20304`. La API omite esos dos IDs, devuelve cero filas en esos casos y agrega el parámetro `p_comprobante` para limitar a ventas confirmadas en ese modo. | Evaluar retiro posterior si se descartan clientes que requieren esos IDs o códigos de error. |
| `SAB_UI_L_PAGOS_VENTA` | Reemplazado funcionalmente por `SAB_API_VENTA_PAGOS`. | Ambos reciben actor y venta y autorizan al dueño o responsable. El original incluye IDs de venta y método de pago y devuelve `-20305` o `-20306` si la venta falta o es ajena. La API agrega `p_comprobante`, devuelve cero filas cuando no hay visibilidad y entrega ID del pago, método, monto y comprobante. | Evaluar retiro posterior si se descartan clientes que requieren los IDs o errores originales. |
| `SAB_UI_L_RESUMEN_VENTA` | Reemplazado funcionalmente por `SAB_API_VENTA_CABECERA`. | Ambos reciben actor y venta y restringen la lectura al dueño o responsable. El original devuelve la fecha como timestamp y los errores `-20301` y `-20302`. La API exige `p_dueno` coherente con el rol, recibe `p_comprobante`, agrega responsable y caja, formatea la fecha como texto y devuelve cero filas para ventas fuera de alcance. | Evaluar retiro posterior si se descartan clientes que dependan del timestamp o los errores del original. |
| `SAB_UI_L_TURNOS_ABIERTOS` | Parcialmente reemplazado por `SAB_API_VENTA_TURNOS` y `SAB_API_CAJA_ABIERTOS`. | El original recibe actor activo y lista turnos abiertos de todas las cajas con ID de turno y caja, nombre, usuario y fecha de apertura e inicial efectivo. Ventas recibe actor y nombre, limita a `MAIN` operativa y devuelve ID de turno y nombre. Caja recibe también rol validado e ID de una caja y devuelve fechas formateadas, responsables y saldos. | Conservar para una consulta operativa de turnos abiertos de varias cajas. |

[Consultas de interfaz base](base/09_consultas_interfaz.sql), [Procedimientos de Caja](migracion-procedimientos/02_caja.sql), [Procedimientos de Ventas](migracion-procedimientos/03_ventas.sql), [Ruta de Ventas](../../backend/src/routes/ventas.routes.js)

## Validación y archivos

| Comprobación | Resultado |
| --- | --- |
| Oracle XE 21c `21.3.0.0.0` | Instalación desde cero y migración incremental ejecutadas en `XEPDB1`. Los 154 procedimientos quedaron `VALID`, sin errores en `USER_ERRORS`. La comparación antes y después de `USER_ARGUMENTS` confirmó las firmas. Las consultas de los 98 refcursores coinciden con la versión de referencia. |
| Llamadas reales de Express | Pasó `node test/flujo-oracle.js` con dueño y dos vendedores. Cubrió autenticación, sesión, diagnóstico, productos, compras, stock, inventario, vendedores, caja, venta, comprobante, inicio, imágenes y reportes. |
| Edición y baja con dos sesiones Oracle | Se verificaron acceso de dueño, rechazo de vendedor, fila inexistente e inactiva, error de clave foránea, `ROLLBACK`, `COMMIT` y auditoría. La segunda sesión esperó por la fila y se comprobó que el bloqueo se liberó al terminar la transacción. La métrica `opened cursors current` se mantuvo en 2 tras 100 repeticiones de cada error por producto inexistente. |
| Backend y acceso a datos | Pasaron `npm test` (53 pruebas), `npm run oracle:auditar` (20 archivos de ejecución), `node test-oracle.js` y `node test/reportes-oracle.readonly.js`. La auditoría confirmó un único punto de ejecución del driver para los bloques de llamada a procedimientos. |
| Frontend | Pasaron `npm run lint`, `npm run build` y `scripts/verificar-interfaz.mjs` en Chromium con respuestas simuladas y nueve resoluciones. |

Las instalaciones y las pruebas de escritura se realizaron en un esquema QA temporal, eliminado al terminar. El esquema operativo `SABOTINO` se consultó en modo de lectura para el contraste de fuentes y dependencias. La instalación desde cero y la incremental ya incluyen el módulo modificado en el orden correcto. Las recomendaciones de retiro quedan pendientes de aprobación.

- Se refactorizaron dos cuerpos PL/SQL en el [módulo Productos y diagnóstico](migracion-procedimientos/04_productos_y_diagnostico.sql).
- Se incorporó el [inventario de los 154 procedimientos](inventario_procedimientos.csv) y se enlazó esta auditoría en la [guía Oracle del proyecto](README.md).
