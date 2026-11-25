# Arquitectura Oracle de SABOTINO

Oracle es la fuente de verdad para la estructura y las reglas de negocio. El inventario general y el análisis de los ajustes se contrastaron con el diccionario y el código PL/SQL de la base existente mediante consultas de solo lectura.

## Contexto y alcance

La conexión de Express usa la cuenta propietaria `SABOTINO` en `XEPDB1`, con Oracle 21c versión `21.3.0.0.0`. El esquema tiene 21 tablas, 33 índices, 21 secuencias, 75 procedimientos, 2 funciones y 8 triggers. Todos esos objetos figuran como `VALID`. El inventario del propietario no contiene vistas, paquetes ni sinónimos propios. También se puede repetir la extracción desde SQL Developer con [inventario.sql](inventario.sql).

| Flujo | Objetos referenciados en el backend |
| --- | --- |
| Acceso y alta inicial | `USUARIO`, `ROL_USUARIO`, `SAB_REGISTRAR_DUENO_INICIAL` |
| Productos y alertas de stock | `PRODUCTO`, `CATEGORIA_PRODUCTO`, `MARCA`, `UNIDAD_MEDIDA`, `SAB_C_PRODUCTO`, `SAB_U_PRODUCTO`, `SAB_D_PRODUCTO` |
| Compras e historial de productos | `SAB_COMPRA_MULTIPLE`, `ABASTECIMIENTO_PROVEEDOR`, `PRODUCTO`, `INSUMO`, `UNIDAD_MEDIDA`, `PROVEEDOR`, `USUARIO` |
| Gestión de proveedores | `PROVEEDOR`, `SAB_C_PROVEEDOR`, `SAB_L_PROVEEDOR`, `SAB_U_PROVEEDOR` |

## Inventario y ajustes

El menú de React ofrece Inventario al dueño. La pantalla muestra existencias y stock crítico, registra ajustes con confirmación y carga el historial paginado de productos.

### Contrato confirmado de ajustes

| Procedimiento | Parámetros posicionales | Efecto |
| --- | --- | --- |
| `SAB_AJUSTAR_STOCK` | `p_actor_id NUMBER`, `p_producto_id NUMBER`, `p_tipo_id NUMBER`, `p_cantidad NUMBER`, `p_observacion VARCHAR2`, `p_ajuste_id OUT NUMBER` | Bloquea el producto, aplica el ajuste y registra historial y auditoría. Devuelve el ID del ajuste. |
| `SAB_AJUSTAR_STOCK_INSUMO` | `p_actor_id NUMBER`, `p_insumo_id NUMBER`, `p_tipo_id NUMBER`, `p_cantidad NUMBER`, `p_nuevo_stock OUT NUMBER` | Bloquea la fila de insumo y actualiza sus existencias. Devuelve el nuevo stock. El contrato carece de observación y de historial de ajustes. |

Los procedimientos usan derechos del definidor. Ambos llaman a `SAB_VALIDAR_DUENO`, que combina `SAB_VALIDAR_USUARIO` y `SAB_F_ES_DUENO` sobre `USUARIO` y `ROL_USUARIO`. Exigen usuario y rol activos, con rol de negocio `DUENO`. La cuenta Oracle propietaria tiene los permisos inherentes sobre los objetos y la sesión observada carece de roles Oracle activos. El actor debe venir de la sesión Express.

La cantidad es positiva y admite hasta tres decimales cuando la unidad lo permite. El tipo de ajuste define un factor `-1` o `1`. Oracle calcula el saldo a partir de la fila bloqueada, exige artículo activo y rechaza resultados negativos. El saldo se almacena como `NUMBER(12,3)`. La observación de producto es nullable y admite 250 bytes.

### Relaciones y efectos

