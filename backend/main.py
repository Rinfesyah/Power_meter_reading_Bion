from fastapi import FastAPI, UploadFile, File, Form, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import shutil
import os
import datetime
import json
import csv # Added for CSV logging
from typing import List, Optional
from pydantic import BaseModel
from ocr_engine import process_image, learn_correction

class PanelModel(BaseModel):
    id: str
    name: str
    location: str
    type: str # "Digital" or "Analog"
    parameters: List[str] = []

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

# Base Paths (Using exact paths requested by user)
BASE_DB_PATH = "D:/Program/IDP/database"
PHOTO_BASE_PATH = os.path.join(BASE_DB_PATH, "foto")
CSV_PATH = os.path.join(BASE_DB_PATH, "readings.csv")
PANELS_DB_PATH = os.path.join(BASE_DB_PATH, "panels.json")

# Ensure base folders exist
os.makedirs(PHOTO_BASE_PATH, exist_ok=True)

# Mount the photo directory to be accessible via HTTP
app.mount("/images", StaticFiles(directory=PHOTO_BASE_PATH), name="images")

@app.post("/api/learn")
def learn_endpoint(req: LearnRequest):
    """
    Endpoint to trigger learning from user correction.
    """
    success = learn_correction(req.panel_name, req.readings, req.raw_text)
    return {"status": "success" if success else "no_match", "message": "Memory updated" if success else "Could not match values in raw text"}

# Helper to read/write panels
def read_panels():
    if not os.path.exists(PANELS_DB_PATH):
        return []
    try:
        with open(PANELS_DB_PATH, 'r') as f:
            return json.load(f)
    except:
        return []

def write_panels(panels):
    with open(PANELS_DB_PATH, 'w') as f:
        json.dump(panels, f, indent=2)

@app.get("/api/panels", response_model=List[PanelModel])
def get_panels():
    return read_panels()

@app.post("/api/panels", response_model=List[PanelModel])
def add_panel(panel: PanelModel):
    panels = read_panels()
    # Check duplicate ID
    if any(p['id'] == panel.id for p in panels):
        # Update existing
        panels = [panel.dict() if p['id'] == panel.id else p for p in panels]
    else:
        # Add new
        panels.append(panel.dict())
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

# ... (rest of code)

def process_and_log_background(file_path: str, panel_name: str, shift: str, operator: str):
    """
    Background worker that runs the heavy OCR and logging.
    """
    try:
        # 1. Heavy OCR with Smart Memory
        ocr_data = process_image(file_path, panel_name) # Pass panel_name for memory!
        readings = ocr_data.get("readings", {})
        
        # 2. Log to CSV
        # ... (CSV Logging logic remains same) ...
        now = datetime.datetime.now()
        today_str = datetime.date.today().isoformat()
        time_str = now.strftime("%H-%M-%S")
        
        # Ensure CSV header exists
        if not os.path.exists(CSV_PATH):
             with open(CSV_PATH, mode='w', newline='') as f:
                csv.writer(f).writerow(["Timestamp", "Date", "Time", "Shift", "Panel Name", "Operator", "Voltage", "Current", "Temperature", "Humidity", "Power", "Image Path"])

        with open(CSV_PATH, mode='a', newline='') as f:
            csv.writer(f).writerow([
                now.isoformat(),
                today_str,
                time_str,
                shift,
                panel_name,
                operator,
                readings.get("voltage", ""),
                readings.get("current", ""),
                readings.get("temperature", ""),
                readings.get("humidity", ""),
                readings.get("power", ""),
                file_path
            ])
        print(f"Background Job: Processed {file_path} successfully (Memory Used: {ocr_data.get('confidence')})")
        
        # SAVE RAW JSON for Frontend to access later? 
        # Actually, for async flow, how does frontend get the 'raw_text' to send back to /api/learn?
        # WE NEED TO SAVE IT.
        json_path = file_path + ".json"
        with open(json_path, 'w') as f:
            json.dump(ocr_data, f)
            
    except Exception as e:
        print(f"Background Job Error: {e}")

@app.get("/api/reading/{filename}")
def get_reading_result(filename: str):
    """
    Helper to retrieve the async result (and raw text) for a specific file.
    Used by Frontend if it wants to check status or get raw text for learning.
    """
    # The frontend sends the full filename like "16-53-12_Panel_3_blob.jpg"
    # We saved JSON as "16-53-12_Panel_3_blob.jpg.json"
    
    # Search for the JSON file
    for root, dirs, files in os.walk(PHOTO_BASE_PATH):
        for file in files:
            # Match: filename.jpg.json or filename.json
            if file == filename + ".json" or file == filename:
                json_file = os.path.join(root, file)
                try:
                    with open(json_file, 'r') as f:
                        return json.load(f)
                except:
                    pass
    
    return {"status": "processing_or_not_found"}

@app.post("/api/ocr")
async def ocr_endpoint(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    panel_name: str = Form(...),
    shift: str = Form(...),
    operator: str = Form("Unknown")
):
    # ... (Same logic, just ensure we pass panel_name to background)
    try:
        # 1. Generate Folder Path
        today_str = datetime.date.today().isoformat()
        folder_name = f"{today_str} - {shift}"
        target_folder = os.path.join(PHOTO_BASE_PATH, folder_name)
        os.makedirs(target_folder, exist_ok=True)

        # 2. Generate File Name
        now = datetime.datetime.now()
        time_str = now.strftime("%H-%M-%S")
        safe_panel_name = "".join([c for c in panel_name if c.isalnum() or c in (' ', '-', '_')]).strip()
        filename = f"{time_str}_{safe_panel_name}_{file.filename}"
        file_location = os.path.join(target_folder, filename)

        # 3. Save Image
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 4. Enqueue Background Task
        background_tasks.add_task(process_and_log_background, file_location, panel_name, shift, operator)

        # 5. Return Response (Include ID for polling if needed)
        from urllib.parse import quote
        image_url = str(request.base_url) + f"images/{quote(folder_name)}/{filename}"
        
        return {
            "status": "queued",
            "message": "Upload accepted. OCR processing in background.",
            "filename": filename, # Used for lookup later
            "image_url": image_url
        }

    except Exception as e:
        print(f"Error processing upload: {e}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    # Reload=True requires the script to be run as a module or string path, 
    # but direct python main.py works too if code doesn't change often.
    uvicorn.run(app, host="0.0.0.0", port=8000)
