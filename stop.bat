@echo off
setlocal
REM Prueft beide moeglichen Dienstnamen (neu: OpenClinic, alt: Bettenaufbereitung)
REM fuer Abwaertskompatibilitaet mit bestehenden Installationen.
set SERVICE_NEW=OpenClinic
set SERVICE_OLD=Bettenaufbereitung
set SERVICE=

sc query %SERVICE_NEW% >nul 2>&1
if %errorlevel% == 0 set SERVICE=%SERVICE_NEW%

if not defined SERVICE (
    sc query %SERVICE_OLD% >nul 2>&1
    if %errorlevel% == 0 set SERVICE=%SERVICE_OLD%
)

if defined SERVICE (
    echo Dienst "%SERVICE%" gefunden - stoppe Dienst...
    net stop %SERVICE%
    if %errorlevel% == 0 (
        echo Dienst erfolgreich gestoppt.
    ) else (
        echo Fehler beim Stoppen des Dienstes. Bitte als Administrator ausfuehren.
    )
    pause & exit /b
)

REM --- Kein Dienst: Prozess auf Port 37843 killen ---
echo Kein Windows-Dienst gefunden - suche Prozess auf Port 37843...

set PID=
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":37843 " ^| findstr "LISTENING"') do set PID=%%a

if not defined PID (
    echo Kein Prozess auf Port 37843 gefunden - Server laeuft nicht.
    pause & exit /b 0
)

echo Beende Prozess PID %PID%...
taskkill /PID %PID% /F >nul 2>&1
if %errorlevel% == 0 (
    echo Server erfolgreich gestoppt.
) else (
    echo Fehler beim Stoppen. Bitte als Administrator ausfuehren.
)
pause
