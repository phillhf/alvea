@echo off
REM ================================================================
REM  Optional: OpenClinic als Windows-Dienst (NSSM)
REM  https://nssm.cc/download  -> nssm.exe hier ablegen
REM
REM  HINWEIS fuer bestehende Installationen: Falls hier zuvor bereits
REM  ein Dienst namens "Bettenaufbereitung" lief, bitte VOR erneutem
REM  Ausfuehren einmalig deinstallieren:
REM    nssm remove Bettenaufbereitung confirm
REM  Sonst laufen zwei Dienste parallel.
REM ================================================================
setlocal
cd /d %~dp0

where nssm >nul 2>nul
if errorlevel 1 (
  echo [FEHLER] nssm.exe nicht gefunden.
  echo         Download: https://nssm.cc/download
  pause & exit /b 1
)

set SERVICE=OpenClinic
set NODE_PATH=
for /f "tokens=*" %%n in ('where node') do set NODE_PATH=%%n

nssm install %SERVICE% "%NODE_PATH%" "%~dp0backend\dist\server.js"
nssm set %SERVICE% AppDirectory "%~dp0backend"
nssm set %SERVICE% AppStdout    "%~dp0logs\stdout.log"
nssm set %SERVICE% AppStderr    "%~dp0logs\stderr.log"
nssm set %SERVICE% Start SERVICE_AUTO_START
nssm set %SERVICE% AppEnvironmentExtra NODE_ENV=production

mkdir logs 2>nul
net start %SERVICE%

echo.
echo Dienst "%SERVICE%" installiert + gestartet.
echo  - Stoppen:        net stop %SERVICE%
echo  - Deinstallieren: nssm remove %SERVICE% confirm
pause