| Tabla | PK | FK y restricciones relevantes |
| --- | --- | --- |
| `PRODUCTO` | `ID_PRODUCTO` | Unidad, marca y categoría. Código de barras único, saldos no negativos, estado `S/N`. |
| `INSUMO` | `ID_INSUMO` | Unidad y proveedor obligatorios. Nombre único, saldos no negativos, estado `S/N`. |
| `UNIDAD_MEDIDA` | `ID_UNIDAD` | Código único, `PERMITE_DECIMALES` en `S/N`. |
| `TIPO_AJUSTE_STOCK` | `ID_TIPO_AJUSTE` | Nombre único y factor `-1/1`. |
| `AJUSTE_INVENTARIO` | `ID_AJUSTE` | Producto, usuario y tipo obligatorios, cantidad positiva, fecha `TIMESTAMP(6)`. |
| `LOG_CAMBIO_PRODUCTO` | `ID_LOG_PRODUCTO` | Producto y usuario responsable. Registra acción, fecha y valores anteriores y nuevos. |
| `ABASTECIMIENTO_PROVEEDOR` | `ID_ABASTECIMIENTO` | Producto, proveedor y usuario. Cantidad positiva y costo no negativo. |

Las FK de estas tablas están habilitadas y validadas, con borrado `NO ACTION`. El historial usa `SEQ_AJUSTE_INVENTARIO`. `SAB_LOG_CAMBIO_PRODUCTO` usa `SEQ_LOG_CAMBIO_PRODUCTO` y registra la acción `AJUSTE_STOCK` dentro de la misma transacción del ajuste. El log y el historial carecen de una FK que vincule cada fila de log con un ID de ajuste.

- `SAB_TRG_PRODUCTO_UNIDAD` valida existencias y stock crítico enteros cuando la unidad lo exige, en inserciones y cambios a stock o unidad.
- `SAB_TRG_TIPO_AJUSTE_HISTORICO` protege el factor de un tipo usado en el historial de productos.
- `SAB_TRG_ROLES_FIJOS` protege el catálogo de roles de negocio utilizado por las validaciones.

### Transacciones y concurrencia

- Cada procedimiento de ajuste hace `COMMIT` al terminar y `ROLLBACK` al capturar una excepción, que vuelve a propagar. Express debe ejecutar cada ajuste en una conexión del pool sin trabajo previo pendiente. Reintentar tras una respuesta perdida podría aplicar el movimiento dos veces.
- `SAB_COMPRA_MULTIPLE` llama a los dos procedimientos `CORE` y confirma al final del lote. El abastecimiento de producto bloquea la misma fila que el ajuste, suma existencias y registra compra y auditoría. El abastecimiento de insumo bloquea su fila, suma existencias y actualiza costo y proveedor.
- `SAB_VENTA_CONFIRMAR` también bloquea productos, valida existencias y descuenta stock antes de confirmar. La interfaz debe recargar existencias después de un ajuste y tratar el saldo previo como una lectura que puede cambiar.

### Integración de React y Express

- `GET /api/inventario` comparte con Compras las consultas de artículos activos y sus unidades. Los cursores de `SAB_L_PRODUCTO` y `SAB_L_INSUMO` omiten `PERMITE_DECIMALES`. El catálogo de tipos se obtiene con `SELECT` sobre `TIPO_AJUSTE_STOCK`, con la misma proyección que `SAB_L_TIPO_AJUSTE_STOCK`. Ambos GET comprueban el permiso del actor con la función de solo lectura `SAB_F_ES_DUENO`.
- `GET /api/inventario/historial?pagina=1` consulta `AJUSTE_INVENTARIO` y devuelve hasta 50 ajustes de productos por página. `POST /api/inventario/ajustes` usa el procedimiento del tipo de artículo con binds y devuelve su salida. React separa el resultado del ajuste de las lecturas posteriores y descarta el formulario ante un resultado incierto.
- Mapear `ORA-20001` a `ORA-20003` a problemas de acceso. Manejar explícitamente tipo inexistente (`20150`), producto inexistente o inactivo (`20006`, `20151`, `20152`), insumo inexistente o inactivo (`20171`, `20172`), cantidades inválidas o decimales incompatibles (`20004`, `20005`, `20170`, `20173`, `20301`) y saldo negativo (`20153`, `20174`). Considerar también el desborde de precisión.

