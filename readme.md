# Client Manager - Proyecto Base CAP con PostgreSQL

Proyecto base desarrollado con **SAP Cloud Application Programming Model (CAP)**, desplegado en **SAP BTP Cloud Foundry** y conectado a una base de datos **PostgreSQL**.

El objetivo de este proyecto es servir como punto de partida para una aplicación backend CAP que expone servicios OData V4 sobre una entidad de clientes.

## Tecnologías utilizadas

- SAP Cloud Application Programming Model (CAP)
- Node.js
- SAP BTP Cloud Foundry
- PostgreSQL Service en SAP BTP
- OData V4
- MTA Deployment

## Estructura del proyecto

| Carpeta / Archivo | Descripción |
|---|---|
| `app/` | Carpeta reservada para futuras aplicaciones frontend. |
| `db/` | Contiene el modelo de datos CDS y los datos iniciales. |
| `srv/` | Contiene la definición del servicio CAP y las entidades proyectadas. |
| `mta.yaml` | Descriptor MTA para desplegar la aplicación en SAP BTP. |
| `package.json` | Define dependencias, scripts y configuración CAP. |
| `README.md` | Documentación principal del proyecto. |

## Modelo de datos

El modelo de datos se encuentra en:

```text
db/schema.cds