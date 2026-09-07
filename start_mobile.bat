@echo off
title DC Ops OCR — Frontend Mobile (Port 3001)
echo ============================================
echo  DC Ops OCR - Frontend Mobile
echo  Port: 3001
echo ============================================
cd /d "%~dp0frontend-mobile"
echo.

if not exist node_modules (
    echo [INFO] node_modules tidak ditemukan. Menjalankan npm install...
    call npm install
)

echo [START] Menjalankan Frontend Mobile...
call npm run dev
pause
