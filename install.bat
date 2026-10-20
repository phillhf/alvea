@echo off
:: UTF-8 Codepage, damit Sonderzeichen/Emojis aus Node/npm korrekt angezeigt werden
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d %~dp0

echo ============================================
echo  OpenClinic  -  INSTALL
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [FEHLER] Node.js ist nicht installiert.
  echo         Bitte Node.js 22 LTS installieren: https://nodejs.org/
  pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo [OK] Node.js %NODEVER% gefunden.
echo.

if not exist backend\.env (
  copy backend\.env.example backend\.env >nul
  echo [OK] backend\.env angelegt.
  for /f "tokens=*" %%s in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set SECRET=%%s
  powershell -Command "(Get-Content backend\.env) -replace 'CHANGE_ME_TO_A_LONG_RANDOM_STRING', '!SECRET!' | Set-Content backend\.env"
  echo      JWT_SECRET zufaellig gesetzt.
)

echo.
echo [1/4] Backend-Dependencies installieren...
pushd backend
call npm install --no-audit --no-fund
if errorlevel 1 ( popd & pause & exit /b 1 )
popd

echo.
echo [2/4] Frontend-Dependencies installieren...
pushd frontend
call npm install --no-audit --no-fund
if errorlevel 1 ( popd & pause & exit /b 1 )

echo.
echo [3/4] Frontend bauen...
call npm run build
if errorlevel 1 ( popd & pause & exit /b 1 )
popd

echo.
echo [4/4] Backend bauen + Datenbank initialisieren...
pushd backend
call npm run build
if errorlevel 1 ( popd & pause & exit /b 1 )
call npm run init-db
if errorlevel 1 ( echo WARNUNG: init-db Fehler - Admin evtl. nicht angelegt )
popd

echo.
echo ============================================
echo  FERTIG.  Jetzt "start.bat" ausfuehren.
echo.
echo  Login:
echo    admin@openclinic.local / admin123
echo    Passwort nach erstem Login sofort aendern!
echo.
echo  Naechste Schritte unter Verwaltung:
echo    1. Haus anlegen
echo    2. Bereiche anlegen
echo    3. Stationen anlegen
echo    4. Zimmer und Betten anlegen
echo    5. Mitarbeiter anlegen
echo ============================================
pause
