import cv2
import numpy as np
import easyocr
import re

# Initialize EasyOCR Reader (English is sufficient for numbers/units)
# gpu=False to be safe on generic laptops, User can enable if they have NVIDIA
reader = easyocr.Reader(['en'], gpu=False) 

import json
import os

# Memory Handling
BASE_DB_PATH = "D:/Program/IDP/database"
MEMORY_PATH = os.path.join(BASE_DB_PATH, "memory.json")

def load_memory():
    if not os.path.exists(MEMORY_PATH):
        return {}
    try:
        with open(MEMORY_PATH, 'r') as f:
            return json.load(f)
    except:
        return {}

def save_memory(mem):
    with open(MEMORY_PATH, 'w') as f:
        json.dump(mem, f, indent=2)

def learn_correction(panel_name, corrected_data, raw_text_list):
    """
    Learns the position (index) of the corrected data in the raw text list.
    """
    memory = load_memory()
    if panel_name not in memory:
        memory[panel_name] = {}
    
    # For each corrected field (e.g. voltage=220.5), find where "220.5" is in raw_text_list
    learned_something = False
    
    # Normalize raw text for matching
    # Remove spaces from raw text items to match "220 V" with "220" easier? 
    # Actually, let's keep it simple: finding the number.
    
    for key, value in corrected_data.items():
        if value is None or value == "":
            continue
        
        target_val = str(value) # e.g. "220.5"
        
        # Try to find which index contains this number
        best_index = -1
        
        for i, text in enumerate(raw_text_list):
            # Check if target number fits in this text line
            # e.g. text="220.5 V", target="220.5" -> Match!
            if target_val in text:
                best_index = i
                break
        
        if best_index != -1:
            memory[panel_name][key] = best_index
            learned_something = True
            print(f"LEARNED: {panel_name} -> {key} is at index {best_index} ('{raw_text_list[best_index]}')")

    if learned_something:
        save_memory(memory)
        return True
    return False

def process_image(image_path: str, panel_name: str = "Unknown"):
    """
    Real OCR processing using EasyOCR with Smart Memory.
    """
    try:
        # 1. Perform OCR
        text_results = reader.readtext(image_path, detail=0)
        full_text = " ".join(text_results)
        print(f"OCR Detected Text: {full_text}")

        readings = {}
        
        # --- 2. SMART MEMORY CHECK ---
        memory = load_memory()
        if panel_name in memory:
            print(f"Using Smart Memory for {panel_name}...")
            panel_mem = memory[panel_name]
            
            for key, index in panel_mem.items():
                if index < len(text_results):
                    # Extract number from that specific line
                    raw_val = text_results[index]
                    # Simple regex to extract just the number from that line
                    num_match = re.search(r"(\d+\.?\d*)", raw_val)
                    if num_match:
                        try:
                            readings[key] = float(num_match.group(1))
                        except:
                            pass
        
        # If memory filled everything, we can skip regex? 
        # Better: Only use regex for fields NOT found in memory.
        
        # --- 3. REGEX FALLBACK (Standard) ---
        # Variable Initialization for remaining fields
        patterns = {
            "voltage": r"(\d+\.?\d*)\s*(?:v|volts?)(?![a-z])", 
            "current": r"(\d+\.?\d*)\s*(?:a|amps?)(?![a-z])",
            "power":   r"(\d+\.?\d*)\s*[k]?[w](?![a-z])",
            "temperature": r"(\d+\.?\d*)\s*(?:°|deg)?\s*[c](?![a-z])",
            "humidity": r"(\d+\.?\d*)\s*%",
        }

        for key, pattern in patterns.items():
            if key not in readings: # Only look if not already found via memory
                match = re.search(pattern, full_text, re.IGNORECASE)
                if match:
                    try:
                        readings[key] = float(match.group(1))
                    except ValueError:
                        pass

        # --- 4. EXTREME FALLBACK (If still empty) ---
        if not readings:
            all_numbers = re.findall(r"(\d+\.?\d*)", full_text)
            candidates = [float(n) for n in all_numbers if "." in n or float(n) > 10]
            if candidates:
                candidates.sort(reverse=True)
                if "voltage" not in readings and len(candidates) > 0:
                    readings["voltage"] = candidates[0]
                if "current" not in readings and len(candidates) > 1:
                    readings["current"] = candidates[1]

        return {
            "detected_type": "Digital Panel (AI)",
            "readings": readings,
            "raw_text": text_results, # Return list! Important for learning
            "full_text_debug": full_text,
            "confidence": 0.85 
        }

    except Exception as e:
        print(f"OCR Error: {e}")
        return {
            "error": str(e),
            "readings": {},
            "raw_text": []
        }
