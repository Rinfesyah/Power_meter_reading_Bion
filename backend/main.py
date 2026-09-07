# Force all print() calls to flush immediately (fixes Docker log visibility for background threads)
import builtins
_builtin_print = builtins.print
def _flush_print(*args, **kwargs):
    kwargs.setdefault('flush', True)
    return _builtin_print(*args, **kwargs)
builtins.print = _flush_print

from fastapi import FastAPI, UploadFile, File, Form, Request, Depends, HTTPException, status
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
import uuid
from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict
from ocr_engine import process_image, learn_correction
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_admin, require_admin_or_supervisor
)
from users_db import read_users, write_users, find_user_by_username, find_user_by_id, seed_default_admin

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

# ─── Auth / User Pydantic Models ──────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str

class CreateUserRequest(BaseModel):
    username: str
    fullName: str
    password: str
    role: str  # 'Admin' | 'Supervisor' | 'Engineer'
    isActive: bool = True

class UpdateUserRequest(BaseModel):
    fullName: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    isActive: Optional[bool] = None

# ─── Rate Limiting (simple in-memory, per-IP) ─────────────────────────────────
# Dict: { ip: { 'count': int, 'reset_at': float } }
_login_attempts: dict = {}

app = FastAPI(title="DC-Ops OCR Backend")

# Seed default admin on startup
seed_default_admin()

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

# ====== AUTH ENDPOINTS ======

@app.post("/api/auth/login")
def login(req: LoginRequest, request: Request):
    """Authenticate user and return JWT token."""
    ip = request.client.host if request.client else "unknown"
    now = time.time()

    # Rate limiting: 5 attempts per 5 minutes per IP
    entry = _login_attempts.get(ip)
    if entry:
        if now < entry['reset_at']:
            if entry['count'] >= 5:
                wait = int(entry['reset_at'] - now)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many login attempts. Try again in {wait} seconds."
                )
        else:
            _login_attempts.pop(ip, None)

    user = find_user_by_username(req.username)
    # Generic error — never reveal whether username or password is wrong
    if not user or not verify_password(req.password, user.get("password_hash", "")):
        rec = _login_attempts.setdefault(ip, {'count': 0, 'reset_at': now + 300})
        rec['count'] += 1
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Kredensial tidak valid. Periksa kembali username dan password."
        )

    if not user.get("isActive", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Akun dinonaktifkan. Hubungi administrator."
        )

    # Clear failed attempts on success
    _login_attempts.pop(ip, None)

    token = create_access_token(
        user_id=user["id"],
        username=user["username"],
        role=user["role"],
        full_name=user["fullName"]
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "fullName": user["fullName"],
            "role": user["role"],
        }
    }


@app.get("/api/auth/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """Return current authenticated user info."""
    return current_user


# ====== USER MANAGEMENT (Admin only) ======

@app.get("/api/users")
def list_users(current_user: dict = Depends(require_admin)):
    """List all users (Admin only). Excludes password hashes."""
    users = read_users()
    return [
        {k: v for k, v in u.items() if k != "password_hash"}
        for u in users
    ]


@app.post("/api/users", status_code=201)
def create_user(req: CreateUserRequest, current_user: dict = Depends(require_admin)):
    """Create a new user account (Admin only)."""
    if req.role not in ("Admin", "Supervisor", "Engineer"):
        raise HTTPException(status_code=400, detail="Role tidak valid. Gunakan: Admin, Supervisor, atau Engineer.")
    if find_user_by_username(req.username):
        raise HTTPException(status_code=409, detail="Username sudah digunakan.")
    users = read_users()
    new_user = {
        "id": str(uuid.uuid4()),
        "username": req.username,
        "fullName": req.fullName,
        "password_hash": hash_password(req.password),
        "role": req.role,
        "isActive": req.isActive,
        "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    users.append(new_user)
    write_users(users)
    return {k: v for k, v in new_user.items() if k != "password_hash"}


@app.put("/api/users/{user_id}")
def update_user(user_id: str, req: UpdateUserRequest, current_user: dict = Depends(require_admin)):
    """Update user info/role/password (Admin only)."""
    users = read_users()
    updated = False
    for u in users:
        if u["id"] == user_id:
            if req.fullName is not None:
                u["fullName"] = req.fullName
            if req.role is not None:
                if req.role not in ("Admin", "Supervisor", "Engineer"):
                    raise HTTPException(status_code=400, detail="Role tidak valid.")
                u["role"] = req.role
            if req.isActive is not None:
                u["isActive"] = req.isActive
            if req.password is not None and req.password.strip() != "":
                u["password_hash"] = hash_password(req.password)
            updated = True
            break
    if not updated:
        raise HTTPException(status_code=404, detail="User tidak ditemukan.")
    write_users(users)
    updated_user = find_user_by_id(user_id)
    return {k: v for k, v in updated_user.items() if k != "password_hash"}


@app.delete("/api/users/{user_id}")
def delete_user(user_id: str, current_user: dict = Depends(require_admin)):
    """Delete a user account (Admin only). Cannot delete yourself."""
    if user_id == current_user.get("id"):
        raise HTTPException(status_code=400, detail="Tidak dapat menghapus akun Anda sendiri.")
    users = read_users()
    new_users = [u for u in users if u["id"] != user_id]
    if len(new_users) == len(users):
        raise HTTPException(status_code=404, detail="User tidak ditemukan.")
    write_users(new_users)
    return {"status": "ok", "message": "User berhasil dihapus."}


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
async def upload_yolo_text(file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
    if not file.filename.endswith(".pt"):
        return {"status": "error", "message": "Only .pt files allowed"}
    path = os.path.join(MODELS_DIR, "yolo_text_detect.pt")
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "success", "message": "YOLO Text model uploaded"}

@app.post("/api/models/upload/yolo-device")
async def upload_yolo_device(file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
    if not file.filename.endswith(".pt"):
        return {"status": "error", "message": "Only .pt files allowed"}
    path = os.path.join(MODELS_DIR, "yolo_device_detect.pt")
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "success", "message": "YOLO Device model uploaded"}

@app.post("/api/models/upload/tesseract")
async def upload_tesseract(file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
    if not file.filename.endswith(".traineddata"):
        return {"status": "error", "message": "Only .traineddata files allowed"}
    path = os.path.join(TESSDATA_DIR, "eng.traineddata")
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "success", "message": "Tesseract model uploaded"}

@app.post("/api/models/upload/paddleocr")
async def upload_paddleocr(file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
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
