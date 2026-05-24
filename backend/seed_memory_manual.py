import json
import os

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MEMORY_PATH = os.path.abspath(os.path.join(BACKEND_DIR, "..", "..", "database", "memory.json"))

def manual_seed():
    # Berdasarkan data backup yang Anda berikan, 
    # urutan teks yang sering muncul adalah:
    # [Angka1, Angka2, Angka3, Angka4, Label1, Label2, Label3, Label4, Unit1, Unit2, Unit3, Unit4]
    # Atau variasi lainnya.
    
    # Namun, skema 'Smart Memory' saat ini adalah memetakan NAMA PARAMETER ke INDEKS baris OCR.
    # Jika Tesseract membaca full display, biasanya urutannya:
    # Vavg
    # 230.55
    # Iavg
    # 10.86
    # ...
    
    # Kita akan set memory untuk mengenali indeks angka berdasarkan label
    # Di Schneider PowerLogic, nilai biasanya ada di SEBELAH KANAN atau DI BAWAH label.
    
    # Mapping default untuk Smart Memory (indeks baris di raw_text)
    # Ini akan di-override otomatis saat user melakukan verifikasi manual (Learning).
    smart_pattern = {
        "Vavg (V)": 0,    # Asumsi baris ke-0 adalah angka pertama
        "Iavg (A)": 1,    # Baris ke-1 angka kedua
        "Ptot (kW)": 2,   # Baris ke-2 angka ketiga
        "E Del (MWh)": 3  # Baris ke-3 angka keempat
    }
    
    memory = {}
    panel_names = ["Schneider_Default", "PAC.A", "UPS 1", "UPS 2", "MDP", "Unknown"]
    for name in panel_names:
        memory[name] = smart_pattern

    os.makedirs(os.path.dirname(MEMORY_PATH), exist_ok=True)
    with open(MEMORY_PATH, 'w') as f:
        json.dump(memory, f, indent=2)

    print(f"Smart Memory Manually Seeded to {MEMORY_PATH}")

if __name__ == "__main__":
    manual_seed()
