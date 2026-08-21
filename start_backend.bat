@echo off
title DC Ops OCR — Backend (Port 8000)
echo ============================================
echo  DC Ops OCR Backend
echo  Port: 8000
echo ============================================
cd /d "%~dp0backend"
echo.

:: Cek apakah .venv sudah ada, jika belum maka buat dan install requirements
if exist .venv\Scripts\python.exe goto :skip_install

echo [INFO] Virtual environment tidak ditemukan. Membuat .venv...
python -m venv .venv

echo [INFO] Menginstal dependensi...
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\pip install -r requirements.txt

:skip_install
echo [INFO] Virtual environment (.venv) sudah ada. Melompati instalasi dependensi.

echo.
echo [START] Starting FastAPI backend on port 8000...
echo.
.venv\Scripts\python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
