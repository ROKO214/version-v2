// ══════════════════════════════════════════
//  LuBabycas — Inventario v2
//  Bodega con trazabilidad S/N
// ══════════════════════════════════════════

// ── AUTH ──────────────────────────────────
let CU = null;

function initAuth() {
  const raw = sessionStorage.getItem('lb_user');
  if (!raw) { window.location.href = 'login.html'; return; }
  CU = JSON.parse(raw);
  try {
    document.getElementById('uname').textContent       = CU.name;
    document.getElementById('urole').textContent       = ROLE_LABELS[CU.role] || CU.role;
    document.getElementById('uavatar').textContent     = CU.name[0].toUpperCase();
    document.getElementById('topbar-user').textContent = CU.name;
  } catch(e) {}
  applyPermissions();
  document.getElementById('app').style.display = 'grid';
}

function applyPermissions() {
  // ── NAV SIDEBAR ──────────────────────────
  if (!can('users'))  document.getElementById('nav-usuarios')?.classList.add('hidden-nav');

  // ── BOTONES DE ACCIÓN ────────────────────
  // Solo write puede crear productos, ingresos, salidas, devoluciones, 2da selección
  const writeOnly = [
    'btn-nuevo-prod',    // Nuevo producto
    'btn-nuevo-ingreso', // Nuevo ingreso
    'btn-nueva-salida',  // Nueva salida
    'btn-nueva-dev',     // Nueva devolución
    'btn-nueva-seg',     // Nueva 2da selección
  ];
  writeOnly.forEach(id => {
    const el = document.getElementById(id);
    if (el && !can('write')) el.style.display = 'none';
  });

  // Solo export puede exportar
  const exportOnly = ['btn-export-prod','btn-export-salidas','btn-export-dev','btn-export-seg','btn-export-audit'];
  exportOnly.forEach(id => {
    const el = document.getElementById(id);
    if (el && !can('export')) el.style.display = 'none';
  });

  // Solo users puede gestionar usuarios
  if (!can('users')) {
    document.getElementById('btn-nuevo-usuario')?.style && (document.getElementById('btn-nuevo-usuario').style.display='none');
    document.getElementById('nav-usuarios')?.classList.add('hidden-nav');
  }

  // ── SECCIÓN ESCANER ──────────────────────
  // Solo write puede hacer ingresos/salidas desde escáner
  if (!can('write')) {
    document.querySelectorAll('.btn-scan-cam, .manual-row button').forEach(el => el.setAttribute('disabled',''));
  }

  // ── DESPACHO RÁPIDO ──────────────────────
  if (!can('write')) {
    const btn = document.getElementById('btn-despacho');
    if (btn) btn.disabled = true;
  }

  // ── BADGE ROL visible en topbar ──────────
  const roleColors = {admin:'#F47B20',supervisor:'#7c3aed',bodeguero:'#2563eb',lectura:'#6b7280'};
  const topbarUser = document.getElementById('topbar-user');
  if (topbarUser) {
    topbarUser.innerHTML = `${CU.name} <span style="background:rgba(255,255,255,.2);padding:1px 6px;border-radius:999px;font-size:10px;font-weight:800">${ROLE_LABELS[CU.role]||CU.role}</span>`;
  }
}

function logout() { sessionStorage.removeItem('lb_user'); window.location.href = 'login.html'; }
function can(p)   { return CU?.perms?.includes(p); }

const ROLE_LABELS = { admin:'Administrador', supervisor:'Supervisor', bodeguero:'Bodeguero', lectura:'Solo Lectura' };
const ROLE_CLASS  = { admin:'role-admin', supervisor:'role-supervisor', bodeguero:'role-bodeguero', lectura:'role-lectura' };
const ROLE_EMOJI  = { admin:'👑', supervisor:'🔧', bodeguero:'📦', lectura:'👁' };

// ── STATE ──────────────────────────────────
let products    = [];
let seriales    = [];
let movimientos = [];
let audit       = [];
let usuarios    = [
  {id:1,username:'admin',     name:'Administrador',role:'admin',     perms:['read','write','edit','delete','users','export']},
  {id:2,username:'supervisor',name:'Supervisor',   role:'supervisor',perms:['read','write','edit','export']},
  {id:3,username:'bodeguero', name:'Bodeguero',    role:'bodeguero', perms:['read','write','edit']},
  {id:4,username:'lectura',   name:'Solo Lectura', role:'lectura',   perms:['read']},
];

let prodFilter  = 'all';
let currentSkuId= null;
let nextId      = 1;
let nextBodN    = 1;

// ── UTILS ──────────────────────────────────
function now()    { return new Date().toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function today()  { return new Date().toISOString().split('T')[0]; }
function genBodCode() { return 'BOD-' + String(nextBodN++).padStart(4,'0'); }
function genId()      { return 'M' + String(nextId++).padStart(5,'0'); }
function stockOf(sku) { return seriales.filter(s => s.sku===sku && s.estado==='disponible').length; }
function findProduct(q){ return products.find(p => p.sku===q || p.barcode1===q || p.barcode2===q); }
function findSerial(sn){ return seriales.find(s => s.sn===sn); }

// ── AUDIT ──────────────────────────────────
function addAudit(action, sku, sn, detail) {
  audit.unshift({ time:now(), user:CU.name, role:CU.role, action, sku:sku||'—', sn:sn||'—', detail:detail||'' });
  if (audit.length > 500) audit.pop();
  renderMiniLog();
}

// ── TOAST ──────────────────────────────────
let toastT;
function toast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.borderLeftColor = type==='ok'?'var(--green)':type==='error'?'var(--red)':'var(--orange)';
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── VIEWS ──────────────────────────────────
function goView(v) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .bn-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('view-'+v)?.classList.add('active');
  document.querySelectorAll(`[data-view="${v}"]`).forEach(el => el.classList.add('active'));
  const views = {
    dashboard: renderDashboard, productos: renderProductos,
    ingresos: renderIngresos, salidas: () => { renderSalidas(); renderSalidasKpis(); },
    auditoria: renderAuditoria, usuarios: renderUsuarios,
    escaner: initScanView, trazabilidad: () => {},
    'sku-detalle': () => {},
  };
  views[v]?.();
}

function goSkuDetalle(sku) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .bn-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('view-sku-detalle')?.classList.add('active');
  verDetalleSku(sku);
}

// ── DASHBOARD ──────────────────────────────
function renderDashboard() {
  const total     = products.length;
  const totalSN   = seriales.length;
  const disp      = seriales.filter(s=>s.estado==='disponible').length;
  const vendidos  = seriales.filter(s=>s.estado==='vendido').length;
  const hoy       = new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'});
  const ingHoy    = movimientos.filter(m=>m.tipo==='ingreso'&&m.date.includes(hoy.split('/')[0]+'/'+hoy.split('/')[1])).length;
  const salHoy    = movimientos.filter(m=>m.tipo==='salida'&&m.date.includes(hoy.split('/')[0]+'/'+hoy.split('/')[1])).length;
  const lowStock  = products.filter(p=>stockOf(p.sku)<=(p.stockMin||0)&&p.stockMin>0);

  document.getElementById('kpi-row').innerHTML = [
    {icon:'fa-boxes-stacked',      cls:'o', val:total,    lbl:'SKUs'},
    {icon:'fa-fingerprint',        cls:'b', val:totalSN,  lbl:'S/N total'},
    {icon:'fa-circle-check',       cls:'g', val:disp,     lbl:'En stock'},
    {icon:'fa-shopping-cart',      cls:'r', val:vendidos, lbl:'Vendidos'},
    {icon:'fa-truck-ramp-box',     cls:'a', val:ingHoy,   lbl:'Ingresos hoy'},
    {icon:'fa-arrow-right-from-bracket', cls:'gr', val:salHoy, lbl:'Salidas hoy'},
  ].map(k=>`<div class="kpi-card">
    <div class="kpi-icon ${k.cls}"><i class="fa-solid ${k.icon}"></i></div>
    <div class="kpi-val">${k.val}</div>
    <div class="kpi-lbl">${k.lbl}</div>
  </div>`).join('');

  // Movimientos del día
  const movEl = document.getElementById('dash-movday');
  const movHoy = movimientos.filter(m=>m.date.includes(hoy.split('/')[0]+'/'+hoy.split('/')[1]));
  movEl.innerHTML = movHoy.length
    ? movHoy.slice(0,6).map(m=>`
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span class="badge ${m.tipo==='ingreso'?'b-ok':'b-alert'}">${m.tipo==='ingreso'?'IN':'OUT'}</span>
        <span class="mono">${m.sku}</span>
        <span style="color:var(--text-m);font-size:11px;flex:1">${m.sn||'—'}</span>
        <span style="color:var(--text-f);font-size:10px">${m.user}</span>
      </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-f);text-align:center;padding:12px">Sin movimientos hoy</p>';

  // Low stock
  const lowEl = document.getElementById('dash-lowstock');
  lowEl.innerHTML = lowStock.length
    ? lowStock.slice(0,5).map(p=>`
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span class="badge b-alert"><i class="fa-solid fa-triangle-exclamation"></i></span>
        <span class="mono">${p.sku}</span>
        <span style="flex:1">${p.name}</span>
        <span style="color:var(--red);font-weight:800">${stockOf(p.sku)}/${p.stockMin}</span>
      </div>`).join('')
    : '<p style="font-size:12px;color:var(--green);text-align:center;padding:12px"><i class="fa-solid fa-circle-check"></i> Todo OK</p>';

  renderMiniLog();
}

function renderMiniLog() {
  const el = document.getElementById('mini-log');
  if (!el) return;
  el.innerHTML = audit.length
    ? audit.slice(0,8).map(e=>`
      <div class="mini-log-entry">
        <span class="mle-time">${e.time}</span>
        <div class="mle-dot"></div>
        <span style="font-size:12px"><strong>${e.user}</strong> — ${e.action}${e.sku!=='—'?' <span class="mono">'+e.sku+'</span>':''}</span>
      </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-f);text-align:center;padding:12px">Sin actividad</p>';
}

// ── PRODUCTOS ──────────────────────────────
function setProdFilter(f, el) {
  prodFilter = f;
  document.querySelectorAll('.pill').forEach(p=>p.classList.remove('active'));
  el?.classList.add('active');
  renderProductos();
}

