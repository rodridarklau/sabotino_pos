# Auditoría técnica de SABOTINO

**Resultado:** los datos de referencia coinciden con Oracle y las verificaciones automatizadas del proyecto pasan. La evidencia permite continuar con la validación funcional de la instalación local. El despliegue multiusuario requiere resolver los puntos de infraestructura y recuperación de operaciones indicados abajo.

## Alcance y evidencia

Se revisaron React, Express, casos de prueba, manifiestos, configuración de sesión, reglas del proyecto, documentación Oracle y estado de Git. `git check-ignore backend/.env` confirmó que Git ignora ese archivo. Las dependencias directas instaladas se comprobaron con `npm ls --depth=0` en ambos proyectos. El análisis de dependencias fue local y queda pendiente la consulta de avisos del registro para el despliegue.

En Oracle se ejecutaron exclusivamente `SELECT` de diccionario, fuentes PL/SQL y datos existentes. El inventario devolvió **21 tablas, 33 índices, 21 secuencias, 75 procedimientos, 2 funciones, 8 triggers y 478 dependencias**. Todos los objetos inventariados figuraban válidos. Se comprobaron 21 restricciones PK, 28 FK, 12 UNIQUE y 128 CHECK, incluidas las restricciones de nulabilidad, todas habilitadas y validadas. Los ocho triggers de reglas, historial e inmutabilidad figuraban habilitados.

Se contrastaron las posiciones, direcciones y tipos de argumentos de los puntos de entrada llamados por Express con `USER_ARGUMENTS`. Se revisaron los cuerpos de alta inicial, catálogo y proveedores, ajustes, compra múltiple y sus auxiliares, venta, caja, usuarios y horarios. Los detalles por objeto y sus relaciones están en la [arquitectura Oracle](oracle/README.md).

Una instancia HTTP de pruebas, con sesión de dueño simulada y conexión Oracle limitada a `SELECT`, devolvió HTTP 200 en las 13 lecturas de sesión, productos, alertas, catálogos, historial de compras, existencias, ajustes, ventas, caja, vendedores y resumen. El listado de proveedores se deja fuera de esta verificación real porque su ruta usa un procedimiento de lectura, y la instrucción de auditoría limita la ejecución real a `SELECT`.

## Matriz por módulo

| Módulo | Revisión estática | Mocks | Oracle real, solo lectura |
| --- | --- | --- | --- |
| Autenticación y sesiones | Argon2id, alta inicial, regeneración, expiración, revocación, origen y roles | Sesión vigente, cuenta inactiva, versión de contraseña obsoleta y acceso de vendedor | Dos cuentas activas con versión de cuenta calculable, sin extraer valores de autenticación |
| Productos y catálogos | Parámetros de alta, edición y baja lógica; controles de unidad; estado y alertas | Cobertura indirecta de alcance y stock en ventas, inventario y reportes | Stock y unidad de Pan amasado; producto crítico en el resumen |
| Proveedores y compras | Listado, alta, edición; `SAB_COMPRA_MULTIPLE` controla el lote con un único COMMIT o ROLLBACK | Lote con proveedores distintos, validación, actor, error de unidad y respuesta incierta | Dos abastecimientos, total $1.057,30 |
| Inventario e insumos | Tipos de ajuste, unidad, saldo, observación y transacción; historial de productos | Ambos procedimientos, permisos, cantidad, saldo y errores | 4,44 KG, un ajuste visible |
| Ventas y pagos | Borrador, confirmación, precios históricos, stock, pagos y recuperación | Pagos divididos, concurrencia, compensación y resultado incierto | Una confirmada por $655 |
| Caja | Firma, arqueo, bloqueos y coordinación con Ventas | Apertura, cierre, importes, borradores pendientes y solicitudes concurrentes | Dos turnos cerrados, cero descuadre neto y cero turnos con descuadre |
| Vendedores y horarios | Rol fijo, Argon2id, alcance, permisos y solapes | Hash, edición sin cambio de rol, horarios y solapes | Vendedor observado con cero ventas registradas, una apertura y cero días con ventas |
| Comprobantes y correo | PDF de 80 mm, logo CID, adjuntos, alcance, límites e idempotencia | PDF, reenvío, rechazo, permisos y envíos simultáneos | Configuración local presente; envío previo al correo de pruebas informado por el usuario |
| Reportes | Consultas separadas por cardinalidad, filtros, estado, exportación y paginación PDF | Permisos, filtros, CSV, logo, páginas y secciones sin títulos huérfanos | Nueve secciones consultadas; cálculos de casos sintéticos comprobados con CTE de lectura |
| Frontend | Navegación, formularios, callbacks, estado de carga, CSS y gráficos responsivos por inspección | La suite cubre contratos HTTP, no interacción DOM | Compilación y lint completos; comprobación manual de navegador y móvil pendiente |

## Hallazgos y correcciones

