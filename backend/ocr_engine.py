import cv2
import numpy as np
import pytesseract
import re
import json
import os
from typing import Dict, List, Tuple

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False

# --- CONFIGURATION ---
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DB_PATH = os.path.abspath(os.path.join(BACKEND_DIR, "..", "..", "database"))
MEMORY_PATH = os.path.join(BASE_DB_PATH, "memory.json")
MODELS_DIR = os.path.join(BACKEND_DIR, "models")
TESSDATA_DIR = os.path.join(MODELS_DIR, "tessdata")
YOLO_TEXT_MODEL = os.path.join(MODELS_DIR, "yolo_text_detect.pt")
YOLO_DEVICE_MODEL = os.path.join(MODELS_DIR, "yolo_device_detect.pt")

# Tesseract setup
if os.name == 'nt':
    _tess_exe = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
    if os.path.exists(_tess_exe):
        pytesseract.pytesseract.tesseract_cmd = _tess_exe

# TESSDATA_PREFIX env var (avoids Windows path-with-spaces bug)
_custom_eng = os.path.join(TESSDATA_DIR, "eng.traineddata")
if os.path.exists(_custom_eng):
    os.environ['TESSDATA_PREFIX'] = TESSDATA_DIR
    _TESS_LANG = '-l eng'
else:
    _TESS_LANG = ''

def _cfg(psm: int) -> str:
    return f'{_TESS_LANG} --psm {psm}'.strip()


# --- MEMORY ---

def load_memory() -> dict:
    if not os.path.exists(MEMORY_PATH):
        return {}
    try:
        with open(MEMORY_PATH, 'r') as f:
            return json.load(f)
    except Exception:
        return {}

def save_memory(mem: dict):
    os.makedirs(os.path.dirname(MEMORY_PATH), exist_ok=True)
    with open(MEMORY_PATH, 'w') as f:
        json.dump(mem, f, indent=2)

def learn_correction(panel_name: str, corrected_data: dict, raw_text_list: list) -> bool:
    memory = load_memory()
    if panel_name not in memory:
        memory[panel_name] = {}
    learned = False
    for key, value in corrected_data.items():
        if value is None or value == "":
            continue
        target_val = str(value)
        for i, text in enumerate(raw_text_list):
            if target_val in text:
                memory[panel_name][key] = i
                learned = True
                break
    if learned:
        save_memory(memory)
    return learned


# --- IMAGE PROCESSING ---

