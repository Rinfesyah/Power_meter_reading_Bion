# 🚀 DC-Ops OCR System

**Data Center Operational Reporting System with AI-Powered OCR Automation.**

Sistem ini didesain khusus untuk mengotomatiskan perekaman data dan pelaporan harian instrumen panel listrik (seperti Schneider PowerLogic) dan fasilitas infrastruktur data center lainnya menggunakan teknologi **Object Detection (YOLO)** dan **Optical Character Recognition (Tesseract OCR)**.

Sistem terdiri dari tiga bagian utama:
1.  **Backend (FastAPI)**: API Server & AI OCR Engine utama (Port `8000`).
2.  **Frontend Mobile (React + Vite)**: Aplikasi mobile-web khusus untuk Operator lapangan melakukan input data dan mengambil foto panel (Port `3001`).
3.  **Frontend Dashboard (React + Vite)**: Web Dashboard premium khusus untuk Manager melakukan verifikasi, penyuntingan data, ekspor Sheets, dan manajemen panel (Port `3000`).

---

## 📂 Struktur Utama Proyek

```text
dc-ops-ocr/
├── backend/               # FastAPI Backend Service & OCR AI Pipeline
│   ├── main.py            # Entry point FastAPI & Queue manager
│   ├── ocr_engine.py      # Core OCR Pipeline (YOLO + OpenCV + Tesseract)
│   ├── requirements.txt   # Python dependency list
│   └── models/            # Tempat menyimpan model YOLO (.pt) dan Tesseract (.traineddata)
├── frontend-mobile/       # React + Vite App untuk Operator lapangan (Port 3001)
├── frontend-dashboard/    # React + Vite App untuk Web Dashboard Manager (Port 3000)
├── README.md              # Ringkasan cepat & cara menjalankan sistem
└── PANDUAN.md             # Panduan lengkap arsitektur, AI, & pemecahan masalah (Bahasa Indonesia)
```

Untuk detail arsitektur lengkap, silakan merujuk ke **[PANDUAN.md](file:///d:/Program/Workplace%20pertama/dc-ops-ocr/PANDUAN.md)**.

---

## ⚡ Cara Cepat Menjalankan Aplikasi

Pastikan Anda memiliki **Node.js LTS**, **Python 3.8 - 3.11**, dan **Tesseract OCR** terpasang di komputer Anda.

### 1. Jalankan Backend (FastAPI - Port 8000)
Buka terminal baru, jalankan perintah berikut:
```bash
cd backend
pip install -r requirements.txt
python main.py
```
*API Server berjalan di `http://localhost:8000`.*

### 2. Jalankan Frontend Mobile (Operator - Port 3001)
Buka terminal baru kedua, jalankan perintah berikut:
```bash
cd frontend-mobile
npm install
npm run dev
```
*Aplikasi operator berjalan di `http://localhost:3001`.*

### 3. Jalankan Frontend Dashboard (Manager - Port 3000)
Buka terminal baru ketiga, jalankan perintah berikut:
```bash
cd frontend-dashboard
npm install
npm run dev
```
*Web Dashboard berjalan di `http://localhost:3000`.*

---

## 📘 Dokumentasi Tambahan

Untuk panduan mendalam tentang:
*   **Arsitektur Sistem Terperinci** (diagram sequence & alur database).
*   **Cara kerja AI & Engine OCR** (pencocokan spasial, filter preprocessing OpenCV, dan memory self-learning).
*   **Prasyarat & Konfigurasi Tesseract OCR di Windows**.
*   **Panduan Troubleshooting Lengkap** (mengatasi bentrok port jaringan, blank page, atau model error).

Buka berkas panduan kami:  
👉 **[PANDUAN.md (Bahasa Indonesia)](file:///d:/Program/Workplace%20pertama/dc-ops-ocr/PANDUAN.md)**

---

## 🛠️ Pemeliharaan & Kontribusi

Sistem ini menggunakan **Self-Correction Memory** adaptif. Setiap kali Anda melakukan penyuntingan manual pada Dashboard Manager, kecerdasan buatan akan mempelajari pola kesalahan karakter dan secara dinamis menyimpannya ke database memori (`database/memory.json`) untuk meningkatkan akurasi pembacaan di masa mendatang.
