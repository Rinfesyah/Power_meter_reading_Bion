import os
import cv2
import numpy as np
from ocr_engine import process_image

def create_dummy_image(path):
    # Create a white image with some text-like boxes
    img = np.ones((500, 500, 3), dtype=np.uint8) * 255
    cv2.putText(img, "Voltage: 220.5 V", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    cv2.putText(img, "Current: 10.2 A", (50, 200), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    cv2.imwrite(path, img)

def test_pipeline():
    dummy_path = "dummy_meter.jpg"
    create_dummy_image(dummy_path)
    
    print("Testing OCR Pipeline...")
    result = process_image(dummy_path, "Test Panel")
    
    print("\nOCR Result:")
    import json
    print(json.dumps(result, indent=2))
    
    if "error" in result:
        print(f"\nPipeline failed with error: {result['error']}")
    else:
        print("\nPipeline executed successfully (check results above).")
        print("Note: If models (.pt) are missing, it uses Tesseract fallback.")

    if os.path.exists(dummy_path):
        os.remove(dummy_path)

if __name__ == "__main__":
    test_pipeline()