Las firmas, reglas y límites de transacción se verificaron por metadatos y lectura de fuentes. Las rutas GET se comprobaron contra Oracle con una conexión limitada a consultas `SELECT`. Las pruebas de escritura usan una conexión simulada y se ejecutan con `node --test test/inventario.test.js` desde `backend`.

## Ventas y apertura de caja

Ventas está disponible para `DUENO` y `VENDEDOR` activos. Express revalida el usuario y el rol de la sesión. El dueño puede consultar ventas de todos los usuarios y cada vendedor puede consultar únicamente las propias, siguiendo el alcance de `SAB_UI_L_RESUMEN_VENTA`, `SAB_UI_L_DETALLE_VENTA` y `SAB_UI_L_PAGOS_VENTA`. La anulación de recuperación desde la UI está limitada a borradores propios.

### Modelo de datos

| Tabla | Identidad y relaciones | Datos y reglas |
| --- | --- | --- |
| `VENTA` | `ID_VENTA NUMBER(15)`; FK a turno y usuario | Fecha `TIMESTAMP(6)`, total `NUMBER(14,2)` no negativo, estado `BORRADOR`, `CONFIRMADA` o `ANULADA`. |
| `DETALLE_VENTA` | `ID_DETALLE_VENTA NUMBER(15)`; FK a venta y producto | Cantidad positiva `NUMBER(12,3)`, costo, precio histórico y subtotal no negativos `NUMBER(14,2)`. |
| `PAGO_VENTA` | `ID_PAGO_VENTA NUMBER(15)`; FK a venta y método | Monto positivo `NUMBER(14,2)`, comprobante nullable de hasta 50 bytes. Una venta admite varias filas. |
| `METODO_PAGO` | `ID_METODO_PAGO NUMBER(10)`; nombre único | `EFECTIVO`, `TARJETA`, `TRANSFERENCIA`; los dos últimos exigen comprobante según el catálogo consultado. |
| `TURNO_CAJA` | `ID_TURNO_CAJA NUMBER(12)`; FK a caja, actor de apertura y actor de cierre | Fecha de apertura y saldos iniciales obligatorios. Estado `ABIERTO` o `CERRADO`; la fecha y el actor de cierre deben estar presentes solo al cerrar. |
| `CAJA_TERMINAL` | `ID_CAJA NUMBER(10)`; nombre único | Ubicación opcional, estado operativo `S/N`. |
| `USUARIO`, `ROL_USUARIO` | Usuario referencia rol | `SAB_VALIDAR_USUARIO` requiere que ambos estén activos y que el rol sea dueño o vendedor. |
| `PRODUCTO`, `UNIDAD_MEDIDA` | Producto referencia unidad, categoría y marca | Se venden productos activos. `SAB_VALIDAR_CANTIDAD` exige cantidades positivas, hasta tres decimales y enteros cuando la unidad lo requiere. |
| `LOG_CAMBIO_PRODUCTO`, `LOG_AUDITORIA_CAJA` | El primero referencia producto y usuario. El segundo referencia turno y usuario. | Oracle registra cambios de stock con acción `VENTA`, y aperturas y cierres mediante operaciones `APERTURA` y `CIERRE`. |

`HORARIO_VENDEDOR` referencia usuario y caja, pero el código de apertura e inicio de venta no lo consulta. Los triggers de detalle y pago impiden mover filas entre ventas y editarlas fuera de un borrador. Los triggers de venta y turno protegen ventas finalizadas y turnos cerrados. Los triggers de métodos y roles protegen sus catálogos y el de producto aplica la unidad a las existencias.

### Procedimientos y transacciones

Todas las entradas y salidas de esta tabla son `NUMBER` salvo el comprobante, que es `VARCHAR2`. El actor siempre viene de la sesión.

