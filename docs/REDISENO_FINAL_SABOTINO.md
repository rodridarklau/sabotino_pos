# SABOTINO 2.0 · Rediseño de módulos

Se actualizó la interfaz del proyecto existente con la paleta, la iconografía y la combinación tipográfica de Inicio. Las pantallas usan superficies blancas y marfil, títulos editoriales y cifras en tipografía sans-serif. La barra principal conserva el logo circular original y las opciones de cada rol.

## Matriz de preservación

| Módulo | Cambio de interfaz | Operaciones conservadas |
| --- | --- | --- |
| Caja | Pestañas de turno actual, terminales e historial. El arqueo distingue el importe esperado, el contado y la diferencia. | Consulta, filtro, detalle y paginación, apertura y cierre con confirmación, administración de terminales según rol. Los formularios y el arqueo mantienen su estado al cambiar de pestaña. |
| Productos | Catálogo con miniaturas, búsqueda identificada, estados y formulario agrupado en información general, comercial, inventario e imagen. | Alta, edición, baja lógica, alertas y abastecimiento desde producto. Biblioteca de 30 ilustraciones, fotos, asociaciones persistentes y favoritos. La opción de IA conserva su estado desactivado. |
| Inventario | Indicadores de artículos activos y stock crítico. El ajuste se distingue de la consulta y el historial. | Búsqueda, filtro de productos e insumos, selección rápida del artículo, unidades, observación donde corresponde, validación, confirmación e historial de ajustes de productos. |
| Compras | Pestañas de nuevo abastecimiento e historial. Cada artículo conserva su tarjeta editable y el total tiene un bloque propio. | Líneas múltiples, tipo, proveedor por línea, creación de proveedor, cantidades, costos, subtotales, confirmación e historial. El aviso de resultado incierto conserva la indicación de revisar historial y existencias. |
| Proveedores | Encabezado, búsqueda con etiqueta visible, acciones secundarias y estados de carga, error y vacío. | Listado, actualización, búsqueda, alta y edición con los campos y validaciones actuales de RUT y contacto. |
| Vendedores y horarios | Estados de cuenta y asignación visibles en tablas. Se distinguen el día, la entrada, la salida y las acciones sensibles. | Alta y edición de cuenta, cambio de contraseña y estado, consulta de horarios y alta, edición y eliminación de asignaciones. Se conservan las confirmaciones, restricciones y validaciones existentes. |
| Reportes | Navegación interna compartida, filtros antes de resultados, indicadores con cifras tabulares, gráficos con colores diferenciados y tablas con importes alineados. | Resumen, Ventas, Productos, Pagos, Compras, Inventario, Movimientos, Caja y Vendedores. Se conservan el período, los filtros específicos, la paginación, las acciones y las exportaciones disponibles en cada sección. |
| Ventas | Adopta el mismo control de pestañas en la revisión de consistencia. | Nueva venta, historial, carrito, pagos, turnos y comprobantes conservan el flujo previo. |

Las confirmaciones nativas y los pasos de revisión existentes siguen activos. Las tablas anchas conservan sus columnas dentro de regiones desplazables y enfocables.

## Componentes y archivos

- Presentación compartida en `frontend/src/Presentacion.jsx` y `frontend/src/Presentacion.css`. Incluye encabezados con el icono del menú, botones de pestaña con estado accesible, indicadores de estado y patrones para tablas, ayudas, formularios y estados vacíos.
- Caja en `Caja.jsx` y `Caja.css`. Productos en `App.jsx`. Inventario en `Inventario.jsx`.
- Compras en `compras.jsx` y `Compras.css`. Proveedores en `Proveedores.jsx`. Personal en `Vendedores.jsx`.
- Reportes en `Reportes.jsx`, `Reportes.css` y `ReportesGraficos.jsx`. Consistencia de pestañas en `Ventas.jsx` y `Ventas.css`.
- Prueba de navegador en `frontend/scripts/verificar-interfaz.mjs`. Evidencia visual en `docs/capturas-rediseno/`.

