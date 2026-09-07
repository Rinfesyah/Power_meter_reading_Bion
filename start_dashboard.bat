@echo off
title DC Ops OCR — Frontend Dashboard (Port 3000)
echo ============================================
echo  DC Ops OCR - Frontend Dashboard
echo  Port: 3000
echo ============================================
cd /d "%~dp0frontend-dashboard"
echo.

if not exist node_modules (
    echo [INFO] node_modules tidak ditemukan. Menjalankan npm install...
    call npm install
)

echo [START] Menjalankan Frontend Dashboard...
call npm run dev
pause
