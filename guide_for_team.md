# Panduan Setup & Kolaborasi Tim (Untuk Frontend Developer & ML Engineer)

Dokumen ini berisi panduan langkah-demi-langkah bagi **Orang 2 (Frontend Developer)** dan **Orang 3 (ML Engineer)** untuk mengunduh proyek dari GitHub, menjalankan Docker, serta menyinkronkan kode program dalam kolaborasi tim.

---

## 📋 Bagian 1: Persiapan Alat di Laptop Masing-Masing

Sebelum memulai, pastikan perangkat lunak berikut sudah terinstal di laptop Anda:
1.  **Git:** [Unduh & Instal Git](https://git-scm.com/)
2.  **Docker Desktop:** [Unduh & Instal Docker Desktop](https://www.docker.com/products/docker-desktop/) (Pastikan Docker Desktop sudah aktif/Running sebelum melangkah ke bagian berikutnya).
3.  **Code Editor:** Gunakan VS Code atau Antigravity IDE.

NOTE

Catatan untuk Pengguna macOS (Macbook):

Tidak memerlukan install Git. Cukup instal Docker Desktop untuk Mac.
Pilih tipe installer Docker yang sesuai dengan prosesor Mac Anda: Apple Silicon (Chip M1/M2/M3) atau Intel Chip.
Jalankan semua perintah terminal menggunakan aplikasi Terminal bawaan Mac atau VS Code Terminal.

---

## 🚀 Bagian 2: Langkah Setup Awal (Pertama Kali)

Ikuti langkah-langkah di bawah ini untuk mengambil proyek dan menjalankannya untuk pertama kali:

### Langkah 1: Clone Repositori dari GitHub
Buka Terminal (atau PowerShell) Anda, masuk ke folder tempat biasa Anda menyimpan proyek (misal: `D:\Projects`), lalu jalankan perintah:
```powershell
git clone https://github.com/Rinfesyah/Workplace_IDP.git
cd Workplace_IDP
```

### Langkah 2: Berpindah ke Branch Pengembangan
Pindah ke branch utama (`main`) yang saat ini aktif digunakan oleh tim:
```powershell
git checkout main
```

### Langkah 3: Unduh File Model AI YOLO (Hanya Jika Belum Ada)
Jika folder `backend/models/` di komputer Anda belum berisi file model `.pt`, mintalah file model tersebut kepada ML Engineer melalui Google Drive bersama, lalu letakkan di folder:
`Workplace_IDP/dc-ops-ocr/backend/models/`

### Langkah 4: Bangun & Jalankan Aplikasi
Jalankan Docker Compose untuk membangun container pertama kali:
```powershell
docker compose up --build
```
Proses ini akan mengunduh image Python, Node.js, menginstal Tesseract OCR, serta library python/NPM lainnya secara otomatis. Setelah selesai, aplikasi dapat diakses di:
*   **Dashboard Manager:** [http://localhost:3000](http://localhost:3000)
*   **Aplikasi Mobile Operator:** [http://localhost:3001](http://localhost:3001)
*   **Backend API Swagger:** [http://localhost:8000/docs](http://localhost:8000/docs)

Untuk mematikan container, tekan `Ctrl + C` di terminal tersebut.

---

## 🔄 Bagian 3: Alur Sinkronisasi & Update Kode Sehari-hari

### Skenario A: Mengambil Update Terbaru dari Tim
Sebelum Anda mulai menulis kode baru setiap harinya, selalu jalankan perintah ini agar kode Anda tidak ketinggalan:
```powershell
# 1. Tarik perubahan terbaru dari GitHub
git pull origin main

# 2. Jalankan aplikasi (tambahkan --build jika rekan tim ada menambahkan library baru)
docker compose up
```

---

### Skenario B: Anda Melakukan Update Kode (Contoh Kasus)

Misalkan **Orang 2** selesai memodifikasi UI Dashboard, atau **Orang 3** memperbarui kode preprocessing gambar di backend. Berikut langkah untuk menyebarkan update tersebut ke tim:

#### **Langkah 1: Cek File yang Anda Ubah**
Ketik perintah ini untuk melihat daftar file yang Anda modifikasi:
```powershell
git status
```

#### **Langkah 2: Simpan Perubahan ke Git Lokal (Commit)**
Kumpulkan file yang diubah dan buat catatan commit yang jelas:
```powershell
git add .
git commit -m "fitur: memperbarui grafik laporan pada dashboard"
```

#### **Langkah 3: Kirim ke GitHub (Push)**
Kirim perubahan Anda ke repositori online agar dapat diambil oleh tim:
```powershell
git push origin main
```

#### **Langkah 4: Kabari Tim Anda**
Kirim pesan singkat di grup chat tim: 
> *"Halo tim, saya sudah push update grafik dashboard terbaru ke branch `main`. Silakan lakukan `git pull` sebelum lanjut bekerja!"*
