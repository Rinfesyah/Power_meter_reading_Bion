# 🏛️ Arsitektur Sistem: DC-Ops Power Meter OCR System

Dokumen ini mendokumentasikan arsitektur teknis menyeluruh, topologi komponen, alur data, skema basis data relasional, dan *pipeline* kecerdasan buatan (*Computer Vision & OCR*) pada sistem **Power Meter Reading (DC-Ops OCR)**.

---

## 📌 1. Gambaran Umum & Topologi Sistem (High-Level Architecture)

Sistem ini dirancang menggunakan arsitektur **Decoupled Modular Client-Server** dengan pemrosesan beban berat (*heavy computation*) secara asinkron (*asynchronous worker thread*) dan sinkronisasi status secara *real-time* via **Server-Sent Events (SSE)**.

```mermaid
flowchart TB
    subgraph Clients ["📱 Client Layer"]
        Mobile["Frontend Mobile (Operator Field)<br/>React 18 + Vite + Lucide<br/>Port 3001"]
        Dashboard["Frontend Dashboard (Manager Web)<br/>React 18 + Vite + Recharts<br/>Port 3000"]
    end

    subgraph BackendLayer ["⚙️ Backend & API Gateway (FastAPI)"]
        API["FastAPI REST Endpoints<br/>Port 8000"]
        SSE["SSE Broadcaster<br/>(/api/events/stream)"]
        Queue["FIFO Processing Queue<br/>(In-Memory Thread-Safe Queue)"]
        Worker["Background OCR Worker Thread<br/>(Continuous Loop)"]
    end

    subgraph AIEngine ["🧠 AI / Computer Vision Engine"]
        YoloDev["YOLOv8 Device Detection<br/>(LCD Bounding Box)"]
        CVPre["OpenCV Preprocessing<br/>(Deskew, CLAHE, Otsu Binarization)"]
        YoloText["YOLOv8 Text Detection<br/>(Line Regions)"]
        Tesseract["Tesseract OCR Engine<br/>(UB-Mannheim Engine)"]
        SpatialMatcher["Spatial & Heuristic Matcher<br/>+ Self-Correction Memory"]
    end

    subgraph DataLayer ["💾 Persistence & Storage Layer"]
        PG[(PostgreSQL Database<br/>Port 5432 / power_meter_db)]
        JSONFallback[("JSON Local Storage Fallback<br/>(panels.json, readings.json, memory.json)")]
        FileStore["Local File Storage<br/>(/database/foto/YYYY-MM-DD - Shift X/)"]
    end

    %% Client Interactions
    Mobile -->|"1. POST /api/ocr (Multipart Form: Image + Metadata)"| API
    Dashboard -->|"GET /api/readings, GET /api/equipments"| API
    Dashboard -->|"PUT /api/readings/{id} (Manual Verify / Edit)"| API
    API -->|"Event Push (ocr_complete, ocr_update)"| SSE
    SSE -.->|"Real-Time Push Stream"| Dashboard
    SSE -.->|"Real-Time Push Stream"| Mobile

    %% Backend Internals
    API -->|"2. Save Image File"| FileStore
    API -->|"3. Insert Log (Status: PENDING)"| PG
    API -->|"Fallback jika DB Offline"| JSONFallback
    API -->|"4. Enqueue Job"| Queue
    Queue -->|"5. Dequeue Job"| Worker

    %% Worker to AI Engine
    Worker -->|"6. Run Pipeline"| YoloDev
    YoloDev --> CVPre
    CVPre --> YoloText
    YoloText --> Tesseract
    Tesseract --> SpatialMatcher

    %% AI to DB
    SpatialMatcher -->|"7. Update Log & Detail Values (COMPLETED)"| PG
    SpatialMatcher -->|"Update JSON Fallback"| JSONFallback
    SpatialMatcher -->|"8. Trigger Broadcast"| SSE
```

---

## 🔄 2. Siklus Hidup & Alur Data (End-to-End Data Flow)

Siklus hidup pemrosesan data terdiri dari 5 tahapan terpadu:

```mermaid
sequenceDiagram
    autonumber
    actor Op as Operator Lapangan
    participant Mob as Frontend Mobile (3001)
    participant API as FastAPI Backend (8000)
    participant Q as Worker Queue
    participant AI as OCR Engine (OpenCV/YOLO/Tesseract)
    participant DB as PostgreSQL / JSON
    participant SSE as SSE Stream Channel
    participant Dash as Web Dashboard (3000)

    Op->>Mob: Foto panel meter listrik & pilih shift
    Mob->>API: POST /api/ocr (file, panel_name, operator, shift, hour)
    API->>API: Simpan foto fisik ke direktori terstruktur
    API->>DB: Simpan header transaksi (Status: PENDING)
    API->>Q: Masukkan job ke antrean FIFO
    API-->>Mob: Respons cepat 200 OK (Job Enqueued)
    API->>SSE: Broadcast "new_reading_pending"
    SSE-->>Dash: Notifikasi realtime entri baru masuk

    loop Worker Thread
        Q->>AI: Ambil antrean & eksekusi process_image()
        AI->>AI: 1. Crop LCD (YOLO/Heuristik)
        AI->>AI: 2. Deskewing (Rotasi otomatis)
        AI->>AI: 3. Deteksi baris angka & OCR Tesseract
        AI->>AI: 4. Spatial Matching nilai vs nama parameter
        AI->>DB: Simpan nilai OCR per parameter (Status: COMPLETED)
        AI->>SSE: Broadcast "ocr_completed"
        SSE-->>Dash: Update tabel realtime & hilangkan badge loading
    end

    opt Jika Ada Koreksi Manual oleh Manager
        Dash->>API: PUT /api/readings/{id} (Koreksi nilai & Verifikasi)
        API->>DB: Update verified_value & flag is_edited=True
        API->>AI: learn_correction() (Simpan memori indeks baris)
        API->>SSE: Broadcast "reading_verified"
    end
```