function renderProductos() {
  // Mostrar/ocultar botones según permisos
  const btnProd = document.getElementById('btn-nuevo-prod');
  if (btnProd) btnProd.style.display = can('write') ? '' : 'none';
  const btnExpProd = document.getElementById('btn-export-prod');
  if (btnExpProd) btnExpProd.style.display = can('export') ? '' : 'none';

  const q = (document.getElementById('prod-search')?.value||'').toLowerCase();
  let rows = products.filter(p => {
    if (q && ![(p.sku||''),(p.name||''),(p.brand||''),(p.barcode1||''),(p.barcode2||'')].some(v=>v.toLowerCase().includes(q))) return false;
    const st = stockOf(p.sku);
    if (prodFilter==='low')  return st<=(p.stockMin||0)&&p.stockMin>0;
    if (prodFilter==='zero') return st===0;
    return true;
  });

  // Desktop table
  const tb = document.getElementById('tbody-productos');
  if (tb) {
    tb.innerHTML = rows.length ? rows.map(p=>{
      const st = stockOf(p.sku);
      const isLow = p.stockMin>0 && st<=p.stockMin;
      const snCount = seriales.filter(s=>s.sku===p.sku).length;
      return `<tr>
        <td><span class="mono" style="color:var(--orange)">${p.sku}</span></td>
        <td style="font-weight:700">${p.name}</td>
        <td>${p.brand||'<span class="faint">—</span>'}</td>
        <td>${p.cat||'<span class="faint">—</span>'}</td>
        <td><span class="mono">${p.barcode1||'<span class="faint">—</span>'}</span></td>
        <td><span class="mono">${p.barcode2||'<span class="faint">—</span>'}</span></td>
        <td><strong style="color:${isLow?'var(--red)':st===0?'var(--text-f)':'var(--green)'}">${st}</strong></td>
        <td><span class="badge b-info">${snCount}</span></td>
        <td>${p.stockMin>0?`<span style="color:${isLow?'var(--red)':'var(--text-m)'}">${p.stockMin}</span>`:'—'}</td>
        <td style="display:flex;gap:4px">
          <button class="btn-tbl" onclick="goSkuDetalle('${p.sku}')"><i class="fa-solid fa-eye"></i> Ver</button>
          ${can('write')?`<button class="btn-tbl" onclick="openIngresoModal('${p.sku}')"><i class="fa-solid fa-plus"></i></button>`:''}
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="10" style="text-align:center;color:var(--text-f);padding:2rem">${products.length?'Sin resultados':'Sin productos — crea el primero'}</td></tr>`;
  }

  // Mobile cards
  const cards = document.getElementById('prod-cards');
  if (cards) {
    cards.innerHTML = rows.length ? rows.map(p=>{
      const st = stockOf(p.sku);
      const isLow = p.stockMin>0 && st<=p.stockMin;
      const color = isLow?'var(--red)':st===0?'var(--text-f)':'var(--green)';
      return `<div class="prod-card">
        <div class="prod-card-top">
          <div style="flex:1">
            <div class="prod-card-sku">${p.sku}</div>
            <div class="prod-card-name">${p.name}</div>
          </div>
          <div style="text-align:right">
            <div class="prod-card-stock" style="color:${color}">${st}</div>
            <div style="font-size:10px;color:var(--text-f)">uds</div>
          </div>
        </div>
        <div class="prod-card-meta">
          ${p.brand?`<span class="badge b-empty">${p.brand}</span>`:''}
          ${p.cat?`<span class="badge b-info">${p.cat}</span>`:''}
          ${isLow?'<span class="badge b-alert">⚠️ Stock bajo</span>':''}
          ${p.barcode2?`<span class="mono">${p.barcode2}</span>`:''}
        </div>
        <div class="prod-card-actions">
          <button class="btn-orange" style="flex:1;justify-content:center;font-size:12px" onclick="goSkuDetalle('${p.sku}')"><i class="fa-solid fa-eye"></i> Ver detalle</button>
          ${can('write')?`<button class="btn-ghost" style="font-size:12px" onclick="openIngresoModal('${p.sku}')"><i class="fa-solid fa-plus"></i> Ingresar</button>`:''}
        </div>
      </div>`;
    }).join('') : `<div style="text-align:center;color:var(--text-f);padding:2rem">${products.length?'Sin resultados':'Sin productos — crea el primero'}</div>`;
  }
}

// ── DETALLE SKU ────────────────────────────
function verDetalleSku(sku) {
  currentSkuId = sku;
  const p = products.find(x=>x.sku===sku);
  if (!p) return;
  document.getElementById('sku-detalle-title').textContent = p.sku+' — '+p.name;
  document.getElementById('sku-detalle-sub').textContent = [p.brand,p.cat,p.ubicacion].filter(Boolean).join(' · ');
  const st    = stockOf(sku);
  const snAll = seriales.filter(s=>s.sku===sku);
  const movs  = movimientos.filter(m=>m.sku===sku);
  const facs  = [...new Set(movs.filter(m=>m.factura).map(m=>m.factura))];
  document.getElementById('sku-info-grid').innerHTML = [
    {label:'Stock',    val:snAll.filter(s=>s.estado==='disponible').length, sub:'disponibles',  color:st===0?'var(--red)':'var(--green)'},
    {label:'S/N total',val:snAll.length,                                    sub:'registrados',  color:'var(--text)'},
    {label:'Vendidos', val:snAll.filter(s=>s.estado==='vendido').length,    sub:'despachados',  color:'var(--red)'},
    {label:'Movimientos',val:movs.length,                                   sub:'historial',    color:'var(--blue)'},
    {label:'Facturas', val:facs.length,                                     sub:'ingresos',     color:'var(--amber)'},
    {label:'Stock mín.',val:p.stockMin||'—',                                sub:st<=(p.stockMin||0)&&p.stockMin>0?'⚠️ BAJO':'configurado', color:'var(--text-m)'},
  ].map(k=>`<div class="sku-info-card">
    <div class="sku-info-label">${k.label}</div>
    <div class="sku-info-val" style="color:${k.color}">${k.val}</div>
    <div class="sku-info-sub">${k.sub}</div>
  </div>`).join('');
  skuTab('sn', document.querySelector('#sku-tabs .view-tab'));
}

function skuTab(tab, el) {
  document.querySelectorAll('.view-tab').forEach(t=>t.classList.remove('active'));
  el?.classList.add('active');
  document.getElementById('sku-tab-sn').style.display          = tab==='sn'?'block':'none';
  document.getElementById('sku-tab-movimientos').style.display = tab==='movimientos'?'block':'none';
  document.getElementById('sku-tab-facturas').style.display    = tab==='facturas'?'block':'none';
  const sku = currentSkuId;
  if (tab==='sn') {
    const snAll = seriales.filter(s=>s.sku===sku);
    document.getElementById('tbody-sn').innerHTML = snAll.length
      ? snAll.map(s=>`<tr>
          <td><span class="mono">${s.sn}</span></td>
          <td><span class="sn-${s.estado}">${s.estado}</span></td>
          <td style="font-size:11px;color:var(--text-m)">${s.ingresoDate||'—'}</td>
          <td><span class="mono">${s.factura||'—'}</span></td>
          <td>${s.proveedor||'—'}</td>
          <td style="font-size:11px;color:var(--text-m)">${s.salidaDate||'—'}</td>
          <td><span class="mono">${s.docSalida||'—'}</span></td>
          <td>${s.userIngreso||'—'}</td>
        </tr>`).join('')
      : '<tr><td colspan="8" style="text-align:center;color:var(--text-f);padding:1.5rem">Sin S/N</td></tr>';
  }
  if (tab==='movimientos') {
    const movs = movimientos.filter(m=>m.sku===sku);
    document.getElementById('tbody-sku-mov').innerHTML = movs.length
      ? movs.map(m=>`<tr>
          <td style="font-size:11px;font-family:monospace;color:var(--text-m)">${m.date}</td>
          <td><span class="badge ${m.tipo==='ingreso'?'b-ok':'b-alert'}">${m.tipo==='ingreso'?'IN':'OUT'}</span></td>
          <td><span class="mono">${m.sn||'—'}</span></td>
          <td style="font-weight:800;color:${m.tipo==='ingreso'?'var(--green)':'var(--red)'}">${m.tipo==='ingreso'?'+':'-'}1</td>
          <td><span class="mono">${m.factura||m.docSalida||'—'}</span></td>
          <td>${m.user}</td>
          <td style="font-size:11px;color:var(--text-m)">${m.notes||'—'}</td>
        </tr>`).join('')
      : '<tr><td colspan="7" style="text-align:center;color:var(--text-f);padding:1.5rem">Sin movimientos</td></tr>';
  }
  if (tab==='facturas') {
    const movs = movimientos.filter(m=>m.sku===sku&&m.tipo==='ingreso'&&m.factura);
    const grp = {};
    movs.forEach(m=>{ if(!grp[m.factura]) grp[m.factura]={f:m.factura,p:m.proveedor,d:m.date,q:0}; grp[m.factura].q++; });
    const rows = Object.values(grp);
    document.getElementById('tbody-sku-fac').innerHTML = rows.length
      ? rows.map(r=>`<tr>
          <td><span class="mono">${r.f}</span></td>
          <td>${r.p||'—'}</td>
          <td style="font-size:11px;color:var(--text-m)">${r.d}</td>
          <td><strong>${r.q}</strong> uds</td>
        </tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;color:var(--text-f);padding:1.5rem">Sin facturas</td></tr>';
  }
}

// ── MODALES ────────────────────────────────
function openModal(id) {
  // Verificar permisos antes de abrir
  const writeModals   = ['modal-producto','modal-ingreso','modal-salida','modal-devolucion','modal-segunda'];
  const usersModals   = ['modal-usuario'];
  const editModals    = ['modal-dev-detalle','modal-seg-detalle','modal-seg-vender'];

  if (writeModals.includes(id) && !can('write'))  { toast('Sin permisos para crear','error'); return; }
  if (usersModals.includes(id) && !can('users'))  { toast('Sin permisos de usuarios','error'); return; }
  if (editModals.includes(id)  && !can('edit'))   { toast('Sin permisos para editar','error'); return; }

  if (id==='modal-ingreso') {
    document.getElementById('ing-sku').innerHTML = '<option value="">— SKU —</option>'+products.map(p=>`<option value="${p.sku}">${p.sku} — ${p.name}</option>`).join('');
    document.getElementById('ing-fecha').value = today();
    ['ing-factura','ing-proveedor','ing-sns','ing-notes'].forEach(i=>document.getElementById(i).value='');
  }
  if (id==='modal-salida') {
    document.getElementById('sal-sku').innerHTML = '<option value="">— SKU —</option>'+products.filter(p=>stockOf(p.sku)>0).map(p=>`<option value="${p.sku}">${p.sku} — ${p.name} (${stockOf(p.sku)} disp.)</option>`).join('');
    ['sal-doc','sal-notes'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('sal-sn-list').innerHTML = '<span style="font-size:12px;color:var(--text-f)">Selecciona un SKU</span>';
  }
  document.getElementById(id)?.classList.add('show');
}

function openIngresoModal(sku) { openModal('modal-ingreso'); if (sku) setTimeout(()=>document.getElementById('ing-sku').value=sku,50); }
function closeModals() { document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.remove('show')); }

// ── GUARDAR PRODUCTO ───────────────────────
function saveProducto() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sku  = document.getElementById('m-sku').value.trim().toUpperCase();
  const name = document.getElementById('m-name').value.trim();
  if (!sku||!name) { toast('SKU y nombre obligatorios','error'); return; }
  if (products.find(p=>p.sku===sku)) { toast('SKU ya existe','error'); return; }
  const p = {
    id:genId(), sku, name,
    brand:    document.getElementById('m-brand').value.trim(),
    cat:      document.getElementById('m-cat').value,
    barcode1: document.getElementById('m-barcode1').value.trim(),
    barcode2: document.getElementById('m-barcode2').value.trim() || genBodCode(),
    stockMin: parseInt(document.getElementById('m-stock-min').value)||0,
    ubicacion:document.getElementById('m-ubicacion').value.trim(),
    notes:    document.getElementById('m-notes').value.trim(),
    createdBy:CU.name, createdAt:now(),
  };
  products.push(p);
  addAudit('SKU creado', sku, '—', p.name);
  closeModals();
  renderProductos();
  renderDashboard();
  toast('SKU '+sku+' creado','ok');
}

// ── GUARDAR INGRESO ────────────────────────
function saveIngreso() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sku       = document.getElementById('ing-sku').value;
  const factura   = document.getElementById('ing-factura').value.trim();
  const proveedor = document.getElementById('ing-proveedor').value.trim();
  const fecha     = document.getElementById('ing-fecha').value;
  const snRaw     = document.getElementById('ing-sns').value;
  const notes     = document.getElementById('ing-notes').value.trim();
  if (!sku||!factura) { toast('SKU y factura obligatorios','error'); return; }
  const snList = snRaw.split('\n').map(s=>s.trim()).filter(Boolean);
  if (!snList.length) { toast('Ingresa al menos un S/N','error'); return; }
  const dup = snList.find(sn=>findSerial(sn));
  if (dup) { toast(`S/N ${dup} ya existe`,'error'); return; }
  const dateStr = (fecha?new Date(fecha).toLocaleDateString('es-CL'):new Date().toLocaleDateString('es-CL'))+' '+new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
  snList.forEach(sn => {
    seriales.push({id:genId(),sku,sn,estado:'disponible',ingresoDate:dateStr,factura,proveedor,salidaDate:null,docSalida:null,userIngreso:CU.name,userSalida:null});
    movimientos.unshift({id:genId(),tipo:'ingreso',sku,sn,factura,proveedor,docSalida:null,user:CU.name,date:dateStr,notes});
    addAudit('Ingreso',sku,sn,'Factura: '+factura);
  });
  closeModals();
  renderProductos();
  renderDashboard();
  renderIngresos();
  toast(`✅ ${snList.length} unidad(es) ingresadas a ${sku}`,'ok');
}

// ── GUARDAR SALIDA ─────────────────────────
function onSalidaSkuChange() {
  const sku = document.getElementById('sal-sku').value;
  const el  = document.getElementById('sal-sn-list');
  if (!sku) { el.innerHTML='<span style="font-size:12px;color:var(--text-f)">Selecciona un SKU</span>'; return; }
  const disp = seriales.filter(s=>s.sku===sku&&s.estado==='disponible');
  el.innerHTML = disp.length
    ? disp.map(s=>`<label class="sn-check-item"><input type="checkbox" value="${s.sn}" name="sal-sn"><span class="mono">${s.sn}</span><span style="font-size:10px;color:var(--text-f);margin-left:auto">${s.ingresoDate||''}</span></label>`).join('')
    : '<span style="font-size:12px;color:var(--red)">Sin unidades disponibles</span>';
}

function saveSalida() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sku   = document.getElementById('sal-sku').value;
  const doc   = document.getElementById('sal-doc').value.trim();
  const notes = document.getElementById('sal-notes').value.trim();
  const sns   = [...document.querySelectorAll('input[name="sal-sn"]:checked')].map(c=>c.value);
  if (!sku) { toast('Selecciona un SKU','error'); return; }
  if (!sns.length) { toast('Selecciona al menos un S/N','error'); return; }
  const dateStr = now();
  sns.forEach(sn => {
    const s = findSerial(sn);
    if (s) { s.estado='vendido'; s.salidaDate=dateStr; s.docSalida=doc; s.userSalida=CU.name; }
    movimientos.unshift({id:genId(),tipo:'salida',tipoDet:'manual',sku,sn,factura:null,proveedor:null,docSalida:doc,user:CU.name,date:dateStr,notes});
    addAudit('Salida',sku,sn,'Doc: '+(doc||'—'));
  });
  closeModals();
  renderProductos();
  renderDashboard();
  renderSalidas();
  renderSalidasKpis();
  toast(`✅ ${sns.length} unidad(es) despachadas de ${sku}`,'ok');
}

// ── RENDER INGRESOS/SALIDAS ────────────────
function renderIngresos() {
  const tb  = document.getElementById('tbody-ingresos');
  const ing = movimientos.filter(m=>m.tipo==='ingreso');
  tb.innerHTML = ing.length
    ? ing.map(m=>`<tr>
        <td style="font-size:11px;font-family:monospace;color:var(--text-m)">${m.date}</td>
        <td><span class="mono">${m.factura||'—'}</span></td>
        <td>${m.proveedor||'—'}</td>
        <td><span class="mono" style="color:var(--orange)">${m.sku}</span></td>
        <td>${products.find(p=>p.sku===m.sku)?.name||'—'}</td>
        <td><span class="mono">${m.sn||'—'}</span></td>
        <td><span style="color:var(--green);font-weight:800">+1</span></td>
        <td>${m.user}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;color:var(--text-f);padding:2rem">Sin ingresos</td></tr>';
}

const TIPO_BADGE = {
  venta:     '<span class="badge b-ok">Venta</span>',
  envio:     '<span class="badge b-info">Envío</span>',
  devolucion:'<span class="badge b-partial">Devolución</span>',
  manual:    '<span class="badge b-empty">Manual</span>',
};

function renderSalidas() {
  // Aplicar permisos en botones de salidas
  const btnExpSal = document.getElementById('btn-export-salidas');
  if (btnExpSal) btnExpSal.style.display = can('export') ? '' : 'none';
  const btnNuevaSal = document.getElementById('btn-nueva-salida');
  if (btnNuevaSal) btnNuevaSal.style.display = can('write') ? '' : 'none';
  // Despacho rápido — ocultar si no tiene write
  const drBody = document.querySelector('.despacho-rapido');
  if (drBody) drBody.style.display = can('write') ? '' : 'none';

  const tb  = document.getElementById('tbody-salidas');
  const sal = movimientos.filter(m=>m.tipo==='salida');
  tb.innerHTML = sal.length
    ? sal.map(m=>`<tr>
        <td style="font-size:11px;font-family:monospace;color:var(--text-m)">${m.date}</td>
        <td>${TIPO_BADGE[m.tipoDet]||TIPO_BADGE.manual}</td>
        <td><span class="mono">${m.docSalida||'—'}</span></td>
        <td><span class="mono" style="color:var(--orange)">${m.sku}</span></td>
        <td>${products.find(p=>p.sku===m.sku)?.name||'—'}</td>
        <td><span class="mono">${m.sn||'—'}</span></td>
        <td>${m.user}</td>
      </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--text-f);padding:2rem">Sin salidas</td></tr>';
}

function renderSalidasKpis() {
  const el  = document.getElementById('salidas-kpis');
  if (!el) return;
  const sal = movimientos.filter(m=>m.tipo==='salida');
  const hoy = new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'});
  el.innerHTML = [
    {icon:'fa-arrow-right-from-bracket',cls:'o',val:sal.length,              lbl:'Total salidas'},
    {icon:'fa-shopping-cart',            cls:'g',val:sal.filter(m=>m.tipoDet==='venta').length, lbl:'Ventas'},
    {icon:'fa-truck',                    cls:'b',val:sal.filter(m=>m.tipoDet==='envio').length, lbl:'Envíos'},
    {icon:'fa-calendar-day',             cls:'a',val:sal.filter(m=>m.date.includes(hoy.split('/')[0]+'/'+hoy.split('/')[1])).length, lbl:'Hoy'},
  ].map(k=>`<div class="kpi-card">
    <div class="kpi-icon ${k.cls}"><i class="fa-solid ${k.icon}"></i></div>
    <div class="kpi-val">${k.val}</div>
    <div class="kpi-lbl">${k.lbl}</div>
  </div>`).join('');
}

// ── DESPACHO RÁPIDO ────────────────────────
let drCurrentSku = null;
let drTipo       = 'venta';
let drTimer      = null;

function drBuscar() {
  const q   = (document.getElementById('dr-search').value||'').trim().toLowerCase();
  const sug = document.getElementById('dr-suggestions');
  if (!q) { sug.style.display='none'; return; }
  clearTimeout(drTimer);
  drTimer = setTimeout(()=>{
    const hits = products.filter(p=>
      (p.sku||'').toLowerCase().includes(q)||
      (p.name||'').toLowerCase().includes(q)||
      (p.barcode1||'').includes(q)||
      (p.barcode2||'').includes(q)
    ).slice(0,8);
    sug.innerHTML = hits.length
      ? hits.map(p=>{
          const st  = stockOf(p.sku);
          const cls = st===0?'zero':st<=(p.stockMin||0)&&p.stockMin>0?'low':'ok';
          return `<div class="dr-suggestion-item" onclick="drSeleccionar('${p.sku}')">
            <span class="dr-suggestion-sku">${p.sku}</span>
            <span class="dr-suggestion-name">${p.name}</span>
            <span class="dr-suggestion-stock ${cls}">${st===0?'Sin stock':st+' uds'}</span>
          </div>`;
        }).join('')
      : '<div style="padding:10px 14px;font-size:12px;color:var(--text-f)">Sin resultados</div>';
    sug.style.display = 'block';
  },180);
}

function drSeleccionar(sku) {
  const p = products.find(x=>x.sku===sku);
  if (!p) return;
  drCurrentSku = sku;
  document.getElementById('dr-suggestions').style.display='none';
  document.getElementById('dr-search').value = p.sku+' — '+p.name;
  const st = stockOf(sku);
  document.getElementById('dr-sku-label').textContent   = p.sku;
  document.getElementById('dr-name-label').textContent  = p.name+(p.brand?' · '+p.brand:'');
  document.getElementById('dr-stock-label').innerHTML   = `Disponibles: <strong style="color:${st===0?'var(--red)':st<=(p.stockMin||0)?'var(--amber)':'var(--green)'}">${st}</strong>`;
  drRenderSnList(sku);
  document.getElementById('dr-producto').style.display='block';
  drActualizarBoton();
}

function drRenderSnList(sku) {
  const disp = seriales.filter(s=>s.sku===sku&&s.estado==='disponible');
  const el   = document.getElementById('dr-sn-list');
  el.innerHTML = disp.length
    ? disp.map(s=>`<label class="dr-sn-item">
        <input type="checkbox" value="${s.sn}" name="dr-sn" onchange="drContar()">
        <div><div class="dr-sn-code">${s.sn}</div><div class="dr-sn-date">${s.ingresoDate||''}</div></div>
      </label>`).join('')
    : '<div style="padding:10px;font-size:12px;color:var(--red);font-weight:700;text-align:center">Sin unidades disponibles</div>';
  document.getElementById('btn-despacho').disabled = !disp.length;
}

function drContar() {
  const n = document.querySelectorAll('input[name="dr-sn"]:checked').length;
  document.getElementById('dr-selected-count').textContent = n+' seleccionado'+(n===1?'':'s');
  drActualizarBoton();
}

function drSelectAll()  { document.querySelectorAll('input[name="dr-sn"]').forEach(c=>{c.checked=true;c.closest('.dr-sn-item').classList.add('selected')}); drContar(); }
function drSelectNone() { document.querySelectorAll('input[name="dr-sn"]').forEach(c=>{c.checked=false;c.closest('.dr-sn-item').classList.remove('selected')}); drContar(); }

function drSetTipo(t) {
  drTipo = t;
  ['venta','envio','devolucion','otro'].forEach(x=>document.getElementById('dr-tipo-'+x).classList.toggle('active',x===t));
  drActualizarBoton();
}

function drActualizarBoton() {
  const n   = document.querySelectorAll('input[name="dr-sn"]:checked').length;
  const btn = document.getElementById('btn-despacho');
  if (!btn) return;
  const L   = {venta:'Confirmar venta',envio:'Confirmar envío',devolucion:'Confirmar devolución',otro:'Confirmar salida'};
  btn.innerHTML = `<i class="fa-solid fa-check"></i> ${L[drTipo]}${n>0?' ('+n+' uds)':''}`;
  btn.disabled  = n===0;
}

function drConfirmar() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sns = [...document.querySelectorAll('input[name="dr-sn"]:checked')].map(c=>c.value);
  if (!sns.length||!drCurrentSku) { toast('Selecciona al menos una unidad','error'); return; }
  const doc     = document.getElementById('dr-doc').value.trim();
  const notes   = document.getElementById('dr-notes').value.trim();
  const dateStr = now();
  const L       = {venta:'Venta',envio:'Envío',devolucion:'Devolución',otro:'Salida'};
  sns.forEach(sn=>{
    const s = seriales.find(x=>x.sn===sn);
    if (s) { s.estado=drTipo==='devolucion'?'reservado':'vendido'; s.salidaDate=dateStr; s.docSalida=doc; s.userSalida=CU.name; }
    movimientos.unshift({id:genId(),tipo:'salida',tipoDet:drTipo,sku:drCurrentSku,sn,factura:null,proveedor:null,docSalida:doc,user:CU.name,date:dateStr,notes:notes||L[drTipo]});
    addAudit(L[drTipo],drCurrentSku,sn,'Doc: '+(doc||'—'));
  });
  const prod = products.find(p=>p.sku===drCurrentSku);
  toast(`✅ ${L[drTipo]}: ${sns.length} uds de ${prod?.name||drCurrentSku}`,'ok');
  renderSalidas(); renderDashboard(); renderSalidasKpis();
  drRenderSnList(drCurrentSku); drSelectNone();
  document.getElementById('dr-stock-label').innerHTML=`Disponibles: <strong style="color:${stockOf(drCurrentSku)===0?'var(--red)':'var(--green)'}">${stockOf(drCurrentSku)}</strong>`;
  document.getElementById('dr-doc').value=''; document.getElementById('dr-notes').value='';
  drActualizarBoton();
}

function drLimpiar() {
  drCurrentSku=null;
  document.getElementById('dr-search').value='';
  document.getElementById('dr-producto').style.display='none';
  document.getElementById('dr-suggestions').style.display='none';
}

document.addEventListener('click', e=>{
  if (!e.target.closest('.dr-search-wrap')&&!e.target.closest('.dr-suggestions'))
    document.getElementById('dr-suggestions')?.style && (document.getElementById('dr-suggestions').style.display='none');
});

// ── TRAZABILIDAD ───────────────────────────
function buscarTrazabilidad() {
  const q  = document.getElementById('traz-input').value.trim();
  const el = document.getElementById('traz-result');
  if (!q) return;

  const serial = findSerial(q);
  if (serial) {
    const p    = products.find(x=>x.sku===serial.sku);
    const movs = movimientos.filter(m=>m.sn===q);
    el.innerHTML = `<div class="traz-result-card">
      <div class="traz-result-title"><i class="fa-solid fa-fingerprint" style="color:var(--orange)"></i> S/N: ${q}</div>
      <div class="traz-result-sub"><span class="mono" style="color:var(--orange)">${serial.sku}</span> · ${p?.name||'—'} · <span class="badge ${serial.estado==='disponible'?'b-ok':'b-alert'}">${serial.estado}</span></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:14px">
        ${[['Ingresó',serial.ingresoDate||'—'],['Factura',serial.factura||'—'],['Proveedor',serial.proveedor||'—'],['Salió',serial.salidaDate||'—'],['Doc. salida',serial.docSalida||'—'],['Usuario',serial.userIngreso||'—']].map(([l,v])=>`<div style="background:var(--bg);border-radius:8px;padding:10px"><div style="font-size:9px;font-weight:800;color:var(--text-m);text-transform:uppercase;margin-bottom:3px">${l}</div><div style="font-size:12px;font-weight:700">${v}</div></div>`).join('')}
      </div>
      <div style="font-size:10px;font-weight:800;color:var(--text-m);text-transform:uppercase;margin-bottom:8px">Historial</div>
      <div class="traz-timeline">
        ${movs.map(m=>`<div class="traz-event"><div class="traz-dot traz-dot-${m.tipo==='ingreso'?'in':'out'}"></div><span class="traz-event-time">${m.date}</span><div><div class="traz-event-title">${m.tipo==='ingreso'?'📦 Entrada':'🚚 Salida'}</div><div class="traz-event-detail">${m.tipo==='ingreso'?'Factura: '+(m.factura||'—'):'Doc: '+(m.docSalida||'—')} · ${m.user}</div></div></div>`).join('')}
        ${!movs.length?'<p style="font-size:12px;color:var(--text-f)">Sin movimientos</p>':''}
      </div>
    </div>`;
    return;
  }

  const prod = findProduct(q)||products.find(p=>p.sku.toLowerCase()===q.toLowerCase());
  if (prod) {
    const movs = movimientos.filter(m=>m.sku===prod.sku);
    el.innerHTML = `<div class="traz-result-card">
      <div class="traz-result-title"><i class="fa-solid fa-boxes-stacked" style="color:var(--orange)"></i> SKU: ${prod.sku}</div>
      <div class="traz-result-sub">${prod.name} · Stock: <strong>${stockOf(prod.sku)}</strong> disponibles</div>
      <div class="traz-timeline">
        ${movs.map(m=>`<div class="traz-event"><div class="traz-dot traz-dot-${m.tipo==='ingreso'?'in':'out'}"></div><span class="traz-event-time">${m.date}</span><div><div class="traz-event-title">${m.tipo==='ingreso'?'📦 Entrada':'🚚 Salida'} — S/N: ${m.sn||'—'}</div><div class="traz-event-detail">${m.tipo==='ingreso'?'Fact: '+(m.factura||'—'):'Doc: '+(m.docSalida||'—')} · ${m.user}</div></div></div>`).join('')}
        ${!movs.length?'<p style="font-size:12px;color:var(--text-f)">Sin movimientos</p>':''}
      </div>
    </div>`;
    return;
  }

  const movsFac = movimientos.filter(m=>m.factura===q||m.docSalida===q);
  if (movsFac.length) {
    el.innerHTML = `<div class="traz-result-card">
      <div class="traz-result-title"><i class="fa-solid fa-file-invoice" style="color:var(--orange)"></i> Documento: ${q}</div>
      <div class="traz-result-sub">${movsFac.length} movimiento(s)</div>
      <div class="traz-timeline">
        ${movsFac.map(m=>`<div class="traz-event"><div class="traz-dot traz-dot-${m.tipo==='ingreso'?'in':'out'}"></div><span class="traz-event-time">${m.date}</span><div><div class="traz-event-title">SKU: ${m.sku} · S/N: ${m.sn||'—'}</div><div class="traz-event-detail">${products.find(p=>p.sku===m.sku)?.name||'—'} · ${m.user}</div></div></div>`).join('')}
      </div>
    </div>`;
    return;
  }

  el.innerHTML = `<div class="traz-result-card" style="text-align:center;color:var(--text-m)"><i class="fa-solid fa-magnifying-glass" style="font-size:24px;display:block;margin-bottom:8px;color:var(--text-f)"></i>Sin resultados para "<strong>${q}</strong>"</div>`;
}

// ── SCANNER ────────────────────────────────
let html5Scanner = null;
let scanRunning  = false;
let scanMode     = 'sku';
let scannedSku   = null;
let scanOp       = 'ingreso';
let scannedUnknownCode = null;

function initScanView() {
  detectServerUrl();
  updateScanUI();
  const isSecure = location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1';
  if (!isSecure) {
    document.getElementById('https-warn').style.display = 'block';
    const btn = document.getElementById('btn-cam-start');
    btn.innerHTML = '<i class="fa-solid fa-lock"></i> Requiere HTTPS';
    btn.style.background = '#9ca3af';
    btn.onclick = ()=>document.getElementById('https-warn').scrollIntoView({behavior:'smooth'});
  }
}

function updateScanUI() {
  document.getElementById('cam-label').textContent = scanMode==='sku'?'Paso 1 — Escanea el SKU':'Paso 2 — Escanea el S/N';
  document.getElementById('step-sku').className    = 'scan-step'+(scannedSku&&scanMode!=='sku'?' done':scanMode==='sku'?' active':'');
  document.getElementById('step-sn').className     = 'scan-step'+(scanMode==='sn'?' active':'');
  document.getElementById('step-confirm').className= 'scan-step';
  // Mostrar botón generar S/N solo en paso 2
  const genWrap = document.getElementById('btn-gen-sn-wrap');
  if (genWrap) genWrap.style.display = (scanMode==='sn' && scannedSku) ? 'block' : 'none';
  // Update placeholder del input manual
  const manual = document.getElementById('manual-input');
  if (manual) manual.placeholder = scanMode==='sku' ? 'Código SKU o barras...' : 'S/N de la unidad...';
}

function startScan() {
  if (!window.Html5Qrcode) { toast('Librería de cámara no disponible','error'); return; }
  document.getElementById('btn-cam-start').style.display = 'none';
  document.getElementById('reader').style.display        = 'block';
  document.getElementById('btn-cam-stop').style.display  = 'flex';
  document.getElementById('cam-status').textContent      = 'Iniciando cámara...';
  html5Scanner = new Html5Qrcode('reader');
  scanRunning  = true;
  Html5Qrcode.getCameras().then(cams=>{
    if (!cams?.length) { document.getElementById('cam-status').textContent='⚠️ Sin cámara'; stopScan(); return; }
    const cam = cams.find(c=>/back|rear|environment/i.test(c.label))||cams[cams.length-1];
    html5Scanner.start(cam.id,{fps:15,qrbox:{width:Math.min(220,window.innerWidth-80),height:100},aspectRatio:1.5},
      code=>onScanCode(code),()=>{})
    .then(()=>document.getElementById('cam-status').textContent='📷 Apunta al código')
    .catch(e=>document.getElementById('cam-status').textContent='⚠️ '+e);
  }).catch(()=>document.getElementById('cam-status').textContent='⚠️ Sin acceso — acepta el permiso de cámara');
}

function stopScan() {
  if (html5Scanner&&scanRunning) { html5Scanner.stop().catch(()=>{}); scanRunning=false; }
  document.getElementById('btn-cam-start').style.display = 'flex';
  document.getElementById('reader').style.display        = 'none';
  document.getElementById('btn-cam-stop').style.display  = 'none';
  document.getElementById('cam-status').textContent      = '';
}

function manualInput() {
  const v = document.getElementById('manual-input').value.trim();
  if (!v) return;
  onScanCode(v);
  document.getElementById('manual-input').value = '';
}

function onScanCode(code) {
  document.getElementById('cam-status').textContent = '✅ '+code;

  if (scanMode==='sku') {
    const p = findProduct(code)||products.find(x=>x.sku===code);
    if (!p) { showScanNewProduct(code); return; }
    scannedSku = p.sku;
    document.getElementById('src-sku').textContent      = p.sku;
    document.getElementById('src-sku-name').textContent = p.name+' · '+stockOf(p.sku)+' disponibles';
    document.getElementById('scan-sku-result').style.display    = 'block';
    document.getElementById('scan-sn-result').style.display     = 'none';
    document.getElementById('scan-confirmed').style.display     = 'none';
    document.getElementById('scan-new-product').style.display   = 'none';
    updateScanUI();
    toast('SKU: '+p.name,'ok');
    return;
  }

  if (scanMode==='sn') {
    const exist = findSerial(code);
    let warn = '';
    if (exist&&exist.sku!==scannedSku) warn='⚠️ S/N pertenece al SKU '+exist.sku;
    if (exist&&exist.estado==='vendido') warn='⚠️ S/N ya fue despachado';
    document.getElementById('src-sn').textContent       = code;
    document.getElementById('src-sn-warn').textContent  = warn;
    document.getElementById('scan-sn-result').style.display  = 'block';
    document.getElementById('scan-confirmed').style.display  = 'none';
    document.getElementById('step-sn').className = 'scan-step done';
    document.getElementById('step-confirm').className = 'scan-step active';
  }
}

function setOp(op) {
  scanOp = op;
  document.getElementById('op-ingreso').classList.toggle('active',op==='ingreso');
  document.getElementById('op-salida').classList.toggle('active',op==='salida');
  document.getElementById('op-ingreso-fields').style.display = op==='ingreso'?'block':'none';
  document.getElementById('op-salida-fields').style.display  = op==='salida'?'block':'none';
}

function confirmMovement() {
  const sn = document.getElementById('src-sn').textContent;
  if (!scannedSku||!sn) { toast('Faltan datos','error'); return; }
  const dateStr = now();
  if (scanOp==='ingreso') {
    if (findSerial(sn)) { toast('S/N ya existe: '+sn,'error'); return; }
    const factura   = document.getElementById('scan-factura').value.trim();
    const proveedor = document.getElementById('scan-proveedor').value.trim();
    seriales.push({id:genId(),sku:scannedSku,sn,estado:'disponible',ingresoDate:dateStr,factura,proveedor,salidaDate:null,docSalida:null,userIngreso:CU.name,userSalida:null});
    movimientos.unshift({id:genId(),tipo:'ingreso',sku:scannedSku,sn,factura,proveedor,docSalida:null,user:CU.name,date:dateStr,notes:''});
    addAudit('Ingreso escáner',scannedSku,sn,'Fact: '+(factura||'—'));
    document.getElementById('conf-msg').textContent = '✅ S/N '+sn+' ingresado a '+scannedSku;
  } else {
    const s = findSerial(sn);
    if (!s||s.sku!==scannedSku||s.estado!=='disponible') { toast('S/N no disponible para este SKU','error'); return; }
    const doc = document.getElementById('scan-pedido').value.trim();
    s.estado='vendido'; s.salidaDate=dateStr; s.docSalida=doc; s.userSalida=CU.name;
    movimientos.unshift({id:genId(),tipo:'salida',tipoDet:'escaner',sku:scannedSku,sn,factura:null,proveedor:null,docSalida:doc,user:CU.name,date:dateStr,notes:''});
    addAudit('Salida escáner',scannedSku,sn,'Doc: '+(doc||'—'));
    document.getElementById('conf-msg').textContent = '✅ S/N '+sn+' despachado de '+scannedSku;
  }
  document.getElementById('scan-confirmed').style.display    = 'block';
  document.getElementById('scan-sn-result').style.display    = 'none';
  renderDashboard(); renderProductos();
  toast(scanOp==='ingreso'?'Ingreso registrado':'Salida registrada','ok');
}

function nextSn() {
  document.getElementById('scan-confirmed').style.display = 'none';
  document.getElementById('scan-sn-result').style.display = 'none';
  scanMode = 'sn';
  updateScanUI();
}

function resetScan() {
  scannedSku = null; scanMode = 'sku';
  ['scan-sku-result','scan-sn-result','scan-confirmed','scan-new-product'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById('step-sku').className = 'scan-step active';
  document.getElementById('step-sn').className  = 'scan-step';
  document.getElementById('step-confirm').className = 'scan-step';
  updateScanUI();
}

// ── NUEVO PRODUCTO DESDE ESCÁNER ──────────
function showScanNewProduct(code) {
  scannedUnknownCode = code;
  document.getElementById('snp-code').textContent = code;
  document.getElementById('scan-new-product').style.display  = 'block';
  document.getElementById('scan-sku-result').style.display   = 'none';
  document.getElementById('snp-form').style.display    = 'none';
  document.getElementById('snp-assign').style.display  = 'none';
  document.getElementById('snp-sku').value  = code;
  document.getElementById('snp-name').value = '';
  toast('Código nuevo — elige qué hacer','');
}

function showSnpForm() {
  document.getElementById('snp-form').style.display   = 'block';
  document.getElementById('snp-assign').style.display = 'none';
}

function showSnpAssign() {
  document.getElementById('snp-sku-assign').innerHTML = '<option value="">— Selecciona SKU —</option>'+
    products.map(p=>`<option value="${p.sku}">${p.sku} — ${p.name}</option>`).join('');
  document.getElementById('snp-assign').style.display = 'block';
  document.getElementById('snp-form').style.display   = 'none';
}

function createProductFromScan() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sku  = document.getElementById('snp-sku').value.trim().toUpperCase();
  const name = document.getElementById('snp-name').value.trim();
  if (!sku||!name) { toast('SKU y nombre obligatorios','error'); return; }
  if (products.find(p=>p.sku===sku)) { toast('SKU ya existe','error'); return; }
  const p = {id:genId(),sku,name,brand:document.getElementById('snp-brand').value.trim(),cat:document.getElementById('snp-cat').value,barcode1:scannedUnknownCode,barcode2:genBodCode(),stockMin:0,ubicacion:'',notes:'Creado desde escáner',createdBy:CU.name,createdAt:now()};
  products.push(p);
  addAudit('SKU creado desde escáner',sku,'—','Código: '+scannedUnknownCode);
  scannedSku = sku;
  document.getElementById('src-sku').textContent      = sku;
  document.getElementById('src-sku-name').textContent = name+' · ✅ RECIÉN CREADO';
  document.getElementById('scan-new-product').style.display = 'none';
  document.getElementById('scan-sku-result').style.display  = 'block';
  scanMode = 'sn';
  updateScanUI();
  renderProductos(); renderDashboard();
  toast('Producto "'+name+'" creado — escanea el S/N','ok');
}

function assignCodeToSku() {
  const sku = document.getElementById('snp-sku-assign').value;
  if (!sku) { toast('Selecciona un SKU','error'); return; }
  const p = products.find(x=>x.sku===sku);
  if (!p) return;
  if (!p.barcode2) p.barcode2 = scannedUnknownCode;
  else if (!p.barcode1) p.barcode1 = scannedUnknownCode;
  addAudit('Código asignado desde escáner',sku,'—',scannedUnknownCode);
  scannedSku = sku;
  document.getElementById('src-sku').textContent      = sku;
  document.getElementById('src-sku-name').textContent = p.name+' · Stock: '+stockOf(sku)+' · ✅ ASIGNADO';
  document.getElementById('scan-new-product').style.display = 'none';
  document.getElementById('scan-sku-result').style.display  = 'block';
  scanMode = 'sn';
  updateScanUI();
  renderProductos();
  toast('Código asignado a '+sku,'ok');
}

function resetScanNewProduct() { scannedUnknownCode=null; document.getElementById('scan-new-product').style.display='none'; resetScan(); }

// ── URL SERVIDOR ───────────────────────────
function detectServerUrl() {
  const el   = document.getElementById('server-url');
  if (!el) return;
  const host = window.location.hostname;
  const port = window.location.port||'';
  if (host==='localhost'||host==='127.0.0.1') {
    el.innerHTML = '<span style="font-size:11px">Para celular: <strong>http://[IP-del-PC]:'+(port||'3000')+'/login.html</strong><br>La IP aparece al correr INICIAR.bat</span>';
  } else {
    el.textContent = `http://${host}${port?':'+port:''}/login.html`;
  }
}

// ── AUDITORÍA ──────────────────────────────
function renderAuditoria() {
  const tb = document.getElementById('tbody-audit');
  tb.innerHTML = audit.length
    ? audit.map(e=>`<tr>
        <td style="font-size:10px;font-family:monospace;color:var(--text-m)">${e.time}</td>
        <td style="font-weight:700">${e.user}</td>
        <td><span class="role-chip ${ROLE_CLASS[e.role]}">${ROLE_EMOJI[e.role]} ${ROLE_LABELS[e.role]}</span></td>
        <td>${e.action}</td>
        <td><span class="mono">${e.sku}</span></td>
        <td><span class="mono">${e.sn}</span></td>
        <td style="font-size:11px;color:var(--text-m)">${e.detail}</td>
      </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--text-f);padding:2rem">Sin actividad</td></tr>';
}

function exportAuditoria() {
  if (!can('export')) { toast('Sin permisos','error'); return; }
  _xlsxDownload(audit.map(e=>({Fecha:e.time,Usuario:e.user,Rol:ROLE_LABELS[e.role],Acción:e.action,SKU:e.sku,'S/N':e.sn,Detalle:e.detail})),'lubabycas_auditoria.xlsx');
}

function exportProductos() {
  if (!can('export')) { toast('Sin permisos','error'); return; }
  _xlsxDownload(products.map(p=>({SKU:p.sku,Nombre:p.name,Marca:p.brand||'',Categoría:p.cat||'','Cód.Fábrica':p.barcode1||'','Cód.Bodega':p.barcode2||'',Stock:stockOf(p.sku),'S/N total':seriales.filter(s=>s.sku===p.sku).length,'Stock mín':p.stockMin||0,Ubicación:p.ubicacion||''})),'lubabycas_productos.xlsx');
}

function _xlsxDownload(data, filename) {
  if (!data.length) { toast('Sin datos',''); return; }
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Datos');
  XLSX.writeFile(wb,filename);
  toast('Exportado: '+filename,'ok');
}

// ── USUARIOS ───────────────────────────────
function renderUsuarios() {
  if (!can('users')) { document.getElementById('view-usuarios').innerHTML='<div style="text-align:center;padding:3rem;color:var(--text-f)"><i class="fa-solid fa-lock" style="font-size:32px;display:block;margin-bottom:12px"></i>Sin acceso</div>'; return; }
  const PERM_L={read:'Leer',write:'Crear',edit:'Editar',delete:'Eliminar',users:'Usuarios',export:'Exportar'};
  document.getElementById('tbody-usuarios').innerHTML = usuarios.map(u=>`<tr>
    <td><span class="mono">${u.username}</span></td>
    <td style="font-weight:700">${u.name}</td>
    <td><span class="role-chip ${ROLE_CLASS[u.role]}">${ROLE_EMOJI[u.role]} ${ROLE_LABELS[u.role]}</span></td>
    <td style="font-size:11px">${u.perms.map(p=>`<span style="background:var(--orange-lt);color:var(--orange);padding:1px 5px;border-radius:4px;margin:1px;display:inline-block;font-weight:700">${PERM_L[p]||p}</span>`).join(' ')}</td>
    <td>${u.username!==CU.username && can('delete')?`<button class="btn-tbl" onclick="deleteUsuario(${u.id})"><i class="fa-solid fa-trash"></i></button>`:'<span class="faint">${u.username===CU.username?"Tú":"—"}</span>'}</td>
  </tr>`).join('');
}

function saveUsuario() {
  if (!can('users')) return;
  const name=document.getElementById('u-name').value.trim();
  const username=document.getElementById('u-username').value.trim();
  const pass=document.getElementById('u-pass').value;
  const role=document.getElementById('u-role').value;
  if (!name||!username||!pass) { toast('Completa todos los campos','error'); return; }
  if (usuarios.find(u=>u.username===username)) { toast('Usuario ya existe','error'); return; }
  const PERMS={admin:['read','write','edit','delete','users','export'],supervisor:['read','write','edit','export'],bodeguero:['read','write','edit'],lectura:['read']};
  usuarios.push({id:Date.now(),username,name,role,perms:PERMS[role]||['read']});
  addAudit('Usuario creado',username,'—','Rol: '+ROLE_LABELS[role]);
  closeModals(); renderUsuarios();
  toast('Usuario '+username+' creado','ok');
}

function deleteUsuario(id) { usuarios=usuarios.filter(u=>u.id!==id); renderUsuarios(); toast('Usuario eliminado'); }

// ══════════════════════════════════════════
//  CARGA INICIAL DESDE SERVIDOR (SQLite)
// ══════════════════════════════════════════

async function loadFromServer() {
  try {
    // Verificar health del servidor
    await API.health();

    // Cargar todos los datos en paralelo
    const [prods, sers, movs, devs, segs, usrs, aud] = await Promise.all([
      API.products.list().catch(()=>[]),
      API.seriales.list().catch(()=>[]),
      API.movimientos.list().catch(()=>[]),
      API.devoluciones.list().catch(()=>[]),
      API.segunda.list().catch(()=>[]),
      API.usuarios.list().catch(()=>[]),
      API.audit.list().catch(()=>[]),
    ]);

    products     = prods.map(p => ({...p, ubCodigo: p.ubCodigo || genUbCodigo(p.bodega||'',p.piso||'',p.pasillo||'',p.rack||'',p.nivel||'')}));
    seriales     = sers;
    movimientos  = movs;
    devoluciones = devs.map(d => ({...d, historial: []}));
    segundaItems = segs.map(s => ({...s, imagenes: typeof s.imagenes==='string'? JSON.parse(s.imagenes||'[]'):s.imagenes||[], movimientos:[]}));
    usuarios     = usrs.map(u => ({...u, activo: u.activo !== 0}));
    audit        = aud;

    console.log(`✅ Servidor conectado — ${products.length} SKUs, ${seriales.length} S/N`);
    _setOfflineBanner(false);
  } catch(e) {
    console.warn('⚠️ Servidor no disponible — modo local:', e.message);
    _setOfflineBanner(true);
    loadFallbackDemo();
  }
}

function _setOfflineBanner(on) {
  let b = document.getElementById('offline-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'offline-banner';
    b.style.cssText = 'position:fixed;top:54px;left:0;right:0;background:#ef4444;color:#fff;text-align:center;padding:7px 16px;font-size:12px;font-weight:800;z-index:9999;display:none';
    b.innerHTML = '⚠️ Sin conexión al servidor — abre lubabycas-server/INICIAR.bat para guardar datos';
    document.body.appendChild(b);
  }
  b.style.display = on ? 'block' : 'none';
}

function loadFallbackDemo() {
  if (products.length) return; // ya hay datos
  products = [
    {id:'P0001',sku:'MUSSOCAFE',name:'Muselina Café Premium',brand:'LuBabycas',cat:'Mundo Bebé',barcode1:'7802900001234',barcode2:'BOD-0001',stockMin:5,ubicacion:'',bodega:'B1',piso:'P1',pasillo:'1',rack:'A',nivel:'N2',ubCodigo:'B1-P1-PS1-RA-N2',notes:'',createdBy:'Sistema',createdAt:now()},
    {id:'P0002',sku:'NOTEBDELL',name:'Notebook Dell 14" i5',brand:'Dell',cat:'Home Office',barcode1:'7802900099991',barcode2:'BOD-0002',stockMin:2,ubicacion:'',bodega:'B2',piso:'P1',pasillo:'3',rack:'C',nivel:'N1',ubCodigo:'B2-P1-PS3-RC-N1',notes:'',createdBy:'Sistema',createdAt:now()},
  ];
  seriales = [
    {id:'S001',sku:'MUSSOCAFE',sn:'SN-MUS-001',estado:'disponible',ingresoDate:now(),factura:'FAC-1025',proveedor:'ABC Dist.',userIngreso:'Admin'},
    {id:'S002',sku:'MUSSOCAFE',sn:'SN-MUS-002',estado:'disponible',ingresoDate:now(),factura:'FAC-1025',proveedor:'ABC Dist.',userIngreso:'Admin'},
  ];
  movimientos = [];
  nextBodN = 3;
}

// ══════════════════════════════════════════
//  FUNCIONES CRUD CON SERVIDOR
// ══════════════════════════════════════════

// Override saveProducto → API
const _origSaveProductoBase = window.saveProducto;
window.saveProducto = async function() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sku  = document.getElementById('m-sku').value.trim().toUpperCase();
  const name = document.getElementById('m-name').value.trim();
  if (!sku||!name) { toast('SKU y nombre obligatorios','error'); return; }

  const bodega  = document.getElementById('m-bodega')?.value  || '';
  const piso    = document.getElementById('m-piso')?.value    || '';
  const pasillo = document.getElementById('m-pasillo')?.value || '';
  const rack    = document.getElementById('m-rack')?.value    || '';
  const nivel   = document.getElementById('m-nivel')?.value   || '';

  const data = {
    sku, name,
    brand:     document.getElementById('m-brand').value.trim(),
    cat:       document.getElementById('m-cat').value,
    barcode1:  document.getElementById('m-barcode1').value.trim(),
    barcode2:  document.getElementById('m-barcode2').value.trim(),
    stockMin:  parseInt(document.getElementById('m-stock-min').value)||0,
    ubicacion: document.getElementById('m-ubicacion')?.value.trim()||'',
    bodega, piso, pasillo, rack, nivel,
    ubCodigo:  genUbCodigo(bodega,piso,pasillo,rack,nivel),
    notes:     document.getElementById('m-notes')?.value.trim()||'',
    createdBy: CU.name,
  };

  try {
    await API.products.create(data);
    await recargarProductos();
    closeModals(); toast('SKU '+sku+' creado','ok');
    addAudit('SKU creado',sku,'—',name);
  } catch(e) {
    // Fallback local
    if (products.find(p=>p.sku===sku)) { toast('SKU ya existe','error'); return; }
    products.push({...data, id:genId(), createdAt:now(), stock:0, snCount:0});
    closeModals(); renderProductos(); renderDashboard();
    toast('SKU creado (local)','ok');
  }
};

// Override saveEditProducto → API
const _origSaveEditProdBase = window.saveEditProducto;
window.saveEditProducto = async function() {
  if (!can('edit')) { toast('Sin permisos','error'); return; }
  const skuOrig = document.getElementById('ep-sku-orig').value;
  const bodega  = document.getElementById('ep-bodega').value;
  const piso    = document.getElementById('ep-piso').value;
  const pasillo = document.getElementById('ep-pasillo').value;
  const rack    = document.getElementById('ep-rack').value;
  const nivel   = document.getElementById('ep-nivel').value;

  const data = {
    name:      document.getElementById('ep-name').value.trim(),
    brand:     document.getElementById('ep-brand').value.trim(),
    cat:       document.getElementById('ep-cat').value,
    barcode1:  document.getElementById('ep-barcode1').value.trim(),
    barcode2:  document.getElementById('ep-barcode2').value.trim(),
    stockMin:  parseInt(document.getElementById('ep-stock-min').value)||0,
    notes:     document.getElementById('ep-notes').value.trim(),
    ubicacion: document.getElementById('ep-ubicacion').value.trim(),
    bodega, piso, pasillo, rack, nivel,
    ubCodigo:  genUbCodigo(bodega,piso,pasillo,rack,nivel),
    editedBy:  CU.name,
  };

  try {
    await API.products.update(skuOrig, data);
    await recargarProductos();
    closeModals(); toast('Producto actualizado','ok');
    addAudit('SKU editado',skuOrig,'—',data.name);
  } catch(e) {
    // Fallback local
    const p = products.find(x=>x.sku===skuOrig);
    if (p) Object.assign(p, data);
    closeModals(); renderProductos();
    toast('Actualizado (local)','ok');
  }
};

// Override eliminarProducto → API
const _origEliminarProdBase = window.eliminarProducto;
window.eliminarProducto = function(sku) {
  if (!can('delete')) { toast('Sin permisos','error'); return; }
  const p       = products.find(x=>x.sku===sku);
  const snCount = seriales.filter(s=>s.sku===sku).length;
  confirmarEliminar(
    `¿Eliminar SKU "${sku}"?`,
    `${p?.name||''} · ${snCount} S/N registrados. No se puede deshacer.`,
    async () => {
      try {
        await API.products.delete(sku);
        await recargarProductos();
        await recargarSeriales();
        await recargarMovimientos();
        toast('SKU '+sku+' eliminado','');
        addAudit('SKU eliminado',sku,'—','');
      } catch(e) {
        // Fallback local
        products    = products.filter(x=>x.sku!==sku);
        seriales    = seriales.filter(s=>s.sku!==sku);
        movimientos = movimientos.filter(m=>m.sku!==sku);
        renderProductos(); renderDashboard();
        toast('Eliminado (local)','');
      }
    }
  );
};

// Override saveIngreso → API
const _origSaveIngresoBase = window.saveIngreso;
window.saveIngreso = async function() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sku       = document.getElementById('ing-sku').value;
  const factura   = document.getElementById('ing-factura').value.trim();
  const proveedor = document.getElementById('ing-proveedor').value.trim();
  const fecha     = document.getElementById('ing-fecha').value;
  const notes     = document.getElementById('ing-notes').value.trim();
  const snRaw     = document.getElementById('ing-sns').value;
  if (!sku||!factura) { toast('SKU y factura obligatorios','error'); return; }
  const sns = snRaw.split(/[\r\n]+/).map(s=>s.trim()).filter(Boolean);
  if (!sns.length) { toast('Ingresa al menos un S/N','error'); return; }

  try {
    await API.movimientos.ingreso({sku, sns, factura, proveedor, fecha, notes, user:CU.name, userRole:CU.role});
    await recargarSeriales();
    await recargarMovimientos();
    closeModals(); renderProductos(); renderDashboard(); renderIngresos();
    addAudit('Ingreso',sku,'—',`${sns.length} uds, Fact: ${factura}`);
    toast(`✅ ${sns.length} unidad(es) ingresadas a ${sku}`,'ok');
  } catch(e) {
    toast('Error: '+e.message,'error');
  }
};

// Override saveSalida → API
const _origSaveSalidaBase = window.saveSalida;
window.saveSalida = async function() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sku   = document.getElementById('sal-sku').value;
  const doc   = document.getElementById('sal-doc').value.trim();
  const notes = document.getElementById('sal-notes').value.trim();
  const sns   = [...document.querySelectorAll('input[name="sal-sn"]:checked')].map(c=>c.value);
  if (!sku)        { toast('Selecciona un SKU','error'); return; }
  if (!sns.length) { toast('Selecciona al menos un S/N','error'); return; }

  try {
    await API.movimientos.salida({sku, sns, docSalida:doc, tipoDet:'manual', notes, user:CU.name, userRole:CU.role});
    await recargarSeriales();
    await recargarMovimientos();
    closeModals(); renderProductos(); renderDashboard(); renderSalidas();
    addAudit('Salida',sku,'—',`${sns.length} uds, Doc: ${doc}`);
    toast(`✅ ${sns.length} unidad(es) despachadas de ${sku}`,'ok');
  } catch(e) {
    toast('Error: '+e.message,'error');
  }
};

// Override drConfirmar → API
const _origDrConfirmarBase = window.drConfirmar;
window.drConfirmar = async function() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sns = [...document.querySelectorAll('input[name="dr-sn"]:checked')].map(c=>c.value);
  if (!sns.length||!drCurrentSku) { toast('Selecciona al menos una unidad','error'); return; }
  const doc   = document.getElementById('dr-doc').value.trim();
  const notes = document.getElementById('dr-notes').value.trim();
  const L     = {venta:'Venta',envio:'Envío',devolucion:'Devolución',otro:'Salida'};

  try {
    await API.movimientos.salida({sku:drCurrentSku, sns, docSalida:doc, tipoDet:drTipo, notes:notes||L[drTipo], user:CU.name, userRole:CU.role});
    await recargarSeriales();
    await recargarMovimientos();
    const prod = products.find(p=>p.sku===drCurrentSku);
    addAudit(L[drTipo],drCurrentSku,'—',`${sns.length} uds, Doc: ${doc}`);
    toast(`✅ ${L[drTipo]}: ${sns.length} uds de ${prod?.name||drCurrentSku}`,'ok');
    renderSalidas(); renderDashboard(); renderSalidasKpis();
    drRenderSnList(drCurrentSku); drSelectNone();
    document.getElementById('dr-stock-label').innerHTML=`Disponibles: <strong style="color:${stockOf(drCurrentSku)===0?'var(--red)':'var(--green)'}">${stockOf(drCurrentSku)}</strong>`;
    document.getElementById('dr-doc').value=''; document.getElementById('dr-notes').value='';
    drActualizarBoton();
  } catch(e) {
    toast('Error: '+e.message,'error');
  }
};

// Override saveUsuario → API
const _origSaveUsuarioBase = window.saveUsuario;
window.saveUsuario = async function() {
  if (!can('users')) { return; }
  const name    = document.getElementById('u-name').value.trim();
  const username= document.getElementById('u-username').value.trim();
  const pass    = document.getElementById('u-pass').value;
  const role    = document.getElementById('u-role').value;
  if (!name||!username||!pass) { toast('Completa todos los campos','error'); return; }

  try {
    await API.usuarios.create({username,name,password:pass,role});
    await recargarUsuarios();
    closeModals(); toast('Usuario '+username+' creado','ok');
    addAudit('Usuario creado',username,'—','Rol: '+ROLE_LABELS[role]);
  } catch(e) {
    toast('Error: '+e.message,'error');
  }
};

// Override saveEditUsuario → API
const _origSaveEditUsuarioBase = window.saveEditUsuario;
window.saveEditUsuario = async function() {
  if (!can('users')) { toast('Sin permisos','error'); return; }
  const id   = parseInt(document.getElementById('eu-id').value);
  const data = {
    name:    document.getElementById('eu-name').value.trim(),
    role:    document.getElementById('eu-role').value,
    activo:  editUsuarioActivo,
    password:document.getElementById('eu-pass').value || undefined,
  };

  try {
    await API.usuarios.update(id, data);
    await recargarUsuarios();
    closeModals(); toast('Usuario actualizado','ok');
    addAudit('Usuario editado','—','—','ID: '+id);
  } catch(e) {
    // Fallback local
    const u = usuarios.find(x=>x.id===id);
    if (u) { u.name=data.name||u.name; u.role=data.role; u.activo=data.activo; if(data.password)u.password=data.password; }
    closeModals(); renderUsuarios();
    toast('Actualizado (local)','ok');
  }
};

// Override toggleActivoRapido → API
const _origToggleActivoBase = window.toggleActivoRapido;
window.toggleActivoRapido = async function(id) {
  if (!can('users')) { toast('Sin permisos','error'); return; }
  const u = usuarios.find(x=>x.id===id);
  if (!u||u.username===CU.username) return;
  const nuevoActivo = u.activo === false ? true : false;

  try {
    await API.usuarios.toggle(id, nuevoActivo);
    await recargarUsuarios();
    toast(nuevoActivo?'✅ Usuario activado':'🔒 Usuario desactivado','ok');
    addAudit(nuevoActivo?'Usuario activado':'Usuario desactivado',u.username,'—','');
  } catch(e) {
    u.activo = nuevoActivo;
    renderUsuarios();
    toast(nuevoActivo?'✅ Activado (local)':'🔒 Desactivado (local)','');
  }
};

// Override deleteUsuario → API
const _origDeleteUsuarioBase = window.deleteUsuario;
window.deleteUsuario = function(id) {
  if (!can('delete')) { toast('Sin permisos','error'); return; }
  const u = usuarios.find(x=>x.id===id);
  if (!u||u.username===CU.username) return;
  confirmarEliminar(
    `¿Eliminar usuario "${u.username}"?`,
    `${u.name} · ${ROLE_LABELS[u.role]}`,
    async () => {
      try {
        await API.usuarios.delete(id);
        await recargarUsuarios();
        toast('Usuario eliminado','');
        addAudit('Usuario eliminado',u.username,'—','');
      } catch(e) {
        usuarios = usuarios.filter(x=>x.id!==id);
        renderUsuarios();
        toast('Eliminado (local)','');
      }
    }
  );
};

// Override eliminarSerial → API
const _origEliminarSerialBase = window.eliminarSerial;
window.eliminarSerial = function(sn, sku) {
  if (!can('delete')) { toast('Sin permisos','error'); return; }
  const s = seriales.find(x=>x.sn===sn);
  confirmarEliminar(
    `¿Eliminar S/N "${sn}"?`,
    `SKU: ${sku} · Estado: ${s?.estado||'—'}`,
    async () => {
      try {
        await API.seriales.delete(sn);
        await recargarSeriales();
        await recargarMovimientos();
        verDetalleSku(sku); renderProductos();
        toast('S/N eliminado','');
        addAudit('S/N eliminado',sku,sn,'');
      } catch(e) {
        seriales    = seriales.filter(x=>x.sn!==sn);
        movimientos = movimientos.filter(m=>m.sn!==sn);
        verDetalleSku(sku); renderProductos();
        toast('Eliminado (local)','');
      }
    }
  );
};

// Override eliminarDevolucion → API
const _origEliminarDevBase = window.eliminarDevolucion;
window.eliminarDevolucion = function(id) {
  if (!can('delete')) { toast('Sin permisos','error'); return; }
  const d = devoluciones.find(x=>x.id===id);
  confirmarEliminar(
    `¿Eliminar devolución?`,
    `SKU: ${d?.sku||'—'} · Motivo: ${d?.motivo||'—'}`,
    async () => {
      try {
        await API.devoluciones.delete(id);
        await recargarDevoluciones();
        toast('Devolución eliminada','');
        addAudit('Devolución eliminada',d?.sku||'—',d?.sn||'—','');
      } catch(e) {
        devoluciones = devoluciones.filter(x=>x.id!==id);
        renderDevoluciones();
        toast('Eliminada (local)','');
      }
    }
  );
};

// Override eliminarSegunda → API
const _origEliminarSegBase = window.eliminarSegunda;
window.eliminarSegunda = function(id) {
  if (!can('delete')) { toast('Sin permisos','error'); return; }
  const s = segundaItems.find(x=>x.id===id);
  confirmarEliminar(
    `¿Eliminar "${s?.nombre||id}"?`,
    'De inventario 2da selección. No se puede deshacer.',
    async () => {
      try {
        await API.segunda.delete(id);
        await recargarSegunda();
        closeModals(); toast('Ítem eliminado','');
        addAudit('2da selección eliminado',s?.sku||'—',s?.sn||'—','');
      } catch(e) {
        segundaItems = segundaItems.filter(x=>x.id!==id);
        renderSegunda(); closeModals();
        toast('Eliminado (local)','');
      }
    }
  );
};

// ── RECARGA DE DATOS DESDE SERVIDOR ───────
async function recargarProductos() {
  try {
    const data = await API.products.list();
    products = data.map(p=>({...p, ubCodigo:p.ubCodigo||genUbCodigo(p.bodega||'',p.piso||'',p.pasillo||'',p.rack||'',p.nivel||'')}));
    renderProductos(); renderDashboard();
  } catch(e) {}
}

async function recargarSeriales() {
  try { seriales = await API.seriales.list(); } catch(e) {}
}

async function recargarMovimientos() {
  try { movimientos = await API.movimientos.list(); } catch(e) {}
}

async function recargarDevoluciones() {
  try {
    const data = await API.devoluciones.list();
    devoluciones = data.map(d=>({...d, historial:[]}));
    renderDevoluciones();
  } catch(e) {}
}

async function recargarSegunda() {
  try {
    const data = await API.segunda.list();
    segundaItems = data.map(s=>({...s, imagenes:typeof s.imagenes==='string'?JSON.parse(s.imagenes||'[]'):s.imagenes||[], movimientos:[]}));
    renderSegunda();
  } catch(e) {}
}

async function recargarUsuarios() {
  try {
    const data = await API.usuarios.list();
    usuarios = data.map(u=>({...u, activo: u.activo!==0}));
    renderUsuarios();
  } catch(e) {}
}

// ── INIT ────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verificar sesión
  const raw = sessionStorage.getItem('lb_user');
  if (!raw) { window.location.href = 'login.html'; return; }
  CU = JSON.parse(raw);

  // 2. Mostrar UI inmediatamente (sin esperar datos)
  try {
    document.getElementById('uname').textContent       = CU.name;
    document.getElementById('urole').textContent       = ROLE_LABELS[CU.role] || CU.role;
    document.getElementById('uavatar').textContent     = CU.name[0].toUpperCase();
    document.getElementById('topbar-user').textContent = CU.name;
    document.getElementById('app').style.display       = 'grid';
  } catch(e) { console.error('initUI error:', e); }

  applyPermissions();

  // 3. Mostrar loading en dashboard
  const kpiEl = document.getElementById('kpi-row');
  if (kpiEl) kpiEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-f);padding:20px"><i class="fa-solid fa-circle-notch fa-spin" style="font-size:24px;color:var(--orange)"></i><div style="margin-top:8px;font-size:13px;font-weight:700">Conectando al servidor...</div></div>';
  goView('dashboard');

  // 4. Cargar datos del servidor
  await loadFromServer();

  // 5. Renderizar con datos reales
  renderDashboard();

  // 6. Auto-refresh cada 60s
  setInterval(async () => {
    if (document.visibilityState === 'visible') {
      try {
        await recargarProductos();
        await recargarSeriales();
        await recargarMovimientos();
      } catch(e) {}
    }
  }, 60000);

  // 7. Heartbeat sesión
  setTimeout(startHeartbeat, 3000);
});

// ══════════════════════════════════════════
//  DEVOLUCIONES
// ══════════════════════════════════════════

let devoluciones   = [];
let devFilter      = 'all';
let currentDevId   = null;

const DEV_ESTADOS = {
  en_revision: { label:'🔍 En revisión', cls:'dev-en_revision' },
  reparado:    { label:'🔧 Reparado',    cls:'dev-reparado'    },
  listo:       { label:'✅ Listo',        cls:'dev-listo'       },
  merma:       { label:'🗑️ Merma',       cls:'dev-merma'       },
};

function setDevFilter(f, el) {
  devFilter = f;
  document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
  el?.classList.add('active');
  renderDevoluciones();
}

function renderDevKpis() {
  const el = document.getElementById('dev-kpis');
  if (!el) return;
  const total       = devoluciones.length;
  const en_revision = devoluciones.filter(d => d.estado === 'en_revision').length;
  const reparado    = devoluciones.filter(d => d.estado === 'reparado').length;
  const listo       = devoluciones.filter(d => d.estado === 'listo').length;
  const merma       = devoluciones.filter(d => d.estado === 'merma').length;
  el.innerHTML = [
    { icon:'fa-rotate-left',    cls:'o', val:total,       lbl:'Total' },
    { icon:'fa-magnifying-glass',cls:'b',val:en_revision, lbl:'En revisión' },
    { icon:'fa-wrench',          cls:'a', val:reparado,   lbl:'Reparados' },
    { icon:'fa-circle-check',    cls:'g', val:listo,      lbl:'Listos' },
    { icon:'fa-trash',           cls:'r', val:merma,      lbl:'Merma' },
  ].map(k => `<div class="kpi-card">
    <div class="kpi-icon ${k.cls}"><i class="fa-solid ${k.icon}"></i></div>
    <div class="kpi-val">${k.val}</div>
    <div class="kpi-lbl">${k.lbl}</div>
  </div>`).join('');
}

function renderDevoluciones() {
  const q   = (document.getElementById('dev-search')?.value || '').toLowerCase();
  let rows  = devoluciones.filter(d => {
    if (devFilter !== 'all' && d.estado !== devFilter) return false;
    if (q && ![(d.sku||''),(d.sn||''),(d.motivo||''),(d.observacion||''),(d.productName||'')].some(v => v.toLowerCase().includes(q))) return false;
    return true;
  });

  // Desktop table
  const tb = document.getElementById('tbody-devoluciones');
  if (tb) {
    tb.innerHTML = rows.length ? rows.map(d => `<tr>
      <td style="font-size:11px;font-family:monospace;color:var(--text-m)">${d.fechaIngreso}</td>
      <td><span class="mono" style="color:var(--orange)">${d.sku}</span></td>
      <td style="font-weight:700">${d.productName||'—'}</td>
      <td><span class="mono">${d.sn||'—'}</span></td>
      <td>${d.motivo}</td>
      <td><span class="badge ${DEV_ESTADOS[d.estado]?.cls||''}">${DEV_ESTADOS[d.estado]?.label||d.estado}</span></td>
      <td style="font-size:11px;color:var(--text-m);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.observacion||'—'}</td>
      <td><span class="mono">${d.docOrigen||'—'}</span></td>
      <td>${d.userIngreso||'—'}</td>
      <td><button class="btn-tbl" onclick="abrirDetalleDev('${d.id}')"><i class="fa-solid fa-pen"></i> Gestionar</button></td>
    </tr>`).join('')
    : `<tr><td colspan="10" style="text-align:center;color:var(--text-f);padding:2rem">${devoluciones.length?'Sin resultados':'Sin devoluciones registradas'}</td></tr>`;
  }

  // Mobile cards
  const cards = document.getElementById('dev-cards');
  if (cards) {
    cards.innerHTML = rows.length ? rows.map(d => `
      <div class="prod-card">
        <div class="prod-card-top">
          <div style="flex:1">
            <div class="prod-card-sku">${d.sku}${d.sn?' · S/N: '+d.sn:''}</div>
            <div class="prod-card-name">${d.productName||d.sku}</div>
            <div style="font-size:12px;color:var(--text-m);margin-top:3px">${d.motivo}</div>
          </div>
          <span class="badge ${DEV_ESTADOS[d.estado]?.cls||''}" style="white-space:nowrap;align-self:flex-start">${DEV_ESTADOS[d.estado]?.label||d.estado}</span>
        </div>
        ${d.observacion?`<div style="font-size:12px;color:var(--text-m);background:var(--bg);padding:8px 10px;border-radius:8px;margin-bottom:10px">${d.observacion}</div>`:''}
        <div class="prod-card-meta">
          ${d.docOrigen?`<span class="mono">${d.docOrigen}</span>`:''}
          <span style="font-size:11px;color:var(--text-f)">${d.fechaIngreso}</span>
        </div>
        <div class="prod-card-actions">
          <button class="btn-orange" style="flex:1;justify-content:center;font-size:12px" onclick="abrirDetalleDev('${d.id}')">
            <i class="fa-solid fa-pen"></i> Gestionar
          </button>
        </div>
      </div>`).join('')
    : `<div style="text-align:center;color:var(--text-f);padding:2rem">${devoluciones.length?'Sin resultados':'Sin devoluciones'}</div>`;
  }

  renderDevKpis();
}

// ── MODAL NUEVA DEVOLUCIÓN ─────────────────
function initDevModal() {
  const sel = document.getElementById('dev-sku');
  if (!sel) return;
  sel.innerHTML = '<option value="">— SKU —</option>' +
    products.map(p => `<option value="${p.sku}">${p.sku} — ${p.name}</option>`).join('');
  document.getElementById('dev-sn').innerHTML   = '<option value="">— S/N vendido —</option>';
  document.getElementById('dev-motivo').value   = '';
  document.getElementById('dev-doc').value      = '';
  document.getElementById('dev-obs').value      = '';
}

function onDevSkuChange() {
  const sku = document.getElementById('dev-sku').value;
  const sel = document.getElementById('dev-sn');
  if (!sku) { sel.innerHTML = '<option value="">— S/N vendido —</option>'; return; }
  // Buscar S/N vendidos o reservados de ese SKU (los que podrían haber sido devueltos)
  const vendidos = seriales.filter(s => s.sku === sku && (s.estado === 'vendido' || s.estado === 'reservado'));
  sel.innerHTML = '<option value="">— sin S/N específico —</option>' +
    vendidos.map(s => `<option value="${s.sn}">${s.sn} (${s.estado})</option>`).join('');
}

function saveDevolucion() {
  if (!can('write')) { toast('Sin permisos', 'error'); return; }
  const sku     = document.getElementById('dev-sku').value;
  const sn      = document.getElementById('dev-sn').value;
  const motivo  = document.getElementById('dev-motivo').value;
  const doc     = document.getElementById('dev-doc').value.trim();
  const obs     = document.getElementById('dev-obs').value.trim();
  if (!sku || !motivo) { toast('SKU y motivo son obligatorios', 'error'); return; }

  const prod     = products.find(p => p.sku === sku);
  const dateStr  = now();
  const id       = 'DEV' + Date.now();
  const newDev   = {
    id, sku, sn, motivo, estado: 'en_revision',
    observacion: obs, docOrigen: doc,
    fechaIngreso: dateStr, fechaEstado: null,
    userIngreso: CU.name, userEstado: '',
    productName: prod?.name || sku,
    historial: [{ estadoAnterior: null, estadoNuevo: 'en_revision', observacion: 'Devolución creada: ' + motivo, user: CU.name, date: dateStr }]
  };

  devoluciones.unshift(newDev);

  // Marcar el S/N como reservado si existe
  if (sn) {
    const serial = seriales.find(s => s.sn === sn);
    if (serial) serial.estado = 'reservado';
  }

  addAudit('Devolución creada', sku, sn || '—', 'Motivo: ' + motivo);
  closeModals();
  renderDevoluciones();
  renderDashboard();
  renderProductos();
  toast('Devolución registrada — en revisión', 'ok');
}

// ── DETALLE / GESTIÓN DEVOLUCIÓN ───────────
function abrirDetalleDev(id) {
  const d = devoluciones.find(x => x.id === id);
  if (!d) return;
  currentDevId = id;
  const prod = products.find(p => p.sku === d.sku);

  document.getElementById('dd-title').textContent    = 'Devolución — ' + d.sku;
  document.getElementById('dd-subtitle').textContent = (prod?.name || d.sku) + (d.sn ? ' · S/N: ' + d.sn : '');

  // Info cards
  document.getElementById('dd-info').innerHTML = [
    { l:'Estado actual', v:`<span class="badge ${DEV_ESTADOS[d.estado]?.cls}">${DEV_ESTADOS[d.estado]?.label||d.estado}</span>` },
    { l:'Motivo',        v: d.motivo },
    { l:'Ingresó',       v: d.fechaIngreso },
    { l:'Doc. origen',   v: d.docOrigen || '—' },
    { l:'Usuario',       v: d.userIngreso },
    { l:'Observación',   v: d.observacion || '—' },
  ].map(x => `<div style="background:var(--bg);border-radius:8px;padding:10px">
    <div style="font-size:9px;font-weight:800;color:var(--text-m);text-transform:uppercase;margin-bottom:4px">${x.l}</div>
    <div style="font-size:12px;font-weight:700">${x.v}</div>
  </div>`).join('');

  // Botones de estado
  const DEV_ESTADOS_FULL = {
    ...DEV_ESTADOS,
    segunda: { label:'🏷️ 2da Selección', cls:'dev-segunda' },
  };
  document.getElementById('dd-estados').innerHTML = Object.entries(DEV_ESTADOS_FULL).map(([key, val]) => `
    <button class="dev-estado-btn ${val.cls} ${d.estado === key ? 'active' : ''}" onclick="selectDevEstado('${key}')">
      ${val.label}
    </button>`).join('');

  document.getElementById('dd-obs-update').value = '';

  // Historial
  const hist = d.historial || [];
  document.getElementById('dd-historial').innerHTML = hist.map(h => `
    <div class="traz-event">
      <div class="traz-dot" style="background:${h.estadoNuevo==='listo'?'var(--green)':h.estadoNuevo==='merma'?'var(--red)':'var(--amber)'}"></div>
      <span class="traz-event-time">${h.date}</span>
      <div>
        <div class="traz-event-title">${DEV_ESTADOS[h.estadoNuevo]?.label || h.estadoNuevo}</div>
        <div class="traz-event-detail">${h.observacion||'—'} · ${h.user}</div>
      </div>
    </div>`).join('') || '<p style="font-size:12px;color:var(--text-f)">Sin historial</p>';

  document.getElementById('modal-dev-detalle').classList.add('show');
}

let selectedDevEstado = null;

function selectDevEstado(estado) {
  selectedDevEstado = estado;
  document.querySelectorAll('.dev-estado-btn').forEach(btn => {
    const key = btn.onclick.toString().match(/'(\w+)'/)?.[1];
    btn.classList.toggle('active', key === estado);
  });
}

function updateDevolucion() {
  if (!can('edit')) { toast('Sin permisos', 'error'); return; }
  if (!currentDevId || !selectedDevEstado) { toast('Selecciona un estado', 'error'); return; }
  const d   = devoluciones.find(x => x.id === currentDevId);
  if (!d)   return;
  const obs      = document.getElementById('dd-obs-update').value.trim();
  const dateStr  = now();
  const anterior = d.estado;

  d.historial = d.historial || [];
  d.historial.push({ estadoAnterior: anterior, estadoNuevo: selectedDevEstado, observacion: obs, user: CU.name, date: dateStr });
  d.estado      = selectedDevEstado;
  d.observacion = obs || d.observacion;
  d.fechaEstado = dateStr;
  d.userEstado  = CU.name;

  // Actualizar serial si corresponde
  if (d.sn) {
    const serial = seriales.find(s => s.sn === d.sn);
    if (serial) {
      if (selectedDevEstado === 'listo')  serial.estado = 'disponible';
      if (selectedDevEstado === 'merma')  serial.estado = 'vendido';
      // en_revision y reparado → queda en reservado
    }
  }

  addAudit('Devolución → ' + selectedDevEstado, d.sku, d.sn || '—', obs || '');

  // Si va a 2da selección → abrir modal de segunda selección
  if (selectedDevEstado === 'segunda') {
    closeModals();
    renderDevoluciones();
    renderDashboard();
    renderProductos();
    const label = selectedDevEstado;
    selectedDevEstado = null;
    toast('Pasa a 2da selección — completa los datos', 'ok');
    setTimeout(()=>pasarDevolucionASegunda(d.id), 300);
    return;
  }

  closeModals();
  renderDevoluciones();
  renderDashboard();
  renderProductos();
  const _label = selectedDevEstado;
  selectedDevEstado = null;
  toast('Estado actualizado', 'ok');
}

function exportDevoluciones() {
  if (!can('export')) { toast('Sin permisos', 'error'); return; }
  if (!devoluciones.length) { toast('Sin devoluciones', ''); return; }
  _xlsxDownload(devoluciones.map(d => ({
    ID:           d.id,
    SKU:          d.sku,
    Producto:     d.productName || '',
    'S/N':        d.sn || '',
    Motivo:       d.motivo,
    Estado:       DEV_ESTADOS[d.estado]?.label || d.estado,
    Observación:  d.observacion || '',
    'Doc. origen':d.docOrigen || '',
    'Fecha ingreso': d.fechaIngreso,
    'Fecha estado':  d.fechaEstado || '',
    'Usuario ingreso': d.userIngreso,
    'Usuario estado':  d.userEstado || '',
  })), 'lubabycas_devoluciones.xlsx');
}

// Override openModal para inicializar modal devolución
const _origOpenModal = openModal;
window.openModal = function(id) {
  if (id === 'modal-devolucion') initDevModal();
  _origOpenModal(id);
};

// goView consolidado al final del archivo

// Badge de devoluciones — manejado en renderDashboard directamente

// ══════════════════════════════════════════
//  SEGUNDA SELECCIÓN
// ══════════════════════════════════════════

let segundaItems = [];
let segFilter    = 'all';
let segImgs      = [];   // base64 de imágenes pendientes
let currentSegId = null;

const FISICO_LABEL = { bueno:'✅ Bueno', regular:'⚠️ Regular', 'dañado':'❌ Dañado' };
const FISICO_CLS   = { bueno:'seg-fisico-bueno', regular:'seg-fisico-regular', 'dañado':'seg-fisico-dañado' };
const SEG_ESTADO   = { disponible:'Disponible', vendido:'Vendido', merma:'Merma' };

// ── Demo data ─────────────────────────────
function loadSegundaDemo() {
  if (segundaItems.length) return;
  segundaItems = [
    { id:'SS001', sku:'MUSSOCAFE', sn:'SN-MUS-003', nombre:'Muselina Café Premium', descripcion:'Pequeña mancha en esquina inferior, no afecta funcionalidad', estadoFisico:'regular', precioOriginal:15990, precioVenta:7990, imagenes:[], estado:'disponible', devolucionOrigen:'DEV-001', fechaIngreso:'25/07/26 14:00', userIngreso:'Admin', notas:'Ideal para regalo', movimientos:[] },
  ];
}

// ── Render KPIs ───────────────────────────
function renderSegKpis() {
  const el = document.getElementById('seg-kpis');
  if (!el) return;
  const total  = segundaItems.length;
  const disp   = segundaItems.filter(s=>s.estado==='disponible').length;
  const vend   = segundaItems.filter(s=>s.estado==='vendido').length;
  const merma  = segundaItems.filter(s=>s.estado==='merma').length;
  const valor  = segundaItems.filter(s=>s.estado==='disponible').reduce((a,s)=>a+(s.precioVenta||0),0);
  el.innerHTML = [
    {icon:'fa-tags',              cls:'o', val:total,                                            lbl:'Total items'},
    {icon:'fa-circle-check',      cls:'g', val:disp,                                             lbl:'Disponibles'},
    {icon:'fa-shopping-cart',     cls:'b', val:vend,                                             lbl:'Vendidos'},
    {icon:'fa-trash',             cls:'r', val:merma,                                            lbl:'Merma'},
    {icon:'fa-dollar-sign',       cls:'a', val:'$'+valor.toLocaleString('es-CL'),                lbl:'Valor stock'},
  ].map(k=>`<div class="kpi-card">
    <div class="kpi-icon ${k.cls}"><i class="fa-solid ${k.icon}"></i></div>
    <div class="kpi-val" style="font-size:${typeof k.val==='string'?'16px':'26px'}">${k.val}</div>
    <div class="kpi-lbl">${k.lbl}</div>
  </div>`).join('');
}

// ── Render cards ──────────────────────────
function renderSegunda() {
  loadSegundaDemo();
  const q    = (document.getElementById('seg-search')?.value||'').toLowerCase();
  let items  = segundaItems.filter(s=>{
    if (segFilter!=='all' && s.estado!==segFilter) return false;
    if (q && ![(s.sku||''),(s.nombre||''),(s.descripcion||''),(s.sn||'')].some(v=>v.toLowerCase().includes(q))) return false;
    return true;
  });

  const el = document.getElementById('seg-cards');
  if (!el) return;

  el.innerHTML = items.length ? items.map(s=>{
    const prod   = products.find(p=>p.sku===s.sku);
    const imgSrc = s.imagenes&&s.imagenes.length ? `<img class="seg-card-img" src="${s.imagenes[0]}" onclick="abrirDetalleSegunda('${s.id}')">` : `<div class="seg-card-img-placeholder"><i class="fa-solid fa-image" style="font-size:28px"></i><span style="font-size:11px">Sin fotos</span></div>`;
    const estadoBadge = s.estado==='disponible'?'<span class="badge seg-estado-disponible">Disponible</span>':s.estado==='vendido'?'<span class="badge seg-estado-vendido">Vendido</span>':'<span class="badge seg-estado-merma">Merma</span>';
    const fisicoSpan  = `<span class="badge ${FISICO_CLS[s.estadoFisico]||''}">${FISICO_LABEL[s.estadoFisico]||s.estadoFisico}</span>`;
    return `<div class="seg-card">
      <div class="seg-card-imgs">
        ${imgSrc}
        <div class="seg-card-badge">${estadoBadge}</div>
        ${s.imagenes&&s.imagenes.length>1?`<div style="position:absolute;bottom:6px;left:8px;background:rgba(0,0,0,.5);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px"><i class="fa-solid fa-images"></i> ${s.imagenes.length}</div>`:''}
      </div>
      <div class="seg-card-body">
        <div><span class="seg-card-sku">${s.sku}</span>${s.sn?` <span class="mono" style="font-size:10px">${s.sn}</span>`:''}</div>
        <div class="seg-card-name">${s.nombre}</div>
        <div class="seg-card-desc">${s.descripcion||'Sin descripción'}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">${fisicoSpan}${s.devolucionOrigen?`<span class="badge b-info" style="font-size:9px">DEV</span>`:''}</div>
        <div class="seg-card-precio">
          ${s.precioOriginal?`<span class="seg-card-precio-orig">$${s.precioOriginal.toLocaleString('es-CL')}</span>`:''}
          <span class="seg-card-precio-venta">$${(s.precioVenta||0).toLocaleString('es-CL')}</span>
        </div>
      </div>
      <div class="seg-card-actions">
        <button class="btn-ghost" style="flex:1;justify-content:center;font-size:12px" onclick="abrirDetalleSegunda('${s.id}')"><i class="fa-solid fa-eye"></i> Ver</button>
        ${s.estado==='disponible'?`<button class="btn-orange" style="flex:1;justify-content:center;font-size:12px" onclick="abrirVentaSegunda('${s.id}')"><i class="fa-solid fa-shopping-cart"></i> Vender</button>`:''}
      </div>
    </div>`;
  }).join('')
  : `<div style="text-align:center;color:var(--text-f);padding:3rem;grid-column:1/-1"><i class="fa-solid fa-tags" style="font-size:32px;display:block;margin-bottom:12px"></i>${segundaItems.length?'Sin resultados':'Sin ítems en segunda selección'}</div>`;

  renderSegKpis();
}

function setSegFilter(f, el) {
  segFilter = f;
  document.querySelectorAll('#view-segunda .filter-pills .pill').forEach(p=>p.classList.remove('active'));
  el?.classList.add('active');
  renderSegunda();
}

// ── Modal nueva/editar ─────────────────────
function abrirModalNuevaSegunda(devId, skuPre, snPre) {
  segImgs = [];
  document.getElementById('seg-edit-id').value   = '';
  document.getElementById('seg-modal-title').textContent = 'Nueva 2da Selección';
  document.getElementById('seg-dev-origen').value = devId||'';
  document.getElementById('seg-sku').innerHTML = '<option value="">— SKU —</option>'+products.map(p=>`<option value="${p.sku}">${p.sku} — ${p.name}</option>`).join('');
  if (skuPre) { document.getElementById('seg-sku').value = skuPre; onSegSkuChange(); setTimeout(()=>{if(snPre) document.getElementById('seg-sn').value=snPre;},50); }
  ['seg-nombre','seg-descripcion','seg-notas'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('seg-precio-orig').value  = '';
  document.getElementById('seg-precio-venta').value = '';
  document.getElementById('seg-estado-fisico').value= 'bueno';
  document.getElementById('seg-img-preview').innerHTML = '';
  document.getElementById('modal-segunda').classList.add('show');
}

function onSegSkuChange() {
  const sku = document.getElementById('seg-sku').value;
  const sel = document.getElementById('seg-sn');
  const prod = products.find(p=>p.sku===sku);
  if (prod && !document.getElementById('seg-nombre').value)
    document.getElementById('seg-nombre').value = prod.name;
  if (!sku) { sel.innerHTML='<option value="">— opcional —</option>'; return; }
  const vendidos = seriales.filter(s=>s.sku===sku&&(s.estado==='vendido'||s.estado==='reservado'));
  sel.innerHTML = '<option value="">— opcional —</option>'+vendidos.map(s=>`<option value="${s.sn}">${s.sn} (${s.estado})</option>`).join('');
}

function onSegImgChange(e) {
  const files = [...e.target.files];
  if (segImgs.length + files.length > 5) { toast('Máximo 5 fotos','error'); return; }
  files.forEach(file=>{
    const reader = new FileReader();
    reader.onload = ev => {
      segImgs.push(ev.target.result);
      renderSegImgPreview();
    };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

function renderSegImgPreview() {
  document.getElementById('seg-img-preview').innerHTML = segImgs.map((src,i)=>`
    <div class="img-preview-item">
      <img src="${src}">
      <button class="img-preview-del" onclick="removeSegImg(${i})"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('');
}

function removeSegImg(i) { segImgs.splice(i,1); renderSegImgPreview(); }

function saveSegunda() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sku    = document.getElementById('seg-sku').value;
  const nombre = document.getElementById('seg-nombre').value.trim();
  const precio = parseFloat(document.getElementById('seg-precio-venta').value);
  if (!sku||!nombre) { toast('SKU y nombre obligatorios','error'); return; }
  if (!precio||precio<=0) { toast('Ingresa el precio de venta','error'); return; }

  const editId = document.getElementById('seg-edit-id').value;
  const item = {
    id:             editId || ('SS'+Date.now()),
    sku,
    sn:             document.getElementById('seg-sn').value,
    nombre,
    descripcion:    document.getElementById('seg-descripcion').value.trim(),
    estadoFisico:   document.getElementById('seg-estado-fisico').value,
    precioOriginal: parseFloat(document.getElementById('seg-precio-orig').value)||0,
    precioVenta:    precio,
    imagenes:       [...segImgs],
    estado:         'disponible',
    devolucionOrigen: document.getElementById('seg-dev-origen').value,
    fechaIngreso:   now(),
    userIngreso:    CU.name,
    notas:          document.getElementById('seg-notas').value.trim(),
    movimientos:    [],
  };

  if (editId) {
    const idx = segundaItems.findIndex(s=>s.id===editId);
    if (idx>=0) { segundaItems[idx]={...segundaItems[idx],...item,id:editId}; }
    toast('Ítem actualizado','ok');
  } else {
    segundaItems.unshift(item);
    addAudit('2da selección agregada',sku,item.sn||'—','$'+precio);
    toast('Agregado a 2da selección','ok');
  }

  closeModals(); renderSegunda();
}

// ── Detalle ───────────────────────────────
function abrirDetalleSegunda(id) {
  const s = segundaItems.find(x=>x.id===id);
  if (!s) return;
  currentSegId = id;
  const prod = products.find(p=>p.sku===s.sku);
  document.getElementById('segd-title').textContent = s.nombre;
  document.getElementById('segd-sub').innerHTML = `<span class="mono" style="color:var(--orange)">${s.sku}</span>${s.sn?' · S/N: '+s.sn:''} · ${prod?.name||''}`;

  // Galería
  document.getElementById('segd-gallery').innerHTML = s.imagenes&&s.imagenes.length
    ? s.imagenes.map(src=>`<img class="seg-gallery-img" src="${src}" onclick="window.open('${src}','_blank')">`).join('')
    : '';

  // Info grid
  document.getElementById('segd-info').innerHTML = [
    {l:'Estado',         v:`<span class="badge seg-estado-${s.estado}">${SEG_ESTADO[s.estado]||s.estado}</span>`},
    {l:'Estado físico',  v:`<span class="badge ${FISICO_CLS[s.estadoFisico]}">${FISICO_LABEL[s.estadoFisico]}</span>`},
    {l:'Precio original',v:s.precioOriginal?'$'+s.precioOriginal.toLocaleString('es-CL'):'—'},
    {l:'Precio venta',   v:`<strong style="color:var(--orange);font-size:16px">$${(s.precioVenta||0).toLocaleString('es-CL')}</strong>`},
    {l:'Ingresó',        v:s.fechaIngreso},
    {l:'Usuario',        v:s.userIngreso},
    {l:'Origen',         v:s.devolucionOrigen||'Manual'},
    {l:'Notas',          v:s.notas||'—'},
  ].map(x=>`<div style="background:var(--bg);border-radius:8px;padding:10px">
    <div style="font-size:9px;font-weight:800;color:var(--text-m);text-transform:uppercase;margin-bottom:4px">${x.l}</div>
    <div style="font-size:12px;font-weight:700">${x.v}</div>
  </div>`).join('');

  // Descripción
  if (s.descripcion) {
    document.getElementById('segd-info').innerHTML += `<div style="background:var(--bg);border-radius:8px;padding:10px;grid-column:1/-1">
      <div style="font-size:9px;font-weight:800;color:var(--text-m);text-transform:uppercase;margin-bottom:4px">Descripción del estado</div>
      <div style="font-size:12px;color:var(--text-m)">${s.descripcion}</div>
    </div>`;
  }

  // Acciones
  document.getElementById('segd-acciones').innerHTML = s.estado==='disponible' ? `
    <button class="btn-orange" style="flex:1;justify-content:center" onclick="closeModals();abrirVentaSegunda('${s.id}')"><i class="fa-solid fa-shopping-cart"></i> Vender</button>
    <button class="btn-ghost" onclick="editarSegunda('${s.id}')"><i class="fa-solid fa-pen"></i> Editar</button>
    <button class="btn-ghost" style="color:var(--red);border-color:var(--red)" onclick="mermaSegunda('${s.id}')"><i class="fa-solid fa-trash"></i> Merma</button>
  ` : `<div style="font-size:12px;color:var(--text-m);padding:8px">Estado: <strong>${SEG_ESTADO[s.estado]}</strong>${s.fechaSalida?' · '+s.fechaSalida:''}</div>`;

  // Historial
  const hist = s.movimientos||[];
  document.getElementById('segd-historial').innerHTML = hist.length
    ? hist.map(m=>`<div class="traz-event">
        <div class="traz-dot traz-dot-${m.tipo==='ingreso'?'in':'out'}"></div>
        <span class="traz-event-time">${m.date}</span>
        <div><div class="traz-event-title">${m.tipo==='ingreso'?'📦 Ingreso':'🛍️ Venta'}</div>
        <div class="traz-event-detail">${m.tipo==='venta'?'Doc: '+(m.docSalida||'—')+' · $'+m.precio:'Ingreso a 2da selección'} · ${m.user}</div></div>
      </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-f)">Sin movimientos</p>';

  document.getElementById('modal-seg-detalle').classList.add('show');
}

function editarSegunda(id) {
  const s = segundaItems.find(x=>x.id===id);
  if (!s) return;
  closeModals();
  abrirModalNuevaSegunda();
  setTimeout(()=>{
    document.getElementById('seg-edit-id').value    = s.id;
    document.getElementById('seg-modal-title').textContent = 'Editar ítem';
    document.getElementById('seg-sku').value        = s.sku;
    onSegSkuChange();
    setTimeout(()=>{ document.getElementById('seg-sn').value = s.sn||''; },50);
    document.getElementById('seg-nombre').value     = s.nombre;
    document.getElementById('seg-descripcion').value= s.descripcion||'';
    document.getElementById('seg-estado-fisico').value = s.estadoFisico||'bueno';
    document.getElementById('seg-precio-orig').value  = s.precioOriginal||'';
    document.getElementById('seg-precio-venta').value = s.precioVenta||'';
    document.getElementById('seg-notas').value      = s.notas||'';
    segImgs = [...(s.imagenes||[])];
    renderSegImgPreview();
  },50);
}

// ── Vender ────────────────────────────────
function abrirVentaSegunda(id) {
  const s = segundaItems.find(x=>x.id===id);
  if (!s) return;
  currentSegId = id;
  document.getElementById('sv-item-id').value  = id;
  document.getElementById('sv-precio').value   = s.precioVenta||0;
  document.getElementById('sv-doc').value      = '';
  document.getElementById('sv-notes').value    = '';
  document.getElementById('seg-vender-info').innerHTML = `<i class="fa-solid fa-tags"></i> <strong>${s.nombre}</strong> · $${(s.precioVenta||0).toLocaleString('es-CL')}`;
  closeModals();
  document.getElementById('modal-seg-vender').classList.add('show');
}

function confirmarVentaSegunda() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const id     = document.getElementById('sv-item-id').value;
  const s      = segundaItems.find(x=>x.id===id);
  if (!s||s.estado!=='disponible') { toast('Item no disponible','error'); return; }
  const doc    = document.getElementById('sv-doc').value.trim();
  const precio = parseFloat(document.getElementById('sv-precio').value)||s.precioVenta;
  const notes  = document.getElementById('sv-notes').value.trim();
  const ds     = now();
  s.estado      = 'vendido';
  s.fechaSalida = ds;
  s.docSalida   = doc;
  s.userSalida  = CU.name;
  s.movimientos = s.movimientos||[];
  s.movimientos.push({tipo:'venta',itemId:id,sku:s.sku,sn:s.sn,docSalida:doc,precio,user:CU.name,date:ds,notes});
  if (s.sn) {
    const serial = seriales.find(x=>x.sn===s.sn);
    if (serial) { serial.estado='vendido'; serial.salidaDate=ds; serial.docSalida=doc; }
  }
  addAudit('2da selección venta',s.sku,s.sn||'—','Doc:'+(doc||'—')+' $'+precio);
  closeModals();
  renderSegunda();
  renderDashboard();
  toast('✅ Venta registrada — 2da selección','ok');
}

// ── Merma ─────────────────────────────────
function mermaSegunda(id) {
  const s = segundaItems.find(x=>x.id===id);
  if (!s) return;
  if (!confirm('¿Confirmar merma de "'+s.nombre+'"? Esta acción no se puede deshacer.')) return;
  s.estado = 'merma';
  s.fechaSalida = now();
  if (s.sn) {
    const serial = seriales.find(x=>x.sn===s.sn);
    if (serial) serial.estado = 'vendido';
  }
  addAudit('2da selección merma',s.sku,s.sn||'—','Dado de baja');
  closeModals();
  renderSegunda();
  toast('Ítem marcado como merma','');
}

// ── Exportar ──────────────────────────────
function exportSegunda() {
  if (!can('export')) { toast('Sin permisos','error'); return; }
  if (!segundaItems.length) { toast('Sin datos',''); return; }
  _xlsxDownload(segundaItems.map(s=>({
    ID:s.id, SKU:s.sku, 'S/N':s.sn||'', Nombre:s.nombre,
    'Estado físico':FISICO_LABEL[s.estadoFisico]||s.estadoFisico,
    'Precio original':s.precioOriginal||0, 'Precio venta':s.precioVenta||0,
    Estado:SEG_ESTADO[s.estado]||s.estado,
    Fotos:(s.imagenes||[]).length,
    'Origen devolución':s.devolucionOrigen||'',
    'Fecha ingreso':s.fechaIngreso,
    'Fecha salida':s.fechaSalida||'',
    Usuario:s.userIngreso, Notas:s.notas||'',
  })),'lubabycas_segunda_seleccion.xlsx');
}

// ── Integración devolución → 2da selección ─
function pasarDevolucionASegunda(devId) {
  const dev = devoluciones.find(d=>d.id===devId);
  if (!dev) return;
  closeModals();
  goView('segunda');
  setTimeout(()=>{
    abrirModalNuevaSegunda(devId, dev.sku, dev.sn||'');
    const prod = products.find(p=>p.sku===dev.sku);
    if (prod) {
      document.getElementById('seg-nombre').value      = prod.name+' (2da selección)';
      document.getElementById('seg-descripcion').value = dev.observacion||dev.motivo||'';
    }
    toast('Completa los datos para agregar a 2da selección','');
  },100);
}



// ══════════════════════════════════════════
//  MEJORAS DEVOLUCIONES — SKU alternativo + imágenes
// ══════════════════════════════════════════

let devImgs = [];

function toggleDevAlt() {
  const tiene = document.getElementById('dev-tiene-alt').checked;
  document.getElementById('dev-alt-wrap').style.display = tiene ? 'block' : 'none';
  if (tiene) {
    document.getElementById('dev-sku-alt').innerHTML =
      '<option value="">— SKU alternativo —</option>' +
      products.map(p => `<option value="${p.sku}">${p.sku} — ${p.name}</option>`).join('');
  }
}

function onDevImgChange(e) {
  const files = [...e.target.files];
  if (devImgs.length + files.length > 5) { toast('Máximo 5 fotos','error'); return; }
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => { devImgs.push(ev.target.result); renderDevImgPreview(); };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

function renderDevImgPreview() {
  document.getElementById('dev-img-preview').innerHTML = devImgs.map((src,i) => `
    <div class="img-preview-item">
      <img src="${src}">
      <button class="img-preview-del" onclick="removeDevImg(${i})"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('');
}

function removeDevImg(i) { devImgs.splice(i,1); renderDevImgPreview(); }

// Override initDevModal to reset images and alt SKU
const _origInitDevModal = initDevModal;
window.initDevModal = function() {
  _origInitDevModal();
  devImgs = [];
  document.getElementById('dev-img-preview').innerHTML = '';
  document.getElementById('dev-tiene-alt').checked = false;
  document.getElementById('dev-alt-wrap').style.display = 'none';
  document.getElementById('dev-sku-alt').innerHTML = '<option value="">— SKU alternativo —</option>';
};

// Override saveDevolucion to include images and alt SKU
const _origSaveDevolucion = saveDevolucion;
window.saveDevolucion = function() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sku     = document.getElementById('dev-sku').value;
  const sn      = document.getElementById('dev-sn').value;
  const motivo  = document.getElementById('dev-motivo').value;
  const doc     = document.getElementById('dev-doc').value.trim();
  const obs     = document.getElementById('dev-obs').value.trim();
  const tieneAlt= document.getElementById('dev-tiene-alt').checked;
  const skuAlt  = tieneAlt ? document.getElementById('dev-sku-alt').value : '';
  if (!sku || !motivo) { toast('SKU y motivo son obligatorios','error'); return; }

  const prod    = products.find(p => p.sku === sku);
  const dateStr = now();
  const id      = 'DEV' + Date.now();

  const newDev = {
    id, sku, sn, motivo, estado:'en_revision',
    observacion: obs, docOrigen: doc,
    skuAlternativo: skuAlt,
    imagenes: [...devImgs],
    fechaIngreso: dateStr, fechaEstado: null,
    userIngreso: CU.name, userEstado: '',
    productName: prod?.name || sku,
    historial: [{ estadoAnterior:null, estadoNuevo:'en_revision', observacion:'Devolución creada: '+motivo+(skuAlt?' | SKU alternativo: '+skuAlt:''), user:CU.name, date:dateStr, imagenes:[...devImgs] }]
  };

  devoluciones.unshift(newDev);

  if (sn) {
    const serial = seriales.find(s => s.sn === sn);
    if (serial) serial.estado = 'reservado';
  }

  addAudit('Devolución creada', sku, sn||'—', 'Motivo: '+motivo+(skuAlt?' | AltSKU: '+skuAlt:''));
  closeModals();
  renderDevoluciones();
  renderDashboard();
  renderProductos();
  devImgs = [];
  toast('Devolución registrada — en revisión','ok');
};

// Override abrirDetalleDev to show images and alt SKU
const _origAbrirDetalleDev = abrirDetalleDev;
window.abrirDetalleDev = function(id) {
  _origAbrirDetalleDev(id);
  const d = devoluciones.find(x => x.id === id);
  if (!d) return;

  // Agregar galería de imágenes si existen
  if (d.imagenes && d.imagenes.length) {
    const gallery = `<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:12px;scroll-snap-type:x mandatory">
      ${d.imagenes.map(src => `<img src="${src}" style="width:180px;height:130px;object-fit:cover;border-radius:var(--radius-lg);flex-shrink:0;scroll-snap-align:start;cursor:pointer;border:1.5px solid var(--border)" onclick="window.open('${src}','_blank')">`).join('')}
    </div>`;
    const body = document.querySelector('#modal-dev-detalle .modal-body');
    if (body && !body.querySelector('.dev-gallery')) {
      const div = document.createElement('div');
      div.className = 'dev-gallery';
      div.innerHTML = gallery;
      body.insertBefore(div, body.firstChild);
    }
  }

  // Mostrar SKU alternativo si existe
  if (d.skuAlternativo) {
    const infoEl = document.getElementById('dd-info');
    if (infoEl) {
      const prodAlt = products.find(p => p.sku === d.skuAlternativo);
      infoEl.innerHTML += `<div style="background:var(--amber-bg);border-radius:8px;padding:10px;border:1px solid #fcd34d">
        <div style="font-size:9px;font-weight:800;color:var(--amber);text-transform:uppercase;margin-bottom:4px">⚠️ SKU alternativo recibido</div>
        <div style="font-size:12px;font-weight:700"><span class="mono">${d.skuAlternativo}</span>${prodAlt?' — '+prodAlt.name:''}</div>
      </div>`;
    }
  }

  // Agregar campo de imágenes en el update
  const updateDiv = document.getElementById('dd-obs-update')?.parentNode;
  if (updateDiv && !document.getElementById('dd-img-section')) {
    const imgSection = document.createElement('div');
    imgSection.id = 'dd-img-section';
    imgSection.innerHTML = `
      <div style="margin-top:10px">
        <label class="form-lbl">Agregar fotos a esta etapa</label>
        <div class="img-upload-area" style="padding:12px" onclick="document.getElementById('dd-img-input').click()">
          <i class="fa-solid fa-camera" style="font-size:16px;color:var(--text-f)"></i>
          <div style="font-size:11px;color:var(--text-m);margin-top:4px">Foto de la reparación o estado actual</div>
        </div>
        <input type="file" id="dd-img-input" accept="image/*" multiple style="display:none" onchange="onDevUpdateImgChange(event)">
        <div id="dd-img-preview" class="img-preview-row"></div>
      </div>`;
    updateDiv.appendChild(imgSection);
  }
  devUpdateImgs = [];
  const prev = document.getElementById('dd-img-preview');
  if (prev) prev.innerHTML = '';
};

let devUpdateImgs = [];

function onDevUpdateImgChange(e) {
  const files = [...e.target.files];
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = ev => { devUpdateImgs.push(ev.target.result); renderDevUpdatePreview(); };
    reader.readAsDataURL(file);
  });
  e.target.value = '';
}

function renderDevUpdatePreview() {
  const el = document.getElementById('dd-img-preview');
  if (el) el.innerHTML = devUpdateImgs.map((src,i) => `
    <div class="img-preview-item">
      <img src="${src}">
      <button class="img-preview-del" onclick="devUpdateImgs.splice(${i},1);renderDevUpdatePreview()"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('');
}

// Override updateDevolucion to include images per step
const _origUpdateDevolucion = updateDevolucion;
window.updateDevolucion = function() {
  if (!can('edit')) { toast('Sin permisos','error'); return; }
  if (!currentDevId || !selectedDevEstado) { toast('Selecciona un estado','error'); return; }
  const d = devoluciones.find(x => x.id === currentDevId);
  if (!d) return;
  const obs     = document.getElementById('dd-obs-update').value.trim();
  const dateStr = now();
  const anterior= d.estado;

  d.historial = d.historial || [];
  d.historial.push({ estadoAnterior:anterior, estadoNuevo:selectedDevEstado, observacion:obs, user:CU.name, date:dateStr, imagenes:[...devUpdateImgs] });
  d.estado       = selectedDevEstado;
  d.observacion  = obs || d.observacion;
  d.fechaEstado  = dateStr;
  d.userEstado   = CU.name;
  if (devUpdateImgs.length) d.imagenes = [...(d.imagenes||[]), ...devUpdateImgs];

  if (d.sn) {
    const serial = seriales.find(s => s.sn === d.sn);
    if (serial) {
      if (selectedDevEstado === 'listo')   serial.estado = 'disponible';
      if (selectedDevEstado === 'merma')   serial.estado = 'vendido';
      if (selectedDevEstado === 'segunda') serial.estado = 'reservado';
    }
  }

  addAudit('Devolución → '+selectedDevEstado, d.sku, d.sn||'—', obs||'');

  if (selectedDevEstado === 'segunda') {
    closeModals();
    renderDevoluciones(); renderDashboard(); renderProductos();
    selectedDevEstado = null; devUpdateImgs = [];
    toast('Pasa a 2da selección — completa los datos','ok');
    setTimeout(() => pasarDevolucionASegunda(d.id), 300);
    return;
  }

  closeModals();
  renderDevoluciones(); renderDashboard(); renderProductos();
  selectedDevEstado = null; devUpdateImgs = [];
  toast('Estado actualizado','ok');
};

// ══════════════════════════════════════════
//  PRECIO CALCULADORA — 2DA SELECCIÓN
// ══════════════════════════════════════════

function calcPrecioFinal() {
  const base  = parseFloat(document.getElementById('sv-precio-base').value) || 0;
  const desc  = parseFloat(document.getElementById('sv-descuento').value)   || 0;
  const final = Math.round(base * (1 - desc / 100));
  document.getElementById('sv-precio').value = final;
  updateAhorro(base, final);
}

function calcDescuento() {
  const base  = parseFloat(document.getElementById('sv-precio-base').value) || 0;
  const final = parseFloat(document.getElementById('sv-precio').value)       || 0;
  if (base > 0) {
    const desc = Math.round((1 - final / base) * 100);
    document.getElementById('sv-descuento').value = Math.max(0, desc);
  }
  updateAhorro(base, final);
}

function updateAhorro(base, final) {
  const el = document.getElementById('sv-ahorro');
  if (!el) return;
  const ahorro = base - final;
  el.innerHTML = ahorro > 0
    ? `<i class="fa-solid fa-tag"></i> Descuento: $${ahorro.toLocaleString('es-CL')} (${Math.round(ahorro/base*100)}% off)`
    : '';
}

// Override abrirVentaSegunda to init calculator
const _origAbrirVenta = abrirVentaSegunda;
window.abrirVentaSegunda = function(id) {
  const s = segundaItems.find(x => x.id === id);
  if (!s) return;
  currentSegId = id;
  document.getElementById('sv-item-id').value    = id;
  document.getElementById('sv-precio-base').value= s.precioVenta || 0;
  document.getElementById('sv-precio').value     = s.precioVenta || 0;
  document.getElementById('sv-descuento').value  = 0;
  document.getElementById('sv-doc').value        = '';
  document.getElementById('sv-notes').value      = '';
  document.getElementById('sv-ahorro').innerHTML = '';
  document.getElementById('seg-vender-info').innerHTML =
    `<i class="fa-solid fa-tags"></i> <strong>${s.nombre}</strong> · SKU: ${s.sku}${s.sn?' · S/N: '+s.sn:''}`;
  closeModals();
  document.getElementById('modal-seg-vender').classList.add('show');
};

// ══════════════════════════════════════════
//  ANALÍTICA
// ══════════════════════════════════════════

let anTab = 'devoluciones';

// Tracking de sesión para usuarios activos
const sessionStart = now();
let currentSection = 'dashboard';

// goView consolidado al final

function analiticaTab(tab, el) {
  anTab = tab;
  document.querySelectorAll('#view-analitica .view-tab').forEach(t => t.classList.remove('active'));
  el?.classList.add('active');
  ['devoluciones','segunda','usuarios'].forEach(t => {
    document.getElementById('aTab-'+t).style.display = t === tab ? 'block' : 'none';
  });
  renderAnalitica();
}

function renderAnalitica() {
  if (anTab === 'devoluciones') renderAnDevoluciones();
  if (anTab === 'segunda')      renderAnSegunda();
  if (anTab === 'usuarios')     renderAnUsuarios();
}

// ── Analítica Devoluciones ─────────────────
function renderAnDevoluciones() {
  const devs   = devoluciones;
  const total  = devs.length;
  const abiertas = devs.filter(d => d.estado==='en_revision'||d.estado==='reparado').length;
  const cerradas = devs.filter(d => ['listo','merma','segunda'].includes(d.estado)).length;
  const merma  = devs.filter(d => d.estado==='merma').length;
  const tasa   = products.length && total ? ((total/Math.max(seriales.filter(s=>s.estado==='vendido').length,1))*100).toFixed(1) : 0;

  document.getElementById('an-dev-kpis').innerHTML = [
    {icon:'fa-rotate-left',   cls:'o', val:total,    lbl:'Total devoluciones'},
    {icon:'fa-hourglass-half',cls:'b', val:abiertas, lbl:'En proceso'},
    {icon:'fa-circle-check',  cls:'g', val:cerradas, lbl:'Cerradas'},
    {icon:'fa-trash',         cls:'r', val:merma,    lbl:'Merma'},
    {icon:'fa-percent',       cls:'a', val:tasa+'%', lbl:'Tasa devolución'},
  ].map(k=>`<div class="kpi-card">
    <div class="kpi-icon ${k.cls}"><i class="fa-solid ${k.icon}"></i></div>
    <div class="kpi-val" style="font-size:${typeof k.val==='string'?'18px':'26px'}">${k.val}</div>
    <div class="kpi-lbl">${k.lbl}</div>
  </div>`).join('');

  // Por estado
  const ESTADOS_DEV = {en_revision:'🔍 En revisión',reparado:'🔧 Reparado',listo:'✅ Listo',merma:'🗑️ Merma',segunda:'🏷️ 2da Selección'};
  const porEstado   = Object.entries(ESTADOS_DEV).map(([k,l]) => ({label:l, val:devs.filter(d=>d.estado===k).length})).filter(x=>x.val>0);
  const maxE = Math.max(...porEstado.map(x=>x.val),1);
  document.getElementById('an-dev-estados').innerHTML = porEstado.length
    ? porEstado.map(x=>`<div class="an-bar-row">
        <div class="an-bar-label">${x.label}</div>
        <div class="an-bar-track"><div class="an-bar-fill" style="width:${(x.val/maxE*100).toFixed(0)}%"></div></div>
        <div class="an-bar-val">${x.val}</div>
      </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-f);text-align:center;padding:12px">Sin datos</p>';

  // Motivos
  const motivos = {};
  devs.forEach(d => { motivos[d.motivo] = (motivos[d.motivo]||0)+1; });
  const motArr  = Object.entries(motivos).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxM    = Math.max(...motArr.map(x=>x[1]),1);
  document.getElementById('an-dev-motivos').innerHTML = motArr.length
    ? motArr.map(([m,v])=>`<div class="an-bar-row">
        <div class="an-bar-label" style="font-size:11px">${m}</div>
        <div class="an-bar-track"><div class="an-bar-fill" style="width:${(v/maxM*100).toFixed(0)}%;background:var(--blue)"></div></div>
        <div class="an-bar-val">${v}</div>
      </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-f);text-align:center;padding:12px">Sin datos</p>';

  // Destinos
  const listo   = devs.filter(d=>d.estado==='listo').length;
  const msegunda= devs.filter(d=>d.estado==='segunda').length;
  const mmerma  = devs.filter(d=>d.estado==='merma').length;
  document.getElementById('an-dev-destinos').innerHTML = [
    {label:'Vuelve al stock', val:listo,    bg:'var(--green-bg)',    color:'var(--green)'},
    {label:'2da Selección',   val:msegunda, bg:'#f3e8ff',            color:'#7c3aed'},
    {label:'Merma / baja',    val:mmerma,   bg:'var(--red-bg)',      color:'var(--red)'},
    {label:'En proceso',      val:abiertas, bg:'var(--amber-bg)',    color:'var(--amber)'},
  ].map(x=>`<div class="destino-pill" style="background:${x.bg};color:${x.color}">
    <div class="destino-pill-val">${x.val}</div>
    <div class="destino-pill-lbl">${x.label}</div>
  </div>`).join('');

  // SKUs con más devoluciones
  const skuCount = {};
  devs.forEach(d => { skuCount[d.sku] = (skuCount[d.sku]||0)+1; });
  const skuArr = Object.entries(skuCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxSK  = Math.max(...skuArr.map(x=>x[1]),1);
  document.getElementById('an-dev-skus').innerHTML = skuArr.length
    ? skuArr.map(([sku,v])=>{
        const p = products.find(x=>x.sku===sku);
        return `<div class="an-bar-row">
          <div class="an-bar-label"><span class="mono" style="color:var(--orange)">${sku}</span><br><span style="font-size:10px;color:var(--text-f)">${p?.name||''}</span></div>
          <div class="an-bar-track"><div class="an-bar-fill" style="width:${(v/maxSK*100).toFixed(0)}%;background:var(--red)"></div></div>
          <div class="an-bar-val">${v}</div>
        </div>`;
      }).join('')
    : '<p style="font-size:12px;color:var(--text-f);text-align:center;padding:12px">Sin datos</p>';
}

// ── Analítica Segunda Selección ────────────
function renderAnSegunda() {
  const items   = segundaItems;
  const total   = items.length;
  const disp    = items.filter(s=>s.estado==='disponible').length;
  const vend    = items.filter(s=>s.estado==='vendido').length;
  const mmerma  = items.filter(s=>s.estado==='merma').length;
  const valorStock   = items.filter(s=>s.estado==='disponible').reduce((a,s)=>a+(s.precioVenta||0),0);
  const valorOrig    = items.filter(s=>s.estado==='disponible').reduce((a,s)=>a+(s.precioOriginal||0),0);
  const recuperacion = valorOrig > 0 ? ((valorStock/valorOrig)*100).toFixed(0) : 0;

  document.getElementById('an-seg-kpis').innerHTML = [
    {icon:'fa-tags',        cls:'o', val:total,                                  lbl:'Total ítems'},
    {icon:'fa-circle-check',cls:'g', val:disp,                                   lbl:'Disponibles'},
    {icon:'fa-shopping-cart',cls:'b',val:vend,                                   lbl:'Vendidos'},
    {icon:'fa-dollar-sign', cls:'a', val:'$'+valorStock.toLocaleString('es-CL'), lbl:'Valor stock'},
    {icon:'fa-arrow-trend-up',cls:'g',val:recuperacion+'%',                      lbl:'% recuperación'},
  ].map(k=>`<div class="kpi-card">
    <div class="kpi-icon ${k.cls}"><i class="fa-solid ${k.icon}"></i></div>
    <div class="kpi-val" style="font-size:${typeof k.val==='string'&&k.val.length>4?'16px':'26px'}">${k.val}</div>
    <div class="kpi-lbl">${k.lbl}</div>
  </div>`).join('');

  // Por estado físico
  const FISICO = {bueno:'✅ Bueno',regular:'⚠️ Regular','dañado':'❌ Dañado'};
  const pFisico = Object.entries(FISICO).map(([k,l])=>({label:l,val:items.filter(s=>s.estadoFisico===k&&s.estado==='disponible').length}));
  const maxF = Math.max(...pFisico.map(x=>x.val),1);
  document.getElementById('an-seg-fisico').innerHTML = pFisico.filter(x=>x.val>0).length
    ? pFisico.map(x=>`<div class="an-bar-row">
        <div class="an-bar-label">${x.label}</div>
        <div class="an-bar-track"><div class="an-bar-fill" style="width:${(x.val/maxF*100).toFixed(0)}%;background:var(--green)"></div></div>
        <div class="an-bar-val">${x.val}</div>
      </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-f);text-align:center;padding:12px">Sin ítems disponibles</p>';

  // Recuperación de valor
  const valorRows = [
    {l:'Precio original total',  v:'$'+valorOrig.toLocaleString('es-CL'),            c:'var(--text-m)'},
    {l:'Precio de venta total',  v:'$'+valorStock.toLocaleString('es-CL'),           c:'var(--orange)'},
    {l:'Diferencia (descuento)', v:'$'+(valorOrig-valorStock).toLocaleString('es-CL'),c:'var(--red)'},
    {l:'% recuperación',         v:recuperacion+'%',                                  c:'var(--green)'},
  ];
  document.getElementById('an-seg-valor').innerHTML =
    '<div style="display:flex;flex-direction:column;gap:10px;padding:8px">' +
    valorRows.map(x =>
      '<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid var(--border)">' +
      '<span style="color:var(--text-m);font-weight:700">'+x.l+'</span>' +
      '<span style="font-weight:800;color:'+x.c+'">'+x.v+'</span>' +
      '</div>'
    ).join('') +
    '</div>';

  // Más antiguos disponibles
  const antiguos = items.filter(s=>s.estado==='disponible').slice(-5).reverse();
  document.getElementById('an-seg-antiguos').innerHTML = antiguos.length
    ? antiguos.map(s=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span class="mono" style="color:var(--orange);min-width:80px">${s.sku}</span>
        <span style="flex:1;font-weight:700">${s.nombre}</span>
        <span class="badge ${FISICO_CLS[s.estadoFisico]}">${FISICO_LABEL[s.estadoFisico]}</span>
        <span style="font-weight:800;color:var(--orange)">$${(s.precioVenta||0).toLocaleString('es-CL')}</span>
        <span style="color:var(--text-f);font-size:10px">${s.fechaIngreso}</span>
      </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-f);text-align:center;padding:12px">Sin ítems disponibles</p>';

  // Ventas recientes
  const vendidos = items.filter(s=>s.estado==='vendido');
  document.getElementById('an-seg-ventas').innerHTML = vendidos.length
    ? vendidos.slice(0,8).map(s=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px">
        <span class="mono" style="color:var(--orange);min-width:80px">${s.sku}</span>
        <span style="flex:1;font-weight:700">${s.nombre}</span>
        <span style="font-weight:800;color:var(--green)">$${(s.precioVenta||0).toLocaleString('es-CL')}</span>
        <span class="mono" style="font-size:10px">${s.docSalida||'—'}</span>
        <span style="color:var(--text-f);font-size:10px">${s.fechaSalida||''}</span>
      </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-f);text-align:center;padding:12px">Sin ventas registradas</p>';
}

// ── Analítica Usuarios Activos ─────────────
// Registro de actividad por usuario
const activityLog = {};

function trackActivity(view) {
  if (!CU) return;
  const key = CU.username;
  activityLog[key] = {
    user: CU, section: view, lastActivity: now(), sessionStart: activityLog[key]?.sessionStart || sessionStart
  };
}

function renderAnUsuarios() {
  // Registrar actividad del usuario actual
  trackActivity(currentSection);

  const ROL_COLOR = {admin:'#F47B20',supervisor:'#7c3aed',bodeguero:'#2563eb',lectura:'#6b7280'};
  const SECTION_LABEL = {
    dashboard:'Dashboard',productos:'Productos',escaner:'Escáner',
    ingresos:'Ingresos',salidas:'Salidas',trazabilidad:'Trazabilidad',
    devoluciones:'Devoluciones',segunda:'2da Selección',
    analitica:'Analítica',auditoria:'Auditoría',usuarios:'Usuarios'
  };

  const activos = Object.values(activityLog);
  const totalUsers = usuarios.length;

  document.getElementById('an-usr-kpis').innerHTML = [
    {icon:'fa-users',       cls:'o', val:totalUsers,  lbl:'Usuarios totales'},
    {icon:'fa-circle-dot',  cls:'g', val:activos.length, lbl:'Sesiones activas'},
    {icon:'fa-clock',       cls:'b', val:activos.length?activos[0].sessionStart:'—', lbl:'Primera sesión hoy'},
  ].map(k=>`<div class="kpi-card">
    <div class="kpi-icon ${k.cls}"><i class="fa-solid ${k.icon}"></i></div>
    <div class="kpi-val" style="font-size:${typeof k.val==='string'&&k.val.length>4?'13px':'26px'};line-height:1.2">${k.val}</div>
    <div class="kpi-lbl">${k.lbl}</div>
  </div>`).join('');

  // Cards usuarios activos
  const cardsEl = document.getElementById('an-usr-cards');
  if (activos.length) {
    cardsEl.innerHTML = activos.map(a => `
      <div class="usr-active-card">
        <div class="usr-active-avatar" style="background:${ROL_COLOR[a.user.role]||'#6b7280'}">${a.user.name[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="usr-active-name">${a.user.name} <span class="usr-online-dot"></span></div>
          <div class="usr-active-role">${ROLE_LABELS[a.user.role]||a.user.role}</div>
          <div class="usr-active-section"><i class="fa-solid fa-location-dot" style="color:var(--orange)"></i> ${SECTION_LABEL[a.section]||a.section}</div>
          <div class="usr-active-time"><i class="fa-regular fa-clock"></i> Última actividad: ${a.lastActivity}</div>
          <div class="usr-active-time"><i class="fa-solid fa-right-to-bracket"></i> Sesión desde: ${a.sessionStart}</div>
        </div>
      </div>`).join('');
  } else {
    cardsEl.innerHTML = '<p style="font-size:12px;color:var(--text-f);padding:12px">Sin sesiones activas registradas</p>';
  }

  // Log de auditoría por usuario
  const byUser = {};
  audit.forEach(e => { if (!byUser[e.user]) byUser[e.user]=[]; byUser[e.user].push(e); });
  const userSummary = Object.entries(byUser).map(([u,evs])=>({user:u, count:evs.length, last:evs[0]})).sort((a,b)=>b.count-a.count);
  const maxAct = Math.max(...userSummary.map(x=>x.count),1);

  document.getElementById('an-usr-actividad').innerHTML = userSummary.length
    ? userSummary.map(x=>`<div class="an-bar-row">
        <div class="an-bar-label">
          <span style="font-weight:800">${x.user}</span><br>
          <span style="font-size:10px;color:var(--text-f)">${x.last?.action||'—'} · ${x.last?.time||''}</span>
        </div>
        <div class="an-bar-track"><div class="an-bar-fill" style="width:${(x.count/maxAct*100).toFixed(0)}%;background:var(--blue)"></div></div>
        <div class="an-bar-val">${x.count}<br><span style="font-size:9px;color:var(--text-f)">acciones</span></div>
      </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-f);text-align:center;padding:12px">Sin actividad registrada</p>';
}

// goView consolidado al final

// ── CONSOLIDATED goView (single override) ────────────────
const _baseGoView = goView;
window.goView = function(v) {
  // Core navigation
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .bn-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('view-'+v)?.classList.add('active');
  document.querySelectorAll('[data-view="'+v+'"]').forEach(el => el.classList.add('active'));

  // Per-view render
  const renders = {
    dashboard:    renderDashboard,
    productos:    renderProductos,
    ingresos:     renderIngresos,
    salidas:      () => { renderSalidas(); renderSalidasKpis(); },
    auditoria:    renderAuditoria,
    usuarios:     renderUsuarios,
    escaner:      initScanView,
    trazabilidad: () => {},
    devoluciones: () => { renderDevoluciones(); renderDevKpis(); },
    segunda:      () => { loadSegundaDemo(); renderSegunda(); },
    analitica:    renderAnalitica,
  };
  renders[v]?.();

  // Track active section
  currentSection = v;
  trackActivity(v);
};

// ══════════════════════════════════════════
//  SESIONES ACTIVAS — Heartbeat real
// ══════════════════════════════════════════

let heartbeatInterval = null;

async function pingSession(seccion) {
  if (!CU) return;
  try {
    await fetch(API_BASE + '/api/session/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username:CU.username, name:CU.name, role:CU.role, seccion: seccion || currentSection })
    });
  } catch(e) { /* sin servidor, modo offline */ }
}

function startHeartbeat() {
  pingSession(currentSection);
  heartbeatInterval = setInterval(() => pingSession(currentSection), 30000);
  window.addEventListener('beforeunload', () => {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API_BASE + '/api/session/' + CU.username, '');
    }
  });
}

async function fetchActiveUsers() {
  try {
    const r = await fetch(API_BASE + '/api/session/activos');
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

// ── Override renderAnUsuarios para usar datos reales ──
window.renderAnUsuarios = async function() {
  const ROL_COLOR = {admin:'#F47B20',supervisor:'#7c3aed',bodeguero:'#2563eb',lectura:'#6b7280'};
  const SECTION_LABEL = {
    dashboard:'Dashboard',productos:'Productos',escaner:'Escáner',
    ingresos:'Ingresos',salidas:'Salidas',trazabilidad:'Trazabilidad',
    devoluciones:'Devoluciones',segunda:'2da Selección',
    analitica:'Analítica',auditoria:'Auditoría',usuarios:'Usuarios'
  };

  // Actualizar ping antes de mostrar
  await pingSession(currentSection);

  // Intentar datos reales del servidor
  let activos = await fetchActiveUsers();

  // Fallback: solo mostrar usuario actual si no hay servidor
  if (!activos) {
    activos = [{
      username: CU.username, name: CU.name, role: CU.role,
      seccion: currentSection, lastPing: now(), sessionStart: now(), ip: 'local'
    }];
  }

  document.getElementById('an-usr-kpis').innerHTML = [
    {icon:'fa-users',        cls:'o', val:usuarios.length,  lbl:'Usuarios totales'},
    {icon:'fa-circle-dot',   cls:'g', val:activos.length,   lbl:'En línea ahora'},
    {icon:'fa-wifi',         cls:'b', val:'cada 30s',       lbl:'Actualización'},
  ].map(k=>`<div class="kpi-card">
    <div class="kpi-icon ${k.cls}"><i class="fa-solid ${k.icon}"></i></div>
    <div class="kpi-val" style="font-size:${typeof k.val==='string'?'14px':'26px'};line-height:1.2">${k.val}</div>
    <div class="kpi-lbl">${k.lbl}</div>
  </div>`).join('');

  const cardsEl = document.getElementById('an-usr-cards');
  cardsEl.innerHTML = activos.length ? activos.map(a => `
    <div class="usr-active-card">
      <div class="usr-active-avatar" style="background:${ROL_COLOR[a.role]||'#6b7280'}">${(a.name||a.username)[0].toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div class="usr-active-name">
          ${a.name||a.username}
          <span class="usr-online-dot"></span>
        </div>
        <div class="usr-active-role">${ROLE_LABELS[a.role]||a.role}</div>
        <div class="usr-active-section">
          <i class="fa-solid fa-location-dot" style="color:var(--orange)"></i>
          ${SECTION_LABEL[a.seccion]||a.seccion||'Dashboard'}
        </div>
        <div class="usr-active-time">
          <i class="fa-regular fa-clock"></i> Último ping: ${a.lastPing}
        </div>
        <div class="usr-active-time">
          <i class="fa-solid fa-right-to-bracket"></i> Sesión desde: ${a.sessionStart}
        </div>
        ${a.ip&&a.ip!=='local'?`<div class="usr-active-time"><i class="fa-solid fa-network-wired"></i> IP: ${a.ip}</div>`:''}
      </div>
    </div>`).join('')
  : '<div style="text-align:center;color:var(--text-f);padding:2rem"><i class="fa-solid fa-users" style="font-size:28px;display:block;margin-bottom:8px"></i>Sin sesiones activas</div>';

  // Actividad por usuario desde auditoría
  const byUser = {};
  audit.forEach(e => { if (!byUser[e.user]) byUser[e.user]=[]; byUser[e.user].push(e); });
  const userSummary = Object.entries(byUser).map(([u,evs])=>({user:u,count:evs.length,last:evs[0]})).sort((a,b)=>b.count-a.count);
  const maxAct = Math.max(...userSummary.map(x=>x.count),1);
  document.getElementById('an-usr-actividad').innerHTML = userSummary.length
    ? userSummary.map(x=>`<div class="an-bar-row">
        <div class="an-bar-label">
          <span style="font-weight:800">${x.user}</span><br>
          <span style="font-size:10px;color:var(--text-f)">${x.last?.action||'—'} · ${x.last?.time||''}</span>
        </div>
        <div class="an-bar-track"><div class="an-bar-fill" style="width:${(x.count/maxAct*100).toFixed(0)}%;background:var(--blue)"></div></div>
        <div class="an-bar-val">${x.count}<br><span style="font-size:9px;color:var(--text-f)">acciones</span></div>
      </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-f);text-align:center;padding:12px">Sin actividad registrada</p>';

  // Auto-refresh cada 30s mientras está en esta tab
  clearTimeout(window._usrRefreshT);
  window._usrRefreshT = setTimeout(() => { if (anTab==='usuarios') renderAnUsuarios(); }, 30000);
};

// ── Iniciar heartbeat al cargar ──
const _origDOMInit = document.addEventListener;
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(startHeartbeat, 2000);
});

// ══════════════════════════════════════════
//  MENÚ "MÁS" — navegación móvil
// ══════════════════════════════════════════

const MAS_VIEWS = ['ingresos','devoluciones','segunda','analitica','auditoria','usuarios'];

function toggleMasMenu() {
  const menu = document.getElementById('mas-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  if (isOpen) {
    closeMasMenu();
  } else {
    // Marcar sección activa en el menú
    document.querySelectorAll('.mas-menu-btn').forEach(btn => btn.classList.remove('active-section'));
    const activeView = document.querySelector('.view.active')?.id?.replace('view-','');
    if (activeView) {
      const btn = document.querySelector(`.mas-menu-btn[onclick*="${activeView}"]`);
      btn?.classList.add('active-section');
    }
    menu.style.display = 'flex';
    // Ocultar btn usuarios si no tiene permiso
    const usrBtn = document.getElementById('mas-btn-usuarios');
    if (usrBtn) usrBtn.style.display = can('users') ? 'flex' : 'none';
  }
}

function closeMasMenu() {
  const menu = document.getElementById('mas-menu');
  if (menu) menu.style.display = 'none';
}

function goViewMas(v) {
  closeMasMenu();
  goView(v);
  // Marcar botón "Más" como activo cuando estamos en esas secciones
  document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('bn-mas-btn')?.classList.add('active');
}

// Override consolidado para marcar correctamente el botón Más
const _goViewFinal = window.goView;
window.goView = function(v) {
  _goViewFinal(v);
  // Corregir estado del botón Más en móvil
  const masBtn = document.getElementById('bn-mas-btn');
  if (masBtn) {
    if (MAS_VIEWS.includes(v)) {
      document.querySelectorAll('.bn-btn').forEach(b => b.classList.remove('active'));
      masBtn.classList.add('active');
    } else {
      masBtn.classList.remove('active');
    }
  }
  // Cerrar menú si estaba abierto
  closeMasMenu();
};

// Cerrar con tecla Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMasMenu();
});

