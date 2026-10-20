@echo off
:: UTF-8 Codepage, damit Sonderzeichen/Emojis aus Node/npm korrekt angezeigt werden
chcp 65001 >nul
:: Blauer Hintergrund (1), weisse Schrift (F)
color 1F
cls
title OpenClinic
mode con cols=80 lines=30

cd /d %~dp0\backend
if not exist node_modules (
  echo [FEHLER] Erst "install.bat" ausfuehren!
  pause & exit /b 1
)
if not exist dist\server.js (
  echo [FEHLER] Build fehlt. Erst "install.bat" ausfuehren!
  pause & exit /b 1
)
echo.
echo    **** OPENCLINIC ****
echo.
echo   BEREIT.
echo.
node dist\server.js
pause
