# Panduan Setup & Kolaborasi Tim (Untuk Frontend Developer & ML Engineer)

Dokumen ini berisi panduan langkah-demi-langkah bagi **Orang 2 (Frontend Developer)** dan **Orang 3 (ML Engineer)** untuk mengunduh proyek dari GitHub, menjalankan Docker, serta menyinkronkan kode program dalam kolaborasi tim.

---

## 📋 Bagian 1: Persiapan Alat di Laptop Masing-Masing

Sebelum memulai, pastikan perangkat lunak berikut sudah terinstal di laptop Anda:
1.  **Git:** [Unduh & Instal Git](https://git-scm.com/)
2.  **Docker Desktop:** [Unduh & Instal Docker Desktop](https://www.docker.com/products/docker-desktop/) (Pastikan Docker Desktop sudah aktif/Running sebelum melangkah ke bagian berikutnya).
3.  **Code Editor:** Gunakan VS Code atau Antigravity IDE.

```NOTE

Catatan untuk Pengguna macOS (Macbook):

Tidak memerlukan install Git. Cukup instal Docker Desktop untuk Mac.
Pilih tipe installer Docker yang sesuai dengan prosesor Mac Anda: Apple Silicon (Chip M1/M2/M3) atau Intel Chip.
Jalankan semua perintah terminal menggunakan aplikasi Terminal bawaan Mac atau VS Code Terminal.
```

---

## 🚀 Bagian 2: Langkah Setup Awal (Pertama Kali)

Ikuti langkah-langkah di bawah ini untuk mengambil proyek dan menjalankannya untuk pertama kali:

### Langkah 1: Clone Repositori dari GitHub
Buka Terminal (atau PowerShell) Anda, masuk ke folder tempat biasa Anda menyimpan proyek (misal: `D:\Projects`), lalu jalankan perintah:
```powershell
git clone https://github.com/Rinfesyah/Power_meter_reading_Bion.git
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

---

## 🌿 Bagian 4: Simulasi Membuat Branch Baru & Melakukan Merge ke Main

Untuk menjaga kestabilan kode di branch `main`, sangat disarankan agar setiap fitur/perbaikan baru dibuat di branch terpisah (*feature branch*) terlebih dahulu sebelum digabungkan ke `main`. 

Berikut adalah simulasi langkah-demi-langkah bagi tim:

### Langkah 1: Pastikan Branch `main` Lokal Terupdate
Sebelum membuat branch baru, pastikan Anda berada di `main` dan menarik update terbaru:
```powershell
git checkout main
git pull origin main
```

### Langkah 2: Buat & Berpindah ke Branch Baru
Buat branch baru dengan nama yang deskriptif terkait fitur yang dikerjakan (contoh: `fitur-tabel-laporan` atau `perbaikan-ocr-analog`):
```powershell
# Format: git checkout -b <nama-branch-baru>
git checkout -b fitur-tabel-laporan
```
*(Catatan: Parameter `-b` digunakan untuk membuat branch baru sekaligus berpindah ke dalamnya).*

### Langkah 3: Bekerja & Commit Perubahan pada Branch Baru
Lakukan modifikasi kode Anda di editor seperti biasa. Setelah selesai, lakukan commit di branch baru tersebut:
```powershell
git add .
git commit -m "fitur: menambahkan filter tanggal pada tabel laporan"
```

### Langkah 4: Push Branch Baru ke GitHub
Kirim branch baru Anda ke GitHub agar tim lain dapat melihat atau mereview-nya:
```powershell
# Format: git push origin <nama-branch-baru>
git push origin fitur-tabel-laporan
```

### Langkah 5: Menggabungkan (Merge) Branch ke `main`
Setelah fitur selesai diuji dan siap digabungkan ke branch utama (`main`), pilih salah satu metode di bawah ini:

#### **Metode A: Melalui Pull Request di GitHub (Sangat Direkomendasikan)**
1. Buka halaman repositori Anda di GitHub: [GitHub Workplace_IDP](https://github.com/Rinfesyah/Workplace_IDP)
2. Anda akan melihat tombol kuning berbunyi **"Compare & pull request"** untuk branch yang baru saja di-push. Klik tombol tersebut.
3. Tulis deskripsi perubahan Anda dan klik **"Create pull request"**.
4. Diskusikan dengan tim/lakukan review, lalu klik **"Merge pull request"** di GitHub jika sudah disetujui.
5. Setelah di-merge di GitHub, tim lain (dan Anda sendiri) cukup melakukan `git pull origin main` di branch `main` lokal masing-masing untuk mengambil perubahan tersebut.

#### **Metode B: Melalui Merge Lokal di Komputer Anda**
Jika ingin melakukan penggabungan sendiri secara lokal di komputer sebelum di-push ke GitHub:
```powershell
# 1. Berpindah kembali ke branch main
git checkout main

# 2. Pastikan main lokal Anda tetap yang paling baru
git pull origin main

# 3. Gabungkan branch fitur ke dalam main
git merge fitur-tabel-laporan

# 4. Kirim hasil penggabungan ke GitHub
git push origin main

# 5. Hapus branch fitur lokal yang sudah tidak digunakan (opsional)
git branch -d fitur-tabel-laporan
```
