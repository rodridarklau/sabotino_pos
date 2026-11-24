# Catálogo visual y punto de venta

[Vista previa de la biblioteca](catalogo-visual.png) · [Catálogo en escritorio](punto-de-venta.png) · [Catálogo a 390 px](punto-de-venta-movil.png)

Las capturas de Ventas muestran el componente renderizado con una ilustración elegida para la vista previa. No se guardó esa asociación durante las pruebas.

## Biblioteca inicial

Las 30 ilustraciones son SVG originales de 512 × 512 píxeles, generados localmente mediante `frontend/scripts/biblioteca-productos.mjs`. Los SVG y el manifiesto se publican en `frontend/public/productos-base/`. Cada entrada registra ID, nombre, categoría, ruta relativa, sinónimos y origen. La generación carece de dependencias externas. Para comprobar que todos los archivos coincidan con el generador, ejecutar desde la raíz:

```text
node frontend/scripts/biblioteca-productos.mjs --verificar
```

Las ilustraciones son recursos de catálogo. La disponibilidad comercial proviene de la consulta de productos activos en Oracle.

## Administración

En **Productos**, el dueño puede crear o editar un producto y abrir **Imagen del producto**. La galería permite buscar por nombre o sinónimo, filtrar por categoría, ver una sugerencia cuando hay una coincidencia exacta y confirmar la elección. Para usar una foto propia, seleccionar un JPG, PNG o WebP. El backend comprueba el formato decodificado con Sharp, admite hasta 5 MB y 16 megapíxeles, rechaza archivos animados, redimensiona a un máximo de 512 × 512 y publica WebP con nombre derivado de su contenido.

En un producto existente, **Guardar imagen y favorito** persiste solo los datos visuales. Al crear un producto, la asociación ocurre tras recibir su ID de Oracle. Si guardar la imagen falla, la interfaz identifica que el producto ya se guardó y permite volver a editar sus preferencias. **Mostrar en Acceso rápido** controla el favorito.

## Datos y permisos

- Oracle sigue proporcionando precio, identificación, categoría, unidad, stock y estado. Las asociaciones se guardan por `ID_PRODUCTO` en `backend/datos-locales/imagenes-productos/productos.json` y las fotos en el subdirectorio `fotos/`.
- El almacenamiento local se excluye de Git y persiste entre reinicios. Las escrituras se serializan dentro de la instancia y cada registro usa una revisión optimista para impedir sobrescrituras obsoletas. Los archivos se publican mediante renombrado atómico. Los nombres de fotos solo admiten hashes hexadecimales y las imágenes base se seleccionan mediante IDs del manifiesto.
- El dueño administra las asociaciones y fotos. Un vendedor autenticado ve las visuales del catálogo de venta. Los favoritos son compartidos. Además, **Acceso rápido** incluye productos activos con al menos dos ventas confirmadas distintas durante los últimos 30 días. Para el vendedor, ese conteo usa exclusivamente sus ventas.
- El catálogo vuelve a consultarse al entrar en Ventas, al recuperar el foco, al actualizar manualmente y después de una venta. Oracle vuelve a validar existencias y unidades al registrar la operación. Las fotos cargan de forma diferida y el nombre por contenido permite cachear versiones sin mostrar una foto antigua tras reemplazarla.
- Para varias instancias o almacenamiento efímero, migrar asociaciones a un almacén compartido con control de versiones y fotos a almacenamiento persistente. Incluir `backend/datos-locales/` en las copias de seguridad locales. Las fotos anteriores se conservan para evitar borrar archivos usados por otra asociación.

## Generación con IA

El botón **Generar imagen con IA** informa que la integración está desactivada. La biblioteca funciona sin Gemini ni credenciales. Una futura implementación deberá validar según la documentación vigente el modelo y la facturación, mantener secretos del lado del servidor y exigir una acción explícita del dueño. La operación deberá crear una vista previa temporal bajo límites de frecuencia, concurrencia y presupuesto. Solo una segunda acción explícita de aprobación deberá asociar el resultado, usando la misma canalización de normalización y almacenamiento de fotos. El catálogo y las lecturas de Ventas permanecen independientes del proveedor.