// ══════════════════════════════════════════
//  UBICACIÓN ESTRUCTURADA EN BODEGA
// ══════════════════════════════════════════

// Generar código de ubicación automático
function genUbCodigo(bodega, piso, pasillo, rack, nivel) {
  const parts = [];
  if (bodega)  parts.push(bodega);
  if (piso)    parts.push(piso);
  if (pasillo) parts.push('PS' + pasillo.toUpperCase());
  if (rack)    parts.push('R'  + rack.toUpperCase());
  if (nivel)   parts.push(nivel);
  return parts.length ? parts.join('-') : '';
}

// Actualizar preview del código en tiempo real
function updateUbCodigo() {
  const bodega  = document.getElementById('m-bodega')?.value  || '';
  const piso    = document.getElementById('m-piso')?.value    || '';
  const pasillo = document.getElementById('m-pasillo')?.value || '';
  const rack    = document.getElementById('m-rack')?.value    || '';
  const nivel   = document.getElementById('m-nivel')?.value   || '';
  const codigo  = genUbCodigo(bodega, piso, pasillo, rack, nivel);
  const preview = document.getElementById('ub-codigo-preview');
  if (preview) {
    preview.textContent = codigo || '— Sin ubicación —';
    preview.style.color = codigo ? 'var(--orange)' : 'var(--text-f)';
  }
}

