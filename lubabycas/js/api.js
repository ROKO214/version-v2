// ══════════════════════════════════════════
//  LuBabycas — Capa de API
//  Conecta el frontend al servidor SQLite
// ══════════════════════════════════════════

const API_BASE = window.location.origin;

// Banner offline
function _setOffline(on) {
  let b = document.getElementById('offline-banner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'offline-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ef4444;color:#fff;text-align:center;padding:7px 16px;font-size:12px;font-weight:800;z-index:9999;display:none;letter-spacing:.02em';
    b.innerHTML = '⚠️ Sin conexión al servidor — los cambios no se guardarán hasta que se reconecte';
    document.body.appendChild(b);
  }
  b.style.display = on ? 'block' : 'none';
  // Push main content down when banner shows
  const main = document.querySelector('.main');
  if (main) main.style.marginTop = on ? 'calc(var(--topbar-h) + 32px)' : '';
}

async function apiFetch(method, path, body) {
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(API_BASE + path, opts);
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: r.statusText }));
      throw new Error(err.error || r.statusText);
    }
    _setOffline(false);
    return await r.json();
  } catch(e) {
    if (e.name === 'TypeError' || e.message.includes('fetch') || e.message.includes('network')) {
      _setOffline(true);
    }
    throw e;
  }
}

function qStr(params) {
  if (!params) return '';
  const p = Object.entries(params).filter(([,v]) => v !== undefined && v !== '');
  return p.length ? '?' + p.map(([k,v]) => k+'='+encodeURIComponent(v)).join('&') : '';
}

const API = {
  // ── Productos ──────────────────────────
  products: {
    list:   (q, filter) => apiFetch('GET', '/api/products'+qStr({q, filter})),
    get:    (code)      => apiFetch('GET', `/api/products/${encodeURIComponent(code)}`),
    create: (data)      => apiFetch('POST',  '/api/products', data),
    update: (sku, data) => apiFetch('PUT',   `/api/products/${encodeURIComponent(sku)}`, data),
    delete: (sku)       => apiFetch('DELETE', `/api/products/${encodeURIComponent(sku)}`),
  },
  // ── Seriales ───────────────────────────
  seriales: {
    list:   (params)    => apiFetch('GET', '/api/seriales'+qStr(params)),
    get:    (sn)        => apiFetch('GET', `/api/seriales/${encodeURIComponent(sn)}`),
    delete: (sn)        => apiFetch('DELETE', `/api/seriales/${encodeURIComponent(sn)}`),
  },
  // ── Movimientos ────────────────────────
  movimientos: {
    list:   (params)    => apiFetch('GET', '/api/movimientos'+qStr(params)),
    ingreso:(data)      => apiFetch('POST', '/api/movimientos/ingreso', data),
    salida: (data)      => apiFetch('POST', '/api/movimientos/salida', data),
    delete: (id)        => apiFetch('DELETE', `/api/movimientos/${id}`),
  },
  // ── Devoluciones ───────────────────────
  devoluciones: {
    list:   (params)    => apiFetch('GET', '/api/devoluciones'+qStr(params)),
    get:    (id)        => apiFetch('GET', `/api/devoluciones/${id}`),
    create: (data)      => apiFetch('POST',  '/api/devoluciones', data),
    update: (id, data)  => apiFetch('PUT',   `/api/devoluciones/${id}`, data),
    delete: (id)        => apiFetch('DELETE', `/api/devoluciones/${id}`),
    stats:  ()          => apiFetch('GET', '/api/devoluciones/stats'),
  },
  // ── Segunda Selección ──────────────────
  segunda: {
    list:   (params)    => apiFetch('GET', '/api/segunda'+qStr(params)),
    get:    (id)        => apiFetch('GET', `/api/segunda/${id}`),
    create: (data)      => apiFetch('POST',  '/api/segunda', data),
    update: (id, data)  => apiFetch('PUT',   `/api/segunda/${id}`, data),
    vender: (id, data)  => apiFetch('POST',  `/api/segunda/${id}/vender`, data),
    merma:  (id, data)  => apiFetch('POST',  `/api/segunda/${id}/merma`, data),
    delete: (id)        => apiFetch('DELETE', `/api/segunda/${id}`),
  },
  // ── Usuarios ───────────────────────────
  usuarios: {
    list:   ()          => apiFetch('GET', '/api/users'),
    create: (data)      => apiFetch('POST',   '/api/users', data),
    update: (id, data)  => apiFetch('PUT',    `/api/users/${id}`, data),
    toggle: (id, activo)=> apiFetch('PATCH',  `/api/users/${id}/toggle`, { activo }),
    delete: (id)        => apiFetch('DELETE',  `/api/users/${id}`),
  },
  // ── Auditoría ──────────────────────────
  audit: {
    list: () => apiFetch('GET', '/api/audit'),
  },
  // ── Trazabilidad ───────────────────────
  traz: {
    buscar: (q) => apiFetch('GET', `/api/trazabilidad/${encodeURIComponent(q)}`),
  },
  // ── Sesiones activas ───────────────────
  session: {
    ping:   (data)  => apiFetch('POST', '/api/session/ping', data),
    activos:()      => apiFetch('GET',  '/api/session/activos'),
  },
  // ── Health ─────────────────────────────
  health: () => apiFetch('GET', '/api/health'),
};
