# 🛒 LuBabycas — Sistema de Inventario v2

Sistema completo de gestión de bodega con trazabilidad por número de serie (S/N), doble código de barras, control de acceso por roles, y sincronización con Shopify.

---

## 📁 Estructura

```
lubabycas/              ← Frontend (abrir en navegador)
  login.html
  app.html
  css/app.css
  js/app.js

lubabycas-server/       ← Backend Node.js
  server.js
  tunnel.js
  INICIAR.bat
  INICIAR_CON_CAMARA.bat
  package.json
  .env.example
```

---

## 🚀 Cómo usar

### Sin cámara (red local)
1. Doble clic en `INICIAR.bat`
2. Abre `http://localhost:3000/login.html` en el PC
3. Desde el celular: abre `http://[IP]:3000/login.html`

### Con cámara en celular (HTTPS)
1. Crea cuenta gratis en https://ngrok.com
2. Copia tu token desde el dashboard
3. Pégalo en `lubabycas-server/.env` → `NGROK_TOKEN=tu_token`
4. Doble clic en `INICIAR_CON_CAMARA.bat`
5. Copia la URL `https://...ngrok-free.app` que aparece
6. Ábrela en el celular → la cámara ya funciona

---

## 🔑 Usuarios de prueba

| Usuario     | Contraseña | Rol              | Puede hacer                         |
|-------------|-----------|------------------|-------------------------------------|
| admin       | admin123  | Administrador    | Todo                                |
| supervisor  | super123  | Supervisor       | Todo menos usuarios y eliminar      |
| bodeguero   | bode123   | Bodeguero        | Leer, crear, editar                 |
| lectura     | leer123   | Solo lectura     | Solo ver                            |

---

## 📦 Módulos del sistema

### Dashboard
- KPIs en tiempo real: SKUs, S/N registrados, stock disponible, vendidos
- Movimientos del día (ingresos y salidas)
- Productos bajo stock mínimo
- Actividad reciente

### Productos / SKU
- Catálogo con doble código de barras (fábrica + bodega)
- Stock calculado desde S/N disponibles
- Stock mínimo con alerta visual
- Vista detallada por SKU con tabs:
  - **Números de serie** — estado de cada unidad física
  - **Movimientos** — historial completo
  - **Facturas** — ingresos agrupados por factura

### Escanear
- Flujo en 3 pasos: SKU → S/N → Confirmar
- Cámara real del celular (requiere HTTPS/ngrok)
- Entrada manual como respaldo
- Validaciones: S/N duplicado, S/N de otro SKU, unidad ya vendida
- Distingue **ingreso** (con factura/proveedor) y **salida** (con documento)

### Ingresos
- Registro de recepciones con N° factura y proveedor
- Un S/N por unidad física
- Múltiples S/N por ingreso (uno por línea)
- Historial completo con usuario y fecha

### Salidas
- Selección visual de S/N disponibles por SKU
- Vinculación con N° de pedido/documento
- Actualización automática de estado (disponible → vendido)

### Trazabilidad
- Búsqueda por S/N → historial completo de esa unidad
- Búsqueda por SKU → todos los S/N y movimientos
- Búsqueda por factura o documento → todos los ítems del documento
- Línea de tiempo visual por evento

### Canales de venta
- Stock en Shopify, Falabella, Paris, Ripley
- Vista comparativa por producto
- Alerta de stock bajo multicanal
- (Shopify real cuando configuras el token en .env)

### Auditoría
- Registro de cada acción: usuario, rol, SKU, S/N, fecha, detalle
- Exportar a Excel

### Usuarios
- Crear y eliminar usuarios
- 4 roles con permisos distintos
- Solo admin puede gestionar usuarios

---

## 📡 API REST

### Auth
```
POST /api/auth/login          { username, password }
```

### Productos
```
GET    /api/products           ?q=busqueda&filter=low|zero
GET    /api/products/:code     busca por SKU, barcode1 o barcode2
POST   /api/products           crear SKU
PUT    /api/products/:sku      editar SKU
DELETE /api/products/:sku      eliminar SKU (borra S/N y movimientos)
```

### Seriales
```
GET    /api/seriales           ?sku=X&sn=Y&estado=disponible
GET    /api/seriales/:sn       detalle de un S/N
```

### Movimientos
```
GET    /api/movimientos        ?sku=X&tipo=ingreso|salida&sn=Y
POST   /api/movimientos/ingreso   { sku, sns:[], factura, proveedor, fecha, notes, user }
POST   /api/movimientos/salida    { sku, sns:[], docSalida, notes, user }
POST   /api/movimientos/ajuste    { sku, sn, nuevoEstado, motivo, user }
```

### Trazabilidad
```
GET    /api/trazabilidad/:query   busca por S/N, SKU, factura o documento
```

### Auditoría
```
GET    /api/audit
DELETE /api/audit
```

### Shopify
```
GET    /api/shopify/status
GET    /api/shopify/products
GET    /api/shopify/sync
PUT    /api/shopify/inventory
```

### Exportar
```
GET    /api/export/products
GET    /api/export/seriales    ?sku=X
GET    /api/export/movimientos
```

### Health
```
GET    /api/health
```

---

## 🛒 Shopify

1. En Shopify Admin → Configuración → Apps y canales de venta → Desarrollar apps
2. Crear app → Configurar permisos:
   - `read_products`, `write_inventory`, `read_inventory`, `read_locations`
3. Instalar app → copiar "Admin API access token"
4. Editar `lubabycas-server/.env`:
   ```
   SHOPIFY_DOMAIN=tutienda.myshopify.com
   SHOPIFY_ACCESS_TOKEN=shpat_xxx
   ```

---

## 🗺️ Fases de desarrollo

| Fase | Estado | Descripción |
|------|--------|-------------|
| 1 — Base inventario | ✅ Listo | SKU, S/N, roles, auditoría |
| 2 — Escáner móvil | ✅ Listo | Cámara, flujo SKU→S/N, ingreso/salida |
| 3 — Trazabilidad | ✅ Listo | Búsqueda por S/N, factura, documento |
| 4 — Shopify | ✅ Proxy listo | Conectar con token |
| 5 — Falabella/Paris/Ripley | 🔜 Pendiente | Requiere credenciales de sellers |
| 6 — Base de datos | 🔜 Pendiente | PostgreSQL para producción |
| 7 — Reportes PDF | 🔜 Pendiente | Exportación avanzada |