| Prioridad | Archivo o componente | Condición e impacto | Corrección y evidencia |
| --- | --- | --- | --- |
| Alta | `server.js`, `auth.routes.js`, `seguridad-sesion.js` | Algunas rutas heredadas aceptaban una sesión ya emitida tras desactivar una cuenta. Cambiar la contraseña tampoco invalidaba la sesión. | Se revalida cuenta, rol y versión de contraseña en la API. Una sesión obsoleta se descarta y devuelve 401. Pruebas de revocación con mocks. El cierre de sesión sigue disponible si Oracle no responde. |
| Alta | `compras.routes.js`, `compras.jsx` | Una desconexión durante la compra podía mostrarse como reversión confirmada. Conservar el formulario facilitaba repetir un lote cuyo resultado era desconocido. | El backend distingue resultados inciertos y React limpia el formulario con un aviso para revisar historial y existencias. El mock simula la pérdida de conexión. Los casos confirmados de negocio conservan sus mensajes. |
| Media | Middleware HTTP en `server.js` | La cookie local ya usaba SameSite y HttpOnly. Faltaba comprobar el origen explícitamente en solicitudes mutantes. | La API comprueba el origen en solicitudes de navegador, con los orígenes explícitos del frontend local. Se prueba la política con un origen ajeno y se conserva el uso de clientes locales sin encabezado Origin. |
| Media | `compras.routes.js`, `compras.jsx` | La coerción JavaScript podía aceptar tipos incompatibles como números y el costo vacío se interpretaba como cero en el formulario. | Los campos se validan antes de convertir; cero explícito conserva su significado. Mock de entrada inválida y compilación React. |
| Media | `Reportes.jsx`, `reportes-exportacion.js` | «Días activos» sugería que abrir un turno contaba como actividad en ese indicador. | Se muestra «Días con ventas registradas», también en PDF y CSV. El cálculo se conserva y los datos reales respaldan el caso de cero ventas y una apertura. |
| Baja | `compras.jsx`, `Proveedores.jsx` | El lint rechazaba los efectos de carga inicial. | Se separó la carga inicial de la recarga manual y se cancela la solicitud inicial al desmontar. Lint completo y compilación correctos. |

## Riesgos pendientes y siguiente etapa

- **Alta, deduplicación persistente de ventas y compras.** Los locks de Oracle protegen la confirmación de una venta y el cierre de un turno determinado; no identifican dos solicitudes distintas como la misma intención comercial. La protección en proceso, el aviso de resultado incierto y la recuperación de borradores cubren la operación local. Una garantía tras reinicios o con varias instancias necesita una clave de operación persistente y un estado recuperable, mediante un cambio diseñado aparte.
- **Alta, producción.** Express usa MemoryStore, cookie HTTP de desarrollo y orígenes de Vite. Antes de publicar, configurar HTTPS, cookie Secure, proxy de confianza limitado, orígenes de despliegue, almacenamiento de sesiones compartido con TTL y controles de observabilidad. El alta inicial debe quedar disponible solo durante la puesta en marcha controlada. Revalidar el costo de las lecturas de sesión bajo carga.
- **Media, concurrencia de horarios.** Oracle valida solapes en el flujo normal, pero el procedimiento consulta antes de escribir sin un bloqueo de coordinación independiente. La protección en el proceso actual no sustituye una restricción o serialización en Oracle para varios clientes. La comprobación de usuario también es al inicio de la solicitud; una operación que ya está ejecutándose puede concluir. Desactivar y reactivar entre solicitudes, sin cambiar la contraseña, no crea una nueva versión de cuenta.
- **Media, cobertura funcional.** La aplicación admite baja lógica de productos y gestión de proveedores. La reactivación de productos y el borrado físico de proveedores no están expuestos en la UI actual. Oracle restringe el borrado por referencias y actualmente carece de historial equivalente para abastecimientos o ajustes de insumos. No se añadió funcionalidad para tapar esas diferencias.
- **Media, correo.** Se conserva `onboarding@resend.dev`. El envío al destinatario de pruebas autorizado fue informado como exitoso antes de esta auditoría. El envío a clientes distintos requiere un dominio remitente verificado. No se contrató un dominio ni se enviaron correos durante la auditoría. [Configuración de Resend](https://resend.com/changelog/official-n8n-node-for-resend)
- **Verificación final.** Repetir en un entorno de pruebas el flujo completo en navegador, incluidos alta, compra, venta, cierre, restauración tras fallos de red e impresión. Ejecutar después el análisis de avisos de dependencias, la revisión de accesibilidad y una prueba de carga. Las pruebas de mocks demuestran el contrato de Express; el COMMIT y ROLLBACK de las operaciones se revisaron en PL/SQL, sin ejecutarlos en Oracle real.

## Reproducción de las verificaciones

- Desde `frontend`, `npm run lint` y `npm run build`.
- Desde `backend`, `node --check server.js` y revisión de sintaxis de `src`, `scripts` y `test`. `node --test test/*.test.js` ejecuta **41 pruebas** con mocks y verificaciones locales de exportación.
- Desde `backend`, `node test/reportes-oracle.readonly.js` ejecuta cálculos con filas simuladas en CTE. La consulta de operaciones reales se hizo por separado, en modo lectura.
- Archivos modificados: middleware, servidor, rutas de autenticación y compras, componentes de Compras, Proveedores y Reportes, exportador de reportes, pruebas de auditoría y comprobantes, y documentación.
