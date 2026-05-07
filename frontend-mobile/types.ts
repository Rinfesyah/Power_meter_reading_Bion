export enum AppMode {
  MOBILE_OPERATOR = 'MOBILE_OPERATOR',
  WEB_DASHBOARD = 'WEB_DASHBOARD'
}

export enum ReadingStatus {
  PENDING = 'PENDING', // Uploaded by mobile, waiting for admin
  VERIFIED = 'VERIFIED', // Approved by admin
  REJECTED = 'REJECTED'
}

export type Shift = 'Morning' | 'Afternoon' | 'Night';

export type PanelParameter = 'voltage' | 'current' | 'temperature' | 'humidity' | 'power';

export interface Panel {
  id: string;
  name: string; // e.g., "UPS A", "Panel-001"
  location: string; // e.g., "Room 101"
  type: string; // e.g., "Analog", "Digital"
  parameters?: PanelParameter[];
}

export interface InstrumentReading {
  id: string;
  timestamp: number;
  imageUrl: string; // Base64 or URL
  panelId: string;
  panelName: string; // Denormalized for easier display
  operatorName: string;
  shift: Shift; // New field for reporting

  // Metrics
  voltage?: number; // V
  current?: number; // A
  temperature?: number; // Celsius
  humidity?: number; // %
  power?: number; // kW

  status: ReadingStatus;
  notes?: string;
}

export interface OCRResult {
  voltage?: number;
  current?: number;
  temperature?: number;
  humidity?: number;
  power?: number;
  rawText?: string;
  imageUrl?: string;
}