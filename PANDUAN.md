# 📘 Panduan Pengembangan & Pengoperasian: DC Ops OCR System (Workplace Pertama)

Selamat datang di panduan teknis **DC Ops OCR System** untuk folder **Workplace Pertama**. Sistem ini dirancang untuk mendigitalkan pencatatan parameter panel listrik dan infrastruktur data center (DC Ops) secara otomatis menggunakan pengenalan karakter optik (**OCR**) berbasis Kecerdasan Buatan (AI).

Sistem ini terbagi menjadi 3 komponen utama:
1.  **Backend Service (Python + FastAPI)**: API server dan AI Engine utama.
2.  **Frontend Mobile App (React + Vite)**: Aplikasi mobile web untuk Operator lapangan mengambil foto panel.
3.  **Frontend Dashboard App (React + Vite)**: Aplikasi desktop web untuk Manager melakukan pemantauan, verifikasi data, dan konfigurasi panel.

---

## 🏗️ 1. Arsitektur & Alur Kerja Sistem

Sistem ini menggunakan arsitektur modern berbasis **Modular Decoupled Client-Server & AI Engine**.

```mermaid
graph TD
    subgraph Frontend (React + Vite + TypeScript)
      A[Frontend Mobile - Port 3001] -->|1. Upload Foto & Metadata| C(FastAPI Backend - Port 8000)
      B[Frontend Dashboard - Port 3000] -->|4. Verifikasi & Edit Readings| C
      B -->|5. Kelola Panel & Ekspor| C
    end
    
    subgraph Backend & AI Engine (FastAPI + YOLO + Tesseract)
      C -->|Penyimpanan Lokal| D[(JSON Database di folder database/)]
      C -->|2. Masukkan Antrean FIFO| E{FIFO Queue}
      E -->|3. Proses OCR secara Asinkron| F[OCR Engine]
      F -->|YOLO Device & Text Detect| G[Detection & Deskew]
      G -->|Tesseract OCR| H[Text Extraction]
      H -->|Pencocokan Spasial & Skema| I[Smart Parameter Matcher]
      I -->|Update Status & Hasil| D
      I -->|Self-Correction Memory| J[(memory.json)]
    end
```

### 📁 Deskripsi Struktur Folder dan Berkas
*   `📁 backend`: API server berbasis **FastAPI (Python)** yang berjalan di port `8000`. Mengelola antrean pemrosesan foto secara *asynchronous* menggunakan FIFO queue, menjalankan pipeline OCR, dan mengoperasikan database JSON lokal.
*   `📁 frontend-mobile`: Aplikasi operator berbasis **React + TypeScript + Vite** yang berjalan di port `3001`. Memiliki antarmuka yang sangat responsif, mendukung akses kamera untuk mempermudah pengambilan foto instrumen panel di lapangan.
*   `📁 frontend-dashboard`: Aplikasi manager berbasis **React + TypeScript + Vite** yang berjalan di port `3000`. Digunakan untuk memverifikasi data OCR, melakukan koreksi, mengelola panel instrumen (CRUD), serta menyimpan tautan ekspor Google Sheets.
*   `📁 database` (di luar root project `dc-ops-ocr`): Menyimpan data persistensi utama:
    *   `panels.json`: Berkas konfigurasi panel instrumen beserta tipe (Digital/Analog) dan parameter yang dipantau (seperti `Vavg (V)`, `Iavg (A)`, dsb).
    *   `readings.json`: Berkas log hasil pembacaan parameter panel yang diunggah oleh operator.
    *   `readings.csv`: Ekspor data log pembacaan panel dalam format CSV.
    *   `memory.json`: Penyimpanan memori koreksi mandiri hasil pembelajaran manual dari verifikasi manager.
    *   `📁 foto`: Direktori penyimpanan berkas gambar yang diunggah oleh operator lapangan, teratur secara dinamis per tanggal dan shift kerja.

---

## 🛠️ 2. Prasyarat Sistem & Lingkungan Kerja

Pastikan komputer Anda telah terpasang software berikut sebelum menjalankan aplikasi:

