# Atelier — plataforma de comercio

Aplicación Next.js para una tienda unificada con colecciones para Hombre y Mujer. El catálogo público puede ejecutarse en modo de muestra o conectarse a PostgreSQL para utilizar productos, usuarios, roles e inventario persistentes.

## Tecnologías

- Next.js App Router y TypeScript
- PostgreSQL y Prisma
- Validación de entrada con Zod
- Sesiones administrativas firmadas (JWT en cookie `HttpOnly`, `SameSite=Strict`)
- Hash de contraseña con bcrypt

## Inicio local

Requisitos: Node.js 20.9 o posterior, npm y Docker Desktop (o una instancia PostgreSQL accesible).

1. Copia `.env.example` como `.env` y cambia `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`. La contraseña inicial debe tener al menos 14 caracteres.
2. Inicia la base local:

   ```powershell
   docker compose up -d
   ```

3. Instala dependencias y genera el cliente de Prisma:

   ```powershell
   npm install
   npm run db:generate
   ```

   Si estableces una contraseña corta para el primer superadmin, ajusta la validación en `prisma/seed.mjs` a la longitud que necesites.

4. Crea las tablas y los datos iniciales:

   ```powershell
   npm run db:migrate
   npm run db:seed
   ```

   La migración incorpora el permiso `HOME_CONTENT_MANAGE`. La semilla crea categorías, productos/variantes iniciales y permisos para `SUPER_ADMIN`, `ADMIN` y `OPERATOR`; vuelve a ejecutarla después de migrar para que ADMIN reciba el permiso de imágenes de portada. Solo crea o actualiza el primer SuperAdmin cuando se proporcionan `ADMIN_EMAIL` y `ADMIN_PASSWORD`.

5. Arranca el sitio:

   ```powershell
   npm run dev
   ```

   Tienda: <http://localhost:3000> · Administración: <http://localhost:3000/admin/login>

Si `DATABASE_URL` no está configurada, las páginas de tienda usan un catálogo de muestra; las operaciones de reserva y administración requieren PostgreSQL.

## Funcionalidad implementada

- Portada con selector visual Hombre/Mujer, temas por segmento, navegación móvil, búsqueda, filtros de catálogo, fichas de producto, favoritos visuales y bolsa local.
- Catálogo servido desde PostgreSQL una vez configurada la base; la bolsa crea reservas de inventario de 15 minutos para variantes persistidas.
- Reserva atómica por SKU en PostgreSQL; el servidor valida disponibilidad y nunca confía en cantidades o precios enviados por el navegador.
- Retiro del carrito libera reservas; proceso idempotente de expiración disponible mediante `/api/cron/expire-reservations`.
- Inicio/cierre de sesión de administración, permisos granulares almacenados en base, panel, analítica, consulta de pedidos e inventario.
- Filtrado de productos administrativos por segmento y categoría, edición de datos y descuentos masivos porcentuales o de valor fijo con registro de auditoría.
- Creación de producto con auditoría y ajuste de inventario con motivo obligatorio.
- Máquina de estados de pedidos con transiciones validadas y registro de auditoría.
- Configuración SuperAdmin para cambiar el nombre, el texto bajo la marca, el aviso superior, los datos de contacto y la información de envíos/cambios; también permite subir/quitar el logo PNG.
- Creación de categorías para Mujer u Hombre desde configuración SuperAdmin; se publican como filtros en la tienda correspondiente y se registran en auditoría.
- Configuración de imágenes de portada disponible para Admin y SuperAdmin; permite reemplazar/restaurar las colecciones de Mujer y Hombre y audita los cambios.

## APIs iniciales

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/products?segment=MEN` | Catálogo activo con stock por variante |
| `POST` | `/api/reservations` | Reservar unidades para el carrito |
| `DELETE` | `/api/reservations` | Liberar reservas del propio carrito |
| `POST` | `/api/admin/login` | Iniciar sesión de administración |
| `POST` | `/api/admin/logout` | Cerrar sesión |
| `GET/POST` | `/api/admin/products` | Consultar/crear productos (permiso requerido) |
| `GET/PATCH` | `/api/admin/orders` | Consultar pedidos y validar cambios de estado |
| `PATCH` | `/api/admin/inventory/{variantId}` | Ajustar stock con motivo |
| `GET` | `/api/admin/site-brand` | Consultar la identidad y la información pública del sitio |
| `PUT` | `/api/admin/site-brand` | Cambiar nombre, subtítulo, aviso, contacto, envíos/cambios o logo (permiso SuperAdmin) |
| `POST` | `/api/admin/categories` | Crear categoría para Mujer u Hombre (permiso SuperAdmin) |
| `GET` | `/api/admin/home-images` | Consultar imágenes de portada |
| `PUT` | `/api/admin/home-images` | Cambiar imágenes PNG/JPG de Mujer y Hombre (permiso `HOME_CONTENT_MANAGE`, asignado a Admin/SuperAdmin) |

## Próximas integraciones antes de producción

- **Pagos y checkout:** el esquema de pedidos/pagos está preparado, pero no hay un proveedor conectado. El botón de pago permanece desactivado para no aparentar cobros que no ocurren. Integrar PSE/QR/transferencia con credenciales del proveedor y webhooks verificados antes de activar ventas.
- **Tiempo real:** conectar un proveedor WebSocket/realtime y publicar cambios de stock/pedido desde el backend.
- **Proceso de expiración:** `vercel.json` programa la ruta de cron cada cinco minutos. En otro hosting, configura un scheduler que envíe `Authorization: Bearer $CRON_SECRET`. La ruta procesa hasta 500 reservas por ejecución.
- **Protecciones operativas:** configura rate limiting distribuido para login y endpoints públicos, TLS, copias de seguridad, alertas y monitorización en el proveedor de despliegue.
- **Archivos del logo:** los PNG subidos se guardan en `public/uploads/site-brand`. En producción usa un volumen persistente o cambia el almacenamiento a un bucket/object storage antes de desplegar en infraestructura efímera.
- **Imágenes de portada:** los PNG/JPG subidos se guardan en `public/uploads/home` (máximo 5 MB por imagen). Usa almacenamiento persistente o un bucket/object storage en producción.
- **Negocio:** completar configuración de envíos, cupones/promociones, anuncios, favoritos persistidos y notificaciones.
- **Pruebas de integración:** probar concurrencia de PostgreSQL, expiración, permisos, flujos de pedido/pago y webhooks con una base de staging antes de operar con clientes.

Las claves de proveedor y contraseñas nunca deben exponerse al cliente. No uses las credenciales de ejemplo de `docker-compose.yml` fuera del desarrollo local.

## Scripts

- `npm run dev` — desarrollo
- `npm run lint` — ESLint
- `npm run build` — build de producción
- `npm run db:generate` — generar Prisma Client
- `npm run db:migrate` — migraciones de desarrollo
- `npm run db:seed` — catálogo y permisos iniciales
