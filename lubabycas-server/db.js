// ══════════════════════════════════════════
//  LuBabycas — Base de datos SQLite v2.2
//  Incluye inventario de Segunda Selección
// ══════════════════════════════════════════

const Database = require('better-sqlite3');
const path     = require('path');

const DB_PATH = path.join(__dirname, 'database.db');
const db      = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`

-- ── USUARIOS ──────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  username  TEXT NOT NULL UNIQUE,
  password  TEXT NOT NULL,
  name      TEXT NOT NULL,
  role      TEXT NOT NULL DEFAULT 'bodeguero',
  perms     TEXT NOT NULL DEFAULT '["read"]',
  activo    INTEGER NOT NULL DEFAULT 1,
  lastLogin TEXT,
  createdAt TEXT DEFAULT (datetime('now','localtime'))
);

-- ── PRODUCTOS / SKU ───────────────────────
CREATE TABLE IF NOT EXISTS products (
  id        TEXT PRIMARY KEY,
  sku       TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  brand     TEXT DEFAULT '',
  cat       TEXT DEFAULT '',
  barcode1  TEXT DEFAULT '',
  barcode2  TEXT DEFAULT '',
  stockMin  INTEGER DEFAULT 0,
  ubicacion TEXT DEFAULT '',
  notes     TEXT DEFAULT '',
  createdBy TEXT DEFAULT 'Sistema',
  createdAt TEXT DEFAULT (datetime('now','localtime')),
  updatedAt TEXT DEFAULT (datetime('now','localtime'))
);

-- ── NÚMEROS DE SERIE (inventario normal) ──
CREATE TABLE IF NOT EXISTS seriales (
  id          TEXT PRIMARY KEY,
  sku         TEXT NOT NULL,
  sn          TEXT NOT NULL UNIQUE,
  estado      TEXT NOT NULL DEFAULT 'disponible',
  ingresoDate TEXT,
  factura     TEXT DEFAULT '',
  proveedor   TEXT DEFAULT '',
  salidaDate  TEXT,
  docSalida   TEXT DEFAULT '',
  userIngreso TEXT DEFAULT '',
  userSalida  TEXT DEFAULT '',
  FOREIGN KEY (sku) REFERENCES products(sku) ON DELETE CASCADE
);

-- ── MOVIMIENTOS ───────────────────────────
CREATE TABLE IF NOT EXISTS movimientos (
  id        TEXT PRIMARY KEY,
  tipo      TEXT NOT NULL,
  tipoDet   TEXT DEFAULT '',
  sku       TEXT NOT NULL,
  sn        TEXT DEFAULT '',
  factura   TEXT DEFAULT '',
  proveedor TEXT DEFAULT '',
  docSalida TEXT DEFAULT '',
  user      TEXT NOT NULL,
  date      TEXT NOT NULL,
  notes     TEXT DEFAULT ''
);

-- ── DEVOLUCIONES (tickets) ────────────────
CREATE TABLE IF NOT EXISTS devoluciones (
  id            TEXT PRIMARY KEY,
  sku           TEXT NOT NULL,
  sn            TEXT DEFAULT '',
  motivo        TEXT NOT NULL DEFAULT '',
  estado        TEXT NOT NULL DEFAULT 'en_revision',
  observacion   TEXT DEFAULT '',
  docOrigen     TEXT DEFAULT '',
  fechaIngreso  TEXT NOT NULL,
  fechaEstado   TEXT,
  userIngreso   TEXT NOT NULL,
  userEstado    TEXT DEFAULT '',
  imagenes      TEXT DEFAULT '[]',
  destinoFinal  TEXT DEFAULT '',
  FOREIGN KEY (sku) REFERENCES products(sku)
);

-- ── HISTORIAL DEVOLUCIONES ────────────────
CREATE TABLE IF NOT EXISTS devolucion_historial (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  devolucionId   TEXT NOT NULL,
  estadoAnterior TEXT,
  estadoNuevo    TEXT NOT NULL,
  observacion    TEXT DEFAULT '',
  user           TEXT NOT NULL,
  date           TEXT NOT NULL,
  FOREIGN KEY (devolucionId) REFERENCES devoluciones(id)
);

-- ══════════════════════════════════════════
--  SEGUNDA SELECCIÓN — inventario separado
-- ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS segunda_seleccion (
  id              TEXT PRIMARY KEY,
  sku             TEXT NOT NULL,
  sn              TEXT DEFAULT '',
  nombre          TEXT NOT NULL,
  descripcion     TEXT DEFAULT '',
  estadoFisico    TEXT NOT NULL DEFAULT 'bueno',
  -- estados: bueno | regular | dañado
  precioOriginal  REAL DEFAULT 0,
  precioVenta     REAL DEFAULT 0,
  imagenes        TEXT DEFAULT '[]',
  estado          TEXT NOT NULL DEFAULT 'disponible',
  -- disponible | vendido | merma
  devolucionOrigen TEXT DEFAULT '',
  fechaIngreso    TEXT NOT NULL,
  fechaSalida     TEXT,
  docSalida       TEXT DEFAULT '',
  userIngreso     TEXT NOT NULL,
  userSalida      TEXT DEFAULT '',
  notas           TEXT DEFAULT '',
  FOREIGN KEY (sku) REFERENCES products(sku)
);

-- ── MOVIMIENTOS SEGUNDA SELECCIÓN ─────────
CREATE TABLE IF NOT EXISTS segunda_movimientos (
  id        TEXT PRIMARY KEY,
  tipo      TEXT NOT NULL,
  itemId    TEXT NOT NULL,
  sku       TEXT NOT NULL,
  sn        TEXT DEFAULT '',
  docSalida TEXT DEFAULT '',
  precio    REAL DEFAULT 0,
  user      TEXT NOT NULL,
  date      TEXT NOT NULL,
  notes     TEXT DEFAULT '',
  FOREIGN KEY (itemId) REFERENCES segunda_seleccion(id)
);

-- ── AUDITORÍA ─────────────────────────────
CREATE TABLE IF NOT EXISTS audit (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  time   TEXT NOT NULL,
  user   TEXT NOT NULL,
  role   TEXT NOT NULL,
  action TEXT NOT NULL,
  sku    TEXT DEFAULT '—',
  sn     TEXT DEFAULT '—',
  detail TEXT DEFAULT ''
);

-- ── SESIONES ACTIVAS ─────────────────────
CREATE TABLE IF NOT EXISTS sesiones (
  username    TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL,
  seccion     TEXT DEFAULT 'dashboard',
  lastPing    TEXT NOT NULL,
  sessionStart TEXT NOT NULL,
  ip          TEXT DEFAULT ''
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ser_sku    ON seriales(sku);
CREATE INDEX IF NOT EXISTS idx_ser_sn     ON seriales(sn);
CREATE INDEX IF NOT EXISTS idx_ser_estado ON seriales(estado);
CREATE INDEX IF NOT EXISTS idx_mov_sku    ON movimientos(sku);
CREATE INDEX IF NOT EXISTS idx_dev_sku    ON devoluciones(sku);
CREATE INDEX IF NOT EXISTS idx_dev_estado ON devoluciones(estado);
CREATE INDEX IF NOT EXISTS idx_2da_sku    ON segunda_seleccion(sku);
CREATE INDEX IF NOT EXISTS idx_2da_estado ON segunda_seleccion(estado);
`);

