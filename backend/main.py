from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import shutil
import os
import datetime
import json
import csv
import threading
import queue
import time
from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict
from ocr_engine import process_image, learn_correction

class PanelModel(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    name: str
    location: str
    type: str # "Digital" or "Analog"
    parameters: List[Any] = []  # [{"name": "Vavg", "unit": "V"}, ...] or legacy ["voltage", ...]

class ReadingModel(BaseModel):
    model_config = ConfigDict(extra='allow')
    id: str
    timestamp: float
    imageUrl: str = ""
    panelId: str
    panelName: str
    operatorName: str = "Unknown"
    shift: str = "1"
    hour: str = ""
    ocr_status: str = "PENDING" # PENDING, PROCESSING, COMPLETED, FAILED
    ocrFilename: str = ""
    status: str = "PENDING"
    notes: str = ""

class LearnRequest(BaseModel):
    panel_name: str
    readings: dict
    raw_text: List[str]

app = FastAPI(title="DC-Ops OCR Backend")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Base Paths (Using relative paths for portability)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DB_PATH = os.path.abspath(os.path.join(BACKEND_DIR, "..", "..", "database"))
PHOTO_BASE_PATH = os.path.join(BASE_DB_PATH, "foto")
CSV_PATH = os.path.join(BASE_DB_PATH, "readings.csv")
PANELS_DB_PATH = os.path.join(BASE_DB_PATH, "panels.json")
READINGS_DB_PATH = os.path.join(BASE_DB_PATH, "readings.json")
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
TESSDATA_DIR = os.path.join(MODELS_DIR, "tessdata")
os.makedirs(TESSDATA_DIR, exist_ok=True)

# Ensure base folders exist
os.makedirs(PHOTO_BASE_PATH, exist_ok=True)

# Mount the photo directory to be accessible via HTTP
app.mount("/images", StaticFiles(directory=PHOTO_BASE_PATH), name="images")

# ====== FIFO QUEUE SYSTEM ======
ocr_queue = queue.Queue()

def update_reading_status_by_filename(filename: str, ocr_status: str, ocr_results: dict = None):
    """Update ocr_status in readings.json by matching ocrFilename"""
    try:
        readings = read_readings()
        updated = False
        for r in readings:
            if r.get('ocrFilename') == filename:
                r['ocr_status'] = ocr_status
                if ocr_results and ocr_results.get("readings"):
                    r['ocrReadings'] = ocr_results["readings"]
                    for k, v in ocr_results["readings"].items():
                        r[k] = v
                updated = True
                break
        if updated:
            write_readings(readings)
    except Exception as e:
        print(f"Error updating status: {e}")

def ocr_worker():
    """Background thread that processes the FIFO queue sequentially."""
    print("[WORKER] OCR Worker Thread Started.")
    while True:
        try:
            task = ocr_queue.get()
            if task is None: break
            
            filename = task['filename']
            file_path = task['file_path']
            panel_name = task['panel_name']
            params_list = task['params_list']
            params_defs = task.get('params_defs', [])
            
            # Wait a moment for the mobile app to finish saving the reading record
            time.sleep(2) 
            update_reading_status_by_filename(filename, "PROCESSING")
            
            try:
                ocr_data = process_image(file_path, panel_name, panel_params=params_list)
                
                # Embed params_defs so dashboard can reconstruct units
                if params_defs:
                    ocr_data['params_defs'] = params_defs
                
                json_path = file_path + ".json"
                with open(json_path, 'w') as f:
                    json.dump(ocr_data, f)
                
                update_reading_status_by_filename(filename, "COMPLETED", ocr_results=ocr_data)
                print(f"[WORKER] ✓ Completed OCR for {filename}")
            except Exception as e:
                print(f"[WORKER] ✗ Failed OCR for {filename}: {e}")
                update_reading_status_by_filename(filename, "FAILED")
            
            ocr_queue.task_done()
        except Exception as e:
            print(f"[WORKER] Error: {e}")
            time.sleep(1)

# Start background worker
threading.Thread(target=ocr_worker, daemon=True).start()

# ====== HELPERS ======

def read_panels():
    if not os.path.exists(PANELS_DB_PATH): return []
    try:
        with open(PANELS_DB_PATH, 'r') as f: return json.load(f)
    except: return []

def write_panels(panels):
    with open(PANELS_DB_PATH, 'w') as f: json.dump(panels, f, indent=2)

def read_readings():
    if not os.path.exists(READINGS_DB_PATH): return []
    try:
        with open(READINGS_DB_PATH, 'r') as f: return json.load(f)
    except: return []

def write_readings(readings_list):
    with open(READINGS_DB_PATH, 'w') as f: json.dump(readings_list, f, indent=2)

# ====== API ENDPOINTS ======

@app.get("/api/readings")
def get_readings():
    return read_readings()

@app.post("/api/readings")
def add_reading(reading: ReadingModel):
    readings_list = read_readings()
    readings_list.insert(0, reading.model_dump())
    write_readings(readings_list)
    return {"status": "ok"}

@app.post("/api/ocr")
async def ocr_endpoint(
    request: Request,
    file: UploadFile = File(...),
    panel_name: str = Form(...),
    panel_id: str = Form(...),
    shift: str = Form(...),
    operator: str = Form("Unknown"),
    panel_params: str = Form("")
):
    try:
        # 1. Save Image
        today_str = datetime.date.today().isoformat()
        folder_name = f"{today_str} - Shift {shift}"
        target_folder = os.path.join(PHOTO_BASE_PATH, folder_name)
        os.makedirs(target_folder, exist_ok=True)

        filename = f"{datetime.datetime.now().strftime('%H-%M-%S')}_{file.filename}"
        file_location = os.path.join(target_folder, filename)
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 2. Return filename so FE can create the reading with it
        from urllib.parse import quote
        image_url = f"{request.base_url}images/{quote(folder_name)}/{filename}"
        
        params_raw = json.loads(panel_params) if panel_params else None
        
        # Support new {name, unit} format — extract just the names for OCR engine
        if params_raw and isinstance(params_raw, list) and len(params_raw) > 0:
            if isinstance(params_raw[0], dict):
                # New format: [{name: "Vavg", unit: "V"}, ...]
                params_list = [p.get("name", "") for p in params_raw if p.get("name")]
                # Keep full param defs for unit lookup
                params_defs = params_raw
            else:
                # Legacy string format
                params_list = params_raw
                params_defs = [{"name": p, "unit": ""} for p in params_raw]
        else:
            params_list = None
            params_defs = []
        
        # 3. Queue the OCR Task (matching by filename later)
        ocr_queue.put({
            "filename": filename,
            "file_path": file_location,
            "panel_name": panel_name,
            "params_list": params_list,
            "params_defs": params_defs
        })

        return {"status": "ok", "filename": filename, "image_url": image_url}

    except Exception as e:
        return {"status": "error", "message": str(e)}

# ====== PANELS CRUD ======

@app.get("/api/panels", response_model=List[PanelModel])
def get_panels():
    return read_panels()

@app.post("/api/panels", response_model=List[PanelModel])
def add_panel(panel: PanelModel):
    panels = read_panels()
    if any(p['id'] == panel.id for p in panels):
        panels = [panel.model_dump() if p['id'] == panel.id else p for p in panels]
    else:
        panels.append(panel.model_dump())
    write_panels(panels)
    return panels

@app.put("/api/panels/{panel_id}", response_model=List[PanelModel])
def update_panel(panel_id: str, panel: PanelModel):
    panels = read_panels()
    panels = [panel.dict() if p['id'] == panel_id else p for p in panels]
    write_panels(panels)
    return panels

@app.delete("/api/panels/{panel_id}", response_model=List[PanelModel])
def delete_panel(panel_id: str):
    panels = read_panels()
    panels = [p for p in panels if p['id'] != panel_id]
    write_panels(panels)
    return panels

# ====== READINGS CRUD ======

@app.get("/api/readings")
def get_readings():
    """Return all readings from the JSON database."""
    return read_readings()

@app.post("/api/readings")
def add_reading(reading: ReadingModel):
    """Add a new reading (called by Mobile after upload)."""
    readings_list = read_readings()
    readings_list.insert(0, reading.model_dump())
    write_readings(readings_list)
    return {"status": "ok", "total": len(readings_list)}

@app.put("/api/readings/{reading_id}")
def update_reading(reading_id: str, reading: ReadingModel):
    """Update a reading (called by Dashboard for verification/editing)."""
    readings_list = read_readings()
    readings_list = [reading.model_dump() if r['id'] == reading_id else r for r in readings_list]
    write_readings(readings_list)
    return {"status": "ok"}

@app.delete("/api/readings/{reading_id}")
def delete_reading(reading_id: str):
    """Delete a reading."""
    readings_list = read_readings()
    readings_list = [r for r in readings_list if r['id'] != reading_id]
    write_readings(readings_list)
    return {"status": "ok"}

# ====== LEARN ======

@app.post("/api/learn")
def learn_endpoint(req: LearnRequest):
    """Endpoint to trigger learning from user correction."""
    success = learn_correction(req.panel_name, req.readings, req.raw_text)
    return {"status": "success" if success else "no_match", "message": "Memory updated" if success else "Could not match values in raw text"}

# ====== MODEL MANAGEMENT ======

@app.post("/api/models/upload/yolo-text")
async def upload_yolo_text(file: UploadFile = File(...)):
    if not file.filename.endswith(".pt"):
        return {"status": "error", "message": "Only .pt files allowed"}
    path = os.path.join(MODELS_DIR, "yolo_text_detect.pt")
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "success", "message": "YOLO Text model uploaded"}

