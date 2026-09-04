@echo off
title LuBabycas v2 — Servidor local
color 0A
cls

echo.
echo  ==========================================
echo   LuBabycas Inventario v2
echo   Servidor red local
echo  ==========================================
echo.

cd /d "%~dp0"
echo  Carpeta: %cd%
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo  ERROR: Instala Node.js desde https://nodejs.org
  pause & exit /b 1
)

if not exist "node_modules\express" (
  echo  Instalando dependencias...
  call npm install express cors dotenv node-fetch
  call npm install better-sqlite3
  echo.
)

node -e "require('better-sqlite3')" >nul 2>&1
if %errorlevel% neq 0 (
  echo  Reparando SQLite...
  call npm rebuild better-sqlite3
)

if not exist ".env" ( copy .env.example .env >nul )

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do ( set IP=%%a & goto :found )
:found
set IP=%IP: =%

echo  ==========================================
echo  PC:      http://localhost:3000/login.html
echo  Celular: http://%IP%:3000/login.html
echo  ==========================================
echo.

node server.js
pause