---

## 🗄️ 3. Skema Basis Data Relasional (Database Architecture)

Sistem menggunakan **PostgreSQL 16** (dikelola via SQLAlchemy ORM) dengan model ternormalisasi pihak ketiga (*3rd Normal Form*), dilengkapi mekanisme *fallback* ke berkas JSON lokal jika koneksi database sedang tidak aktif.

### 3.1 Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    master_equipments ||--o{ equipment_parameters : has
    master_parameters ||--o{ equipment_parameters : configured_in
    master_equipments ||--o{ log_headers : inspected
    users ||--o{ log_headers : records
    master_shifts ||--o{ log_headers : assigned_to
    log_headers ||--|{ log_details : contains
    master_parameters ||--o{ log_details : measures

    master_equipments {
        int id PK
        string equipment_code UK "Kode unik (cth: PNL-001)"
        string name "Nama panel (cth: PowerLogic PM5350)"
        string location "Lokasi ruangan/data hall"
        string category "Digital / Analog"
        boolean status_active
        timestamp created_at
    }

    master_parameters {
        int id PK
        string parameter_name UK "Nama metrik (cth: Vavg, Iavg, kWh)"
        string unit "Satuan (V, A, kW, kWh, Hz)"
        string data_type "DECIMAL / INTEGER / TEXT"
        timestamp created_at
    }

    equipment_parameters {
        int id PK
        int equipment_id FK
        int parameter_id FK
        decimal normal_min_value "Batas ambang bawah aman"
        decimal normal_max_value "Batas ambang atas aman"
        int sort_order "Urutan tampilan di UI"
    }

    users {
        int id PK
        string name "Nama lengkap operator"
        string badge_number UK "NIP / Nomor identitas"
        string role "Technician / Supervisor / Admin"
        timestamp created_at
    }

    master_shifts {
        int id PK
        string shift_name "Shift 1, Shift 2, Shift 3"
        time start_time
        time end_time
    }

    log_headers {
        int id PK
        int user_id FK
        int shift_id FK
        int equipment_id FK
        timestamp inspected_at
        text general_notes
        string status "PENDING, PROCESSING, COMPLETED, FAILED"
        string validation_status "PENDING, VERIFIED, REJECTED"
        string photo_path "Path file foto di disk"
        string ocr_filename
        timestamp created_at
    }

    log_details {
        int id PK
        int log_header_id FK
        int parameter_id FK
        string raw_ocr_value "Hasil pembacaan mentah OCR"
        decimal verified_value "Nilai numerik terverifikasi"
        string value_text
        boolean is_abnormal "True jika di luar batas normal min/max"
        boolean is_edited "True jika diedit manual oleh manusia"
        decimal cer_score "Character Error Rate score"
    }
```

### 3.2 Dual-Persistence Mode (Resilience Architecture)
* **Primary Store:** PostgreSQL (`master_equipments`, `log_headers`, `log_details`, dsb). Digunakan untuk analitik historis, aggregasi laporan, kueri cepat dengan indeks b-tree, dan integrasi antar sistem.
* **Secondary / Fallback Store:** Berkas JSON lokal (`database/panels.json`, `database/readings.json`, `database/memory.json`). Jika PostgreSQL tidak dapat diakses saat *development* mandiri di laptop teknisi, backend secara otomatis beralih (*graceful fallback*) ke berkas JSON sehingga operasional lapangan tidak pernah terhenti.

---

## 🧠 4. Pipeline Computer Vision & AI OCR

Pipeline pengenalan optik dirancang khusus untuk menangani tantangan display digital data center (layar LCD 7-segment / dot matrix dengan pantulan cahaya, sudut miring, dan pencahayaan minim).

```mermaid
flowchart LR
    subgraph S1 ["1. Device Detection"]
        Raw["Foto Mentah"] --> YoloCrop{"Model YOLO<br/>Tersedia?"}
        YoloCrop -->|Ya| YoloBox["Deteksi Box Layar LCD<br/>+ 10% Margin"]
        YoloCrop -->|Tidak| CVContour["Heuristik OpenCV:<br/>Kontur Terang Terbesar /<br/>Top 75% Crop"]
    end

    subgraph S2 ["2. Deskewing & Orientasi"]
        YoloBox --> Hough["Hough Line Transform"]
        CVContour --> Hough
        Hough --> Rotate["Koreksi Sudut Kemiringan<br/>(Rotasi Otomatis)"]
    end

    subgraph S3 ["3. Enhancement & Binarization"]
        Rotate --> Gray["Grayscale Conversion"]
        Gray --> CLAHE["Peningkatan Kontras Dinamis<br/>(CLAHE)"]
        CLAHE --> Scale["Super-scaling 2.0x"]
        Scale --> Otsu["Otsu Threshold Binarization<br/>+ Pixel Morphological Erosion"]
    end

    subgraph S4 ["4. Text Extraction & Matching"]
        Otsu --> Tess["Tesseract OCR Engine<br/>(--psm 6 / digit whitelist)"]
        Tess --> Matcher{"Spatial Matcher"}
        Matcher -->|Garis Sama / Kolom Kanan| Result["Assign Nilai ke Parameter"]
        Matcher -->|Gagal Spasial| Mem["Self-Correction Memory<br/>(Fallback Indeks Baris)"]
        Mem --> Result
    end
```

### Karakteristik Unggulan Pipeline:
1. **Adaptive Self-Correction Memory:**
   * Saat operator atau manajer mengedit nilai OCR yang keliru melalui Dashboard Web, sistem memanggil fungsi `learn_correction()`.
   * Sistem mencatat indeks posisi baris teks tempat nilai yang benar berada, sehingga pada pembacaan berikutnya untuk tipe panel yang sama, AI langsung memprioritaskan baris tersebut.
2. **Character Error Rate (CER) Metric:**
   * Setiap kali verifikasi manual dilakukan, sistem menghitung metrik jarak Levenshtein antara `raw_ocr_value` dan `verified_value` untuk mengukur akurasi model AI secara kuantitatif.

---

## ⚡ 5. Arsitektur Komunikasi Real-Time (Server-Sent Events)

Alih-alih membuat antarmuka frontend melakukan *polling* terus-menerus (yang membebani CPU dan bandwidth), backend mengimplementasikan **Server-Sent Events (SSE)** melalui endpoint `/api/events/stream`.

* **Koneksi:** Frontend membuka 1 koneksi HTTP persistent menggunakan browser `EventSource`.
* **Kanal Siaran (*Broadcast Queue*):** Backend menggunakan `asyncio.Queue` per klien aktif yang dikelola oleh `MAIN_LOOP`.
* **Jenis Event yang Dikirimkan:**
  * `NEW_READING`: Ketika operator mengunggah foto baru.
  * `READING_UPDATED`: Ketika pemrosesan OCR selesai di latar belakang.
  * `READING_DELETED`: Ketika manajer menghapus rekaman pembacaan.
  * `PANEL_UPDATED`: Ketika konfigurasi panel atau parameter diubah.
* **Mekanisme Failover:** Jika koneksi SSE terputus, frontend secara otomatis beralih ke interval *silent polling* setiap 15 detik sampai koneksi SSE tersambung kembali.

---

## 🚢 6. Topologi Deployment & Kontainerisasi

Aplikasi dapat dijalankan dalam 2 mode:

### 1. Mode Kontainerisasi Docker (Rekomendasi Produksi)
Menggunakan `docker-compose.yml` yang mengorkestrasi 4 kontainer terisolasi:
* `dc_ops_postgres` (Port `5432`): Database PostgreSQL 16 Alpine dengan volume persisten `postgres_data`.
* `backend` (Port `8000`): Python 3.10 + OpenCV + Tesseract OCR + FastAPI.
* `frontend-dashboard` (Port `3000`): React Vite Web Server untuk workstation manajer.
* `frontend-mobile` (Port `3001`): React Vite Web Server untuk perangkat genggam operator lapangan.

### 2. Mode Native Windows (Rekomendasi Pengujian Lokal)
* Backend dijalankan langsung menggunakan skrip otomatis [`start_backend.bat`](file:///d:/Program/Power_meter_reading_Bion/start_backend.bat) yang mengisolasi lingkungan via virtual environment Python (`.venv`).
* Frontend dijalankan via `npm run dev` pada Node.js LTS.

---

## 🔒 7. Standar Keamanan & Keandalan Data (Reliability)

1. **Integritas Transaksi:** Penghapusan master equipment menerapkan `ON DELETE CASCADE` untuk parameter dan `ON DELETE SET NULL` untuk histori log agar riwayat audit data operasional masa lalu tidak hilang.
2. **Thread Safety:** Antrean OCR menggunakan modul `queue.Queue` standar Python yang aman terhadap persaingan thread (*thread-safe*), mencegah tabrakan proses saat puluhan operator mengunggah foto bersamaan di pergantian shift.
3. **Penyimpanan Gambar Idempoten:** Foto disimpan dengan penamaan berbasis *timestamp* unik dan folder berjenjang tanggal/shift untuk mencegah penimpaan berkas (*file overwrites*).