// ── SEED USUARIOS ─────────────────────────
const PERMS = {
  admin:      ['read','write','edit','delete','users','export'],
  supervisor: ['read','write','edit','export'],
  bodeguero:  ['read','write','edit'],
  lectura:    ['read'],
};
const defaultUsers = [
  {username:'admin',     password:'admin123', name:'Administrador',role:'admin'},
  {username:'supervisor',password:'super123', name:'Supervisor',   role:'supervisor'},
  {username:'bodeguero', password:'bode123',  name:'Bodeguero',    role:'bodeguero'},
  {username:'lectura',   password:'leer123',  name:'Solo Lectura', role:'lectura'},
];
const insUser = db.prepare(`INSERT OR IGNORE INTO usuarios (username,password,name,role,perms) VALUES (@username,@password,@name,@role,@perms)`);
defaultUsers.forEach(u => insUser.run({...u, perms:JSON.stringify(PERMS[u.role])}));

// ── SEED PRODUCTOS DE EJEMPLO ─────────────
if (db.prepare('SELECT COUNT(*) as n FROM products').get().n === 0) {
  const now = new Date().toLocaleString('es-CL');
  const iP  = db.prepare(`INSERT OR IGNORE INTO products (id,sku,name,brand,cat,barcode1,barcode2,stockMin,ubicacion,createdBy,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const iSN = db.prepare(`INSERT OR IGNORE INTO seriales (id,sku,sn,estado,ingresoDate,factura,proveedor,userIngreso) VALUES (?,?,?,?,?,?,?,?)`);

  [
    ['P0001','MUSSOCAFE','Muselina Café Premium',  'LuBabycas','Mundo Bebé','7802900001234','BOD-0001',5,'Estante A-1'],
    ['P0002','COCHEAZUL','Coche Bebé Azul Compact','LuBabycas','Mundo Bebé','7802900005678','BOD-0002',2,'Zona B'],
    ['P0003','NOTEBDELL','Notebook Dell 14" i5',   'Dell',     'Home Office','7802900099991','BOD-0003',2,'Vitrina'],
  ].forEach(p => iP.run(...p,'Sistema',now));

  [
    ['S001','MUSSOCAFE','SN-MUS-001','disponible','15/07/26 09:00','FAC-1025','ABC Dist.','Admin'],
    ['S002','MUSSOCAFE','SN-MUS-002','disponible','15/07/26 09:00','FAC-1025','ABC Dist.','Admin'],
    ['S003','MUSSOCAFE','SN-MUS-003','vendido',   '15/07/26 09:00','FAC-1025','ABC Dist.','Admin'],
    ['S004','COCHEAZUL','SN-COC-001','disponible','20/07/26 10:00','FAC-1030','XYZ Prov.','Admin'],
    ['S005','NOTEBDELL','SN-DELL-001','disponible','01/08/26 09:00','FAC-1050','Dell Chile','Admin'],
  ].forEach(s => iSN.run(...s));

  // Ejemplo segunda selección
  db.prepare(`INSERT OR IGNORE INTO segunda_seleccion (id,sku,sn,nombre,descripcion,estadoFisico,precioOriginal,precioVenta,estado,devolucionOrigen,fechaIngreso,userIngreso,notas)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'SS001','MUSSOCAFE','SN-MUS-003',
    'Muselina Café Premium',
    'Pequeña mancha en esquina inferior, no afecta funcionalidad',
    'regular', 15990, 7990, 'disponible', 'DEV-DEMO',
    '25/07/26 14:00','Admin','Ideal para regalo'
  );
}

// ── HELPERS ───────────────────────────────
function stockOf(sku) {
  return db.prepare(`SELECT COUNT(*) as n FROM seriales WHERE sku=? AND estado='disponible'`).get(sku)?.n || 0;
}
function stock2daOf(sku) {
  return db.prepare(`SELECT COUNT(*) as n FROM segunda_seleccion WHERE sku=? AND estado='disponible'`).get(sku)?.n || 0;
}
function nowStr() {
  return new Date().toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
}
function genId(prefix='X') {
  return prefix + Date.now() + Math.random().toString(36).slice(2,5).toUpperCase();
}

module.exports = { db, stockOf, stock2daOf, nowStr, genId };