Productos consulta una vez por carga o actualización el **GET existente** `/api/productos-imagenes` para mostrar las asociaciones locales. Esta lectura está limitada al dueño y el listado comercial sigue disponible si falla. El vendedor conserva las imágenes disponibles en el catálogo de Ventas. Los contratos HTTP, las solicitudes comerciales, los cálculos, las reglas, el pool y los procedimientos Oracle se conservaron. La referencia de tablas, procedimientos y transacciones está en [Arquitectura Oracle](oracle/README.md).

## Verificaciones

| Verificación | Resultado |
| --- | --- |
| Lint y compilación de Vite, antes y después del cambio | Correctos |
| Suite existente de Node con mocks y verificaciones locales de exportación | 48 de 48 antes y después |
| Biblioteca visual | 30 ilustraciones verificadas |
| Navegación en Chromium con respuestas simuladas | Ocho módulos visitados en 1920 × 1080, 1366 × 768, 1024 × 768, 768 × 1024 y 390 × 844 sin desbordamiento horizontal de página en los escenarios probados |
| Formularios y roles | Conservación de datos al alternar pestañas, arqueo con revisión y cancelación, miniatura y editor de producto, ajuste inválido, compra incierta simulada, alta y edición visibles, permisos de menú y terminales |
| Reportes | Nueve secciones, error simulado, gráfico consultable por teclado y solicitudes de CSV y PDF con fechas. La suite existente verifica el contenido de las exportaciones. |
| Comparación del árbol de trabajo | Huellas SHA-256 de los archivos previos comparadas con la línea base. El repositorio carecía de un commit base. Backend y documentación Oracle coinciden con su estado inicial. |

Desde `frontend`, ejecutar `npm run lint`, `npm run build` y `node scripts/biblioteca-productos.mjs --verificar`. Para la prueba de interfaz, indicar la ruta al ejecutable Chromium mediante `SABOTINO_NAVEGADOR` y ejecutar `node scripts/verificar-interfaz.mjs` después de compilar. La prueba usa un servidor HTTP local con datos simulados y puede guardar capturas en el directorio indicado por `SABOTINO_CAPTURAS`. En la ejecución de este entorno Brave necesitó la opción `SABOTINO_CHROMIUM_LOCAL_SIN_SANDBOX=1` para que el proceso de renderizado respondiera al controlador local. Desde `backend`, ejecutar `node --test test/*.test.js`.

## Capturas

| Módulo | Escritorio | Móvil |
| --- | --- | --- |
| Caja | [1366 × 768](capturas-rediseno/caja-1366.png) | [390 × 844](capturas-rediseno/caja-390.png) |
| Productos | [1366 × 768](capturas-rediseno/productos-1366.png) | [390 × 844](capturas-rediseno/productos-390.png) |
| Inventario | [1366 × 768](capturas-rediseno/inventario-1366.png) | [390 × 844](capturas-rediseno/inventario-390.png) |
| Compras | [1366 × 768](capturas-rediseno/compras-1366.png) | [390 × 844](capturas-rediseno/compras-390.png) |
| Proveedores | [1366 × 768](capturas-rediseno/proveedores-1366.png) | [390 × 844](capturas-rediseno/proveedores-390.png) |
| Vendedores | [1366 × 768](capturas-rediseno/vendedores-1366.png) | [390 × 844](capturas-rediseno/vendedores-390.png) |
| Reportes | [1366 × 768](capturas-rediseno/reportes-1366.png) | [390 × 844](capturas-rediseno/reportes-390.png) |

## Limitaciones y pendientes

Las comprobaciones usaron Chromium con tamaños emulados y datos simulados. La validación en dispositivos físicos, otros navegadores y con tecnología de asistencia queda pendiente. Las operaciones reales de Oracle y los envíos de correo quedaron fuera de las pruebas. El historial de Compras y el de ajustes mantienen el alcance de productos que ofrece la aplicación. Los diálogos nativos conservan la presentación del navegador.
