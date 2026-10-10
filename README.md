# Atelier — plataforma de comercio

Aplicación Next.js para una tienda unificada con colecciones para Hombre y Mujer. Los datos persistentes de la tienda se almacenan en Cloudflare D1 (SQLite) y se acceden mediante Prisma con el binding `DB` de Cloudflare.

## Tecnologías

- Next.js App Router y TypeScript
- Cloudflare D1 (SQLite), Prisma y `@prisma/adapter-d1`
- Validación de entrada con Zod
- Sesiones administrativas firmadas (JWT en cookie `HttpOnly`, `SameSite=Strict`)
- Hash de contraseña con bcrypt

## Inicio local

Requisitos: Node.js 20.9 o posterior, npm y Wrangler autenticado para migrar la base remota.

1. Copia `.env.example` como `.env` y configura `SESSION_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`. Usa secretos aleatorios y una contraseña inicial de al menos 14 caracteres. `DATABASE_URL` no selecciona la base de datos en el runtime de Cloudflare.
2. Genera el cliente Prisma y aplica el esquema a D1 local:

   ```powershell
   npm install
   npm run db:generate
   npm run db:migrate:local
   ```

3. Para aplicar las migraciones a la D1 remota configurada en `wrangler.jsonc`, inicia sesión con Wrangler y ejecuta:

   ```powershell
   npx wrangler login
   npm run db:migrate:remote
   ```

4. Arranca el sitio en desarrollo o prueba el build adaptado a Workers:

   ```powershell
   npm run dev
   ```

   ```powershell
   npm run preview
   ```

   Tienda: <http://localhost:3000> · Administración: <http://localhost:3000/admin/login>. El runtime usa el binding D1 `DB`; si ese binding no está configurado, las consultas deben fallar explícitamente en vez de mostrar datos de muestra como si fueran datos persistidos.

## Despliegue con Cloudflare Workers Builds

En la configuración de builds del Worker conectado al repositorio, usa:

- **Build command:** `npm run build:cloudflare`
- **Deploy command:** `npx wrangler deploy`

No uses `npm run build` como build command: ejecuta únicamente `next build` y no genera el worker ni la configuración compilada de OpenNext que requiere `wrangler deploy`. El comando `build:cloudflare` genera Prisma Client y crea los artefactos de OpenNext. El cliente Prisma se importa desde su entrypoint WASM para que el build del Worker empaquete el compilador WASM como módulo en lugar de intentar leerlo del sistema de archivos en runtime.

Next.js se mantiene fijado en `16.3.8` porque Next.js `16.4.0` introduce `preview-props.json`, que OpenNext Cloudflare `1.20.10` todavía no incorpora al bundle de runtime; actualizarlo antes de que el adaptador incluya ese manifiesto provoca errores 1101 al abrir la tienda.

## Funcionalidad implementada

- Portada con selector visual Hombre/Mujer, temas por segmento, navegación móvil, búsqueda, filtros de catálogo, fichas de producto, favoritos visuales y bolsa local.
- Catálogo servido desde D1; la bolsa crea reservas de inventario de 15 minutos para variantes persistidas.
- Reserva de inventario en D1; el servidor valida disponibilidad y nunca confía en cantidades o precios enviados por el navegador.
- Retiro del carrito libera reservas; proceso idempotente de expiración disponible mediante `/api/cron/expire-reservations`.
- Inicio/cierre de sesión de administración, permisos granulares almacenados en base, panel, analítica, consulta de pedidos e inventario.
- Filtrado de productos administrativos por segmento y categoría, edición de datos y descuentos masivos porcentuales o de valor fijo con registro de auditoría.
- Margen porcentual predeterminado configurable por SuperAdmin para productos nuevos; cada producto conserva su valor de creación, permite editar el margen al actualizarlo y redondea el precio calculado al millar más cercano.
- Creación de producto con auditoría y ajuste de inventario con motivo obligatorio; el SuperAdmin puede eliminar productos inactivos o agotados, salvo que tengan historial de pedidos. La eliminación también borra sus variantes, movimientos de inventario, reservas y artículos de carritos, y deja un registro de auditoría.
- Máquina de estados de pedidos con transiciones validadas y registro de auditoría.
- Configuración SuperAdmin para cambiar el nombre, el texto bajo la marca, el aviso superior, los datos de contacto y la información de envíos/cambios; también permite subir/quitar el logo PNG.
- Creación de categorías para Mujer u Hombre desde configuración SuperAdmin; se publican como filtros en la tienda correspondiente y se registran en auditoría.
- Configuración de imágenes de portada disponible para Admin y SuperAdmin; permite guardar URLs HTTP/HTTPS o restaurar las imágenes predeterminadas de Mujer y Hombre, y audita los cambios.

