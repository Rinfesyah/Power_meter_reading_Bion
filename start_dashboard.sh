#!/bin/bash
# ============================================
#  DC Ops OCR - Frontend Dashboard (macOS / Linux)
#  Port: 3000
# ============================================

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/frontend-dashboard" || exit 1

echo "============================================"
echo "  DC Ops OCR - Frontend Dashboard"
echo "  Port: 3000"
echo "============================================"
echo ""

if [ ! -d "node_modules" ]; then
    echo "[INFO] node_modules tidak ditemukan. Menjalankan npm install..."
    npm install
fi

echo "[START] Menjalankan Frontend Dashboard..."
npm run dev
