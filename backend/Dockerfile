# Gunakan image Python slim sebagai base image untuk ukuran file yang efisien
FROM python:3.10-slim

# Set environment variables agar output Python langsung ditampilkan di console (tidak buffer)
ENV PYTHONUNBUFFERED=1

# Tentukan direktori kerja di dalam container
WORKDIR /app

# Instal dependensi sistem yang dibutuhkan oleh OpenCV dan Tesseract OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Salin requirements.txt terlebih dahulu agar bisa memanfaatkan Docker cache
COPY requirements.txt .

# Instal dependensi Python
RUN pip install --no-cache-dir -r requirements.txt

# Salin seluruh kode backend ke dalam container
COPY . .

# Buat folder uploads jika belum ada
RUN mkdir -p uploads

# Tentukan port yang akan digunakan oleh container
EXPOSE 8000

# Jalankan server FastAPI dengan Uvicorn
CMD ["python", "main.py"]
