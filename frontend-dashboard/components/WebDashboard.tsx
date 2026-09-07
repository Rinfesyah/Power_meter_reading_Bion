import React, { useState, useRef } from 'react';
import { InstrumentReading, Panel, ReadingStatus, Shift, PanelParameterDef, VerifiedReading, normalizeParameter, AuthUser, UserRole, hasPermission } from '../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import {
  Activity, Download, Search, Thermometer, Zap, CheckSquare, Trash2, Plus, Edit2,
  LayoutDashboard, Settings, FileSpreadsheet, Filter, Printer, XCircle, RotateCcw,
  Link, Save, Database, Server, Loader2, CheckCircle, AlertCircle, Clock, Upload, Cpu, X,
  Users, LogOut, ShieldCheck
} from 'lucide-react';
import UserManagement from './UserManagement';

interface Props {
  readings: InstrumentReading[];
  panels: Panel[];
  googleSheetUrl: string;
  currentUser: AuthUser;
  onLogout: () => void;
  onUpdateGoogleSheetUrl: (url: string) => void;
  onUpdateReading: (reading: InstrumentReading) => void;
  onDeleteReading: (id: string) => void;
  onAddPanel: (panel: Panel) => void;
  onUpdatePanel: (panel: Panel) => void;
  onDeletePanel: (id: string) => void;
  onRefreshReadings: () => Promise<void>;
}

type Tab = 'dashboard' | 'verification' | 'panels' | 'reports' | 'rejected' | 'settings' | 'users';

/** Role badge colors */
const ROLE_BADGE: Record<UserRole, { bg: string; text: string; label: string }> = {
  Admin:      { bg: '#dc2626', text: '#fff', label: 'Admin' },
  Supervisor: { bg: '#d97706', text: '#fff', label: 'Supervisor' },
  Engineer:   { bg: '#2563eb', text: '#fff', label: 'Engineer' },
};

/** Preset parameters for quick-add */
const PRESET_PARAMS: PanelParameterDef[] = [
  { name: 'Vavg',         unit: 'V'   },
  { name: 'Iavg',         unit: 'A'   },
  { name: 'Ptot',         unit: 'kW'  },
  { name: 'E Del',        unit: 'MWh' },
  { name: 'Frequency',    unit: 'Hz'  },
  { name: 'Power Factor', unit: ''    },
  { name: 'Temperature',  unit: '°C'  },
  { name: 'Humidity',     unit: '%'   },
];