1.  **Node.js (versi 16.x atau yang lebih baru)**: [Unduh Node.js LTS](https://nodejs.org/). Diperlukan untuk memasang dependensi dan menjalankan kedua frontend.
2.  **Python (versi 3.8 s.d 3.11)**: [Unduh Python](https://www.python.org/). Diperlukan untuk backend FastAPI dan pemrosesan AI/OCR.
3.  **Tesseract OCR**:
    *   Unduh installer untuk Windows dari [UB Mannheim Tesseract](https://github.com/UB-Mannheim/tesseract/wiki).
    *   Pasang aplikasi tersebut di lokasi default (`C:\Program Files\Tesseract-OCR\tesseract.exe`). Kode backend secara otomatis mendeteksi keberadaan berkas eksekusi ini pada platform Windows.
    *   *Opsional*: Tambahkan path instalasi Tesseract ke **Environment Variables (PATH)** sistem Windows agar dapat diakses secara global.

---

## 🚀 3. Langkah Instalasi & Cara Menjalankan

Ikuti panduan langkah demi langkah di bawah ini untuk memasang seluruh komponen dan menjalankannya:

### Langkah A: Memasang dan Menjalankan Backend (FastAPI - Port 8000)
1.  Buka **Terminal atau PowerShell**.
2.  Masuk ke direktori backend:
    ```powershell
    cd "D:\Program\Workplace pertama\dc-ops-ocr\backend"
    ```
3.  Instal pustaka Python yang didefinisikan dalam `requirements.txt`:
    ```powershell
    pip install -r requirements.txt
    ```
    *Catatan: Dependensi mencakup `fastapi`, `uvicorn`, `opencv-python`, `numpy`, `pytesseract`, dan `ultralytics`.*
4.  Jalankan backend API server:
    ```powershell
    python main.py
    ```
    *API server akan aktif dan mendengarkan di `http://localhost:8000`.*

---

### Langkah B: Memasang & Menjalankan Frontend Mobile (Port 3001)
1.  Buka **Terminal atau Tab Baru** di PowerShell.
2.  Masuk ke direktori `frontend-mobile`:
    ```powershell
    cd "D:\Program\Workplace pertama\dc-ops-ocr\frontend-mobile"
    ```
3.  Instal paket dependensi Node.js:
    ```powershell
    npm install
    ```
4.  Jalankan server pengembangan lokal (Vite):
    ```powershell
    npm run dev
    ```
    *Aplikasi mobile operator siap diakses melalui web browser di `http://localhost:3001`.*

---

### Langkah C: Memasang & Menjalankan Frontend Dashboard (Port 3000)
1.  Buka **Terminal atau Tab Baru** di PowerShell.
2.  Masuk ke direktori `frontend-dashboard`:
    ```powershell
    cd "D:\Program\Workplace pertama\dc-ops-ocr\frontend-dashboard"
    ```
3.  Instal paket dependensi Node.js:
    ```powershell
    npm install
    ```
4.  Jalankan server pengembangan lokal (Vite):
    ```powershell
    npm run dev
    ```
    *Aplikasi dashboard manager siap diakses melalui web browser di `http://localhost:3000`.*

---

## 📱 4. Alur Kerja Pengoperasian Sistem

Proses perekaman data operasional dirancang agar sepenuhnya digital, cepat, dan terverifikasi dengan baik.

### Tahap 1: Pengambilan Data Lapangan (Operator via Handphone / Port 3001)
1.  Operator membuka `http://localhost:3001` pada browser perangkat mobile.
2.  Operator memasukkan **Nama**, memilih **Shift** kerja (1, 2, atau 3), serta **Waktu/Jam** pencatatan, lalu menekan tombol **"Mulai Shift"**.
3.  Pada daftar panel, pilih instrumen yang ingin dicatat (misalnya *Panel-001* atau *UPS A*).
4.  Ketuk area kamera untuk mengambil foto display panel secara jelas, lalu tekan **"Simpan"**.
5.  Aplikasi mobile akan mengirim berkas gambar ke backend `/api/ocr` untuk disimpan ke folder `database/foto/<Tanggal> - Shift <Shift>/`, dan mendaftarkan entri pembacaan baru ke database lokal dengan status `PENDING`.
6.  Operator dapat langsung melanjutkan mencatat panel berikutnya tanpa harus menunggu proses OCR selesai di latar belakang.

### Tahap 2: Verifikasi & Konfirmasi Data (Manager via Desktop / Port 3000)
1.  Manager membuka Dashboard di `http://localhost:3000`.
2.  Halaman utama akan memuat daftar log pembacaan panel terbaru.
3.  Proses OCR yang selesai di latar belakang akan mengubah status pembacaan menjadi `COMPLETED` dan menampilkan angka hasil ekstraksi otomatis.
4.  Manager mengeklik entri yang masuk untuk membandingkan foto asli instrumen panel dengan nilai hasil OCR otomatis.
5.  Jika ada ketidaksesuaian pembacaan (misalnya OCR membaca `237.D2` dari display tujuh segmen dan seharusnya bernilai `237.02`), Manager dapat langsung menyunting nilai tersebut di kolom isian.
6.  Klik tombol **"Verify & Approve"** untuk mengonfirmasi dan mengunci data tersebut. Entri yang diverifikasi akan otomatis diperbarui di database lokal.
7.  Manager juga dapat melakukan manajemen panel (Tambah/Edit/Hapus instrumen dan parameter spesifik) di tab **"Panel Management"**.

---

## 🧠 5. Sistem AI & OCR Cerdas (Koreksi Mandiri Adaptif)

Sistem ini didukung oleh kecerdasan buatan modular yang dirancang khusus untuk memproses gambar display instrumen industri:

1.  **Deteksi Perangkat & Potong Otomatis (YOLO Device Detection)**:
    *   Jika model YOLO (`yolo_device_detect.pt`) tersedia di folder `models/`, sistem akan otomatis melacak koordinat LCD panel, memberi margin aman, dan memotong gambar agar fokus pada display meter.
    *   Jika YOLO tidak aktif/gagal, OpenCV akan mengambil alih melalui pencarian kontur area LCD yang terang secara heuristik, atau memotong 25% area atas gambar untuk mengabaikan label fisik luar panel.
2.  **Koreksi Kemiringan Gambar (Deskewing)**:
    *   Menggunakan transformasi Hough Lines untuk mendeteksi sudut kemiringan kamera operator saat memotret, lalu memutar gambar secara otomatis untuk mengembalikan ketegakan orientasi pembacaan.
3.  **Ekstraksi Wilayah Teks (YOLO Text Detection & Tesseract)**:
    *   Mendeteksi koordinat setiap baris karakter numerik, memproses potongan gambar secara individual (melalui peningkatan kontras lokal CLAHE, penskalaan ulang 2.0x, binarisasi Otsu, dan erosi piksel), lalu mengirimkan potongan bersih tersebut ke mesin OCR Tesseract.
4.  **Pencocokan Cerdas (Smart Schema & Memory Mapping)**:
    *   **Strategi Spasial**: Mencari nilai angka di baris yang sama di sebelah kanan nama parameter yang terdeteksi.
    *   **Self-Correction Memory (Koreksi Mandiri)**: Jika proses spasial gagal, sistem memuat indeks baris historis dari berkas `memory.json`. Memori ini otomatis bertambah pintar setiap kali Manager melakukan perbaikan manual di Dashboard (fungsi `learn_correction` akan merekam indeks posisi baris di mana angka yang benar berada).

---

## 🛠️ 6. Solusi Pemecahan Masalah (Troubleshooting)

### 🔴 Masalah 1: Error "KeyError: 'filename'" pada backend sewaktu memproses OCR
*   **Penyebab**: Terjadi tumpang-tindih (duplikasi) rute eksternal pada berkas `main.py` yang menggunakan struktur data antrean yang berbeda.
*   **Solusi**: Kami telah menghapus rute duplikat tersebut. Pastikan Anda menjalankan berkas `backend/main.py` yang telah diperbarui agar antrean FIFO berjalan serasi menggunakan identifikasi nama berkas (`filename`).

### 🔴 Masalah 2: Hasil OCR tidak mendeteksi angka sama sekali atau bernilai kosong
*   **Penyebab**: Pustaka Tesseract OCR tidak terpasang dengan benar di sistem Windows, atau lokasi `tesseract.exe` berada di luar deteksi otomatis backend.
*   **Solusi**: Pastikan software Tesseract OCR telah terinstal pada folder `C:\Program Files\Tesseract-OCR\`. Jika folder tersebut kosong atau dipasang di tempat lain, buat konfigurasi Environment Variables (PATH) pada Windows menuju folder binari Tesseract Anda.

### 🔴 Masalah 3: Bentrokan Port Jaringan (Port 8000/3000/3001 sudah digunakan)
*   **Penyebab**: Sesi server pengembangan sebelumnya belum dimatikan secara bersih dan masih tertahan di latar belakang Windows.
*   **Solusi**: Jalankan perintah PowerShell berikut untuk menghentikan proses yang menduduki port tertentu secara paksa:
    ```powershell
    # Hentikan paksa proses pada port backend (8000)
    Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess -Force
    
    # Hentikan paksa proses pada port dashboard (3000)
    Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force
    ```

---

Dengan panduan lengkap ini, tim pengembang dan tim operasional lapangan siap menjalankan dan menguji aplikasi **DC Ops OCR System** dengan lancar dan optimal! Selamat bekerja!
