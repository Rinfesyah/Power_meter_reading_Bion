# Force all print() calls to flush immediately (fixes Docker log visibility for background threads)
import builtins
_builtin_print = builtins.print
def _flush_print(*args, **kwargs):
    kwargs.setdefault('flush', True)
    return _builtin_print(*args, **kwargs)
builtins.print = _flush_print

from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import shutil
import os
import zipfile
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

# Import database and ORM
import database
import models_db
import crud
from sqlalchemy.orm import Session

# Auto-create tables if not exists on startup
try:
    if database.check_db_connection():
        database.Base.metadata.create_all(bind=database.engine)
        print("[DB] PostgreSQL tables verified/created successfully.")
except Exception as e:
    print(f"[DB] Notice: Could not connect to PostgreSQL on startup: {e}")

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
    """Update ocr_status in both PostgreSQL and readings.json"""
    # 1. Update in PostgreSQL
    try:
        if database.check_db_connection():
            db = database.SessionLocal()
            try:
                header = crud.get_log_header_by_filename(db, filename)
                if header:
                    header.status = ocr_status
                    if ocr_results and ocr_results.get("readings"):
                        crud.save_reading_to_db(
                            db=db,
                            panel_name=header.equipment.name if header.equipment else "Unknown",
                            operator_name=header.user.name if header.user else "Unknown",
                            shift_str=header.shift.shift_name if header.shift else "1",
                            photo_path=header.photo_path or "",
                            ocr_filename=filename,
                            status=ocr_status,
                            ocr_readings=ocr_results.get("readings")
                        )
                    db.commit()
            finally:
                db.close()
    except Exception as e:
        print(f"[DB] Error updating status in DB: {e}")

    # 2. Update in JSON
    try:
        readings = read_readings_from_file()
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
            write_readings_to_file(readings)
    except Exception as e:
        print(f"Error updating status in JSON: {e}")

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

# ====== HELPERS & DB CONVERTERS ======

def read_panels_from_file():
    if not os.path.exists(PANELS_DB_PATH): return []
    try:
        with open(PANELS_DB_PATH, 'r') as f: return json.load(f)
    except: return []

def write_panels_to_file(panels):
    with open(PANELS_DB_PATH, 'w') as f: json.dump(panels, f, indent=2)

def read_readings_from_file():
    if not os.path.exists(READINGS_DB_PATH): return []
    try:
        with open(READINGS_DB_PATH, 'r') as f: return json.load(f)
    except: return []

def write_readings_to_file(readings_list):
    with open(READINGS_DB_PATH, 'w') as f: json.dump(readings_list, f, indent=2)

def db_equipment_to_dict(eq: models_db.MasterEquipment) -> dict:
    params = []
    if eq.equipment_parameters:
        for ep in sorted(eq.equipment_parameters, key=lambda x: x.sort_order or 0):
            p_name = ep.parameter.parameter_name if ep.parameter else ""
            p_unit = ep.parameter.unit if ep.parameter else ""
            params.append({
                "name": p_name,
                "unit": p_unit,
                "min": float(ep.normal_min_value) if ep.normal_min_value is not None else None,
                "max": float(ep.normal_max_value) if ep.normal_max_value is not None else None
            })
    return {
        "id": eq.equipment_code or str(eq.id),
        "name": eq.name,
        "location": eq.location or "",
        "type": eq.category or "Digital",
        "parameters": params
    }