// Render badge de ubicación para tablas y cards
function renderUbBadge(p) {
  if (!p.ubCodigo && !p.ubicacion) return '<span class="faint">—</span>';
  const codigo = p.ubCodigo || '';
  const notas  = p.ubicacion || '';
  return `<div>
    ${codigo ? `<span class="ub-codigo">${codigo}</span>` : ''}
    ${notas  ? `<div class="ub-detalle">${notas}</div>` : ''}
  </div>`;
}

// Render ubicación detallada para detalle SKU
function renderUbDetalle(p) {
  if (!p.bodega && !p.piso && !p.pasillo && !p.rack && !p.nivel && !p.ubicacion)
    return '<span style="color:var(--text-f);font-size:12px">Sin ubicación asignada</span>';

  const UB_LABELS = {
    bodega: 'Bodega', piso: 'Piso', pasillo: 'Pasillo', rack: 'Rack', nivel: 'Nivel'
  };
  const UB_VALS = {
    B1:'Bodega 1',B2:'Bodega 2',B3:'Bodega 3',B4:'Bodega 4',
    P1:'Piso 1',P2:'Piso 2',
    N1:'Nivel 1',N2:'Nivel 2',N3:'Nivel 3',N4:'Nivel 4',N5:'Nivel 5',
  };

  const items = ['bodega','piso','pasillo','rack','nivel'].filter(k => p[k]);
  return `
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
      ${p.ubCodigo ? `<span class="ub-codigo" style="font-size:13px">${p.ubCodigo}</span>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px;margin-top:8px">
      ${items.map(k => `
        <div style="background:var(--bg);border-radius:8px;padding:8px 10px">
          <div style="font-size:9px;font-weight:800;color:var(--text-m);text-transform:uppercase;margin-bottom:2px">${UB_LABELS[k]}</div>
          <div style="font-size:13px;font-weight:800">${UB_VALS[p[k]] || p[k]}</div>
        </div>`).join('')}
      ${p.ubicacion ? `
        <div style="background:var(--bg);border-radius:8px;padding:8px 10px">
          <div style="font-size:9px;font-weight:800;color:var(--text-m);text-transform:uppercase;margin-bottom:2px">Notas</div>
          <div style="font-size:12px;font-weight:700;color:var(--text-m)">${p.ubicacion}</div>
        </div>` : ''}
    </div>`;
}

// Override saveProducto to include location fields
const _origSaveProducto = saveProducto;
window.saveProducto = function() {
  if (!can('write')) { toast('Sin permisos','error'); return; }
  const sku  = document.getElementById('m-sku').value.trim().toUpperCase();
  const name = document.getElementById('m-name').value.trim();
  if (!sku || !name) { toast('SKU y nombre obligatorios','error'); return; }
  if (products.find(p => p.sku === sku)) { toast('SKU ya existe','error'); return; }

  const bodega  = document.getElementById('m-bodega')?.value  || '';
  const piso    = document.getElementById('m-piso')?.value    || '';
  const pasillo = document.getElementById('m-pasillo')?.value || '';
  const rack    = document.getElementById('m-rack')?.value    || '';
  const nivel   = document.getElementById('m-nivel')?.value   || '';

  const p = {
    id:        genId(),
    sku, name,
    brand:     document.getElementById('m-brand').value.trim(),
    cat:       document.getElementById('m-cat').value,
    barcode1:  document.getElementById('m-barcode1').value.trim(),
    barcode2:  document.getElementById('m-barcode2').value.trim() || genBodCode(),
    stockMin:  parseInt(document.getElementById('m-stock-min').value) || 0,
    ubicacion: document.getElementById('m-ubicacion').value.trim(),
    bodega, piso, pasillo, rack, nivel,
    ubCodigo:  genUbCodigo(bodega, piso, pasillo, rack, nivel),
    notes:     document.getElementById('m-notes')?.value.trim() || '',
    createdBy: CU.name,
    createdAt: now(),
  };

  products.push(p);
  addAudit('SKU creado', sku, '—', p.name + (p.ubCodigo ? ' · ' + p.ubCodigo : ''));
  closeModals();
  renderProductos();
  renderDashboard();
  toast('SKU ' + sku + ' creado' + (p.ubCodigo ? ' — ' + p.ubCodigo : ''), 'ok');
};

// Override renderProductos to show location
const _origRenderProductos = renderProductos;
window.renderProductos = function() {
  const btnProd   = document.getElementById('btn-nuevo-prod');
  if (btnProd)    btnProd.style.display    = can('write')  ? '' : 'none';
  const btnExpProd= document.getElementById('btn-export-prod');
  if (btnExpProd) btnExpProd.style.display = can('export') ? '' : 'none';

  const q = (document.getElementById('prod-search')?.value || '').toLowerCase();
  let rows = products.filter(p => {
    if (q && ![(p.sku||''),(p.name||''),(p.brand||''),(p.barcode1||''),(p.barcode2||''),(p.ubCodigo||''),(p.bodega||''),(p.rack||'')].some(v => v.toLowerCase().includes(q))) return false;
    const st = stockOf(p.sku);
    if (prodFilter === 'low')  return st <= (p.stockMin||0) && p.stockMin > 0;
    if (prodFilter === 'zero') return st === 0;
    return true;
  });

  // Desktop table
  const tb = document.getElementById('tbody-productos');
  if (tb) {
    tb.innerHTML = rows.length ? rows.map(p => {
      const st    = stockOf(p.sku);
      const isLow = p.stockMin > 0 && st <= p.stockMin;
      const snCount = seriales.filter(s => s.sku === p.sku).length;
      return `<tr>
        <td><span class="mono" style="color:var(--orange)">${p.sku}</span></td>
        <td style="font-weight:700">${p.name}</td>
        <td>${p.brand || '<span class="faint">—</span>'}</td>
        <td>${p.cat   || '<span class="faint">—</span>'}</td>
        <td><span class="mono">${p.barcode1 || '<span class="faint">—</span>'}</span></td>
        <td><span class="mono">${p.barcode2 || '<span class="faint">—</span>'}</span></td>
        <td>${renderUbBadge(p)}</td>
        <td><strong style="color:${isLow?'var(--red)':st===0?'var(--text-f)':'var(--green)'}">${st}</strong></td>
        <td><span class="badge b-info">${snCount}</span></td>
        <td>${p.stockMin > 0 ? `<span style="color:${isLow?'var(--red)':'var(--text-m)'}">${p.stockMin}</span>` : '—'}</td>
        <td style="display:flex;gap:4px">
          <button class="btn-tbl" onclick="goSkuDetalle('${p.sku}')"><i class="fa-solid fa-eye"></i> Ver</button>
          ${can('write') ? `<button class="btn-tbl" onclick="openIngresoModal('${p.sku}')"><i class="fa-solid fa-plus"></i></button>` : ''}
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="11" style="text-align:center;color:var(--text-f);padding:2rem">${products.length ? 'Sin resultados' : 'Sin productos — crea el primero'}</td></tr>`;
  }

  // Mobile cards
  const cards = document.getElementById('prod-cards');
  if (cards) {
    cards.innerHTML = rows.length ? rows.map(p => {
      const st    = stockOf(p.sku);
      const isLow = p.stockMin > 0 && st <= p.stockMin;
      const color = isLow ? 'var(--red)' : st === 0 ? 'var(--text-f)' : 'var(--green)';
      return `<div class="prod-card">
        <div class="prod-card-top">
          <div style="flex:1">
            <div class="prod-card-sku">${p.sku}</div>
            <div class="prod-card-name">${p.name}</div>
            ${p.ubCodigo ? `<div style="margin-top:4px"><span class="ub-codigo">${p.ubCodigo}</span></div>` : ''}
          </div>
          <div style="text-align:right">
            <div class="prod-card-stock" style="color:${color}">${st}</div>
            <div style="font-size:10px;color:var(--text-f)">uds</div>
          </div>
        </div>
        <div class="prod-card-meta">
          ${p.brand  ? `<span class="badge b-empty">${p.brand}</span>` : ''}
          ${p.cat    ? `<span class="badge b-info">${p.cat}</span>`   : ''}
          ${isLow    ? '<span class="badge b-alert">⚠️ Stock bajo</span>' : ''}
        </div>
        <div class="prod-card-actions">
          <button class="btn-orange" style="flex:1;justify-content:center;font-size:12px" onclick="goSkuDetalle('${p.sku}')"><i class="fa-solid fa-eye"></i> Ver</button>
          ${can('write') ? `<button class="btn-ghost" style="font-size:12px" onclick="openIngresoModal('${p.sku}')"><i class="fa-solid fa-plus"></i></button>` : ''}
        </div>
      </div>`;
    }).join('') : `<div style="text-align:center;color:var(--text-f);padding:2rem">${products.length ? 'Sin resultados' : 'Sin productos'}</div>`;
  }
};

// Override verDetalleSku to show location
const _origVerDetalleSku = verDetalleSku;
window.verDetalleSku = function(sku) {
  _origVerDetalleSku(sku);
  const p = products.find(x => x.sku === sku);
  if (!p) return;

  // Append location card to sku-info-grid
  const grid = document.getElementById('sku-info-grid');
  if (grid && (p.ubCodigo || p.bodega || p.ubicacion)) {
    const ubCard = document.createElement('div');
    ubCard.className = 'sku-info-card';
    ubCard.style.gridColumn = '1/-1';
    ubCard.innerHTML = `
      <div class="sku-info-label"><i class="fa-solid fa-location-dot" style="color:var(--orange)"></i> Ubicación en bodega</div>
      ${renderUbDetalle(p)}`;
    grid.appendChild(ubCard);
  }
};

// Buscador también busca por ubicación
const _origBuscarTraz = buscarTrazabilidad;
window.buscarTrazabilidad = function() {
  const q   = document.getElementById('traz-input').value.trim();
  const el  = document.getElementById('traz-result');
  if (!q) return;

  // Buscar por código de ubicación
  const porUb = products.filter(p =>
    (p.ubCodigo || '').toLowerCase().includes(q.toLowerCase()) ||
    (p.bodega   || '').toLowerCase().includes(q.toLowerCase()) ||
    (p.rack     || '').toLowerCase().includes(q.toLowerCase())
  );

  if (porUb.length && !['SN-','BOD-','FAC-','PED-','DEV'].some(p => q.toUpperCase().startsWith(p))) {
    if (porUb.length === 1) {
      // Un solo producto en esa ubicación → mostrar detalle
      const prod = porUb[0];
      const sns  = seriales.filter(s => s.sku === prod.sku);
      el.innerHTML = `<div class="traz-result-card">
        <div class="traz-result-title"><i class="fa-solid fa-location-dot" style="color:var(--orange)"></i> Ubicación: ${q}</div>
        <div style="margin-bottom:12px">${renderUbDetalle(prod)}</div>
        <div style="font-size:10px;font-weight:800;color:var(--text-m);text-transform:uppercase;margin-bottom:8px">Producto en esta ubicación</div>
        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg);border-radius:var(--radius-lg)">
          <span class="mono" style="color:var(--orange)">${prod.sku}</span>
          <span style="font-weight:800;flex:1">${prod.name}</span>
          <span style="color:var(--green);font-weight:800">${stockOf(prod.sku)} uds</span>
          <button class="btn-tbl" onclick="goSkuDetalle('${prod.sku}')"><i class="fa-solid fa-eye"></i></button>
        </div>
        <div style="margin-top:10px;font-size:10px;font-weight:800;color:var(--text-m);text-transform:uppercase;margin-bottom:6px">S/N en stock</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px">
          ${sns.filter(s=>s.estado==='disponible').map(s=>`<span class="mono" style="font-size:11px">${s.sn}</span>`).join('') || '<span style="color:var(--text-f);font-size:12px">Sin unidades disponibles</span>'}
        </div>
      </div>`;
      return;
    }
    // Varios productos en zona → mostrar lista
    el.innerHTML = `<div class="traz-result-card">
      <div class="traz-result-title"><i class="fa-solid fa-location-dot" style="color:var(--orange)"></i> Zona: ${q} — ${porUb.length} productos</div>
      ${porUb.map(p => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          ${p.ubCodigo ? `<span class="ub-codigo">${p.ubCodigo}</span>` : ''}
          <span class="mono" style="color:var(--orange)">${p.sku}</span>
          <span style="font-weight:700;flex:1">${p.name}</span>
          <span style="color:var(--green);font-weight:800">${stockOf(p.sku)} uds</span>
          <button class="btn-tbl" onclick="goSkuDetalle('${p.sku}')"><i class="fa-solid fa-eye"></i></button>
        </div>`).join('')}
    </div>`;
    return;
  }

  // Continuar con búsqueda normal
  _origBuscarTraz();
};

