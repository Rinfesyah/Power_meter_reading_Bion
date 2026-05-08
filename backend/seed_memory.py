import json
import os

BACKUP_FILE = "d:/Program/Workplace pertama/dc-ops-ocr/backend/power_meter_backup_full_1778169636776.json"
MEMORY_PATH = "D:/Program/IDP/database/memory.json"

def seed_smart_memory():
    with open(BACKUP_FILE, 'r') as f:
        data = json.load(f)

    dataset = data.get("ocr_dataset", [])
    
    # Kelompokkan berdasarkan ID foto (prefix timestamp)
    photos = {}
    for entry in dataset:
        pid = entry.get("id", "").split('-')[0]
        if pid not in photos: photos[pid] = []
        photos[pid].append(entry)

    # Kita akan mencari urutan baris hasil OCR yang dihasilkan Tesseract nanti
    # Biasanya Tesseract membaca dari atas ke bawah.
    
    mapping_stats = {} # {label: [list of relative indices]}

    for pid, entries in photos.items():
        # Sortir semua box dalam satu foto dari atas ke bawah
        entries.sort(key=lambda e: (e.get("crop") or {}).get("y", 0))
        
        texts = [e.get("raw_ocr_text", "").strip() for e in entries]
        
        for i, txt in enumerate(texts):
            clean = txt.lower().replace(".", "").replace(" ", "")
            
            label_key = None
            if "vavg" in clean: label_key = "Vavg (V)"
            elif "iavg" in clean: label_key = "Iavg (A)"
            elif "ptot" in clean: label_key = "Ptot (kW)"
            elif "edel" in clean: label_key = "E Del (MWh)"
            
            if label_key:
                # Cari angka terdekat dalam daftar teks yang sudah disortir Y
                # Kita cari di rentang -2 sampai +2 dari posisi label
                for j in range(max(0, i-2), min(len(texts), i+3)):
                    val_txt = texts[j]
                    # Jika mengandung angka dan bukan label itu sendiri
                    if any(c.isdigit() for c in val_txt) and j != i:
                        if label_key not in mapping_stats: mapping_stats[label_key] = []
                        mapping_stats[label_key].append(j)
                        break

    # Hitung modus (indeks paling sering muncul)
    final_mapping = {}
    for label, indices in mapping_stats.items():
        if indices:
            final_mapping[label] = max(set(indices), key=indices.count)

    # Simpan ke memory.json
    os.makedirs(os.path.dirname(MEMORY_PATH), exist_ok=True)
    existing = {}
    if os.path.exists(MEMORY_PATH):
        try:
            with open(MEMORY_PATH, 'r') as f: existing = json.load(f)
        except: pass
    
    for panel in ["Schneider_Default", "PAC.A", "UPS 1", "UPS 2", "MDP", "Unknown"]:
        existing[panel] = final_mapping

    with open(MEMORY_PATH, 'w') as f:
        json.dump(existing, f, indent=2)

    print("SUCCESS: Smart Memory seeded from box-level backup.")
    print("Detected Index Pattern:", final_mapping)

if __name__ == "__main__":
    seed_smart_memory()
