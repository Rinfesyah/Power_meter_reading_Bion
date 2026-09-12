#!/bin/bash
# ============================================
#  DC Ops OCR Backend (macOS / Linux)
#  Port: 8000
# ============================================

# Pastikan path Homebrew terbaca (untuk Tesseract OCR di macOS Apple Silicon M1/M2/M3)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Pindah ke direktori backend
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/backend" || exit 1

echo "============================================"
echo "  DC Ops OCR Backend"
echo "  Port: 8000"
echo "============================================"
echo ""

# Cek apakah python3 terpasang
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 tidak ditemukan. Silakan instal Python 3 terlebih dahulu."
    exit 1
fi

# Cek apakah virtual environment (.venv) sudah ada
if [ ! -f ".venv/bin/python" ]; then
    echo "[INFO] Virtual environment tidak ditemukan. Membuat .venv..."
    python3 -m venv .venv
    echo "[INFO] Menginstal dependensi..."
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install -r requirements.txt
else
    echo "[INFO] Virtual environment (.venv) sudah ada. Melompati instalasi dependensi."
fi

echo ""
echo "[START] Starting FastAPI backend on port 8000..."
echo ""
.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