// Resetear campos ubicación al abrir modal nuevo producto
const _origOpenModalUb = window.openModal;
window.openModal = function(id) {
  _origOpenModalUb(id);
  if (id === 'modal-producto') {
    ['m-bodega','m-piso','m-nivel'].forEach(sel => {
      const el = document.getElementById(sel);
      if (el) el.value = '';
    });
    ['m-pasillo','m-rack'].forEach(inp => {
      const el = document.getElementById(inp);
      if (el) el.value = '';
    });
    updateUbCodigo();
  }
};

// ══════════════════════════════════════════
//  EDITAR PRODUCTO
// ══════════════════════════════════════════

function abrirEditProducto(sku) {
  if (!can('edit')) { toast('Sin permisos para editar','error'); return; }
  const p = products.find(x => x.sku === sku);
  if (!p) return;

  document.getElementById('ep-sku-orig').value  = sku;
  document.getElementById('ep-sku').value       = sku;
  document.getElementById('ep-name').value      = p.name || '';
  document.getElementById('ep-brand').value     = p.brand || '';
  document.getElementById('ep-cat').value       = p.cat || '';
  document.getElementById('ep-barcode1').value  = p.barcode1 || '';
  document.getElementById('ep-barcode2').value  = p.barcode2 || '';
  document.getElementById('ep-stock-min').value = p.stockMin || '';
  document.getElementById('ep-notes').value     = p.notes || '';
  document.getElementById('ep-bodega').value    = p.bodega || '';
  document.getElementById('ep-piso').value      = p.piso || '';
  document.getElementById('ep-pasillo').value   = p.pasillo || '';
  document.getElementById('ep-rack').value      = p.rack || '';
  document.getElementById('ep-nivel').value     = p.nivel || '';
  document.getElementById('ep-ubicacion').value = p.ubicacion || '';
  updateEpUbCodigo();
  document.getElementById('modal-edit-producto').classList.add('show');
}