| Procedimiento | Parámetros en orden | Efecto |
| --- | --- | --- |
| `SAB_ABRIR_CAJA` | actor, caja, efectivo inicial, turno OUT | Bloquea la terminal, exige que esté operativa y que carezca de turno abierto, y crea el turno y su auditoría. |
| `SAB_VENTA_INICIAR` | actor, turno, venta OUT | Bloquea el turno y exige que esté abierto. Persiste un borrador. |
| `SAB_VENTA_AGREGAR_PRODUCTO` | actor, venta, producto, cantidad, detalle OUT | Bloquea el borrador propio y guarda la línea con precio y costo de ese momento. |
| `SAB_VENTA_AGREGAR_PAGO` | actor, venta, método, monto, comprobante, pago OUT | Bloquea el borrador propio y valida método, monto y comprobante. |
| `SAB_VENTA_CONFIRMAR` | actor, venta, total OUT | Bloquea turno, venta y productos en orden de ID. Revalida stock, vuelve a calcular el subtotal con el precio vigente redondeado por línea y exige que la suma de pagos coincida. Descuenta existencias, escribe el log y confirma todo junto. |
| `SAB_VENTA_CANCELAR` | actor, venta | Borra líneas y pagos del borrador y conserva la cabecera `ANULADA`. Oracle permite al dueño anular un borrador ajeno. |
| `SAB_CERRAR_CAJA` | actor, turno, efectivo real, tarjeta real, transferencia real, descuadre OUT | Bloquea el turno, rechaza borradores pendientes, suma pagos de ventas confirmadas por método y registra el cierre desde Caja. |

Los IDs los generan `SEQ_VENTA`, `SEQ_DETALLE_VENTA`, `SEQ_PAGO_VENTA`, `SEQ_TURNO_CAJA`, `SEQ_LOG_CAMBIO_PRODUCTO` y `SEQ_LOG_AUDITORIA_CAJA` dentro de Oracle.

Cada procedimiento de escritura confirma individualmente o revierte su transacción ante error. Express usa una conexión y llama en orden sin transacciones externas. Ante un rechazo conocido tras crear la venta, intenta anular el borrador. Ante un resultado incierto, devuelve el identificador si lo conoce y la UI pide revisar el historial. Se bloquean envíos simultáneos del mismo actor dentro del proceso Express y se guarda un aviso en la sesión del navegador. La base carece de una clave de idempotencia para deduplicar solicitudes después de reinicios o entre procesos.

### Lecturas y pruebas

`GET /api/ventas/catalogos` entrega productos activos con `PERMITE_DECIMALES`, métodos, turnos abiertos y cajas disponibles. Ventas enlaza a Caja para abrir un turno y vuelve a cargar los turnos al entrar. `GET /api/ventas` filtra y pagina el historial. `GET /api/ventas/:id` devuelve cabecera, líneas y pagos usando consultas de solo lectura y el alcance de usuario ya descrito. Los GET se verificaron contra Oracle con una conexión limitada a `SELECT`. Las pruebas de escritura de Ventas usan mocks.

## Caja, arqueo e historial

