@echo off
title LuBabycas — Instalador
color 0A
cls

echo.
echo  ==========================================
echo   LuBabycas — Instalacion de dependencias
echo  ==========================================
echo.

cd /d "%~dp0"

node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo  ERROR: Instala Node.js desde https://nodejs.org
  pause & exit /b 1
)

echo  Paso 1: Limpiando instalacion anterior...
if exist "node_modules" rmdir /s /q node_modules
if exist "package-lock.json" del package-lock.json
echo  OK
echo.

echo  Paso 2: Instalando dependencias base...
call npm install express cors dotenv @ngrok/ngrok
echo.

echo  Paso 3: Instalando SQLite (puede demorar)...
call npm install better-sqlite3
if %errorlevel% neq 0 (
  echo.
  echo  SQLite nativo fallo. Intentando con binario precompilado...
  call npm install better-sqlite3 --ignore-scripts
  call npm rebuild better-sqlite3 --update-binary
)
echo.

echo  Paso 4: Verificando...
node -e "require('better-sqlite3'); console.log('SQLite OK')"
if %errorlevel% neq 0 (
  echo.
  echo  ==========================================
  echo   SQLite no pudo instalarse.
  echo   Soluciones:
  echo   1. Instala Visual C++ Build Tools:
  echo      https://aka.ms/vs/17/release/vs_BuildTools.exe
  echo      (selecciona "Desarrollo de escritorio con C++")
  echo   2. O instala Windows Build Tools:
  echo      npm install -g windows-build-tools
  echo   3. Luego vuelve a correr este archivo.
  echo  ==========================================
  echo.
  pause & exit /b 1
)

echo.
echo  ==========================================
echo   Instalacion completa exitosa
echo   Ahora abre INICIAR.bat o 
echo   INICIAR_CON_CAMARA.bat
echo  ==========================================
echo.
pause