function updateEpUbCodigo() {
  const bodega  = document.getElementById('ep-bodega')?.value  || '';
  const piso    = document.getElementById('ep-piso')?.value    || '';
  const pasillo = document.getElementById('ep-pasillo')?.value || '';
  const rack    = document.getElementById('ep-rack')?.value    || '';
  const nivel   = document.getElementById('ep-nivel')?.value   || '';
  const codigo  = genUbCodigo(bodega, piso, pasillo, rack, nivel);
  const prev    = document.getElementById('ep-ub-preview');
  if (prev) prev.textContent = codigo || '—';
}

function saveEditProducto() {
  if (!can('edit')) { toast('Sin permisos','error'); return; }
  const skuOrig = document.getElementById('ep-sku-orig').value;
  const p = products.find(x => x.sku === skuOrig);
  if (!p) return;

  const bodega  = document.getElementById('ep-bodega').value;
  const piso    = document.getElementById('ep-piso').value;
  const pasillo = document.getElementById('ep-pasillo').value;
  const rack    = document.getElementById('ep-rack').value;
  const nivel   = document.getElementById('ep-nivel').value;

  p.name      = document.getElementById('ep-name').value.trim()     || p.name;
  p.brand     = document.getElementById('ep-brand').value.trim();
  p.cat       = document.getElementById('ep-cat').value;
  p.barcode1  = document.getElementById('ep-barcode1').value.trim();
  p.barcode2  = document.getElementById('ep-barcode2').value.trim() || p.barcode2;
  p.stockMin  = parseInt(document.getElementById('ep-stock-min').value) || 0;
  p.notes     = document.getElementById('ep-notes').value.trim();
  p.bodega    = bodega;
  p.piso      = piso;
  p.pasillo   = pasillo;
  p.rack      = rack;
  p.nivel     = nivel;
  p.ubicacion = document.getElementById('ep-ubicacion').value.trim();
  p.ubCodigo  = genUbCodigo(bodega, piso, pasillo, rack, nivel);
  p.updatedAt = now();

  addAudit('SKU editado', skuOrig, '—', p.name + (p.ubCodigo ? ' · '+p.ubCodigo : ''));
  closeModals();
  renderProductos();
  renderDashboard();
  toast('Producto actualizado', 'ok');
}