def db_log_header_to_dict(h: models_db.LogHeader) -> dict:
    ocr_readings = {}
    verified_readings = []
    for d in (h.log_details or []):
        p_name = d.parameter.parameter_name if d.parameter else ""
        p_unit = d.parameter.unit if d.parameter else ""
        if d.raw_ocr_value is not None:
            ocr_readings[p_name] = d.raw_ocr_value
        v_val = float(d.verified_value) if d.verified_value is not None else d.value_text
        verified_readings.append({
            "name": p_name,
            "value": v_val,
            "unit": p_unit,
            "is_edited": d.is_edited or False
        })
        if v_val is not None and p_name not in ocr_readings:
            ocr_readings[p_name] = v_val

    # Timestamp in milliseconds (JavaScript Date format)
    ts = int(h.inspected_at.timestamp() * 1000) if h.inspected_at else int(time.time() * 1000)

    # Resolve photo URL
    image_url = h.photo_path or ""
    if not image_url and h.ocr_filename:
        for root, dirs, files in os.walk(PHOTO_BASE_PATH):
            if h.ocr_filename in files:
                rel = os.path.relpath(os.path.join(root, h.ocr_filename), PHOTO_BASE_PATH).replace('\\', '/')
                image_url = f"http://localhost:8000/images/{rel}"
                break
    elif image_url and not image_url.startswith("http") and not image_url.startswith("data:"):
        image_url = f"http://localhost:8000/images/{image_url.lstrip('/')}"

    v_status = h.validation_status or "PENDING"
    if v_status not in ("PENDING", "VERIFIED", "REJECTED"):
        v_status = "PENDING"

    item = {
        "id": str(h.id),
        "timestamp": ts,
        "imageUrl": image_url,
        "panelId": h.equipment.equipment_code if h.equipment else str(h.equipment_id),
        "panelName": h.equipment.name if h.equipment else "Unknown Panel",
        "operatorName": h.user.name if h.user else "Unknown",
        "shift": h.shift.shift_name.replace("Shift ", "") if h.shift else "1",
        "hour": h.inspected_at.strftime("%H:%M") if h.inspected_at else "",
        "ocr_status": h.status or "PENDING",
        "ocrFilename": h.ocr_filename or "",
        "status": v_status,
        "notes": h.general_notes or "",
        "ocrReadings": ocr_readings,
        "verifiedReadings": verified_readings
    }
    # Flatten readings for legacy compatibility
    for k, v in ocr_readings.items():
        item[k] = v
    return item


# ====== API ENDPOINTS ======

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
                params_list = [p.get("name", "") for p in params_raw if p.get("name")]
                params_defs = params_raw
            else:
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
    try:
        if database.check_db_connection():
            db = database.SessionLocal()
            try:
                eqs = crud.get_equipments(db)
                if eqs:
                    return [db_equipment_to_dict(eq) for eq in eqs]
            finally:
                db.close()
    except Exception as e:
        print(f"[DB] Error fetching panels from DB: {e}")
    return read_panels_from_file()

@app.post("/api/panels", response_model=List[PanelModel])
def add_panel(panel: PanelModel):
    # Save to DB
    try:
        if database.check_db_connection():
            db = database.SessionLocal()
            try:
                crud.create_or_update_equipment(
                    db=db,
                    name=panel.name,
                    location=panel.location,
                    category=panel.type,
                    equipment_code=panel.id,
                    parameters=panel.parameters
                )
            finally:
                db.close()
    except Exception as e:
        print(f"[DB] Error saving panel to DB: {e}")

    # Mirror to JSON file
    panels = read_panels_from_file()
    if any(p['id'] == panel.id for p in panels):
        panels = [panel.model_dump() if p['id'] == panel.id else p for p in panels]
    else:
        panels.append(panel.model_dump())
    write_panels_to_file(panels)
    return get_panels()

@app.put("/api/panels/{panel_id}", response_model=List[PanelModel])
def update_panel(panel_id: str, panel: PanelModel):
    return add_panel(panel)

@app.delete("/api/panels/{panel_id}", response_model=List[PanelModel])
def delete_panel(panel_id: str):
    try:
        if database.check_db_connection():
            db = database.SessionLocal()
            try:
                crud.delete_equipment(db, panel_id)
            finally:
                db.close()
    except Exception as e:
        print(f"[DB] Error deleting panel in DB: {e}")

    panels = read_panels_from_file()
    panels = [p for p in panels if p['id'] != panel_id]
    write_panels_to_file(panels)
    return get_panels()

# ====== READINGS CRUD ======

@app.get("/api/readings")
def get_readings():
    """Return readings from PostgreSQL if available, fallback to JSON."""
    try:
        if database.check_db_connection():
            db = database.SessionLocal()
            try:
                headers = crud.get_all_log_headers(db)
                if headers:
                    return [db_log_header_to_dict(h) for h in headers]
            finally:
                db.close()
    except Exception as e:
        print(f"[DB] Error fetching readings from DB: {e}")
    return read_readings_from_file()

