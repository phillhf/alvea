@echo off
:: UTF-8 Codepage, damit Sonderzeichen/Emojis aus Node/npm/PowerShell korrekt angezeigt werden
chcp 65001 >nul
color 1F
title OpenClinic Update
cd /d "%~dp0"

if not exist "Update\update.ps1" (
    echo [FEHLER] Update\update.ps1 nicht gefunden.
    echo  Bitte sicherstellen, dass der komplette "Update"-Ordner vorhanden ist.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update\update.ps1"
exit /b %errorlevel%
