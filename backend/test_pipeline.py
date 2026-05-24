"""Test the fixed OCR pipeline with correct workflow."""
from ocr_engine import process_image
import json, glob
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FOTO_DIR = os.path.abspath(os.path.join(BACKEND_DIR, "..", "..", "database", "foto"))
images = glob.glob(f"{DB_FOTO_DIR}/**/*.jpg", recursive=True)
print(f"Found {len(images)} images\n")

if images:
    latest = sorted(images)[-1]
    print(f"Testing: {latest}\n")
    
    # Simulate real usage: pass panel parameters
    result = process_image(
        latest, 
        "PAC.A",
        panel_params=["Vavg (V)", "Iavg (A)", "Ptot (kW)", "E Del (MWh)"]
    )
    
    print(f"\n{'='*60}")
    print(f"RESULTS:")
    print(f"  Device detected: {result.get('device_detected')}")
    print(f"  Labeled pairs: {json.dumps(result.get('labeled_pairs', []), indent=4)}")
    print(f"  Readings: {json.dumps(result.get('readings', {}), indent=4)}")
    print(f"  Confidence: {result.get('confidence')}")