- `CAJA_TERMINAL.NOMBRE_CAJA` es único y admite 50 bytes. La ubicación es opcional y admite 100 bytes. El estado acepta `S/N` y `SEQ_CAJA_TERMINAL` genera el ID. Al solicitar la primera apertura, Express busca el nombre exacto `MAIN`. Si falta y el actor es dueño activo, llama a `SAB_C_CAJA_TERMINAL(actor, 'MAIN', NULL, 'S', id OUT)`. Una segunda lectura recupera el ID real, incluso si la creación inicial coincidió con otra solicitud. La restricción única impide duplicados y la apertura siguiente usa el bloqueo de Oracle. Si el dueño aún no preparó MAIN, el vendedor recibe un mensaje con ese requisito. Si MAIN ya existe fuera de servicio, se conserva su estado.
- Las rutas de administración de terminales se retiraron de Express. Los procedimientos `SAB_U_CAJA_TERMINAL` y `SAB_D_CAJA_TERMINAL` siguen en Oracle. Los registros previos y las referencias `NO ACTION` desde `TURNO_CAJA` y `HORARIO_VENDEDOR` se conservan. Las nuevas aperturas, ventas y asignaciones de horario usan MAIN. Los turnos cerrados anteriores siguen consultables según el rol.
- Dueños y vendedores activos pueden abrir y cerrar turnos conforme a `SAB_VALIDAR_USUARIO`. Los procedimientos usan derechos del definidor. El catálogo muestra los turnos activos a ambos roles. Los vendedores ven en el historial cerrado los turnos que abrieron o cerraron y, en el detalle, únicamente sus propias ventas. El arqueo siempre usa los pagos de todas las ventas confirmadas del turno.
- `POST /api/caja/turnos` y el endpoint anterior `POST /api/ventas/turnos` comparten la llamada a `SAB_ABRIR_CAJA`. El procedimiento bloquea la terminal y excluye una segunda apertura simultánea. `POST /api/caja/turnos/:id/cierre` pasa los tres importes reales a `SAB_CERRAR_CAJA`. El procedimiento bloquea el turno, verifica que siga abierto y rechaza ventas en borrador (`ORA-20143`). Venta y cierre usan el mismo bloqueo del turno. Al terminar, cada procedimiento confirma sus cambios o revierte ante una excepción.
- El arqueo proyectado suma saldo inicial y pagos de ventas confirmadas por método. Los importes reales de efectivo, tarjeta y transferencia se ingresan explícitamente. Oracle recalcula el esperado al cerrar. En el historial se muestran los importes de sistema y reales almacenados en `TURNO_CAJA` y el descuadre registrado en `LOG_AUDITORIA_CAJA`. El trigger `SAB_TRG_TURNO_INMUTABLE` protege turnos cerrados y Oracle devuelve `ORA-20142` ante un segundo intento de cierre.
- `GET /api/caja` muestra MAIN, su turno activo y el total de ventas confirmadas del día comercial en Santiago. `GET /api/caja/turnos` pagina y filtra turnos cerrados. `GET /api/caja/turnos/:id` entrega los importes por método, ventas visibles, resumen de confirmadas, borradores y auditoría. La inicialización de MAIN y las consultas modificadas se verificaron con respuestas simuladas.

## Vendedores y horarios

- `USUARIO` referencia `ROL_USUARIO`. RUT y nombre de usuario son únicos, el estado acepta `S/N` y Oracle almacena un hash de hasta 255 bytes. El alta usa `SAB_C_USUARIO` con el rol `VENDEDOR` resuelto en Oracle. La edición usa `SAB_U_USUARIO`, que bloquea la cuenta, conserva su rol y mantiene el hash anterior si recibe `NULL`. Express limita los destinos de edición a vendedores, usa Argon2id y consulta duplicados de nombre sin distinguir mayúsculas, igual que el inicio de sesión. El frontend permite activar y desactivar cuentas, sin borrado de usuarios.
- La API descarta una sesión si la cuenta o su rol están inactivos o si la contraseña cambió desde el inicio de sesión. La versión de la cuenta se conserva en la sesión del servidor. `LOG_SESION_USUARIO` referencia a `USUARIO`. `SAB_REGISTRAR_SESION` y `SEQ_LOG_SESION_USUARIO` existen para eventos de sesión y la aplicación conserva su flujo sin escrituras de auditoría de sesión.
- `HORARIO_VENDEDOR` referencia usuario y terminal. `SAB_C_HORARIO_VENDEDOR` y `SAB_U_HORARIO_VENDEDOR` exigen una cuenta activa y una caja operativa, incluso al guardar una asignación inactiva. Oracle valida los días admitidos y `HH24:MI`, con hora final posterior a la inicial. Un horario activo no puede solaparse con otro activo del mismo vendedor y día aunque se asigne a otra caja. Para eliminar una asignación se usa `SAB_D_HORARIO_VENDEDOR`. Los cambios se confirman o revierten dentro de las rutinas y los IDs vienen de `SEQ_USUARIO` y `SEQ_HORARIO_VENDEDOR`. La verificación PL/SQL de solapes no bloquea una fila de coordinación, por lo que la exclusión entre procesos o clientes Oracle independientes requeriría una garantía adicional en la base. Los horarios no condicionan aperturas ni ventas en el PL/SQL actual.

## Comprobantes de compra

