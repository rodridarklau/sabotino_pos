
# SABOTINO — Instrucciones para Codex

## Contexto del proyecto

SABOTINO es un sistema web de gestión de una panadería,
desarrollado como proyecto universitario.

Tecnologías:
- Frontend: React + Vite.
- Backend: Node.js + Express.
- Base de datos: Oracle Database 21c XE.
- Conexión Oracle: XEPDB1, mediante node-oracledb.
- Autenticación: sesiones Express y contraseñas Argon2.
- Desarrollo local en Windows y VS Code.

Carpeta: C:\Proyectos\SABOTINO

Frontend:
- frontend/src/App.jsx
- frontend/src/Compras.jsx
- frontend/src/Proveedores.jsx
- frontend/src/Inventario.jsx (en desarrollo)

Backend:
- backend/server.js
- backend/src/config/database.js
- backend/src/routes/

Vite se ejecuta normalmente en localhost:5173.
Express se ejecuta en localhost:3000.
Vite utiliza un proxy para las rutas /api.

## Funcionalidades desarrolladas

1. Conexión a Oracle 21c.
2. Registro inicial e inicio de sesión del dueño.
3. Registro, listado, búsqueda y edición de productos.
4. Desactivación lógica de productos.
5. Alertas de inventario por stock crítico.
6. Registro y edición de proveedores.
7. Compras múltiples de productos e insumos.
8. Abastecimiento y actualización de existencias.
9. Historial de compras de productos.

Módulo actual: INVENTARIO.
Su implementación aún debe verificarse en el proyecto.

Módulos pendientes:
- Finalizar inventario y ajustes.
- Ventas y métodos de pago.
- Caja y turnos.
- Gestión de vendedores.
- Reportes.
- Mejoras visuales.
- Pruebas finales.

Los archivos reales son la fuente de verdad.
Verificar qué está implementado antes de asumir que algo funciona.

## Base de datos

Oracle contiene tablas, relaciones, secuencias,
triggers y procedimientos almacenados ya desarrollados.

Procedimientos importantes:

PRODUCTOS:
- SAB_C_PRODUCTO
- SAB_U_PRODUCTO
- SAB_D_PRODUCTO

PROVEEDORES:
- SAB_C_PROVEEDOR
- SAB_L_PROVEEDOR
- SAB_U_PROVEEDOR
- SAB_D_PROVEEDOR

COMPRAS:
- SAB_COMPRA_MULTIPLE
- SAB_ABASTECER
- SAB_ABASTECER_INSUMO

INVENTARIO:
- SAB_AJUSTAR_STOCK
- SAB_AJUSTAR_STOCK_INSUMO

SAB_D_PRODUCTO desactiva lógicamente el producto.
SAB_D_PROVEEDOR elimina físicamente el proveedor.

SAB_COMPRA_MULTIPLE recibe un CLOB JSON con objetos:
{
  "tipo": "PRODUCTO",
  "id_articulo": 1,
  "id_proveedor": 2,
  "cantidad": 10,
  "costo_unitario": 300
}

El tipo puede ser PRODUCTO o INSUMO.
Oracle controla las transacciones y el stock.

Los ajustes de productos tienen historial.
Los ajustes de insumos no tienen un historial equivalente
en el procedimiento actual.

## REGLAS OBLIGATORIAS DE SEGURIDAD

1. NO modificar la estructura de Oracle sin autorización.
2. NO ejecutar DROP, TRUNCATE, DELETE, ALTER ni
   migraciones de base de datos.
3. NO ejecutar INSERT, UPDATE, procedimientos de escritura
   ni pruebas POST/PUT/DELETE contra Oracle real.
4. NO conectarse directamente a Oracle.
5. NO leer, mostrar, copiar ni modificar archivos .env,
   claves, contraseñas o secretos.
6. NO cambiar procedimientos, triggers o secuencias.
7. NO eliminar archivos o datos existentes sin autorización.
8. NO hacer commits, push ni cambios de ramas Git.
9. NO instalar dependencias nuevas sin justificarlo y
   solicitar autorización.
10. NO implementar funciones sin revisar primero
    las rutas y procedimientos existentes.
11. NO realizar pruebas que escriban datos reales.
12. Solicitar autorización antes de cualquier operación
    irreversible.

Para trabajar con Oracle, utilizar la documentación,
las firmas de procedimientos y las consultas SQL
que proporcione el usuario.

Si falta información de una tabla o procedimiento,
solicitarla. No inventar estructuras.

## Forma de trabajar

- Responder en español.
- Revisar primero el código existente.
- Mantener las funcionalidades que ya funcionan.
- Trabajar por módulos y no modificar todo a la vez.
- Presentar un plan antes de cambios importantes.
- Hacer modificaciones mínimas y justificadas.
- Reutilizar componentes y rutas existentes.
- Validar datos tanto en frontend como en backend.
- Respetar los permisos del dueño y los vendedores.
- Ejecutar verificaciones de sintaxis y compilación
  que no modifiquen la base de datos.
- No afirmar que una función está probada en Oracle
  si no se ha comprobado realmente.
- Mostrar qué archivos fueron modificados.
- Informar los resultados de las pruebas y
  cualquier limitación.

Objetivo: completar SABOTINO sin perder funcionalidades
ni comprometer la integridad de la base de datos.

## USO OBLIGATORIO DE LOS PROCEDIMIENTOS ORACLE