// ══════════════════════════════════════════
//  EDITAR / ACTIVAR / DESACTIVAR USUARIO
// ══════════════════════════════════════════

let editUsuarioActivo = true;

function abrirEditUsuario(id) {
  if (!can('users')) { toast('Sin permisos','error'); return; }
  const u = usuarios.find(x => x.id === id);
  if (!u) return;

  document.getElementById('eu-id').value       = id;
  document.getElementById('eu-name').value     = u.name;
  document.getElementById('eu-username').value = u.username;
  document.getElementById('eu-pass').value     = '';
  document.getElementById('eu-role').value     = u.role;

  editUsuarioActivo = u.activo !== false; // undefined = activo por defecto
  renderToggleEstado();
  document.getElementById('modal-edit-usuario').classList.add('show');
}

function renderToggleEstado() {
  const btn   = document.getElementById('eu-toggle-btn');
  const label = document.getElementById('eu-estado-label');
  if (!btn || !label) return;
  if (editUsuarioActivo) {
    btn.className   = 'toggle-btn on';
    label.innerHTML = '<span class="badge-activo">✅ Activo</span> — puede iniciar sesión';
  } else {
    btn.className   = 'toggle-btn off';
    label.innerHTML = '<span class="badge-inactivo">🔒 Inactivo</span> — acceso bloqueado';
  }
}

