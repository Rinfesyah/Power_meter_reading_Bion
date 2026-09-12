#!/bin/bash
# ============================================
#  DC Ops OCR - Frontend Mobile (macOS / Linux)
#  Port: 3001
# ============================================

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/frontend-mobile" || exit 1

echo "============================================"
echo "  DC Ops OCR - Frontend Mobile"
echo "  Port: 3001"
echo "============================================"
echo ""

if [ ! -d "node_modules" ]; then
    echo "[INFO] node_modules tidak ditemukan. Menjalankan npm install..."
    npm install
fi

echo "[START] Menjalankan Frontend Mobile..."
npm run dev