La base de datos de SABOTINO contiene procedimientos
almacenados que implementan las reglas del negocio.

Estos procedimientos son la fuente de verdad para las
operaciones sobre la base de datos.

ANTES de implementar cualquier módulo:

1. Identificar TODOS los procedimientos relacionados
   con la funcionalidad solicitada.

2. Investigar para cada procedimiento:
   - Parámetros de entrada y salida.
   - Tipos de datos.
   - Código PL/SQL completo.
   - Validaciones y restricciones.
   - Permisos y roles.
   - Tablas utilizadas.
   - Procedimientos CORE y auxiliares.
   - Triggers relacionados.
   - Uso de COMMIT y ROLLBACK.
   - Errores Oracle que puede generar.

3. Revisar las relaciones y columnas de las tablas
   utilizadas en el módulo.

4. Reutilizar los procedimientos existentes para las
   operaciones de negocio. No reemplazar su lógica
   con INSERT, UPDATE o DELETE directos.

5. No inventar nombres, parámetros, tablas ni columnas.

6. No implementar funcionalidades que contradigan
   las reglas definidas en PL/SQL.

7. Si falta información, generar consultas SQL de
   SOLO LECTURA para que el usuario las ejecute
   en SQL Developer y entregue los resultados.

8. No conectarse directamente a Oracle ni ejecutar
   procedimientos sin autorización expresa.

9. Antes de modificar código, presentar un resumen:
   - Procedimientos encontrados.
   - Función de cada procedimiento.
   - Cómo se utilizarán desde Express.
   - Qué archivos necesitan cambios.
   - Riesgos y limitaciones identificados.

10. Después de implementar, verificar que las
    llamadas a Oracle respeten exactamente las
    firmas y reglas de los procedimientos.

REGLA PRINCIPAL:
No desarrollar un módulo sin comprender primero
su implementación en Oracle.

Utilizar todos los procedimientos PERTINENTES,
sin llamar innecesariamente a procedimientos
de otros módulos.

# ANÁLISIS INTEGRAL OBLIGATORIO DE ORACLE

La base de datos Oracle 21c de SABOTINO ya está diseñada
e implementada. Debe tratarse como la fuente de verdad
para la estructura de datos y las reglas del negocio.

NO es suficiente analizar únicamente procedimientos.

## Antes de desarrollar un módulo

Debes investigar todos los objetos de Oracle relacionados:

1. TABLAS
   - Columnas, tipos y precisión.
   - Claves primarias y foráneas.
   - Restricciones CHECK, UNIQUE y NOT NULL.
   - Valores por defecto.
   - Relaciones entre entidades.

2. PROCEDIMIENTOS Y FUNCIONES
   - Parámetros y tipos.
   - Código PL/SQL.
   - Reglas del negocio.
   - Validaciones.
   - Procedimientos auxiliares y CORE.
   - Excepciones y códigos de error.

3. TRIGGERS
   - Tabla y eventos asociados.
   - Momento de ejecución.
   - Condiciones y comportamiento.
   - Cambios automáticos.
   - Posibles efectos secundarios.

4. SECUENCIAS
   - Identificadores generados automáticamente.
   - Relación con procedimientos y triggers.

5. VISTAS E ÍNDICES
   - Vistas existentes y su finalidad.
   - Índices relevantes para las consultas.

6. SEGURIDAD
   - Usuarios, roles y permisos.
   - Validaciones de autorización.
   - Restricciones de acceso a las operaciones.

7. TRANSACCIONES Y DEPENDENCIAS
   - COMMIT y ROLLBACK.
   - Bloqueos y concurrencia.
   - Dependencias entre objetos.
   - Efectos sobre otras tablas.

## Metodología obligatoria

FASE 1: INVESTIGACIÓN

Revisar todos los objetos relevantes y documentar
cómo funciona la funcionalidad en Oracle.

Si faltan detalles, generar consultas SQL de SOLO LECTURA
para que el usuario las ejecute en SQL Developer.

Nunca inventar estructuras ni asumir comportamientos.

FASE 2: DISEÑO

Explicar cómo se conectará React con Express y Oracle.

Identificar qué procedimientos existentes se utilizarán
y qué validaciones son necesarias en cada capa.

FASE 3: IMPLEMENTACIÓN

Modificar directamente los archivos existentes.
Reutilizar las reglas del negocio implementadas en Oracle.

No modificar la base de datos sin autorización explícita.

FASE 4: VERIFICACIÓN

Comprobar sintaxis, compilación, manejo de errores,
seguridad y consistencia con Oracle.

No ejecutar pruebas de escritura sobre la base real.
Solicitar al usuario las pruebas manuales necesarias.

## Documentación permanente

Crear y mantener documentación del esquema:
- Objetos relevantes.
- Relaciones y dependencias.
- Reglas de negocio.
- Procedimientos y funciones.
- Riesgos y limitaciones.
- Módulos implementados y pendientes.

No almacenar contraseñas ni secretos.

## PROHIBICIONES

- No modificar tablas, triggers, procedimientos,
  funciones, vistas, secuencias ni restricciones.
- No ejecutar SQL que altere datos o estructura.
- No conectarse directamente a Oracle sin autorización.
- No omitir las reglas del negocio existentes.
- No inventar objetos ni relaciones.
- No realizar commits de Git sin autorización.

Estas reglas prevalecen sobre la comodidad
o rapidez de implementación.
