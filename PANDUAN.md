# 📘 Panduan Pengembangan & Pengoperasian: DC Ops OCR System

Selamat datang di panduan teknis operasional **DC Ops OCR System (Power Meter Reading)**. Sistem ini dirancang khusus untuk mendigitalkan dan mengotomatiskan pencatatan parameter panel listrik (seperti Schneider PowerLogic, PM5350, dsb.) dan infrastruktur data center secara cepat, andal, dan akurat menggunakan teknologi Computer Vision & Optical Character Recognition (**OCR**) berbasis AI.

Sistem terdiri dari 3 komponen utama yang terhubung secara *real-time*:
1.  **Backend Service (Python + FastAPI)**: API server, antrean *background worker*, dan AI OCR Engine (Port `8000`).
2.  **Frontend Mobile App (React + Vite)**: Aplikasi mobile-web responsif khusus untuk Operator lapangan mengambil foto panel dan memasukkan data shift (Port `3001`).
3.  **Frontend Dashboard App (React + Vite)**: Web Dashboard analitik untuk Manager melakukan verifikasi, penyuntingan data pembacaan, manajemen panel/parameter, serta ekspor laporan (Port `3000`).

Untuk dokumentasi desain teknis dan diagram internal mendalam, silakan baca **[ARSITEKTUR.md](file:///d:/Program/Power_meter_reading_Bion/ARSITEKTUR.md)**.

---

## 🏗️ 1. Arsitektur & Alur Kerja Sistem

Sistem mengadopsi arsitektur **Decoupled Client-Server** dengan pemrosesan OCR asinkron melalui antrean FIFO dan komunikasi dua arah menggunakan Server-Sent Events (SSE).

```mermaid
graph TD
    subgraph Frontend (React + Vite + TypeScript)
      A[Frontend Mobile - Port 3001] -->|1. Upload Foto & Metadata| C(FastAPI Backend - Port 8000)
      B[Frontend Dashboard - Port 3000] -->|4. Verifikasi & Koreksi Readings| C
      B -->|5. Kelola Master Panel & Ekspor| C
      C -.->|Real-Time SSE Updates| B
      C -.->|Real-Time SSE Updates| A
    end
    
    subgraph Backend & AI Engine (FastAPI + YOLO + Tesseract)
      C -->|Simpan Foto Fisik| FOTO[ Direktori /database/foto/ ]
      C -->|Tulis Transaksi Awal| DB[(PostgreSQL 16 / JSON Fallback)]
      C -->|2. Masukkan Antrean FIFO| E{Worker FIFO Queue}
      E -->|3. Proses OCR Asinkron| F[OCR Engine]
      F -->|YOLO Device Detect| G[Crop LCD & Deskewing]
      G -->|OpenCV CLAHE & Otsu| H[Filter Binarisasi]
      H -->|Tesseract Engine| I[Ekstraksi Angka]
      I -->|Pencocokan Spasial| J[Smart Matcher]
      J -->|Update Status COMPLETED| DB
      J -->|Koreksi Adaptif| MEM[(memory.json)]
    end
```

### 📁 Struktur Folder Proyek
*   `📁 backend/`: Layanan API berbasis **FastAPI (Python)**. Mengelola antrean pemrosesan foto latar belakang, pipeline OCR (OpenCV + YOLO + Tesseract), endpoint CRUD, dan streaming SSE.
    *   `main.py`: Entry point server FastAPI, routing HTTP, dan antrean worker thread.
    *   `ocr_engine.py`: Pipeline ekstraksi gambar, rotasi (deskew), deteksi binarisasi, dan Tesseract OCR.
    *   `database.py`: Konfigurasi engine database SQLAlchemy dan koneksi PostgreSQL.
    *   `models_db.py`: Model ORM tabel relasional (`master_equipments`, `log_headers`, `log_details`, dll).
    *   `crud.py`: Logika transaksi database untuk operasi data operasional.
    *   `requirements.txt`: Daftar pustaka Python yang diperlukan.
*   `📁 frontend-mobile/`: Aplikasi web ramah ponsel (PWA/mobile layout) dengan akses kamera terintegrasi untuk operator lapangan (Port `3001`).
*   `📁 frontend-dashboard/`: Aplikasi web analitik dan manajemen instrumen untuk supervisor dan manajer (Port `3000`).
*   `📁 database/`: Tempat penyimpanan data persisten:
    *   `init.sql`: Skema inisialisasi basis data PostgreSQL untuk deployment pertama.
    *   `panels.json` & `readings.json`: Basis data lokal fallback otomatis jika PostgreSQL tidak dijalankan.
    *   `memory.json`: Berkas memori koreksi mandiri (*self-learning memory*) hasil verifikasi manajer.
    *   `📁 foto/`: Penyimpanan gambar panel yang dikelompokkan rapi per tanggal dan shift kerja.
*   `start_backend.bat`: Skrip otomatis Windows untuk inisialisasi lingkungan `.venv` dan menjalankan backend sekali klik.
*   `docker-compose.yml`: Konfigurasi orkestrasi kontainer Docker (PostgreSQL, Backend, Mobile, Dashboard).

---

## 🛠️ 2. Prasyarat Sistem & Lingkungan Kerja

Sebelum menjalankan aplikasi di lingkungan pengembang lokal Windows, pastikan software berikut telah terpasang:

1.  **Node.js (versi 18.x LTS atau lebih baru)**: [Unduh Node.js](https://nodejs.org/).
2.  **Python (versi 3.9 s.d 3.11)**: [Unduh Python](https://www.python.org/). Pastikan opsi *"Add Python to PATH"* dicentang saat instalasi.
3.  **Tesseract OCR Engine**:
    *   Unduh installer Windows resmi dari [UB-Mannheim Tesseract](https://github.com/UB-Mannheim/tesseract/wiki).
    *   Pasang di lokasi default: `C:\Program Files\Tesseract-OCR\tesseract.exe`.
    *   Backend secara otomatis mendeteksi direktori instalasi standar ini.
4.  **Docker Desktop (Opsional, jika ingin menjalankan dengan PostgreSQL)**:
    *   [Unduh Docker Desktop](https://www.docker.com/products/docker-desktop/).

---

## 🚀 3. Langkah Menjalankan Aplikasi

Anda dapat memilih menjalankan sistem secara **Lokal Native (Windows)** atau menggunakan **Docker Compose**.

### Opsi A: Menjalankan Secara Native di Windows (Paling Cepat untuk Development)

#### 1. Jalankan Backend (Port 8000)
Cukup klik dua kali berkas:
```text
start_backend.bat
```
*Skrip ini akan secara otomatis membuat virtual environment `.venv`, memasang dependensi dari `requirements.txt`, dan menjalankan server Uvicorn di `http://localhost:8000`.*

*Atau jika dijalankan via PowerShell manual:*
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Jalankan Frontend Mobile Operator (Port 3001)
Buka tab PowerShell baru:
```powershell
cd frontend-mobile
npm install
npm run dev
```
*Aplikasi mobile operator siap dibuka melalui browser di `http://localhost:3001`.*

#### 3. Jalankan Frontend Dashboard Manager (Port 3000)
Buka tab PowerShell baru lainnya:
```powershell
cd frontend-dashboard
npm install
npm run dev
```
*Web Dashboard manajer siap diakses melalui browser di `http://localhost:3000`.*

---

### Opsi B: Menjalankan Menggunakan Docker Compose (Termasuk PostgreSQL)

Jika Anda ingin menjalankan seluruh ekosistem (PostgreSQL 16 + Backend + Kedua Frontend) dalam kontainer terisolasi:

```powershell
# Jalankan seluruh service di latar belakang
docker compose up -d

# Periksa status kontainer
docker compose ps

# Melihat log proses backend secara live
docker compose logs -f backend
```

Untuk mematikan service:
```powershell
docker compose down
```

---

## 📱 4. Prosedur Operasional Standar (SOP Penggunaan)

### Tahap 1: Pengambilan Data Lapangan (Teknisi / Operator - Port 3001)
1.  Buka `http://localhost:3001` pada browser smartphone atau tablet.
2.  Pilih **Nama Operator**, pilih **Shift Kerja** (Shift 1, 2, atau 3), serta **Jam Inspeksi**, lalu ketuk **"Mulai Shift"**.
3.  Pilih instrumen panel yang akan diinspeksi dari daftar panel.
4.  Arahkan kamera ke layar instrumen (usahakan pencahayaan cukup dan display berada di tengah frame).
5.  Tekan tombol ambil foto lalu konfirmasi simpan.
6.  Sistem segera mengunggah gambar ke backend dengan status awal `PENDING`. Operator dapat langsung berpindah ke panel berikutnya tanpa perlu menunggu proses AI selesai.

### Tahap 2: Verifikasi & Rekonsiliasi Data (Supervisor / Manager - Port 3000)
1.  Buka `http://localhost:3000` pada komputer kerja.
2.  Data hasil foto dari lapangan akan langsung muncul di tabel utama melalui update *real-time* SSE (badge status akan otomatis berganti dari `PROCESSING` menjadi `COMPLETED`).
3.  Klik baris log untuk membuka jendela inspeksi:
    *   Sisi kiri menampilkan foto asli resolusi tinggi dari display panel.
    *   Sisi kanan menampilkan nilai angka yang diekstraksi otomatis oleh AI.
4.  Jika ada angka yang kurang tepat (misalnya karakter 8 terbaca B akibat pantulan cahaya):
    *   Ubah angka secara manual pada kolom input.
    *   Klik **"Verify & Approve"**.
5.  Sistem akan menyimpan nilai terverifikasi dan secara cerdas memperbarui **Self-Correction Memory** agar akurasi pembacaan berikutnya semakin tinggi.
6.  Gunakan tab **"Export"** untuk mengunduh rekap dalam format Excel/CSV atau sinkronisasi langsung ke Google Sheets.

---

## 🧠 5. Fitur Cerdas & Optimasi OCR

1. **Auto Deskewing:**
   Sistem mengoreksi orientasi foto yang miring hingga $\pm 45^\circ$ secara otomatis menggunakan transformasi Hough Lines pada OpenCV.
2. **Dynamic Contrast Enhancement (CLAHE):**
   Mempertegas karakter 7-segment yang redup pada display LCD berlatar belakang backlight hijau/biru.
3. **Adaptive Self-Learning Memory:**
   Tiap koreksi manual oleh manajer melatih model pencocokan spasial tanpa perlu melakukan training ulang model deep learning yang memakan waktu lama.
4. **Dual Persistence Architecture:**
   Jika PostgreSQL sedang dimatikan atau mengalami gangguan jaringan, backend otomatis beroperasi menggunakan penyimpanan lokal JSON tanpa kehilangan data operasional.

---

## 🛠️ 6. Panduan Pemecahan Masalah (Troubleshooting)

### 🔴 1. Port Jaringan Bentrok (Port 8000 / 3000 / 3001 Sudah Terpakai)
Jika terminal menampilkan pesan `error: listen EADDRINUSE: address already in use`, hentikan proses yang menahan port tersebut dengan perintah PowerShell berikut:
```powershell
# Hentikan proses yang menahan port 8000 (Backend)
Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force

# Hentikan proses yang menahan port 3000 (Dashboard)
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Hentikan proses yang menahan port 3001 (Mobile)
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess | Stop-Process -Force
```

### 🔴 2. Error Tesseract: `tesseract is not installed or it's not in your PATH`
*   Pastikan Tesseract OCR terinstal di `C:\Program Files\Tesseract-OCR\tesseract.exe`.
*   Jika diinstal di direktori lain, tambahkan folder binari tersebut ke dalam variabel lingkungan sistem Windows (`PATH`), lalu buka kembali terminal PowerShell Anda.

### 🔴 3. Backend Gagal Terhubung ke PostgreSQL
*   Pastikan service PostgreSQL berjalan (misalnya melalui Docker: `docker compose up -d postgres`).
*   Jika Anda tidak ingin menggunakan PostgreSQL saat pengujian mandiri, biarkan backend berjalan seperti biasa—backend secara otomatis akan menggunakan database file JSON lokal (`database/panels.json` & `database/readings.json`) sebagai fallback.

---

*Dokumentasi ini dikelola secara aktif untuk memastikan keandalan operasional fasilitas Data Center.*