@app.post("/api/readings")
def add_reading(reading: ReadingModel):
    """Add a new reading (called by Mobile/Dashboard)."""
    # Save to PostgreSQL
    try:
        if database.check_db_connection():
            db = database.SessionLocal()
            try:
                # Extract extra fields if any
                reading_dict = reading.model_dump()
                ocr_readings = reading_dict.get("ocrReadings", {})
                verified_readings = reading_dict.get("verifiedReadings", [])

                crud.save_reading_to_db(
                    db=db,
                    panel_name=reading.panelName,
                    operator_name=reading.operatorName,
                    shift_str=reading.shift,
                    photo_path=reading.imageUrl,
                    ocr_filename=reading.ocrFilename,
                    notes=reading.notes,
                    status=reading.ocr_status,
                    validation_status=reading.status,
                    ocr_readings=ocr_readings,
                    verified_readings=verified_readings
                )
            finally:
                db.close()
    except Exception as e:
        print(f"[DB] Error adding reading to DB: {e}")

    # Mirror to JSON
    readings_list = read_readings_from_file()
    readings_list.insert(0, reading.model_dump())
    write_readings_to_file(readings_list)
    return {"status": "ok", "total": len(readings_list)}

@app.put("/api/readings/{reading_id}")
def update_reading(reading_id: str, reading: ReadingModel):
    """Update a reading (called by Dashboard for verification/editing)."""
    try:
        if database.check_db_connection():
            db = database.SessionLocal()
            try:
                reading_dict = reading.model_dump()
                ocr_readings = reading_dict.get("ocrReadings", {})
                verified_readings = reading_dict.get("verifiedReadings", [])

                target_filename = reading.ocrFilename
                if (not target_filename) and str(reading_id).isdigit():
                    h = crud.get_log_header_by_id(db, int(reading_id))
                    if h:
                        target_filename = h.ocr_filename

                crud.save_reading_to_db(
                    db=db,
                    panel_name=reading.panelName,
                    operator_name=reading.operatorName,
                    shift_str=reading.shift,
                    photo_path=reading.imageUrl,
                    ocr_filename=target_filename,
                    notes=reading.notes,
                    status=reading.ocr_status,
                    validation_status=reading.status,
                    ocr_readings=ocr_readings,
                    verified_readings=verified_readings
                )
            finally:
                db.close()
    except Exception as e:
        print(f"[DB] Error updating reading in DB: {e}")

    readings_list = read_readings_from_file()
    readings_list = [reading.model_dump() if str(r.get('id')) == str(reading_id) else r for r in readings_list]
    write_readings_to_file(readings_list)
    return {"status": "ok"}


@app.delete("/api/readings/{reading_id}")
def delete_reading(reading_id: str):
    """Delete a reading."""
    try:
        if database.check_db_connection():
            db = database.SessionLocal()
            try:
                if reading_id.isdigit():
                    h = crud.get_log_header_by_id(db, int(reading_id))
                    if h:
                        db.delete(h)
                        db.commit()
            finally:
                db.close()
    except Exception as e:
        print(f"[DB] Error deleting reading in DB: {e}")

    readings_list = read_readings_from_file()
    readings_list = [r for r in readings_list if r['id'] != reading_id]
    write_readings_to_file(readings_list)
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

@app.post("/api/models/upload/paddleocr")
async def upload_paddleocr(file: UploadFile = File(...)):
    if not file.filename.endswith(".zip"):
        return {"status": "error", "message": "Only .zip files allowed"}
    zip_path = os.path.join(MODELS_DIR, "power_meter_rec_inference.zip")
    extract_dir = os.path.join(MODELS_DIR, "power_meter_rec_inference")
    with open(zip_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    try:
        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir)
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
        return {"status": "success", "message": f"PaddleOCR model uploaded & extracted ({os.path.getsize(zip_path)//1024} KB). Restart backend untuk memuat ulang model."}
    except Exception as e:
        return {"status": "error", "message": f"Gagal mengekstrak zip: {e}"}

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
