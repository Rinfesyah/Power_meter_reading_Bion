export enum AppMode {
  MOBILE_OPERATOR = 'MOBILE_OPERATOR',
  WEB_DASHBOARD = 'WEB_DASHBOARD'
}

export enum ReadingStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED'
}

export type Shift = '1' | '2' | '3';

export interface PanelParameterDef {
  name: string;
  unit: string;
}

export type PanelParameter = string;

export interface Panel {
  id: string;
  name: string;
  location: string;
  type: string;
  parameters?: PanelParameterDef[];
}

export interface VerifiedReading {
  name: string;
  value: number | null;
  unit: string;
}

export interface InstrumentReading {
  id: string;
  timestamp: number;
  imageUrl: string;
  panelId: string;
  panelName: string;
  operatorName: string;
  shift: Shift;
  hour?: string;

  voltage?: number;
  current?: number;
  temperature?: number;
  humidity?: number;
  power?: number;

  ocrReadings?: Record<string, number | null>;
  verifiedReadings?: VerifiedReading[];

  status: ReadingStatus;
  notes?: string;
  [key: string]: any;
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

export function normalizeParameter(param: any): PanelParameterDef {
  if (typeof param === 'string') {
    const match = param.match(/^(.+?)\s*\((.+?)\)$/);
    if (match) return { name: match[1].trim(), unit: match[2].trim() };
    return { name: param, unit: '' };
  }
  return param as PanelParameterDef;
}

// ─── Auth Types ───────────────────────────────────────────────────────────────

export type UserRole = 'Admin' | 'Supervisor' | 'Engineer';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
}