function toggleUsuarioEstado() {
  editUsuarioActivo = !editUsuarioActivo;
  renderToggleEstado();
}

function saveEditUsuario() {
  if (!can('users')) { toast('Sin permisos','error'); return; }
  const id = parseInt(document.getElementById('eu-id').value);
  const u  = usuarios.find(x => x.id === id);
  if (!u) return;

  const PERMS = {
    admin:['read','write','edit','delete','users','export'],
    supervisor:['read','write','edit','export'],
    bodeguero:['read','write','edit'],
    lectura:['read'],
  };
  const newRole = document.getElementById('eu-role').value;
  const newPass = document.getElementById('eu-pass').value;

  u.name   = document.getElementById('eu-name').value.trim() || u.name;
  u.role   = newRole;
  u.perms  = PERMS[newRole] || ['read'];
  u.activo = editUsuarioActivo;
  if (newPass) u.password = newPass;

  addAudit('Usuario editado', u.username, '—', `Rol: ${u.role} | Estado: ${editUsuarioActivo?'activo':'inactivo'}`);
  closeModals();
  renderUsuarios();
  toast('Usuario actualizado', 'ok');
}

function toggleActivoRapido(id) {
  if (!can('users')) { toast('Sin permisos','error'); return; }
  const u = usuarios.find(x => x.id === id);
  if (!u) return;
  u.activo = u.activo === false ? true : false;
  addAudit(u.activo?'Usuario activado':'Usuario desactivado', u.username, '—', '');
  renderUsuarios();
  toast(u.activo ? '✅ Usuario activado' : '🔒 Usuario desactivado', 'ok');
}

// Override renderUsuarios to show edit button, estado and toggle
const _origRenderUsuarios = renderUsuarios;
window.renderUsuarios = function() {
  if (!can('users')) {
    document.getElementById('view-usuarios').innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-f)"><i class="fa-solid fa-lock" style="font-size:32px;display:block;margin-bottom:12px"></i>Sin acceso</div>';
    return;
  }
  const PERM_L = {read:'Leer',write:'Crear',edit:'Editar',delete:'Eliminar',users:'Usuarios',export:'Exportar'};
  document.getElementById('tbody-usuarios').innerHTML = usuarios.map(u => {
    const activo  = u.activo !== false;
    const esTu    = u.username === CU.username;
    return `<tr style="${activo?'':'opacity:.55'}">
      <td><span class="mono">${u.username}</span></td>
      <td style="font-weight:700">${u.name}</td>
      <td><span class="role-chip ${ROLE_CLASS[u.role]}">${ROLE_EMOJI[u.role]} ${ROLE_LABELS[u.role]}</span></td>
      <td>
        ${esTu
          ? '<span class="badge-activo">✅ Activo (tú)</span>'
          : `<button onclick="toggleActivoRapido(${u.id})" style="background:none;border:none;cursor:pointer;font-size:13px;font-weight:800;padding:3px 8px;border-radius:999px;${activo?'background:var(--green-bg);color:var(--green-text)':'background:var(--red-bg);color:var(--red)'}">
              ${activo ? '✅ Activo' : '🔒 Inactivo'}
            </button>`
        }
      </td>
      <td style="font-size:11px">${u.perms.map(p => `<span style="background:var(--orange-lt);color:var(--orange);padding:1px 5px;border-radius:4px;margin:1px;display:inline-block;font-weight:700">${PERM_L[p]||p}</span>`).join(' ')}</td>
      <td>
        <div style="display:flex;gap:5px">
          <button class="btn-tbl" onclick="abrirEditUsuario(${u.id})"><i class="fa-solid fa-pen"></i> Editar</button>
          ${!esTu && can('delete') ? `<button class="btn-tbl" style="color:var(--red);border-color:var(--red)" onclick="deleteUsuario(${u.id})"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
};

// Override login to block inactive users
const _origLogin = () => {};
// initAuth consolidado — no override, la función original en línea 9 se reemplaza
// La verificación de usuario activo se hace después de cargar datos del servidor

// renderProductos CRUD buttons are handled inside _baseRenderProductos

// ══════════════════════════════════════════
//  CRUD COMPLETO — Eliminar con confirmación
// ══════════════════════════════════════════

// Modal de confirmación reutilizable
function confirmarEliminar(msg, sub, onConfirm) {
  document.getElementById('confirm-delete-msg').textContent = msg;
  document.getElementById('confirm-delete-sub').textContent = sub || '';
  document.getElementById('confirm-delete-btn').onclick = () => { closeModals(); onConfirm(); };
  document.getElementById('modal-confirm-delete').classList.add('show');
}

// ── ELIMINAR PRODUCTO ──────────────────────
function eliminarProducto(sku) {
  if (!can('delete')) { toast('Sin permisos para eliminar','error'); return; }
  const p      = products.find(x => x.sku === sku);
  const snCount= seriales.filter(s => s.sku === sku).length;
  confirmarEliminar(
    `¿Eliminar SKU "${sku}"?`,
    `${p?.name || ''} · ${snCount} S/N registrados. Esta acción no se puede deshacer.`,
    () => {
      products    = products.filter(x => x.sku !== sku);
      seriales    = seriales.filter(s => s.sku !== sku);
      movimientos = movimientos.filter(m => m.sku !== sku);
      devoluciones= devoluciones.filter(d => d.sku !== sku);
      segundaItems= segundaItems.filter(s => s.sku !== sku);
      addAudit('SKU eliminado', sku, '—', p?.name || '');
      renderProductos();
      renderDashboard();
      toast('SKU ' + sku + ' eliminado', '');
    }
  );
}

// ── ELIMINAR S/N ──────────────────────────
function eliminarSerial(sn, sku) {
  if (!can('delete')) { toast('Sin permisos','error'); return; }
  const s = seriales.find(x => x.sn === sn);
  confirmarEliminar(
    `¿Eliminar S/N "${sn}"?`,
    `SKU: ${sku} · Estado: ${s?.estado || '—'}`,
    () => {
      seriales    = seriales.filter(x => x.sn !== sn);
      movimientos = movimientos.filter(m => m.sn !== sn);
      addAudit('S/N eliminado', sku, sn, '');
      verDetalleSku(sku);
      renderProductos();
      toast('S/N eliminado', '');
    }
  );
}

// ── ELIMINAR MOVIMIENTO ───────────────────
function eliminarMovimiento(id) {
  if (!can('delete')) { toast('Sin permisos','error'); return; }
  confirmarEliminar(
    '¿Eliminar este movimiento del historial?',
    'Solo elimina el registro — no revierte el stock.',
    () => {
      movimientos = movimientos.filter(m => m.id !== id);
      addAudit('Movimiento eliminado', '—', '—', 'ID: ' + id);
      renderIngresos();
      renderSalidas();
      toast('Movimiento eliminado', '');
    }
  );
}

// ── ELIMINAR DEVOLUCIÓN ───────────────────
function eliminarDevolucion(id) {
  if (!can('delete')) { toast('Sin permisos','error'); return; }
  const d = devoluciones.find(x => x.id === id);
  confirmarEliminar(
    `¿Eliminar devolución "${id}"?`,
    `SKU: ${d?.sku || '—'} · Motivo: ${d?.motivo || '—'}`,
    () => {
      // Liberar S/N si estaba reservado
      if (d?.sn) {
        const s = seriales.find(x => x.sn === d.sn);
        if (s && s.estado === 'reservado') s.estado = 'vendido';
      }
      devoluciones = devoluciones.filter(x => x.id !== id);
      addAudit('Devolución eliminada', d?.sku || '—', d?.sn || '—', '');
      renderDevoluciones();
      toast('Devolución eliminada', '');
    }
  );
}

// ── ELIMINAR SEGUNDA SELECCIÓN ────────────
function eliminarSegunda(id) {
  if (!can('delete')) { toast('Sin permisos','error'); return; }
  const s = segundaItems.find(x => x.id === id);
  confirmarEliminar(
    `¿Eliminar "${s?.nombre || id}" de 2da selección?`,
    'Esta acción no se puede deshacer.',
    () => {
      segundaItems = segundaItems.filter(x => x.id !== id);
      addAudit('2da selección eliminado', s?.sku || '—', s?.sn || '—', '');
      renderSegunda();
      closeModals();
      toast('Ítem eliminado', '');
    }
  );
}

// ── ELIMINAR USUARIO ──────────────────────
const _origDeleteUsuario = deleteUsuario;
window.deleteUsuario = function(id) {
  if (!can('delete')) { toast('Sin permisos','error'); return; }
  const u = usuarios.find(x => x.id === id);
  if (!u) return;
  if (u.username === CU.username) { toast('No puedes eliminarte a ti mismo','error'); return; }
  confirmarEliminar(
    `¿Eliminar usuario "${u.username}"?`,
    `${u.name} · ${ROLE_LABELS[u.role]}`,
    () => {
      usuarios = usuarios.filter(x => x.id !== id);
      addAudit('Usuario eliminado', u.username, '—', u.name);
      renderUsuarios();
      toast('Usuario eliminado', '');
    }
  );
};

// ══════════════════════════════════════════
//  RENDERPRODUCTOS FINAL con botones CRUD
// ══════════════════════════════════════════
// Override final para incluir editar + eliminar en tabla y cards

const _baseRenderProductos = window.renderProductos;
window.renderProductos = function() {
  const btnProd    = document.getElementById('btn-nuevo-prod');
  const btnExpProd = document.getElementById('btn-export-prod');
  if (btnProd)    btnProd.style.display    = can('write')  ? '' : 'none';
  if (btnExpProd) btnExpProd.style.display = can('export') ? '' : 'none';

  const q = (document.getElementById('prod-search')?.value || '').toLowerCase();
  let rows = products.filter(p => {
    if (q && ![(p.sku||''),(p.name||''),(p.brand||''),(p.barcode1||''),(p.barcode2||''),(p.ubCodigo||'')].some(v=>v.toLowerCase().includes(q))) return false;
    const st = stockOf(p.sku);
    if (prodFilter==='low')  return st<=(p.stockMin||0)&&p.stockMin>0;
    if (prodFilter==='zero') return st===0;
    return true;
  });

  // Desktop table
  const tb = document.getElementById('tbody-productos');
  if (tb) {
    tb.innerHTML = rows.length ? rows.map(p => {
      const st      = stockOf(p.sku);
      const isLow   = p.stockMin>0 && st<=p.stockMin;
      const snCount = seriales.filter(s=>s.sku===p.sku).length;
      return `<tr>
        <td><span class="mono" style="color:var(--orange)">${p.sku}</span></td>
        <td style="font-weight:700">${p.name}</td>
        <td>${p.brand||'<span class="faint">—</span>'}</td>
        <td>${p.cat||'<span class="faint">—</span>'}</td>
        <td><span class="mono">${p.barcode1||'—'}</span></td>
        <td><span class="mono">${p.barcode2||'—'}</span></td>
        <td>${renderUbBadge(p)}</td>
        <td><strong style="color:${isLow?'var(--red)':st===0?'var(--text-f)':'var(--green)'}">${st}</strong></td>
        <td><span class="badge b-info">${snCount}</span></td>
        <td>${p.stockMin>0?`<span style="color:${isLow?'var(--red)':'var(--text-m)'}">${p.stockMin}</span>`:'—'}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button class="btn-tbl" onclick="goSkuDetalle('${p.sku}')"><i class="fa-solid fa-eye"></i></button>
            ${can('write')?`<button class="btn-tbl" onclick="openIngresoModal('${p.sku}')"><i class="fa-solid fa-plus"></i></button>`:''}
            ${can('edit')?`<button class="btn-tbl" onclick="abrirEditProducto('${p.sku}')"><i class="fa-solid fa-pen"></i></button>`:''}
            ${can('delete')?`<button class="btn-tbl" style="color:var(--red);border-color:var(--red)" onclick="eliminarProducto('${p.sku}')"><i class="fa-solid fa-trash"></i></button>`:''}
          </div>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="11" style="text-align:center;color:var(--text-f);padding:2rem">${products.length?'Sin resultados':'Sin productos — crea el primero'}</td></tr>`;
  }

  // Mobile cards
  const cards = document.getElementById('prod-cards');
  if (cards) {
    cards.innerHTML = rows.length ? rows.map(p => {
      const st    = stockOf(p.sku);
      const isLow = p.stockMin>0 && st<=p.stockMin;
      const color = isLow?'var(--red)':st===0?'var(--text-f)':'var(--green)';
      return `<div class="prod-card">
        <div class="prod-card-top">
          <div style="flex:1">
            <div class="prod-card-sku">${p.sku}</div>
            <div class="prod-card-name">${p.name}</div>
            ${p.ubCodigo?`<div style="margin-top:4px"><span class="ub-codigo">${p.ubCodigo}</span></div>`:''}
          </div>
          <div style="text-align:right">
            <div class="prod-card-stock" style="color:${color}">${st}</div>
            <div style="font-size:10px;color:var(--text-f)">uds</div>
          </div>
        </div>
        <div class="prod-card-meta">
          ${p.brand?`<span class="badge b-empty">${p.brand}</span>`:''}
          ${p.cat?`<span class="badge b-info">${p.cat}</span>`:''}
          ${isLow?'<span class="badge b-alert">⚠️ Stock bajo</span>':''}
        </div>
        <div class="prod-card-actions" style="flex-wrap:wrap">
          <button class="btn-orange" style="flex:1;justify-content:center;font-size:12px" onclick="goSkuDetalle('${p.sku}')"><i class="fa-solid fa-eye"></i> Ver</button>
          ${can('edit')?`<button class="btn-ghost" style="font-size:12px" onclick="abrirEditProducto('${p.sku}')"><i class="fa-solid fa-pen"></i></button>`:''}
          ${can('delete')?`<button class="btn-ghost" style="font-size:12px;color:var(--red);border-color:var(--red)" onclick="eliminarProducto('${p.sku}')"><i class="fa-solid fa-trash"></i></button>`:''}
        </div>
      </div>`;
    }).join('') : `<div style="text-align:center;color:var(--text-f);padding:2rem">${products.length?'Sin resultados':'Sin productos'}</div>`;
  }
};

// ══════════════════════════════════════════
//  CRUD S/N EN DETALLE SKU
// ══════════════════════════════════════════
// Override skuTab para agregar botón eliminar en S/N
const _origSkuTab = skuTab;
window.skuTab = function(tab, el) {
  _origSkuTab(tab, el);
  if (tab === 'sn' && can('delete')) {
    const rows = document.querySelectorAll('#tbody-sn tr');
    rows.forEach(row => {
      const tds = row.querySelectorAll('td');
      if (tds.length && !row.querySelector('.btn-del-sn')) {
        const snEl = tds[0]?.querySelector('.mono');
        const sn   = snEl?.textContent?.trim();
        if (sn && sn !== '—') {
          const td = document.createElement('td');
          td.innerHTML = `<button class="btn-tbl btn-del-sn" style="color:var(--red);border-color:var(--red)" onclick="eliminarSerial('${sn}','${currentSkuId}')"><i class="fa-solid fa-trash"></i></button>`;
          row.appendChild(td);
        }
      }
    });
  }
  if (tab === 'movimientos' && can('delete')) {
    const rows = document.querySelectorAll('#tbody-sku-mov tr');
    rows.forEach((row, i) => {
      const movs = movimientos.filter(m => m.sku === currentSkuId);
      if (movs[i] && !row.querySelector('.btn-del-mov')) {
        const td = document.createElement('td');
        td.innerHTML = `<button class="btn-tbl btn-del-mov" style="color:var(--red);border-color:var(--red)" onclick="eliminarMovimiento('${movs[i].id}')"><i class="fa-solid fa-trash"></i></button>`;
        row.appendChild(td);
      }
    });
  }
};

// ══════════════════════════════════════════
//  CRUD DEVOLUCIONES — botón eliminar
// ══════════════════════════════════════════
const _origRenderDevoluciones = renderDevoluciones;
window.renderDevoluciones = function() {
  _origRenderDevoluciones();
  renderDevKpis();
  // Agregar botón eliminar en tabla desktop
  if (can('delete')) {
    const rows = document.querySelectorAll('#tbody-devoluciones tr');
    rows.forEach(row => {
      if (!row.querySelector('.btn-del-dev')) {
        const btn = row.querySelector('.btn-tbl');
        const onclick = btn?.getAttribute('onclick') || '';
        const match   = onclick.match(/'(DEV[^']+)'/);
        if (match) {
          const id = match[1];
          const td = document.createElement('td');
          td.innerHTML = `<button class="btn-tbl btn-del-dev" style="color:var(--red);border-color:var(--red)" onclick="eliminarDevolucion('${id}')"><i class="fa-solid fa-trash"></i></button>`;
          row.appendChild(td);
        }
      }
    });
  }
};

// ══════════════════════════════════════════
//  FLUJO ESCANEO MEJORADO — S/N generado
// ══════════════════════════════════════════

// Generar S/N sugerido automáticamente al escanear SKU
function sugerirSN(sku) {
  const fecha   = new Date();
  const yy      = String(fecha.getFullYear()).slice(2);
  const mm      = String(fecha.getMonth()+1).padStart(2,'0');
  const dd      = String(fecha.getDate()).padStart(2,'0');
  const count   = seriales.filter(s => s.sku === sku).length + 1;
  return `${sku.slice(0,4)}-${yy}${mm}${dd}-${String(count).padStart(3,'0')}`;
}

// Override onScanCode para mostrar S/N sugerido
const _origOnScanCode = onScanCode;
window.onScanCode = function(code) {
  document.getElementById('cam-status').textContent = '✅ ' + code;

  if (scanMode === 'sku') {
    const p = findProduct(code) || products.find(x => x.sku === code);
    if (!p) { showScanNewProduct(code); return; }
    scannedSku = p.sku;
    document.getElementById('src-sku').textContent      = p.sku;
    document.getElementById('src-sku-name').textContent = p.name + ' · ' + stockOf(p.sku) + ' disponibles';
    document.getElementById('scan-sku-result').style.display  = 'block';
    document.getElementById('scan-sn-result').style.display   = 'none';
    document.getElementById('scan-confirmed').style.display   = 'none';
    document.getElementById('scan-new-product').style.display = 'none';
    updateScanUI();
    toast('SKU: ' + p.name, 'ok');
    // Pre-llenar S/N sugerido en el input manual
    const snSugerido = sugerirSN(p.sku);
    const manual = document.getElementById('manual-input');
    if (manual && scanMode !== 'sku') manual.placeholder = 'Sugerido: ' + snSugerido;
    return;
  }

  if (scanMode === 'sn') {
    const exist = findSerial(code);
    let warn = '';
    if (exist && exist.sku !== scannedSku) warn = '⚠️ S/N pertenece al SKU ' + exist.sku;
    if (exist && exist.estado === 'vendido') warn = '⚠️ S/N ya fue despachado';
    document.getElementById('src-sn').textContent      = code;
    document.getElementById('src-sn-warn').textContent = warn;
    document.getElementById('scan-sn-result').style.display = 'block';
    document.getElementById('scan-confirmed').style.display = 'none';
    document.getElementById('step-sn').className       = 'scan-step done';
    document.getElementById('step-confirm').className  = 'scan-step active';
  }
};

// Botón "Generar S/N" en el escáner paso 2
function generarSNSugerido() {
  if (!scannedSku) { toast('Primero escanea el SKU','error'); return; }
  const sn = sugerirSN(scannedSku);
  // Simular escaneo del S/N generado
  onScanCode(sn);
  document.getElementById('manual-input').value = '';
  toast('S/N generado: ' + sn, 'ok');
}