def deskew(img):
    """Automatic rotation correction using Hough Lines."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=80,
                            minLineLength=50, maxLineGap=10)
    angles = []
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            if -45 < angle < 45:
                angles.append(angle)
    if angles:
        median_angle = np.median(angles)
        if 0.5 < abs(median_angle) < 30.0:
            (h, w) = img.shape[:2]
            M = cv2.getRotationMatrix2D((w // 2, h // 2), median_angle, 1.0)
            img = cv2.warpAffine(img, M, (w, h),
                                 flags=cv2.INTER_CUBIC,
                                 borderMode=cv2.BORDER_REPLICATE)
    return img


def preprocess_crop(crop_img):
    """6-step preprocessing for OCR on a single text crop."""
    gray = cv2.cvtColor(crop_img, cv2.COLOR_BGR2GRAY) if len(crop_img.shape) == 3 else crop_img
    h, w = gray.shape
    if h > 0:
        scale = 70.0 / h
        resized = cv2.resize(gray, (max(1, int(w * scale)), 70),
                             interpolation=cv2.INTER_LANCZOS4)
    else:
        resized = gray
    _, thresh = cv2.threshold(resized, 0, 255,
                              cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if np.sum(thresh == 0) > np.sum(thresh == 255):
        thresh = cv2.bitwise_not(thresh)
    kernel = np.ones((2, 2), np.uint8)
    dilated = cv2.erode(thresh, kernel, iterations=1)
    padded = cv2.copyMakeBorder(dilated, 20, 20, 50, 50,
                                cv2.BORDER_CONSTANT, value=255)
    return padded


# --- LABELED PAIR EXTRACTION ---

def _parse_labeled_pairs(lines: List[str]) -> List[Tuple[str, float, str]]:
    """
    Parse OCR text lines to extract (label, value, unit) triples.
    
    Handles Schneider PowerLogic display format:
      Vavg  237.02  V
      Iavg   10.81  A
      Ptot   6.41641 kW
      E Del 177.76  MWh
    """
    NUMBER_RE = re.compile(r'(\d+[\.,]?\d*)')
    pairs = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        nums = list(NUMBER_RE.finditer(line))
        if not nums:
            continue

        m = nums[0]
        try:
            val = float(m.group(1).replace(',', '.'))
        except ValueError:
            continue

        label_part = line[:m.start()].strip()
        unit_part = line[m.end():].strip()

        # Clean label
        label_part = re.sub(r'^[\[\(\{"\'\s]+', '', label_part).strip()
        if not label_part:
            continue

        # Extract first word as unit
        unit_part = unit_part.split()[0] if unit_part.split() else ''
        unit_part = unit_part if re.match(r'^[A-Za-z%°]{1,5}$', unit_part) else ''

        pairs.append((label_part, val, unit_part))

    return pairs


def _match_param(param_name: str, label: str) -> bool:
    """
    Check if a panel parameter name matches an OCR-extracted label.
    Includes synonym mapping based on Schneider PowerLogic patterns.
    """
    pn = re.sub(r'[^a-z0-9 ]', ' ', param_name.lower()).strip()
    lb = re.sub(r'[^a-z0-9 ]', ' ', label.lower()).strip()

    # Skip very short labels unless they are specific known single-char labels
    if len(lb) < 2 and lb not in ['v', 'i', 'p']:
        return False

    # Synonym Mapping
    synonyms = {
        "vavg": ["v", "v ave", "volt", "voltage", "l.avg", "l avg", "lavg", "v.avg", "ligwg", "lvavg"],
        "iavg": ["i", "i ave", "amp", "ampere", "current", "1.avg", "1 avg", "iavg", "iawvg", "iawg", "ia v g"],
        "ptot": ["p", "p tot", "pwr", "power", "kw", "ftot", "f tot", "ptot", "ptat"],
        "e del": ["e", "del", "energy", "mwh", "edel", "e del"]
    }



    # Check if label is a synonym for any part of the parameter name
    for key, syns in synonyms.items():
        if key in pn:
            if lb == key or lb in syns:
                return True

    # Direct substring match
    if lb in pn or pn in lb:
        return True

    # Word overlap
    pn_words = {w for w in pn.split() if len(w) >= 2}
    lb_words = {w for w in lb.split() if len(w) >= 2}
    if pn_words & lb_words:
        return True

    return False


# ============================================================
# MAIN PIPELINE
# Correct workflow:
#   1. Receive raw image
#   2. YOLO Device Detect → Crop to meter display
#   3. Deskew the cropped display
#   4. YOLO Text Detect on display → Bounding boxes
#   5. Preprocess each box → Tesseract OCR
#   6. Fallback: full-display OCR if few boxes found
#   7. Parse labeled pairs → Match to panel params
# ============================================================

def process_image(image_path: str, panel_name: str = "Unknown",
                  panel_params: list = None) -> dict:
    """
    Multi-stage OCR pipeline:
    1. YOLO detect meter display → crop
    2. Deskew cropped display
    3. YOLO detect text regions → bounding boxes
    4. Preprocess + OCR each box
    5. Full-display fallback OCR
    6. Parse label-value-unit pairs
    7. Match against panel parameters
    """
    try:
        img = cv2.imread(image_path)
        if img is None:
            return {"error": "Could not read image",
                    "readings": {}, "raw_text": [], "labeled_pairs": []}

        print(f"[OCR] Processing: {image_path}")
        print(f"[OCR] Image size: {img.shape[1]}x{img.shape[0]}")
        print(f"[OCR] Panel params: {panel_params}")

        # ── Step 1: YOLO Device Detection → Crop to meter display ──
        display_img = img
        device_detected = False
        h_orig, w_orig = img.shape[:2]

        if YOLO_AVAILABLE and os.path.exists(YOLO_DEVICE_MODEL):
            try:
                model = YOLO(YOLO_DEVICE_MODEL)
                # Lowered confidence threshold to 0.01 as requested
                results = model(img, verbose=False, conf=0.01)
                
                best_conf, best_box = 0, None
                for r in results:
                    for box in r.boxes:
                        conf = float(box.conf[0])
                        if conf > best_conf:
                            best_conf = conf
                            best_box = [int(v) for v in box.xyxy[0].tolist()]

                if best_box:
                    x1, y1, x2, y2 = best_box
                    pad_w = int((x2 - x1) * 0.05)
                    pad_h = int((y2 - y1) * 0.05)
                    
                    crop = img[max(0, y1-pad_h):min(h_orig, y2+pad_h), 
                               max(0, x1-pad_w):min(w_orig, x2+pad_w)]
                    
                    if crop.size > 0:
                        display_img = crop
                        device_detected = True
                        print(f"[OCR] ✓ YOLO detected unit (conf={best_conf:.4f})")
            except Exception as e:
                print(f"[OCR] YOLO Error: {e}")


        # ── Step 1.5: OpenCV Fallback (Jika YOLO gagal) ──
        if not device_detected:
            print("[OCR] ⚠ YOLO failed. Trying OpenCV LCD detection fallback...")
            try:
                # Cari area kotak terang (LCD) di tengah-bawah gambar
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                blur = cv2.GaussianBlur(gray, (7, 7), 0)
                # Threshold tinggi untuk mencari LCD yang biasanya terang
                _, thresh = cv2.threshold(blur, 180, 255, cv2.THRESH_BINARY)
                
                contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                
                best_rect = None
                max_area = 0
                
                for cnt in contours:
                    area = cv2.contourArea(cnt)
                    # LCD meteran biasanya berukuran 5% - 40% dari total gambar
                    if (h_orig * w_orig * 0.03) < area < (h_orig * w_orig * 0.5):
                        peri = cv2.arcLength(cnt, True)
                        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
                        
                        # Cari bentuk segi empat
                        if len(approx) >= 4:
                            x, y, w, h = cv2.boundingRect(approx)
                            # Pastikan posisinya tidak di paling atas (abaikan label panel)
                            if y > h_orig * 0.15:
                                if area > max_area:
                                    max_area = area
                                    best_rect = (x, y, w, h)
                
                if best_rect:
                    x, y, w, h = best_rect
                    # Beri padding ekstra untuk label parameter di samping angka
                    display_img = img[max(0, y-20):min(h_orig, y+h+20), 
                                      max(0, x-50):min(w_orig, x+w+50)]
                    device_detected = True
                    print(f"[OCR] ✓ OpenCV fallback detected LCD area at y={y}")
                else:
                    # Fallback terakhir: Potong 25% atas (biasanya label panel ada di sana)
                    print("[OCR] ⚠ No LCD found. Cropping top 25% to avoid panel labels.")
                    display_img = img[int(h_orig*0.25):, :]
            except Exception as e:
                print(f"[OCR] Fallback error: {e}")


        # ── Step 2: Deskew the display crop ──
        display_img = deskew(display_img)
        print("[OCR] ✓ Deskew applied")

        # ── Step 3: YOLO Text Detection on display ──
        boxes_found = []
        if YOLO_AVAILABLE and os.path.exists(YOLO_TEXT_MODEL):
            try:
                model = YOLO(YOLO_TEXT_MODEL)
                # Set confidence threshold to 0.5 specifically for text detection
                results = model(display_img, verbose=False, conf=0.5)
                for r in results:
                    for box in r.boxes:
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        conf = float(box.conf[0])
                        if conf > 0.5:
                            boxes_found.append({
                                'left': int(x1), 'top': int(y1),
                                'width': int(x2-x1), 'height': int(y2-y1),
                                'conf': conf
                            })
                print(f"[OCR] ✓ Text detection: {len(boxes_found)} boxes found (conf > 0.5)")
            except Exception as e:
                print(f"[OCR] YOLO Text error: {e}")


        else:
            print("[OCR] YOLO text model not available")

        # ── Step 4: Deduplicate & Sort Bounding Boxes ──
        # Manual NMS to remove overlapping boxes (e.g. Box[0] and Box[1] same area)
        def get_iou(box1, box2):
            x1 = max(box1['left'], box2['left'])
            y1 = max(box1['top'], box2['top'])
            x2 = min(box1['left'] + box1['width'], box2['left'] + box2['width'])
            y2 = min(box1['top'] + box1['height'], box2['top'] + box2['height'])
            intersection = max(0, x2 - x1) * max(0, y2 - y1)
            area1 = box1['width'] * box1['height']
            area2 = box2['width'] * box2['height']
            return intersection / float(area1 + area2 - intersection)

        unique_boxes = []
        if boxes_found:
            # Sort by confidence descending to keep the best one
            boxes_found.sort(key=lambda x: x['conf'], reverse=True)
            for box in boxes_found:
                is_duplicate = False
                for u_box in unique_boxes:
                    if get_iou(box, u_box) > 0.4: # Overlap > 40% = same object
                        is_duplicate = True
                        break
                if not is_duplicate:
                    unique_boxes.append(box)
        
        # Now sort top-to-bottom for processing
        unique_boxes.sort(key=lambda b: b['top'])

        # ── Step 5: OCR each unique box & Organize into Rows ──
        rows: List[List[dict]] = [] 
        all_raw_texts = []
        img_h, img_w = display_img.shape[:2]

        for i, box in enumerate(unique_boxes):

            x, y, w, h = box['left'], box['top'], box['width'], box['height']
            if w <= 0 or h <= 0: continue
            crop = display_img[max(0,y):min(img_h,y+h), max(0,x):min(img_w,x+w)]
            if crop.size == 0: continue
            
            processed = preprocess_crop(crop)
            try:
                # Use --psm 7 for single line/word crops
                text = pytesseract.image_to_string(processed, config=_cfg(7)).strip()
                if text:
                    # Raw numeric cleaning
                    num_match = re.search(r"(\d+[\.,]\d+)", text)
                    clean_text = num_match.group(1).replace(',', '.') if num_match else text
                    
                    item = {'text': clean_text, 'orig_text': text, 'box': box}
                    all_raw_texts.append(clean_text)
                    print(f"[OCR]   Box[{i}] conf={box['conf']:.2f}: '{clean_text}'")

                    # Add to rows (Dynamic tolerance: 50% of average box height)
                    found_row = False
                    row_tolerance = max(15, h * 0.5) 
                    for row in rows:
                        # Compare with center Y to be more accurate
                        row_center_y = row[0]['box']['top'] + row[0]['box']['height'] / 2
                        current_center_y = y + h / 2
                        if abs(row_center_y - current_center_y) < row_tolerance:
                            row.append(item)
                            row.sort(key=lambda r: r['box']['left'])
                            found_row = True
                            break
                    if not found_row:
                        rows.append([item])
            except Exception as e:
                print(f"[OCR]   Box[{i}] OCR error: {e}")

        # ── Step 6: Full-display OCR fallback ──
        print("[OCR] Running full-display OCR fallback...")
        try:
            full_text = pytesseract.image_to_string(display_img, config=_cfg(6)).strip()
            full_lines = [l.strip() for l in full_text.split('\n') if l.strip()]
        except Exception:
            full_lines = []

        # ── Step 7: Parse labeled pairs & Match panel parameters ──
        readings: Dict[str, float] = {}
        
        # Strategy A: Row-based Anchor (Label at left, Value at right)
        for row in rows:
            # Debug row content
            row_texts = [r['text'] for r in row]
            print(f"[OCR]   Processing Row: {row_texts}")
            
            for i, item in enumerate(row):
                # Search for a numeric value to the right of this item
                potential_val = None
                for j in range(i + 1, len(row)):
                    try:
                        # Cek apakah teks mengandung angka
                        val_str = row[j]['text']
                        m = re.search(r"(\d+\.?\d*)", val_str)
                        if m:
                            potential_val = float(m.group(1))
                            break
                    except: continue
                
                if potential_val is not None:
                    # Match label text to parameters
                    for param in (panel_params or []):
                        if _match_param(param, item['orig_text']):
                            if param not in readings:
                                readings[param] = potential_val
                                print(f"[OCR]   Spatial Match: '{param}' ← '{item['orig_text']}' matched to right-val {potential_val}")

        # Strategy B: Smart Memory (Line Index) as fallback
        memory = load_memory()
        relevant_memory = memory.get(panel_name) or memory.get("Schneider_Default")
        
        if relevant_memory:
            for param, idx in relevant_memory.items():
                if param not in readings and idx < len(all_raw_texts):
                    val_str = all_raw_texts[idx]
                    try:
                        m = re.search(r"(\d+\.?\d*)", val_str)
                        if m:
                            # Hanya gunakan memory jika hasil spasial kosong
                            readings[param] = float(m.group(1))
                            print(f"[OCR]   Memory Match: '{param}' ← Box[{idx}] = {readings[param]}")
                    except: pass


        # Strategy C: Full Text Parsing (Last Resort)
        labeled_pairs_raw = _parse_labeled_pairs(full_lines if full_lines else all_raw_texts)
        if panel_params:
            for param in panel_params:
                if param not in readings:
                    for lbl, val, unit in labeled_pairs_raw:
                        if _match_param(param, lbl):
                            readings[param] = val
                            print(f"[OCR]   Label Match: '{param}' ← '{lbl}' = {val}")
                            break

        print(f"[OCR] ✓ Final readings: {readings}")
        return {
            "detected_type": "Spatial OCR Pipeline",
            "device_detected": device_detected,
            "readings": readings,
            "raw_text": all_raw_texts,
            "rows_debug": [[r['text'] for r in row] for row in rows],
            "confidence": 0.98 if len(readings) >= 2 else 0.40
        }



    except Exception as e:
        import traceback
        print(f"[OCR] FATAL ERROR: {e}")
        traceback.print_exc()
        return {"error": str(e), "readings": {},
                "raw_text": [], "labeled_pairs": []}
