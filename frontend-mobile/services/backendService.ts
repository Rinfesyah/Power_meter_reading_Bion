import { InstrumentReading } from '../types';

const BACKEND_URL = 'http://localhost:8000';

/**
 * Sends an image file to the Python FastAPI backend for OCR processing.
 */
export async function performBackendOCR(
  file: File,
  panelName: string,
  panelId: string,
  shift: string,
  operatorName: string,
  panelParams: string[] = []
): Promise<Record<string, any>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('panel_name', panelName);
  formData.append('panel_id', panelId);
  formData.append('shift', shift);
  formData.append('operator', operatorName);
  formData.append('panel_params', JSON.stringify(panelParams)); // send param names to backend


  const response = await fetch(`${BACKEND_URL}/api/ocr`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Backend OCR failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return {
    imageUrl: data.image_url || '',
    filename: data.filename || '',
    ocrStatus: data.status || 'unknown',
    message: data.message || '',
  };
}

/**
 * Polls the backend for OCR results until they are ready or timeout.
 * Returns the OCR readings (voltage, current, etc.) once available.
 */
export async function pollForOCRResult(
  filename: string,
  maxAttempts: number = 15,
  intervalMs: number = 2000
): Promise<Record<string, any>> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await getReadingResult(filename);
      
      // Check if OCR processing is done (has readings or raw_text)
      if (result && result.readings && Object.keys(result.readings).length > 0) {
        return result;
      }
      
      // If we get raw_text but no readings, OCR ran but found nothing
      if (result && result.raw_text && Array.isArray(result.raw_text)) {
        return result;
      }
      
      // Still processing, keep polling
      if (result.status === 'processing_or_not_found') {
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        continue;
      }
    } catch (e) {
      // Network error, retry
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  // Timeout: return empty result
  return { readings: {}, raw_text: [], timeout: true };
}

/**
 * Save a reading to the backend database.
 */
export async function saveReading(reading: InstrumentReading): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/api/readings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reading),
  });
  if (!response.ok) {
    throw new Error(`Failed to save reading: ${response.status}`);
  }
}

/**
 * Fetch all readings from the backend.
 */
export async function fetchReadings(): Promise<InstrumentReading[]> {
  const response = await fetch(`${BACKEND_URL}/api/readings`);
  if (!response.ok) {
    throw new Error(`Failed to fetch readings: ${response.status}`);
  }
  return response.json();
}

/**
 * Update a reading on the backend.
 */
export async function updateReading(reading: InstrumentReading): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/api/readings/${reading.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reading),
  });
  if (!response.ok) {
    throw new Error(`Failed to update reading: ${response.status}`);
  }
}

/**
 * Delete a reading from the backend.
 */
export async function deleteReading(id: string): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/api/readings/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`Failed to delete reading: ${response.status}`);
  }
}

/**
 * Polls the backend for the OCR result of a specific file.
 */
export async function getReadingResult(filename: string): Promise<Record<string, any>> {
  const response = await fetch(`${BACKEND_URL}/api/reading/${filename}`);
  if (!response.ok) {
    throw new Error(`Failed to get reading: ${response.status}`);
  }
  return response.json();
}