@app.post("/api/models/upload/yolo-device")
async def upload_yolo_device(file: UploadFile = File(...)):
    if not file.filename.endswith(".pt"):
        return {"status": "error", "message": "Only .pt files allowed"}
    path = os.path.join(MODELS_DIR, "yolo_device_detect.pt")
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "success", "message": "YOLO Device model uploaded"}

@app.post("/api/models/upload/tesseract")
async def upload_tesseract(file: UploadFile = File(...)):
    if not file.filename.endswith(".traineddata"):
        return {"status": "error", "message": "Only .traineddata files allowed"}
    path = os.path.join(TESSDATA_DIR, "eng.traineddata")
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "success", "message": "Tesseract model uploaded"}

# ====== OCR ======

def process_and_log_background(file_path: str, panel_name: str, shift: str, operator: str, panel_params: list = None):
    """Background worker that runs the heavy OCR and logging."""
    try:
        ocr_data = process_image(file_path, panel_name, panel_params=panel_params)
        readings = ocr_data.get("readings", {})
        
        now = datetime.datetime.now()
        today_str = datetime.date.today().isoformat()
        time_str = now.strftime("%H-%M-%S")
        
        print(f"Background Job: Processed {file_path}")
        print(f"  Labeled pairs: {ocr_data.get('labeled_pairs', [])}")
        print(f"  Readings matched: {readings}")
        
        json_path = file_path + ".json"
        with open(json_path, 'w') as f:
            json.dump(ocr_data, f)
            
    except Exception as e:
        import traceback
        print(f"Background Job Error: {e}")
        traceback.print_exc()

@app.get("/api/reading/{filename}")
def get_reading_result(filename: str):
    """Helper to retrieve the async OCR result for a specific file."""
    for root, dirs, files in os.walk(PHOTO_BASE_PATH):
        for file in files:
            if file == filename + ".json" or file == filename:
                json_file = os.path.join(root, file)
                try:
                    with open(json_file, 'r') as f:
                        return json.load(f)
                except:
                    pass
    return {"status": "processing_or_not_found"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
