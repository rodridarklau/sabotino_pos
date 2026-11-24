# SABOTINO 2.0 · Fase 1

Inicio es la vista inicial tras iniciar sesión. El encabezado compartido conserva la identificación, el rol y el cierre de sesión. El menú muestra los módulos permitidos y se abre mediante un botón en pantallas de hasta 860 px. Los horarios siguen dentro de Vendedores.

## Datos de Inicio

`GET /api/inicio` usa la sesión existente y comprueba el usuario y su rol activo. La respuesta tiene `Cache-Control: no-store`. Una visita a Inicio solicita una lectura y el botón Actualizar Inicio permite repetirla. Al navegar fuera se cancela la solicitud del navegador.

| Indicador | Fuente y alcance |
| --- | --- |
| Importe y cantidad de ventas confirmadas | `VENTA`, conteo por venta y suma de `TOTAL_VENTA`. Incluye desde la medianoche civil en Santiago hasta el comienzo del día siguiente. Para el vendedor se vincula su ID a `ID_USUARIO`. |
| Turnos abiertos | `TURNO_CAJA` y `CAJA_TERMINAL`. Para el vendedor se muestran los turnos que abrió. El acceso a Caja conserva las reglas del módulo operativo. |
| Stock crítico | Consulta compartida con Productos sobre `PRODUCTO` y `UNIDAD_MEDIDA`. Incluye productos activos con stock igual o inferior al umbral, solo para el dueño. Abastecer utiliza la selección inicial existente en Compras. |

Cada lectura distingue un resultado vacío de un error. La actividad muestra turnos y alertas. La fecha de venta usa la misma interpretación civil de los campos Oracle `TIMESTAMP` documentada en [Arquitectura Oracle](oracle/README.md).

## Comprobación local

Con el frontend y backend habituales en ejecución, iniciar sesión como dueño y comprobar los indicadores, el menú y el acceso de abastecimiento si hay alertas. Iniciar sesión como vendedor y comprobar sus ventas confirmadas, sus turnos y las opciones de menú. A 390 px, abrir el menú, elegir un módulo y comprobar que el menú se cierra y el cierre de sesión sigue disponible.

Las comprobaciones de esta fase usan respuestas simuladas. Para corroborar las cifras de la instalación, comparar Inicio con Reportes del mismo día comercial, con las alertas de Productos y con Caja.

## Capturas de referencia

- [Inicio del dueño](inicio-dueno-escritorio.png)
- [Inicio del vendedor](inicio-vendedor-escritorio.png)
- [Menú móvil abierto](inicio-menu-movil.png)
- [Inicio del vendedor a 390 px](inicio-vendedor-movil.png)

Las capturas muestran sesiones simuladas y el estado vacío, con el logo oficial incluido.
