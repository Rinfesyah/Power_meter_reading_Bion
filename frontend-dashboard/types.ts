export enum AppMode {
  MOBILE_OPERATOR = 'MOBILE_OPERATOR',
  WEB_DASHBOARD = 'WEB_DASHBOARD'
}

export enum ReadingStatus {
  PENDING = 'PENDING', // Uploaded by mobile, waiting for admin
  VERIFIED = 'VERIFIED', // Approved by admin
  REJECTED = 'REJECTED'
}

export type Shift = '1' | '2' | '3';

/** New format: parameter dengan nama & satuan terpisah */
export interface PanelParameterDef {
  name: string;  // e.g. "Vavg", "Iavg", "Ptot", "E Del"
  unit: string;  // e.g. "V", "A", "kW", "MWh"
}

/** Backward-compat alias */
export type PanelParameter = string;

export interface Panel {
  id: string;
  name: string; // e.g., "UPS A", "Panel-001"
  location: string; // e.g., "Room 101"
  type: string; // e.g., "Analog", "Digital"
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
  imageUrl: string; // Base64 or URL
  panelId: string;
  panelName: string; // Denormalized for easier display
  operatorName: string;
  shift: Shift;
  hour?: string; // Format "HH:MM"

  // Metrics (legacy flat fields)
  voltage?: number; // V
  current?: number; // A
  temperature?: number; // Celsius
  humidity?: number; // %
  power?: number; // kW

  // New structured fields
  ocrReadings?: Record<string, number | null>;  // {Vavg: 229.99, ...}
  verifiedReadings?: VerifiedReading[];          // [{name, value, unit}, ...]

  status: ReadingStatus;
  notes?: string;
  [key: string]: any; // Allow custom metric fields
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

/** Helper: normalise old string-format parameter to new object format */
export function normalizeParameter(param: any): PanelParameterDef {
  if (typeof param === 'string') {
    const match = param.match(/^(.+?)\s*\((.+?)\)$/);
    if (match) return { name: match[1].trim(), unit: match[2].trim() };
    return { name: param, unit: '' };
  }
  return param as PanelParameterDef;
}

// ─── Auth & RBAC Types ─────────────────────────────────────────────────────────

export type UserRole = 'Admin' | 'Supervisor' | 'Engineer';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
}

export interface UserRecord extends AuthUser {
  isActive: boolean;
  createdAt: string;
}

/** Permissions matrix per role */
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  Admin: ['dashboard', 'verification', 'panels', 'reports', 'rejected', 'settings', 'users'],
  Supervisor: ['dashboard', 'verification', 'panels', 'reports', 'rejected'],
  Engineer: ['dashboard', 'reports', 'verification', 'rejected'],
};

export function hasPermission(role: UserRole, tab: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(tab) ?? false;
}