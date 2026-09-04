// ══════════════════════════════════════════
//  LuBabycas — Túnel HTTPS con ngrok
//  node tunnel.js
// ══════════════════════════════════════════

require('dotenv').config();
const os   = require('os');
const PORT = process.env.PORT || 3000;
const TOKEN = (process.env.NGROK_TOKEN || '').trim();

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family === 'IPv4' && !net.internal) return net.address;
  return 'localhost';
}

async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   🛒  LuBabycas v2 — Iniciando...       ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  // 0. Verificar SQLite antes de arrancar
  console.log('  🗄️  Verificando base de datos...');
  try {
    require('better-sqlite3');
    console.log('  ✅ SQLite OK');
  } catch(e) {
    console.log('');
    console.log('  ❌ ERROR: better-sqlite3 no está instalado correctamente');
    console.log('');
    console.log('  Soluciones:');
    console.log('  1. Corre INSTALAR.bat para reinstalar dependencias');
    console.log('  2. Si falla, instala Visual C++ Build Tools:');
    console.log('     https://aka.ms/vs/17/release/vs_BuildTools.exe');
    console.log('  3. Selecciona "Desarrollo de escritorio con C++"');
    console.log('  4. Vuelve a correr INSTALAR.bat');
    console.log('');
    console.log('  Presiona Ctrl+C para salir');
    setInterval(()=>{}, 60000);
    return;
  }

  // 1. Levantar servidor Express
  console.log('  📦 Iniciando servidor...');
  const app    = require('./server.js');
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`  ✅ Servidor activo en puerto ${PORT}`);
  });

  server.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.log(`  ⚠️  Puerto ${PORT} ocupado — usando el proceso existente`);
    } else {
      console.error('  ❌ Error servidor:', e.message);
    }
  });

  await new Promise(r => setTimeout(r, 1200));

  // 2. Verificar token
  if (!TOKEN || TOKEN.includes('tu_token') || TOKEN.length < 10) {
    console.log('');
    console.log('  ⚠️  NGROK_TOKEN no configurado');
    console.log('  La cámara solo funciona en localhost.');
    console.log('');
    console.log('  Para activar cámara en celular:');
    console.log('  1. Crea cuenta gratis en https://ngrok.com');
    console.log('  2. Copia tu token desde el dashboard');
    console.log('  3. Pégalo en lubabycas-server\\.env:');
    console.log('     NGROK_TOKEN=2abc...');
    console.log('');
    const IP = getLocalIP();
    console.log(`  PC:   http://localhost:${PORT}/login.html`);
    console.log(`  Red:  http://${IP}:${PORT}/login.html`);
    console.log('');
    console.log('  Presiona Ctrl+C para detener');
    setInterval(() => {}, 60000);
    return;
  }

  // 3. Crear túnel ngrok
  let ngrok;
  try {
    ngrok = require('@ngrok/ngrok');
  } catch(e) {
    console.log('  ❌ @ngrok/ngrok no instalado — corre: npm install');
    process.exit(1);
  }

  // Cerrar túnel previo si existe
  try {
    await ngrok.disconnect();
    await new Promise(r => setTimeout(r, 800));
    console.log('  ♻️  Túnel anterior cerrado');
  } catch(e) { /* ninguno activo */ }

  console.log('  🔗 Abriendo túnel HTTPS...');

  try {
    const listener = await ngrok.forward({ addr: PORT, authtoken: TOKEN });
    const url      = listener.url();
    const IP       = getLocalIP();

    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║   ✅  LISTO — Cámara activada                       ║');
    console.log('  ╠══════════════════════════════════════════════════════╣');
    console.log(`  ║  📱 CELULAR: ${url}/login.html`);
    console.log('  ║  (Abre esa URL en el celular para usar la cámara)   ║');
    console.log('  ╠══════════════════════════════════════════════════════╣');
    console.log(`  ║  💻 PC:   http://localhost:${PORT}/login.html             ║`);
    console.log(`  ║  🌐 Red:  http://${IP}:${PORT}/login.html        ║`);
    console.log('  ╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log('  Presiona Ctrl+C para detener todo');
    console.log('');

    process.on('SIGINT', async () => {
      console.log('\n  Cerrando túnel y servidor...');
      try { await ngrok.disconnect(); } catch(e) {}
      server.close();
      process.exit(0);
    });

    setInterval(() => {}, 60000);

  } catch(e) {
    console.log('');
    console.log('  ❌ Error ngrok:', e.message);
    console.log('');

    if (e.message.includes('ERR_NGROK_334') || e.message.includes('already online')) {
      console.log('  ► Túnel ya abierto en otro proceso.');
      console.log('  ► Ve a: https://dashboard.ngrok.com/endpoints');
      console.log('  ► Elimina el endpoint activo y vuelve a correr este archivo.');
    } else if (e.message.includes('401') || e.message.includes('auth') || e.message.includes('token')) {
      console.log('  ► Token inválido o vencido.');
      console.log('  ► Copia el token desde: https://dashboard.ngrok.com/get-started/your-authtoken');
      console.log('  ► Actualiza lubabycas-server\\.env → NGROK_TOKEN=...');
    } else if (e.message.includes('ECONNREFUSED') || e.message.includes('network')) {
      console.log('  ► Sin conexión a internet o ngrok bloqueado.');
    }

    console.log('');
    console.log('  Servidor local sigue activo:');
    console.log(`  http://localhost:${PORT}/login.html`);
    console.log('');
    console.log('  Presiona Ctrl+C para detener');
    setInterval(() => {}, 60000);
  }
}

main().catch(e => { console.error('  ❌ Error fatal:', e.message); process.exit(1); });
