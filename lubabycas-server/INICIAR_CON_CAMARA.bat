@echo off
title LuBabycas v2 — Con camara HTTPS
color 0A
cls

echo.
echo  ==========================================
echo   LuBabycas Inventario v2
echo   Servidor + Tunel HTTPS (camara activa)
echo  ==========================================
echo.

cd /d "%~dp0"
echo  Carpeta: %cd%
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo  ERROR: Node.js no instalado.
  echo  Descarga desde: https://nodejs.org
  pause & exit /b 1
)
for /f %%i in ('node --version') do set NODEVER=%%i
echo  Node.js: %NODEVER%
echo.

:: Instalar dependencias basicas primero (sin better-sqlite3)
if not exist "node_modules\express" (
  echo  Instalando dependencias base...
  call npm install express cors dotenv @ngrok/ngrok node-fetch
  echo.
)

:: Instalar better-sqlite3 por separado con rebuild
if not exist "node_modules\better-sqlite3" (
  echo  Instalando base de datos SQLite...
  call npm install better-sqlite3 --build-from-source 2>nul
  if %errorlevel% neq 0 (
    echo  Intentando metodo alternativo...
    call npm install better-sqlite3 --ignore-scripts 2>nul
    if %errorlevel% neq 0 (
      echo  Instalando con npm ci...
      call npm install better-sqlite3
    )
  )
  echo.
)

:: Verificar que better-sqlite3 funcione
node -e "require('better-sqlite3')" >nul 2>&1
if %errorlevel% neq 0 (
  echo  Reparando better-sqlite3...
  call npm rebuild better-sqlite3
  echo.
)

:: Crear .env si no existe
if not exist ".env" (
  copy .env.example .env >nul
  echo  Archivo .env creado.
  echo.
  echo  ==========================================
  echo   Agrega tu token ngrok en .env:
  echo   NGROK_TOKEN=tu_token_aqui
  echo   Token gratis: https://ngrok.com
  echo  ==========================================
  echo.
  notepad .env
  echo  Presiona una tecla cuando guardes el .env...
  pause
)

echo  Iniciando servidor + tunel HTTPS...
echo.
node tunnel.js

echo.
pause