En Ventas, **¿Desea comprobante?** aparece tras confirmar. Si el usuario acepta, se abre la vista previa. Al cerrar la vista o rechazar el comprobante se prepara la siguiente venta. La vista también está disponible en el detalle histórico de una venta confirmada. Ofrece descarga PDF e impresión. Para impresión térmica, usar papel de 80 mm y escala real en el controlador. El [PDF de ejemplo](../comprobante-ejemplo.pdf) y su [vista renderizada](../comprobante-ejemplo.png) usan datos simulados.

- El modelo consulta `VENTA`, `DETALLE_VENTA`, `PAGO_VENTA`, `METODO_PAGO`, `PRODUCTO`, `UNIDAD_MEDIDA`, `USUARIO`, `TURNO_CAJA` y `CAJA_TERMINAL`. Solo se emiten para ventas confirmadas y visibles por el actor. Los importes y cantidades vienen de la venta. Los nombres descriptivos se consultan al emitir la copia porque la venta no guarda una instantánea de esos textos.
- El logo original y la versión PNG se distribuyen en `frontend/public/branding/`. PDFKit necesita acceso al PNG desde el backend en esa ruta relativa y lo incrusta junto a su máscara de transparencia. El correo usa el mismo PNG inline y lleva adjunto el PDF. El comprobante es informativo y el documento usa formato chileno y moneda CLP.
- El servicio de correo usa la API de Resend. En el panel agrega un dominio propio con envío habilitado, publica los registros DNS indicados y verifica el dominio. En API Keys crea una clave con permiso **Sending access** limitada a ese dominio. Introduce la clave localmente en `backend/.env` como `SABOTINO_RESEND_API_KEY` y configura `SABOTINO_CORREO_REMITENTE` con el formato `"SABOTINO <comprobantes@tu-dominio>"`. Reinicia Express. Desde `backend`, `npm run correo:estado` muestra solo presencia o formato inválido y no contacta al proveedor. [API de envío de Resend](https://resend.com/docs/api-reference/emails/send-email)
- La dirección del cliente se usa para la solicitud y no se persiste en SABOTINO. Se aplica un límite de 12 solicitudes por IP en 15 minutos y se bloquean envíos simultáneos al mismo destinatario para la misma venta dentro del proceso Express. El formulario reutiliza la clave de idempotencia al reintentar desde el mismo formulario abierto y genera una nueva para un reenvío explícito. Resend conserva la clave durante 24 horas. La aceptación por Resend no verifica entrega final. Tras un resultado incierto, consulta los registros de Resend antes de cerrar la vista y comenzar otro envío. [Idempotencia de Resend](https://resend.com/changelog/idempotency-keys)
- Las lecturas de vendedores y comprobantes se comprobaron con `SELECT`. Los cambios de vendedores, los horarios y el envío se probaron con mocks. Falta validar una entrega real con el proveedor configurado y comprobar el resultado en una impresora térmica.

## Reportes y estadísticas

El módulo usa únicamente consultas `SELECT` con parámetros enlazados. React muestra la opción solo al dueño y Express comprueba de nuevo el rol de la sesión contrastándolo con `USUARIO` y `ROL_USUARIO`. El vendedor recibe HTTP 403 para los reportes y las exportaciones. El historial propio de Ventas conserva sus reglas anteriores.

### Objetos revisados y cálculo

Se contrastaron columnas, tipos, PK, FK, restricciones, dependencias, triggers y secuencias de ventas, detalle, pagos, métodos, productos, categorías, marcas, unidades, abastecimientos, proveedores, insumos, ajustes, turnos, terminales, auditorías y usuarios. `SAB_R_HORAS_VENTA`, `SAB_R_TOP_PRODUCTOS` y `SAB_R_DESCUADRES_CAJA` validan al dueño. Sus definiciones se usaron como referencia junto con `SAB_VENTA_CONFIRMAR`, `SAB_VENTA_CANCELAR`, `SAB_COMPRA_MULTIPLE`, los abastecimientos y `SAB_CERRAR_CAJA`. Los reportes ejecutan las consultas filtrables de [reportes.js](../../backend/src/services/reportes.js), sin ejecutar rutinas Oracle.

| Área | Fórmula y alcance |
| --- | --- |
| Ventas | Ingreso = suma de `VENTA.TOTAL_VENTA` confirmadas, una fila por venta. Transacciones = conteo de esas ventas. Ticket = promedio Oracle redondeado a dos decimales, vacío cuando no hay ventas. El detalle permite filtrar todos los estados. Producto, categoría y método seleccionan ventas con `EXISTS`; el ingreso incluye la venta completa. |
| Tendencias | Fecha de venta agrupada por día, semana ISO, mes o año. Período previo = el mismo número de días civiles inmediatamente anteriores. En los gráficos se alinean los grupos por posición, incluidos grupos parciales, y se indican ambas fechas. Días de mayor y menor actividad se determinan dentro del rango actual, incluyendo días sin confirmaciones; los empates se resuelven por fecha más temprana. |
| Productos | Suma de cantidad e importe histórico de las líneas confirmadas, ventas distintas por producto y precio histórico mínimo y máximo. La comparación por cantidad requiere elegir una unidad. Nombre, unidad y categoría se consultan en el catálogo actual. |
| Pagos | Suma y conteo de las filas de pago de ventas confirmadas, separados del detalle. Participación = monto de cada método dividido por el total de pagos incluido. Un filtro de método restringe las filas del informe de pagos; producto o categoría restringen las ventas admitidas. Los métodos sin pagos se muestran con cero. |
| Compras | Suma del importe por abastecimiento de producto, redondeado por línea a dos decimales como en el historial de Compras. El conteo corresponde a registros de abastecimiento, porque el esquema carece de cabecera histórica del lote. Las cantidades se separan por unidad. |
| Stock y ajustes | Activos con `STOCK_ACTUAL <= STOCK_CRITICO`; agotado = saldo cero. Es una foto actual, independiente del rango. Los ajustes históricos de producto usan `CANTIDAD_AJUSTADA × FACTOR_OPERACION`. Los abastecimientos y ajustes de insumos carecen de historial equivalente. |
| Caja | Cerrados por fecha de cierre y abiertos al momento de consultar. Responsable de caja puede ser quien abrió o cerró el turno. En abiertos, esperado por método = monto inicial + pagos confirmados del turno. En cerrados se leen importes de sistema y reales guardados. Descuadre = suma de real menos esperado por método, como en `SAB_CERRAR_CAJA`. El indicador neto permite que diferencias de signo contrario se compensen; se muestra también el número de turnos con descuadre. Las ventas del turno se agregan independientemente de los pagos. |
| Vendedores | Actividad de cuentas cuyo rol es `VENDEDOR`. El conteo de ventas registradas incluye todos los estados y las cifras monetarias usan confirmadas. Los turnos son aperturas en el rango y dependen de fecha, terminal y responsable, aunque se filtren las ventas por producto, categoría o método. |

Los períodos se eligen en `America/Santiago` y se consultan con intervalos `[desde 00:00, hasta + 1 día 00:00)`. Las columnas Oracle son `TIMESTAMP` sin zona y las rutinas escriben `SYSTIMESTAMP`; en la revisión la hora de Oracle coincidió con Santiago. Las fechas guardadas se interpretan como hora civil local y no permiten reconstruir un desplazamiento histórico si el servidor cambió de zona. Las duraciones se calculan en minutos civiles. No se infiere utilidad neta de ingresos o compras.

### API, interfaz y exportación

- `GET /api/reportes/catalogos` devuelve opciones de filtro. `GET /api/reportes/:seccion` sirve resumen, ventas, productos, pagos, compras, inventario, movimientos, caja o vendedores. Las tablas presentan 25 filas por página, con ranking limitado a 5, 10 o 20. El rango máximo es de 366 días inclusivos.
- `GET /api/reportes/:seccion/csv` exporta el detalle filtrado desde la primera fila. Usa UTF-8 con BOM, separador punto y coma y protección contra fórmulas. `GET /api/reportes/:seccion/pdf` añade el encabezado SABOTINO, período, filtros, indicadores, logo y numeración de páginas. El máximo por exportación es 1000 filas de detalle. Si se supera, la API pide acotar el rango o los filtros.
- En el navegador, entrar como dueño, abrir **Reportes**, elegir un preajuste o rango, y recorrer las secciones. Los controles muestran los filtros aplicables y las notas aclaran las excepciones. En inventario, **Abastecer** y **Ver en Inventario** llevan a los módulos existentes. Los gráficos se renderizan con Canvas y CSS, y los datos correspondientes también están disponibles en tablas.
- Desde `backend`, `node --test test/*.test.js` ejecuta las pruebas con mocks. `node test/reportes-oracle.readonly.js` comprueba cálculos Oracle con filas simuladas definidas dentro de CTE y sin modificar datos. El comprobante térmico conserva su implementación independiente del PDF A4.

## Incorporación de resultados

### Alta de insumos y edición pendiente

`POST /api/inventario/insumos` usa el actor de la sesión validada y llama a `SAB_C_INSUMO(actor, unidad, proveedor, nombre, costo, stock inicial, stock crítico, estado, id OUT)`. Según el contrato suministrado, Oracle valida al dueño y las referencias, usa `SEQ_INSUMO` y controla `COMMIT` y `ROLLBACK`. Express devuelve el ID solo tras recibir una salida válida. La pantalla Insumos incluye registros inactivos para consultar el resultado del alta, mientras el inventario general, Compras y los ajustes conservan su selección de activos. La llamada se comprobó con Oracle simulado.

La pantalla Insumos usa `SAB_AJUSTAR_STOCK_INSUMO` para los ajustes. Para evaluar una futura edición de datos, ejecutar estas consultas de solo lectura en SQL Developer con el esquema de SABOTINO seleccionado. Compartir las columnas y restricciones de `INSUMO` y el resultado de los bloques de rutinas correspondientes de [inventario.sql](inventario.sql).

```sql
SELECT owner, name, type, referenced_name, referenced_type
FROM all_dependencies
WHERE owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
  AND referenced_owner = owner
  AND referenced_name = 'INSUMO'
ORDER BY type, name;

SELECT column_name, data_type, data_length, data_precision, data_scale,
       nullable, data_default
FROM all_tab_columns
WHERE owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
  AND table_name = 'INSUMO'
ORDER BY column_id;
```

El proveedor visible en Productos se toma del abastecimiento real más reciente, ordenado por fecha y por ID en caso de empate. La vista inversa en Proveedores usa el mismo criterio. El esquema documentado carece de un vínculo editable independiente para el proveedor de un producto.

El proveedor «SABOTINO — Producción propia» se registra mediante el formulario existente y `SAB_C_PROVEEDOR` con RUT empresarial aportado por el dueño. React ofrece el registro real como alternativa seleccionable en Compras y lo preselecciona al crear insumos. El alta de productos sigue sin proveedor obligatorio, y una asociación histórica solo se origina en un abastecimiento real.

El historial de Compras pagina `ABASTECIMIENTO_PROVEEDOR` en orden descendente por fecha e ID. `SAB_COMPRA_MULTIPLE` invoca los procedimientos CORE de abastecimiento. El CORE de insumos actualiza el insumo sin dejar un movimiento de compra equivalente según la documentación disponible. Para contrastar dependencias de las rutinas con SQL Developer se puede ejecutar esta consulta de solo lectura.

```sql
SELECT name, type, referenced_name, referenced_type
FROM all_dependencies
WHERE owner = SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA')
  AND (name = 'SAB_COMPRA_MULTIPLE' OR name LIKE 'SAB_ABASTECER%')
ORDER BY name, referenced_type, referenced_name;
```

1. Confirmar el esquema y reconciliar el inventario de objetos con las referencias del código, incluidos sinónimos y dependencias entre esquemas.
2. Construir el diccionario de columnas y restricciones y el diagrama de relaciones con la extracción de Oracle.
3. Documentar por operación el camino desde React y Express hasta los objetos Oracle, con efectos sobre tablas, validaciones, permisos, errores y límites transaccionales.
4. Presentar el diseño y los archivos afectados antes de implementar. Usar los procedimientos pertinentes de Oracle para las operaciones de negocio y verificar localmente sintaxis y compilación.
