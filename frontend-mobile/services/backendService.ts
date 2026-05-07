const BACKEND_URL = 'http://localhost:8000';

/**
 * Sends an image file to the Python FastAPI backend for OCR processing.
 * The backend saves the image, queues background OCR, and returns a response.
 *
 * @param file - The image file captured by the operator
 * @param panelName - Name of the panel being photographed
 * @param shift - Current shift (Morning, Afternoon, Night)
 * @param operatorName - Name of the operator
 * @returns OCR result object with readings and image URL
 */
export async function performBackendOCR(
  file: File,
  panelName: string,
  shift: string,
  operatorName: string
): Promise<Record<string, any>> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('panel_name', panelName);
  formData.append('shift', shift);
  formData.append('operator', operatorName);

  const response = await fetch(`${BACKEND_URL}/api/ocr`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Backend OCR failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // If backend returns a queued status, the OCR runs in background.
  // We return whatever data is available immediately (image_url, filename, etc.)
  return {
    imageUrl: data.image_url || '',
    filename: data.filename || '',
    status: data.status || 'unknown',
    message: data.message || '',
  };
}

/**
 * Polls the backend for the OCR result of a specific file.
 * Used when the initial upload returns "queued" status.
 *
 * @param filename - The filename returned from the upload
 * @returns The OCR reading data if available
 */
export async function getReadingResult(filename: string): Promise<Record<string, any>> {
  const response = await fetch(`${BACKEND_URL}/api/reading/${filename}`);

  if (!response.ok) {
    throw new Error(`Failed to get reading: ${response.status}`);
  }

  return response.json();
}