## APIs iniciales

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/products?segment=MEN` | Catálogo activo con stock por variante |
| `POST` | `/api/reservations` | Reservar unidades para el carrito |
| `DELETE` | `/api/reservations` | Liberar reservas del propio carrito |
| `POST` | `/api/admin/login` | Iniciar sesión de administración |
| `POST` | `/api/admin/logout` | Cerrar sesión |
| `GET/POST` | `/api/admin/products` | Consultar/crear productos (permiso requerido) |
| `PUT` | `/api/admin/pricing-settings` | Configurar el margen porcentual predeterminado para productos nuevos (solo SuperAdmin) |
| `DELETE` | `/api/admin/products/{productId}` | Eliminar un producto inactivo o agotado (solo SuperAdmin; bloqueado si tiene pedidos) |
| `GET/PATCH` | `/api/admin/orders` | Consultar pedidos y validar cambios de estado |
| `PATCH` | `/api/admin/inventory/{variantId}` | Ajustar stock con motivo |
| `GET` | `/api/admin/site-brand` | Consultar la identidad y la información pública del sitio |
| `PUT` | `/api/admin/site-brand` | Cambiar nombre, subtítulo, aviso, contacto, envíos/cambios o logo (permiso SuperAdmin) |
| `POST` | `/api/admin/categories` | Crear categoría para Mujer u Hombre (permiso SuperAdmin) |
| `GET` | `/api/admin/home-images` | Consultar imágenes de portada |
| `PUT` | `/api/admin/home-images` | Guardar las URLs HTTP/HTTPS de las imágenes de Mujer y Hombre (permiso `HOME_CONTENT_MANAGE`, asignado a Admin/SuperAdmin) |

## Próximas integraciones antes de producción

- **Pagos y checkout:** el esquema de pedidos/pagos está preparado, pero no hay un proveedor conectado. El botón de pago permanece desactivado para no aparentar cobros que no ocurren. Integrar PSE/QR/transferencia con credenciales del proveedor y webhooks verificados antes de activar ventas.
- **Tiempo real:** conectar un proveedor WebSocket/realtime y publicar cambios de stock/pedido desde el backend.
- **Proceso de expiración:** `vercel.json` programa la ruta de cron cada cinco minutos. En otro hosting, configura un scheduler que envíe `Authorization: Bearer $CRON_SECRET`. La ruta procesa hasta 500 reservas por ejecución.
- **Protecciones operativas:** configura rate limiting distribuido para login y endpoints públicos, TLS, copias de seguridad, alertas y monitorización en el proveedor de despliegue.
- **Archivos del logo:** los PNG subidos se guardan en `public/uploads/site-brand`. En producción usa un volumen persistente o cambia el almacenamiento a un bucket/object storage antes de desplegar en infraestructura efímera.
- **Imágenes de portada:** se almacenan como URLs públicas HTTP/HTTPS en D1; las imágenes deben estar alojadas en un servicio accesible públicamente.
- **Negocio:** completar configuración de envíos, cupones/promociones, anuncios, favoritos persistidos y notificaciones.
- **Datos iniciales:** aplica primero las migraciones D1 y configura de forma segura el SuperAdmin, el catálogo, los permisos y los ajustes comerciales antes de aceptar pedidos.
- **Pruebas de integración:** probar concurrencia, expiración, permisos y flujos de pedido/pago en una D1 de staging antes de operar con clientes.

Las claves de proveedor y contraseñas nunca deben exponerse al cliente. No uses las credenciales de ejemplo de `docker-compose.yml` fuera del desarrollo local.

## Scripts

- `npm run dev` — desarrollo
- `npm run lint` — ESLint
- `npm run build` — build de producción
- `npm run db:generate` — generar Prisma Client
- `npm run db:migrate` — migraciones de desarrollo
- `npm run db:migrate:local` — aplicar migraciones a la D1 local de Wrangler
- `npm run db:migrate:remote` — aplicar migraciones a la D1 remota
- `npm run db:seed` — ejecutar la semilla Prisma SQLite local (no siembra la D1 remota)
