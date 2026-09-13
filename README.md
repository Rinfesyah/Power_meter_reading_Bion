# ⚡ DC-Ops Power Meter Reading System (AI-Powered OCR)

[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![PaddleOCR](https://img.shields.io/badge/PaddleOCR-PP--OCRv4-1488C8.svg?style=flat)](https://github.com/PaddlePaddle/PaddleOCR)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?style=flat&logo=react)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED.svg?style=flat&logo=docker)](https://www.docker.com/)

Sistem otomatisasi pencatatan dan pelaporan data operasional instrumen panel listrik (seperti *Schneider PowerLogic PM5350*, *digital/analog power meter*) untuk fasilitas infrastruktur Data Center. 

Sistem ini mentransformasikan alur kerja inspeksi fisik manual menjadi digital secara instan menggunakan pipeline **Computer Vision (OpenCV + YOLOv8)** dan pengenalan karakter hibrida **PaddleOCR (PP-OCRv4 Mobile)** dengan cadangan **Tesseract OCR**, terintegrasi secara *real-time* via **Server-Sent Events (SSE)**.

---

## 🌟 Fitur Utama

*   **📱 Mobile-First Field App (Port 3001):** Antarmuka web responsif ramah smartphone dengan akses kamera langsung untuk pengambilan foto display panel di lapangan tanpa repot.
*   **💻 Manager Web Dashboard (Port 3000):** Dashboard pemantauan analitik *real-time*, validasi & verifikasi pembacaan OCR berdampingan dengan foto asli, manajemen instrumen panel (CRUD), upload model AI, serta ekspor data ke Excel/Google Sheets.
*   **🧠 Intelligent Hybrid OCR Pipeline:** 
    *   *Auto-crop LCD* menggunakan model YOLOv8 (`yolo_device_detect.pt`) atau deteksi kontur OpenCV fallback.
    *   *Auto-deskewing* rotasi kemiringan foto berbasis transformasi garis Hough.
    *   *Text Detection*: YOLOv8 (`yolo_text_detect.pt`) untuk melokalisasi kotak baris angka dengan NMS deduplication.
    *   *Primary Recognition Engine*: **PaddleOCR (PP-OCRv4 Mobile)** via PaddleX, berakurasi tinggi untuk membaca font digital LCD 7-segment dan dot-matrix.
    *   *Fail-Safe Fallback*: **Tesseract OCR** dengan pra-pemrosesan 6 tahap jika PaddleOCR tidak aktif atau output kosong.
    *   *Adaptive Self-Correction Memory*: Sistem mempelajari riwayat koreksi manual dari manajer untuk memetakan indeks baris secara mandiri.
*   **🚀 Dynamic AI Model Hot-Upload:** Kemudahan mengunggah model PaddleOCR (`.zip`), model YOLO (`.pt`), dan Tesseract (`.traineddata`) langsung dari Web Dashboard.
*   **🔄 Real-Time Event Streaming (SSE):** Setiap foto baru yang diunggah dari lapangan akan langsung muncul dan ter-update di dashboard manajer tanpa perlu me-refresh halaman.
*   **💾 Dual-Persistence Reliability:** Berjalan di atas **PostgreSQL 16** untuk kebutuhan relasional skala penuh, dengan kemampuan *automatic graceful fallback* ke penyimpanan JSON lokal jika database offline.

---

## 📂 Struktur Repositori

```text
Power_meter_reading_Bion/
├── backend/               # FastAPI Backend Service & OCR AI Pipeline
│   ├── main.py            # REST API, SSE broadcaster, model upload & worker queue
│   ├── ocr_engine.py      # Pipeline OpenCV, YOLO, PaddleOCR, Tesseract, & Memory
│   ├── models_db.py       # SQLAlchemy ORM models (master_equipments, log_headers, dll)
│   ├── crud.py            # Operasi transaksi database
│   ├── database.py        # Koneksi database & session manager
│   ├── requirements.txt   # Dependensi Python (fastapi, ultralytics, paddlex, paddlepaddle, dll)
│   └── models/            # Bobot model AI:
│       ├── yolo_device_detect.pt       # Model deteksi display meteran
│       ├── yolo_text_detect.pt         # Model deteksi bounding box teks
│       ├── power_meter_rec_inference/  # Model PaddleOCR (en_PP-OCRv4_mobile_rec)
│       └── tessdata/                   # Berkas bahasa Tesseract (eng.traineddata)
├── frontend-mobile/       # Aplikasi web operator lapangan (React + TypeScript + Vite)
├── frontend-dashboard/    # Dashboard analitik & verifikasi manager (React + TypeScript + Vite)
├── database/              # Skema database & data lokal
│   ├── init.sql           # Skema inisialisasi tabel PostgreSQL
│   ├── panels.json        # Data panel (fallback)
│   ├── readings.json      # Data log pembacaan (fallback)
│   └── memory.json        # Memori koreksi mandiri AI
├── docker-compose.yml     # Konfigurasi orkestrasi kontainer Docker
├── start_backend.bat      # Launcher 1-klik backend Windows (.venv auto-setup)
├── start_backend.sh       # Launcher backend macOS / Linux
├── ARSITEKTUR.md          # 🏛️ Dokumentasi teknis & arsitektur mendalam
├── guide_for_team.md      # 👥 Panduan setup & alur kerja tim pengembang
└── PANDUAN.md             # 📘 Panduan instalasi, operasional, & pemecahan masalah
```

---

## ⚡ Cara Cepat Menjalankan Sistem

### Opsi 1: Menjalankan Secara Native di Windows (Disarankan untuk Dev)

Pastikan **Python 3.10 / 3.11**, **Node.js LTS (18+)**, dan **Tesseract OCR** telah terpasang. Pastikan juga file model AI (YOLO & PaddleOCR) tersedia di `backend/models/`.

1. **Jalankan Backend (Port 8000):**
   Cukup klik dua kali berkas [`start_backend.bat`](file:///d:/Program/Power_meter_reading_Bion/start_backend.bat).  
   *(Skrip akan otomatis membuat `.venv`, menginstal dependensi, dan menjalankan server FastAPI).*

2. **Jalankan Frontend Mobile Operator (Port 3001):**
   ```powershell
   cd frontend-mobile
   npm install
   npm run dev
   ```
   *Akses melalui browser di: `http://localhost:3001`*

3. **Jalankan Frontend Dashboard Manager (Port 3000):**
   ```powershell
   cd frontend-dashboard
   npm install
   npm run dev
   ```
   *Akses melalui browser di: `http://localhost:3000`*

---

### Opsi 2: Menjalankan dengan Docker Compose (All-in-One + PostgreSQL)

```powershell
# Jalankan PostgreSQL, Backend, Mobile, dan Dashboard
docker compose up -d

# Pantau log backend
docker compose logs -f backend
```

---

## 📚 Dokumentasi Lanjutan

Untuk informasi teknis yang lebih komprehensif, silakan pelajari dokumen resmi kami:

*   🏛️ **[ARSITEKTUR.md](file:///d:/Program/Power_meter_reading_Bion/ARSITEKTUR.md)**: Diagram arsitektur C4, Entity Relationship Diagram (ERD), pipeline Computer Vision & hybrid OCR (PaddleOCR + Tesseract), SSE, dan model hot-upload.
*   📘 **[PANDUAN.md](file:///d:/Program/Power_meter_reading_Bion/PANDUAN.md)**: Panduan instalasi langkah demi langkah, SOP operasional teknisi dan manajer, konfigurasi OCR di Windows, serta solusi kendala (*troubleshooting*).
*   👥 **[guide_for_team.md](file:///d:/Program/Power_meter_reading_Bion/guide_for_team.md)**: Panduan setup lingkungan kerja untuk Frontend Developer dan ML Engineer serta alur kolaborasi Git.

---

## 🛡️ Lisensi & Kontribusi
Proyek ini dikembangkan secara internal untuk optimalisasi operasional infrastruktur Data Center. Seluruh kontribusi dan perubahan wajib mematuhi standar integritas data dan arsitektur yang tertera pada panduan resmi.
