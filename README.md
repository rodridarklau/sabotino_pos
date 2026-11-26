<div align="center">

# SABOTINO

### Sistema integral de gestión comercial y punto de venta

Plataforma web para administrar las operaciones de una panadería y pastelería, desde el abastecimiento hasta la venta y el cierre de caja.

![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) ![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white) ![Oracle](https://img.shields.io/badge/Oracle-21c-F80000?style=flat-square) ![Estado](https://img.shields.io/badge/Estado-desarrollo%20local-blue?style=flat-square)

</div>

## Descripción

SABOTINO reúne en una sola aplicación las operaciones de un negocio comercial. Separa la interfaz de usuario, la API y las reglas de persistencia, utilizando procedimientos almacenados de Oracle para operaciones de negocio. El proyecto está orientado a una instalación local y fue desarrollado en un contexto académico.

## Funcionalidades

| Módulo | Funcionalidad |
| --- | --- |
| Punto de venta | Catálogo, cesta, confirmación de ventas y pagos divididos |
| Caja | Apertura, arqueo y cierre de turnos |
| Inventario | Productos, insumos, ajustes y alertas de stock |
| Abastecimiento | Compras de varios artículos y gestión de proveedores |
| Usuarios | Acceso diferenciado para dueño y vendedor, horarios y sesiones |
| Reportes | Indicadores, consultas y exportación CSV/PDF |
| Comprobantes | Generación de PDF y envío por correo configurable |

## Arquitectura

```mermaid
flowchart LR
    U[Usuario] --> F[React + Vite]
    F -->|API REST| B[Express / Node.js]
    B --> D[(Oracle 21c)]
    B --> P[PDFKit]
    B --> C[Servicio de correo]
```

| Capa | Tecnología |
| --- | --- |
| Interfaz | React, Vite, CSS |
| API | Node.js, Express |
| Persistencia | Oracle Database 21c, SQL y PL/SQL |
| Seguridad | Argon2id, sesiones Express, validación de roles |
| Documentos | PDFKit |
| Pruebas | Node.js test runner y conexiones simuladas |

## Estructura

```text
backend/
  src/config/       Configuración y conexión
  src/routes/       Endpoints de la API
  src/services/     Servicios de negocio
  test/             Pruebas automatizadas
frontend/
  src/              Componentes y estilos
  public/           Recursos visuales
  scripts/          Herramientas de verificación
docs/
  oracle/           Arquitectura de base de datos
```

## Instalación local

Necesitas Git, Node.js compatible con las dependencias del proyecto, npm y una instancia Oracle 21c con una base pluggable abierta, como `XEPDB1` en Oracle XE.

```bash
git clone https://github.com/rodridarklau/base-de-datos.git
cd base-de-datos
```

### Preparar Oracle

Desde una cuenta administradora de la PDB, crea un esquema vacío y sustituye `TU_CONTRASENA` por una contraseña propia.

```sql
CREATE USER SABOTINO IDENTIFIED BY "TU_CONTRASENA" DEFAULT TABLESPACE USERS QUOTA 64M ON USERS;
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE PROCEDURE, CREATE TRIGGER TO SABOTINO;
```

Desde la raíz del repositorio, abre SQL*Plus en la carpeta `docs/oracle`. SQL*Plus solicitará la contraseña.

```powershell
cd docs/oracle
sqlplus 'SABOTINO@localhost:1521/XEPDB1' '@instalar_desde_cero.sql'
```

Al terminar, debe aparecer `Total SABOTINO: 149 procedimientos VALID (70 base + 79 API).` Si el esquema ya contiene una instalación anterior, sigue la guía para revisar sus dependencias y ejecutar el instalador incremental. [Guía de actualización](docs/oracle/RETIRO_5_PROCEDIMIENTOS.md)

### Iniciar la aplicación

Crea un archivo local `backend/.env` con la configuración propia.

```dotenv
ORACLE_USER=SABOTINO
ORACLE_PASSWORD=tu_contrasena
ORACLE_CONNECT_STRING=localhost:1521/XEPDB1
SESSION_SECRET=tu_secreto_de_sesion
PORT=3000
```

El secreto de sesión debe tener al menos 32 caracteres y generarse de forma segura. El servicio de correo es opcional y requiere configuración adicional.

En una terminal, desde la raíz del repositorio, inicia la API.

```bash
cd backend
npm ci
node server.js
```

En otra terminal, desde la raíz del repositorio:

```bash
cd frontend
npm ci
npm run dev
```

Abre la dirección local que indica Vite (habitualmente `http://localhost:5173`). El proxy de desarrollo conecta con la API local. Si el esquema está vacío de usuarios, registra al primer dueño desde la pantalla de configuración inicial.

## Verificación

Desde `backend`:

```bash
npm run oracle:auditar
npm test
node test-oracle.js
```

Desde `frontend`:

```bash
npm run lint
npm run build
```

La auditoría ES3 documenta el cumplimiento de la rúbrica. El inventario de Oracle identifica los 149 procedimientos vigentes y su uso. [Auditoría ES3](docs/AUDITORIA_ES3_INF324.md) · [Inventario de Oracle](docs/oracle/inventario_procedimientos.csv)

## Estado y alcance

Proyecto en desarrollo local. Antes de un despliegue público es necesario revisar HTTPS, almacenamiento de sesiones, configuración de orígenes, dependencias y protección de datos. Las pruebas y la instalación dependen del entorno disponible.

## Créditos

Proyecto académico colaborativo. Los aportes individuales se reflejan en el historial del repositorio; la documentación no atribuye en exclusiva el trabajo grupal a una sola persona.