const WebDashboard: React.FC<Props> = ({
  readings, panels, googleSheetUrl, currentUser, onLogout, onUpdateGoogleSheetUrl, onUpdateReading, onDeleteReading, onAddPanel, onUpdatePanel, onDeletePanel, onRefreshReadings
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [editingReading, setEditingReading] = useState<InstrumentReading | null>(null);

  // Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Panel CRUD State
  const [isPanelModalOpen, setIsPanelModalOpen] = useState(false);
  const [panelForm, setPanelForm] = useState<Partial<Panel>>({});

  // Reporting State
  const [reportShift, setReportShift] = useState<Shift | 'All'>('All');
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Settings State (Local temp state for input)
  const [tempUrl, setTempUrl] = useState(googleSheetUrl);
  const [isSaved, setIsSaved] = useState(false);

  // Model Upload State
  const [modelUploadStatus, setModelUploadStatus] = useState<Record<string, string>>({});
  const [customParamInput, setCustomParamInput] = useState('');
  const [customUnitInput, setCustomUnitInput] = useState('');
  const yoloTextRef = useRef<HTMLInputElement>(null);
  const yoloDeviceRef = useRef<HTMLInputElement>(null);
  const tesseractRef = useRef<HTMLInputElement>(null);
  const paddleOcrRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const BACKEND_URL = 'http://localhost:8000';

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshReadings();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  // Open verification modal: fetch OCR results from backend first
  const openVerification = async (reading: InstrumentReading) => {
    setOcrLoading(true);
    let enrichedReading: any = { ...reading };

    // Resolve panel parameters (normalize old string format)
    const panel = panels.find(p => p.id === reading.panelId);
    const rawParams = panel?.parameters || [];
    const paramDefs: PanelParameterDef[] = rawParams.map(normalizeParameter);

    try {
      const filename = (reading as any).ocrFilename
        || (reading.imageUrl?.includes('localhost') ? reading.imageUrl.split('/').pop() : null);

      if (filename) {
        const res = await fetch(`${BACKEND_URL}/api/reading/${filename}`);
        const data = await res.json();

        if (data && data.readings && !data.status) {
          enrichedReading.ocrReadings = data.readings;

          // Use params_defs from OCR JSON if available (more accurate units)
          const ocrParamDefs: PanelParameterDef[] = (data.params_defs || []).length > 0
            ? data.params_defs.map(normalizeParameter)
            : paramDefs;

          // Build verifiedReadings pre-filled with OCR values
          enrichedReading.verifiedReadings = ocrParamDefs.map((pd: PanelParameterDef) => ({
            name: pd.name,
            unit: pd.unit,
            value: data.readings[pd.name] ?? null
          })) as VerifiedReading[];

          if (data.labeled_pairs) enrichedReading.labeled_pairs = data.labeled_pairs;
          if (data.rows_debug)    enrichedReading.rows_debug    = data.rows_debug;
        } else {
          // No OCR data — init empty verifiedReadings
          enrichedReading.verifiedReadings = paramDefs.map(pd => ({ name: pd.name, unit: pd.unit, value: null }));
        }
      } else {
        enrichedReading.verifiedReadings = paramDefs.map(pd => ({ name: pd.name, unit: pd.unit, value: null }));
      }
    } catch (e) {
      console.warn('Could not fetch OCR results:', e);
      enrichedReading.verifiedReadings = paramDefs.map(pd => ({ name: pd.name, unit: pd.unit, value: null }));
    }

    setOcrLoading(false);
    setEditingReading(enrichedReading);
  };

  // Filtered Data
  const verifiedReadings = readings.filter(r => r.status === ReadingStatus.VERIFIED);
  const pendingReadings = readings.filter(r => r.status === ReadingStatus.PENDING);
  const rejectedReadings = readings.filter(r => r.status === ReadingStatus.REJECTED);

  // --- Analytics Helpers ---
  const chartData = verifiedReadings
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(r => ({
      time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      temp: r.temperature || 0,
      power: r.power || 0,
    })).slice(-10);

  const avgTemp = verifiedReadings.length
    ? (verifiedReadings.reduce((acc, curr) => acc + (curr.temperature || 0), 0) / verifiedReadings.length).toFixed(1)
    : '0';

  const totalPower = verifiedReadings
    .reduce((acc, curr) => acc + (curr.power || 0), 0).toFixed(1);

  // --- Handlers ---

  const syncToGoogleSheet = async (reading: InstrumentReading, panelLocation?: string) => {
    if (!googleSheetUrl) return true;

    try {
      // Build structured payload with 6 columns per parameter:
      // param_ocr, value_ocr, unit_ocr, param_verify, value_verify, unit_verify
      const verifiedRows: VerifiedReading[] = (reading as any).verifiedReadings || [];
      const ocrMap: Record<string, number | null> = (reading as any).ocrReadings || {};
      const rowsDebug: string[][] = (reading as any).rows_debug || [];
      const labeledPairs: any[] = (reading as any).labeled_pairs || (reading as any).ocrLabeledPairs || [];

      // Name-based match function (fallback only)
      const matchParamByName = (paramName: string, label: string): boolean => {
        if (!label) return false;
        const pn = paramName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
        const lb = label.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();

        if (lb.length < 2 && !['v', 'i', 'p'].includes(lb)) return false;

        const synonyms: Record<string, string[]> = {
          "vavg": ["v", "v ave", "volt", "voltage", "l.avg", "lavg", "v.avg", "ua.g", "ua g", "uag", "ligwg", "lvavg", "vavg"],
          "iavg": ["i", "i ave", "amp", "ampere", "current", "1.avg", "iavg", "iawvg", "iawg", "ia v g"],
          "ptot": ["p", "p tot", "pwr", "power", "kw", "ftot", "f tot", "ptot", "ptat"],
          "e del": ["e", "del", "energy", "mwh", "edel", "e del"]
        };

        for (const [key, syns] of Object.entries(synonyms)) {
          if (pn.includes(key)) {
            if (lb === key || syns.includes(lb)) return true;
          }
        }

        if (lb.includes(pn) || pn.includes(lb)) return true;

        const pnWords = new Set(pn.split(' ').filter(w => w.length >= 2));
        const lbWords = new Set(lb.split(' ').filter(w => w.length >= 2));
        const intersection = new Set([...pnWords].filter(x => lbWords.has(x)));
        if (intersection.size > 0) return true;

        return false;
      };

      // Parse a numeric value from OCR text string
      const parseOcrValue = (text: string): number | null => {
        if (!text) return null;
        const cleaned = String(text).replace(',', '.');
        const m = cleaned.match(/(\d+\.?\d*)/);
        if (m) {
          const n = parseFloat(m[1]);
          return isNaN(n) ? null : n;
        }
        return null;
      };

      const paramRows = verifiedRows.map((vr, idx) => {
        let rawParam = vr.name;
        let rawValue: number | null = ocrMap[vr.name] ?? null;
        let rawUnit = vr.unit;

        let foundRawRow: string[] | null = null;

        // ── Strategy 1: Positional match ──────────────────────────────────────
        // When count of OCR rows equals count of panel parameters, use direct
        // index mapping. This is most reliable because the meter always displays
        // params in the same order, even if the label text was misread
        // (e.g. "Ua.g" instead of "Vavg", "Iawg" instead of "Iavg").
        if (rowsDebug.length > 0 && rowsDebug.length === verifiedRows.length) {
          foundRawRow = rowsDebug[idx] || null;
        }

        // ── Strategy 2: Name-based match (when positional not applicable) ─────
        if (!foundRawRow) {
          foundRawRow = rowsDebug.find(row =>
            row && row.length > 0 && matchParamByName(vr.name, row[0])
          ) || null;
        }

        // ── Strategy 3: labeled_pairs fallback ────────────────────────────────
        if (!foundRawRow) {
          const matchedPair = labeledPairs.find(pair =>
            pair && pair.label && matchParamByName(vr.name, pair.label)
          );
          if (matchedPair) {
            rawParam = matchedPair.label || vr.name;
            rawUnit  = matchedPair.unit  || '';
            if (rawValue === null && matchedPair.value != null) {
              rawValue = parseOcrValue(String(matchedPair.value));
            }
          }
        }

        // Apply the found raw row
        if (foundRawRow) {
          rawParam = foundRawRow[0] || vr.name;
          rawUnit  = foundRawRow[2] || '';
          // If ocrMap has no value for this param, parse directly from the raw row text
          if (rawValue === null && foundRawRow[1]) {
            rawValue = parseOcrValue(foundRawRow[1]);
          }
        }

        return {
          param_ocr:    rawParam,
          value_ocr:    rawValue,
          unit_ocr:     rawUnit,
          param_verify: vr.name,
          value_verify: vr.value,
          unit_verify:  vr.unit,
        };
      });

      const payload = {
        id:            reading.id,
        panelName:     reading.panelName,
        panelId:       reading.panelId,
        operatorName:  reading.operatorName,
        shift:         reading.shift,
        hour:          reading.hour,
        timestamp:     reading.timestamp,
        location:      panelLocation || "",
        status:        reading.status,
        notes:         reading.notes,
        paramRows,                           // structured [{param_ocr,value_ocr,...}]
        ocrReadings:     ocrMap,              // legacy flat dict
        verifiedReadings: verifiedRows,       // [{name,value,unit}]
      };

      await fetch(googleSheetUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return true;
    } catch (error) {
      console.error("Sync Error:", error);
      return false;
    }
  };

  const handleVerify = async (reading: InstrumentReading) => {
    setIsSyncing(true);
    setSyncError(null);

    // 1. Get detailed panel info (to get Location/Room for PAC sheet)
    const panelInfo = panels.find(p => p.id === reading.panelId);

    // 2. Sync to Google Sheet
    if (googleSheetUrl) {
      const success = await syncToGoogleSheet(reading, panelInfo?.location);
      if (!success) {
        setSyncError("Failed to sync to Spreadsheet. Please check internet or URL.");
        setIsSyncing(false);
        return; // Stop if sync fails? Or allow local save? Let's stop to warn user.
      }
    }

    // 3. Update Local State
    onUpdateReading({
      ...reading,
      status: ReadingStatus.VERIFIED
    });

    setIsSyncing(false);
    setEditingReading(null);
  };

  const handleSaveEdit = async () => {
    if (!editingReading) return;

    onUpdateReading(editingReading);

    // --- SMART MEMORY TRIGGER ---
    try {
      if (editingReading.imageUrl && editingReading.imageUrl.includes("localhost")) {
        const filename = editingReading.imageUrl.split('/').pop();
        if (filename) {
          const res = await fetch(`http://localhost:8000/api/reading/${filename}`);
          const data = await res.json();

          if (data.raw_text) {
            // Build readings dict from verifiedReadings for the learn endpoint
            const vr: VerifiedReading[] = (editingReading as any).verifiedReadings || [];
            const readingsDict: Record<string, number | null> = {};
            vr.forEach(r => { readingsDict[r.name] = r.value; });

            await fetch('http://localhost:8000/api/learn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                panel_name: editingReading.panelName,
                readings:   readingsDict,
                raw_text:   data.raw_text
              })
            });
            console.log("Smart Memory Updated!");
          }
        }
      }
    } catch (e) {
      console.error("Failed to update Smart Memory:", e);
    }

    setEditingReading(null);
  };

  const handleReject = (reading: InstrumentReading) => {
    onUpdateReading({
      ...reading,
      status: ReadingStatus.REJECTED
    });
    setEditingReading(null);
  };

  const handleRestore = (reading: InstrumentReading) => {
    onUpdateReading({
      ...reading,
      status: ReadingStatus.PENDING
    });
  };

  const handlePermanentDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDeleteReading(id);
  }

  const handlePanelSubmit = () => {
    const params: PanelParameterDef[] = ((panelForm.parameters || []) as any[]).map(normalizeParameter);
    if (panelForm.id) {
      onUpdatePanel({ ...panelForm, parameters: params } as Panel);
    } else {
      onAddPanel({ ...panelForm, parameters: params, id: crypto.randomUUID() } as Panel);
    }
    setIsPanelModalOpen(false);
    setPanelForm({});
    setCustomParamInput('');
    setCustomUnitInput('');
  };

  const openPanelModal = (panel?: Panel) => {
    // Normalise existing parameters to new format
    const existingParams = (panel?.parameters || []).map(normalizeParameter);
    setPanelForm(panel ? { ...panel, parameters: existingParams } : {
      name: '',
      location: '',
      type: 'Digital',
      parameters: [] as any
    });
    setCustomParamInput('');
    setCustomUnitInput('');
    setIsPanelModalOpen(true);
  };

  const handleSaveSettings = () => {
    onUpdateGoogleSheetUrl(tempUrl);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleModelUpload = async (endpoint: string, file: File, key: string) => {
    setModelUploadStatus(prev => ({ ...prev, [key]: 'uploading' }));
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`http://localhost:8000${endpoint}`, { method: 'POST', body: form });
      const data = await res.json();
      setModelUploadStatus(prev => ({ ...prev, [key]: data.status === 'success' ? 'success' : 'error' }));
    } catch (e) {
      setModelUploadStatus(prev => ({ ...prev, [key]: 'error' }));
    }
    setTimeout(() => setModelUploadStatus(prev => ({ ...prev, [key]: '' })), 3000);
  };

  // --- Render Functions ---

  const renderDashboard = () => (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard icon={<Thermometer />} label="Avg. Temperature" value={`${avgTemp}°C`} subValue="Normal Range" color="blue" />
        <StatCard icon={<Zap />} label="Total Power Load" value={`${totalPower} kW`} subValue="Verified Usage" color="yellow" />
        <StatCard icon={<CheckSquare />} label="Pending Reviews" value={pendingReadings.length.toString()} subValue="Action Required" color={pendingReadings.length > 0 ? "red" : "green"} />
        <StatCard icon={<Activity />} label="Total Readings" value={readings.length.toString()} subValue="All time" color="green" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Temperature Trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none' }} />
                <Line type="monotone" dataKey="temp" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Power Consumption (kW)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                <Bar dataKey="power" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );

  const renderVerification = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-gray-800">Verification Queue</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition-all disabled:opacity-60"
            title="Refresh data dari backend"
          >
            <RotateCcw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
            {pendingReadings.length} Pending
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pendingReadings.map(reading => (
          <div key={reading.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="relative h-48 bg-gray-100">
              <img src={reading.imageUrl} alt="Panel" className="w-full h-full object-cover" />
              <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
                {new Date(reading.timestamp).toLocaleTimeString()}
              </div>
              <div className="absolute top-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold shadow-sm">
                {reading.shift}
              </div>
            </div>
            <div className="p-4 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-bold text-gray-900">{reading.panelName}</h4>
                  <p className="text-xs text-gray-500">By {reading.operatorName}</p>
                </div>
                {/* OCR Status Badge */}
                <div>
                  {reading.ocr_status === 'COMPLETED' ? (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
                      <CheckCircle size={12} />
                      Completed
                    </span>
                  ) : reading.ocr_status === 'FAILED' ? (
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full flex items-center gap-1">
                      <AlertCircle size={12} />
                      Failed
                    </span>
                  ) : reading.ocr_status === 'PROCESSING' ? (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full flex items-center gap-1 animate-pulse">
                      <Loader2 size={12} className="animate-spin" />
                      Processing
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-full flex items-center gap-1">
                      <Clock size={12} />
                      Queued
                    </span>
                  )}
                </div>
              </div>

              {/* Dynamic param preview */}
              {(() => {
                const panel = panels.find(p => p.id === reading.panelId);
                const params = panel?.parameters || ['voltage', 'current', 'power'];
                const paramDefs = params.map(normalizeParameter);
                return (
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    {paramDefs.slice(0, 5).map((pd, idx) => {
                      const vrVal = (reading.verifiedReadings || []).find(vr => vr.name === pd.name)?.value;
                      const ocrVal = reading.ocrReadings?.[pd.name];
                      const flatVal = reading[pd.name] ?? reading[pd.name.toLowerCase()];
                      const value = vrVal ?? ocrVal ?? flatVal ?? '-';
                      return (
                        <div key={idx} className="truncate">
                          <span className="text-gray-400 text-xs">{pd.name}:</span> {value} {pd.unit && <span className="text-gray-400 text-[10px]">({pd.unit})</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <button
                onClick={() => openVerification(reading)}
                className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold shadow-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
              >
                {reading.ocr_status === 'COMPLETED' ? (
                  <><CheckCircle size={18} /> Review & Verify</>
                ) : reading.ocr_status === 'PROCESSING' || reading.ocr_status === 'PENDING' ? (
                  <><Loader2 size={18} className="animate-spin" /> Review & Verify (OCR In Progress)</>
                ) : (
                  <><Activity size={18} /> Review & Verify</>
                )}
              </button>

            </div>
          </div>
        ))}

        {pendingReadings.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-400 bg-white rounded-xl border border-dashed border-gray-200">
            <CheckSquare className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p>No pending readings. Good job!</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderRejected = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-gray-800">Rejected Items</h3>
        <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
          {rejectedReadings.length} Rejected
        </span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 font-semibold uppercase text-xs">
            <tr>
              <th className="px-6 py-4">Image</th>
              <th className="px-6 py-4">Panel Info</th>
              <th className="px-6 py-4">Time / Operator</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rejectedReadings.map((reading) => (
              <tr key={reading.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <img src={reading.imageUrl} alt="Thumb" className="w-12 h-12 object-cover rounded-lg border border-gray-200" />
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-gray-900">{reading.panelName}</div>
                  <div className="text-xs text-gray-500">ID: {reading.id.slice(0, 8)}</div>
                </td>
                <td className="px-6 py-4">
                  <div>{new Date(reading.timestamp).toLocaleString()}</div>
                  <div className="text-xs text-gray-500">By {reading.operatorName} ({reading.shift})</div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">REJECTED</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleRestore(reading)}
                    title="Restore to Verification Queue"
                    className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg mr-2 transition-colors"
                  >
                    <RotateCcw size={18} />
                  </button>
                  <button
                    onClick={(e) => handlePermanentDelete(e, reading.id)}
                    title="Delete Permanently"
                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {rejectedReadings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                  No rejected items.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderReports = () => {
    // Filter logic for report
    const reportData = verifiedReadings.filter(r => {
      const rDate = new Date(r.timestamp).toISOString().split('T')[0];
      const matchDate = rDate === reportDate;
      const matchShift = reportShift === 'All' || r.shift === reportShift;
      return matchDate && matchShift;
    });

    const usedParamsSet = new Set<string>();
    // Collect all parameter names used in report data
    reportData.forEach(r => {
      const panel = panels.find(p => p.id === r.panelId);
      (panel?.parameters || []).forEach((p: any) => {
        usedParamsSet.add(normalizeParameter(p).name);
      });
      // Also include verifiedReadings keys
      ((r as any).verifiedReadings || []).forEach((vr: any) => {
        if (vr.name) usedParamsSet.add(vr.name);
      });
    });
    const usedParams = Array.from(usedParamsSet);

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-wrap items-end gap-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase">Report Date</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase">Shift</label>
            <select
              value={reportShift}
              onChange={(e) => setReportShift(e.target.value as Shift | 'All')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm min-w-[150px] focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="All">Semua Shift</option>
              <option value="1">Shift 1</option>
              <option value="2">Shift 2</option>
              <option value="3">Shift 3</option>
            </select>
          </div>
          <div className="ml-auto flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
              <Filter size={16} /> Filter
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm">
              <Printer size={16} /> Print Report
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-lg font-bold text-gray-800">
              Daily Report: {new Date(reportDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Showing {reportData.length} records for <span className="font-semibold">{reportShift}</span> shift
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-gray-700 font-semibold uppercase text-xs border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Panel</th>
                  <th className="px-6 py-4">Operator</th>
                  <th className="px-6 py-4">Shift</th>
                  {usedParams.map(paramId => {
                    return <th key={paramId} className="px-6 py-4 text-right">{paramId}</th>
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reportData.length > 0 ? reportData.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono text-xs">{new Date(r.timestamp).toLocaleTimeString()}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{r.panelName}</td>
                    <td className="px-6 py-4">{r.operatorName}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.shift === '1' ? 'bg-orange-100 text-orange-700' :
                        r.shift === '2' ? 'bg-blue-100 text-blue-700' :
                          'bg-indigo-100 text-indigo-700'
                        }`}>
                        Shift {r.shift}
                      </span>
                    </td>
                    {usedParams.map(paramId => {
                      const vrVal = (r.verifiedReadings || []).find((vr: any) => vr.name === paramId)?.value;
                      const value = vrVal !== undefined && vrVal !== null
                        ? vrVal
                        : (r[paramId] !== undefined && r[paramId] !== null ? r[paramId] : null);
                      return (
                        <td key={paramId} className="px-6 py-4 text-right font-mono text-gray-900">
                          {value !== null ? (typeof value === 'number' ? value.toFixed(1) : value) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                      No data available for the selected criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderPanels = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Panel Configuration</h3>
        <button
          onClick={() => openPanelModal()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus size={16} />
          Add Panel
        </button>
      </div>
      <table className="w-full text-left text-sm text-gray-600">
        <thead className="bg-gray-50 text-gray-700 font-semibold uppercase text-xs">
          <tr>
            <th className="px-6 py-4">Name</th>
            <th className="px-6 py-4">Location</th>
            <th className="px-6 py-4">Type</th>
            <th className="px-6 py-4">Params</th>
            <th className="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {panels.map((panel) => (
            <tr key={panel.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 font-medium text-gray-900">{panel.name}</td>
              <td className="px-6 py-4">{panel.location}</td>
              <td className="px-6 py-4">{panel.type}</td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-1">
                  {(panel.parameters || []).map((p: any, i: number) => {
                    const pd = normalizeParameter(p);
                    return (
                      <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100 font-mono">
                        {pd.name}{pd.unit ? <span className="text-blue-400">({pd.unit})</span> : ''}
                      </span>
                    );
                  })}
                  {(!panel.parameters || panel.parameters.length === 0) && <span className="text-gray-400 text-xs">—</span>}
                </div>
              </td>
              <td className="px-6 py-4 text-right">
                <button onClick={() => openPanelModal(panel)} className="text-blue-600 hover:text-blue-800 mr-3">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => onDeletePanel(panel.id)} className="text-red-500 hover:text-red-700">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderSettings = () => (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-green-100 text-green-700 rounded-lg">
            <Database size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">System Integration</h3>
            <p className="text-sm text-gray-500">Connect the dashboard to your external Google Spreadsheet database.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Google Apps Script Web App URL</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={tempUrl}
                  onChange={(e) => setTempUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Paste the deployment URL from your Google Apps Script project (Deploy {'>'} Web App).
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveSettings}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all ${isSaved
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
            >
              {isSaved ? <CheckSquare size={18} /> : <Save size={18} />}
              {isSaved ? 'Configuration Saved' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>

      {/* Model Management */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-purple-100 text-purple-700 rounded-lg">
            <Cpu size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">Model Management</h3>
            <p className="text-sm text-gray-500">Upload model hasil pelatihan (YOLO, Tesseract & PaddleOCR) ke server.</p>
          </div>
        </div>

        <div className="space-y-4">
          {[
            { label: 'YOLO Text/Digit Detection (.pt)', key: 'yolo-text', endpoint: '/api/models/upload/yolo-text', accept: '.pt', ref: yoloTextRef },
            { label: 'YOLO Device Detection (.pt)', key: 'yolo-device', endpoint: '/api/models/upload/yolo-device', accept: '.pt', ref: yoloDeviceRef },
            { label: 'Tesseract Custom Model (.traineddata)', key: 'tesseract', endpoint: '/api/models/upload/tesseract', accept: '.traineddata', ref: tesseractRef },
            { label: 'PaddleOCR Model (.zip)', key: 'paddleocr', endpoint: '/api/models/upload/paddleocr', accept: '.zip', ref: paddleOcrRef },
          ].map(m => (
            <div key={m.key} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl bg-gray-50">
              <div>
                <p className="font-medium text-gray-800 text-sm">{m.label}</p>
                {modelUploadStatus[m.key] === 'success' && <p className="text-xs text-green-600 mt-1 font-semibold">✓ Upload berhasil!</p>}
                {modelUploadStatus[m.key] === 'error' && <p className="text-xs text-red-600 mt-1 font-semibold">✗ Upload gagal.</p>}
                {modelUploadStatus[m.key] === 'uploading' && <p className="text-xs text-blue-600 mt-1 animate-pulse">Mengupload...</p>}
              </div>
              <div className="flex items-center gap-2">
                <input type="file" ref={m.ref} className="hidden" accept={m.accept}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleModelUpload(m.endpoint, f, m.key); }} />
                <button
                  onClick={() => m.ref.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
                >
                  <Upload size={16} /> Upload
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
        <h4 className="font-semibold text-blue-900 mb-2">How to get the URL?</h4>
        <ol className="list-decimal list-inside text-sm text-blue-800 space-y-2">
          <li>Open your Google Spreadsheet.</li>
          <li>Go to <strong>Extensions</strong> &gt; <strong>Apps Script</strong>.</li>
          <li>Deploy your script as a <strong>Web App</strong>.</li>
          <li>Set <em>"Who has access"</em> to <strong>"Anyone"</strong>.</li>
          <li>Copy the generated URL and paste it above.</li>
        </ol>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex-shrink-0 hidden md:flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight leading-tight">Power Meter</h1>
          <p className="text-slate-400 text-xs mt-1">Monitoring Dashboard</p>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {hasPermission(currentUser.role, 'dashboard') && (
            <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label="Overview" />
          )}
          {hasPermission(currentUser.role, 'reports') && (
            <NavItem active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<FileSpreadsheet size={20} />} label="Shift Reports" />
          )}
          {hasPermission(currentUser.role, 'verification') && (
            <NavItem active={activeTab === 'verification'} onClick={() => setActiveTab('verification')} icon={<CheckSquare size={20} />} label="Verification" badge={pendingReadings.length} />
          )}
          {hasPermission(currentUser.role, 'rejected') && (
            <NavItem active={activeTab === 'rejected'} onClick={() => setActiveTab('rejected')} icon={<XCircle size={20} />} label="Rejected" badge={rejectedReadings.length > 0 ? rejectedReadings.length : undefined} />
          )}
          {hasPermission(currentUser.role, 'panels') && (
            <NavItem active={activeTab === 'panels'} onClick={() => setActiveTab('panels')} icon={<Server size={20} />} label="Panels" />
          )}
          {hasPermission(currentUser.role, 'users') && (
            <NavItem active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<Users size={20} />} label="User Management" />
          )}
        </nav>
        {/* Settings + User Info + Logout */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          {hasPermission(currentUser.role, 'settings') && (
            <NavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={20} />} label="Settings" />
          )}
          {/* User badge */}
          <div className="px-3 py-3 rounded-lg bg-slate-800 mt-2">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={15} className="text-slate-400" />
              <span
                style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '0.5px',
                  padding: '2px 8px', borderRadius: 20,
                  background: ROLE_BADGE[currentUser.role]?.bg || '#475569',
                  color: ROLE_BADGE[currentUser.role]?.text || '#fff',
                }}
              >
                {ROLE_BADGE[currentUser.role]?.label || currentUser.role}
              </span>
            </div>
            <p className="text-slate-200 text-sm font-medium truncate">{currentUser.fullName}</p>
            <p className="text-slate-500 text-xs truncate">{currentUser.username}</p>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen">
        <div className="p-8">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'verification' && renderVerification()}
          {activeTab === 'reports' && renderReports()}
          {activeTab === 'rejected' && renderRejected()}
          {activeTab === 'panels' && renderPanels()}
          {activeTab === 'settings' && renderSettings()}
          {activeTab === 'users' && <UserManagement />}
        </div>
      </main>

      {/* Verification Modal */}
      {editingReading && (() => {
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex overflow-hidden">
              {/* Left: Image */}
              <div className="w-1/2 bg-black flex items-center justify-center relative">
                <img src={editingReading.imageUrl} className="max-w-full max-h-full object-contain" alt="evidence" />
                <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs backdrop-blur-sm">
                  {editingReading.shift} Shift
                </div>
              </div>
              {/* Right: OCR Results + Editable Form */}
              <div className="w-1/2 p-6 overflow-y-auto bg-gray-50 flex flex-col gap-5">
                <div>
                  <h3 className="text-xl font-bold text-gray-800 mb-1">Verify Reading</h3>
                  <p className="text-sm text-gray-500">Review AI extracted data against the image.</p>
                </div>

                {/* === OCR Result Table === */}
                {(() => {
                  const ocrData = (editingReading as any);
                  const rows = ocrData.rows_debug || [];
                  const pairs = ocrData.labeled_pairs || ocrData.ocrLabeledPairs || [];

                  // Ensure we check length properly
                  const hasData = (Array.isArray(rows) && rows.length > 0) || (Array.isArray(pairs) && pairs.length > 0);

                  return hasData ? (

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Cpu size={14} className="text-blue-500" />
                        <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">AI OCR Result (Processing Rows)</span>
                      </div>
                      <div className="rounded-xl overflow-hidden border border-blue-100 bg-blue-950 text-blue-100 font-mono">
                        {/* Header */}
                        <div className="grid grid-cols-3 text-xs font-bold uppercase px-4 py-2 bg-blue-900 text-blue-300 border-b border-blue-800">
                          <span>Parameter</span>
                          <span className="text-center">Value</span>
                          <span className="text-right">Symbol</span>
                        </div>
                        {/* Render Rows from rows_debug if available */}
                        {rows.length > 0 ? (
                          rows.map((row: string[], i: number) => (
                            <div
                              key={i}
                              className={`grid grid-cols-3 px-4 py-2 text-sm items-center ${i % 2 === 0 ? 'bg-blue-950' : 'bg-blue-900/40'
                                }`}
                            >
                              <span className="text-blue-300 truncate">{row[0] || '—'}</span>
                              <span className="text-center text-white font-bold tabular-nums">
                                {row[1] || '—'}
                              </span>
                              <span className="text-right text-blue-400">{row[2] || '—'}</span>
                            </div>
                          ))
                        ) : (
                          /* Fallback to legacy pairs format */
                          pairs.map((p: any, i: number) => (
                            <div
                              key={i}
                              className={`grid grid-cols-3 px-4 py-2 text-sm items-center ${i % 2 === 0 ? 'bg-blue-950' : 'bg-blue-900/40'
                                }`}
                            >
                              <span className="text-blue-300 truncate">{p.label}</span>
                              <span className="text-center text-white font-bold tabular-nums">{p.value}</span>
                              <span className="text-right text-blue-400">{p.unit || '—'}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-100 px-4 py-5 flex flex-col items-center gap-2 text-gray-400">
                      <Cpu size={20} />
                      <span className="text-xs text-center">OCR belum dijalankan atau tidak menemukan nilai.<br />Upload foto baru untuk mendapatkan hasil OCR.</span>
                    </div>
                  );
                })()}


                {/* === Editable Form === */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Edit &amp; Correct Values</p>

                  {/* Column headers */}
                  <div className="grid grid-cols-[1fr_110px_72px] gap-2 px-1">
                    <span className="text-xs text-gray-400 font-medium">Parameter</span>
                    <span className="text-xs text-gray-400 font-medium">Value</span>
                    <span className="text-xs text-gray-400 font-medium">Satuan</span>
                  </div>

                  {/* Verified reading rows */}
                  {((editingReading as any).verifiedReadings || []).map((paramVal: VerifiedReading, idx: number) => (
                    <div key={idx} className="grid grid-cols-[1fr_110px_72px] gap-2 items-center">
                      <span className="text-sm font-semibold text-gray-700 truncate" title={paramVal.name}>{paramVal.name}</span>
                      <input
                        type="number"
                        step="any"
                        value={paramVal.value ?? ''}
                        placeholder="—"
                        onChange={(e) => {
                          const updated = [...((editingReading as any).verifiedReadings as VerifiedReading[])];
                          updated[idx] = { ...updated[idx], value: e.target.value === '' ? null : parseFloat(e.target.value) };
                          setEditingReading({ ...editingReading, verifiedReadings: updated } as any);
                        }}
                        className="w-full p-2 border border-gray-300 rounded-lg text-sm font-mono font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <input
                        type="text"
                        value={paramVal.unit || ''}
                        placeholder="unit"
                        onChange={(e) => {
                          const updated = [...((editingReading as any).verifiedReadings as VerifiedReading[])];
                          updated[idx] = { ...updated[idx], unit: e.target.value };
                          setEditingReading({ ...editingReading, verifiedReadings: updated } as any);
                        }}
                        className="w-full p-2 border border-gray-300 rounded-lg text-sm text-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  ))}

                  {((editingReading as any).verifiedReadings || []).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">Tidak ada parameter yang terdaftar untuk panel ini.</p>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                    <textarea
                      className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                      value={editingReading.notes || ''}
                      onChange={(e) => setEditingReading({ ...editingReading, notes: e.target.value })}
                    />
                  </div>
                </div>

                {syncError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                    <AlertCircle size={16} />
                    {syncError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setEditingReading(null)} disabled={isSyncing} className="px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 disabled:opacity-50">Cancel</button>
                  <button onClick={() => handleReject(editingReading)} disabled={isSyncing} className="px-4 py-3 bg-red-50 border border-red-200 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors disabled:opacity-50">Reject</button>
                  <button
                    onClick={() => handleVerify(editingReading)}
                    disabled={isSyncing}
                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 shadow-md transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {isSyncing ? (
                      <><Loader2 className="animate-spin" size={20} />Syncing...</>
                    ) : (
                      <><CheckCircle size={20} />Approve &amp; Save</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Panel Edit Modal */}
      {isPanelModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{panelForm.id ? 'Edit Panel' : 'Add New Panel'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Panel Name</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded-lg" value={panelForm.name || ''} onChange={e => setPanelForm({ ...panelForm, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input type="text" className="w-full p-2 border border-gray-300 rounded-lg" value={panelForm.location || ''} onChange={e => setPanelForm({ ...panelForm, location: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select className="w-full p-2 border border-gray-300 rounded-lg" value={panelForm.type || 'Digital'} onChange={e => setPanelForm({ ...panelForm, type: e.target.value })}>
                  <option value="Digital">Digital Display</option>
                  <option value="Analog">Analog Gauge</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Monitored Parameters</label>

                {/* Column headers for param list */}
                <div className="grid grid-cols-[1fr_80px_32px] gap-2 px-2 mb-1">
                  <span className="text-xs text-gray-400">Nama Parameter</span>
                  <span className="text-xs text-gray-400">Satuan</span>
                  <span />
                </div>

                {/* Current parameters list */}
                <div className="space-y-1.5 max-h-44 overflow-y-auto mb-3">
                  {((panelForm.parameters || []) as any[]).map(normalizeParameter).map((param: PanelParameterDef, idx: number) => (
                    <div key={idx} className="grid grid-cols-[1fr_80px_32px] gap-2 items-center bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5">
                      <span className="text-sm font-medium text-gray-800 truncate">{param.name}</span>
                      <span className="text-xs text-gray-500 font-mono">{param.unit || '—'}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = ((panelForm.parameters || []) as any[]).map(normalizeParameter)
                            .filter((_: PanelParameterDef, i: number) => i !== idx);
                          setPanelForm({ ...panelForm, parameters: updated });
                        }}
                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Hapus parameter"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  {(panelForm.parameters || []).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded-lg">
                      Belum ada parameter. Tambahkan di bawah.
                    </p>
                  )}
                </div>

                {/* Preset quick-add */}
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5 font-medium">Preset Cepat:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_PARAMS
                      .filter(p => !((panelForm.parameters || []) as any[]).map(normalizeParameter)
                        .find((ep: PanelParameterDef) => ep.name === p.name))
                      .map(p => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => {
                            const current = ((panelForm.parameters || []) as any[]).map(normalizeParameter);
                            setPanelForm({ ...panelForm, parameters: [...current, p] });
                          }}
                          className="text-xs px-2.5 py-1 bg-white text-blue-700 border border-blue-300 rounded-full hover:bg-blue-50 transition-colors"
                        >
                          + {p.name}{p.unit ? ` (${p.unit})` : ''}
                        </button>
                      ))
                    }
                  </div>
                </div>

                {/* Add custom parameter */}
                <div>
                  <p className="text-xs text-gray-500 mb-1 font-medium">Tambah Parameter Kustom:</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nama (mis. Vavg)"
                      className="flex-1 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={customParamInput}
                      onChange={e => setCustomParamInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const n = customParamInput.trim();
                          if (n) {
                            const current = ((panelForm.parameters || []) as any[]).map(normalizeParameter);
                            if (!current.find((p: PanelParameterDef) => p.name === n)) {
                              setPanelForm({ ...panelForm, parameters: [...current, { name: n, unit: customUnitInput.trim() }] });
                            }
                            setCustomParamInput('');
                            setCustomUnitInput('');
                          }
                        }
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Satuan"
                      className="w-20 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={customUnitInput}
                      onChange={e => setCustomUnitInput(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const n = customParamInput.trim();
                        if (n) {
                          const current = ((panelForm.parameters || []) as any[]).map(normalizeParameter);
                          if (!current.find((p: PanelParameterDef) => p.name === n)) {
                            setPanelForm({ ...panelForm, parameters: [...current, { name: n, unit: customUnitInput.trim() }] });
                          }
                          setCustomParamInput('');
                          setCustomUnitInput('');
                        }
                      }}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button onClick={() => setIsPanelModalOpen(false)} className="flex-1 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={handlePanelSubmit} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sub-components ---

const NavItem = ({ active, onClick, icon, label, badge }: any) => (
  <div
    onClick={onClick}
    className={`flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer transition-colors ${active ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
  >
    <div className="flex items-center gap-3">
      {icon}
      <span className="font-medium">{label}</span>
    </div>
    {badge > 0 && (
      <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{badge}</span>
    )}
  </div>
);

const StatCard = ({ icon, label, value, subValue, color }: any) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    red: 'bg-red-100 text-red-600',
  };
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-start gap-4">
      <div className={`p-3 rounded-lg ${colors[color] || colors.blue}`}>
        {React.cloneElement(icon, { size: 24 })}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
        <h4 className="text-2xl font-bold text-gray-900">{value}</h4>
        <p className="text-xs text-gray-400 mt-1">{subValue}</p>
      </div>
    </div>
  );
};

const InputGroup = ({ label, value, onChange }: any) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
    <input
      type="number"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      className="w-full p-3 bg-white rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold text-gray-800"
    />
  </div>
);

export default WebDashboard;