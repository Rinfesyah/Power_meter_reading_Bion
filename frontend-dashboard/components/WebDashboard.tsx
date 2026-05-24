import React, { useState, useRef } from 'react';
import { InstrumentReading, Panel, ReadingStatus, Shift, PanelParameter } from '../types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';
import {
  Activity, Download, Search, Thermometer, Zap, CheckSquare, Trash2, Plus, Edit2,
  LayoutDashboard, Settings, FileSpreadsheet, Filter, Printer, XCircle, RotateCcw,
  Link, Save, Database, Server, Loader2, CheckCircle, AlertCircle, Clock, Upload, Cpu
} from 'lucide-react';

interface Props {
  readings: InstrumentReading[];
  panels: Panel[];
  googleSheetUrl: string;
  onUpdateGoogleSheetUrl: (url: string) => void;
  onUpdateReading: (reading: InstrumentReading) => void;
  onDeleteReading: (id: string) => void;
  onAddPanel: (panel: Panel) => void;
  onUpdatePanel: (panel: Panel) => void;
  onDeletePanel: (id: string) => void;
}

type Tab = 'dashboard' | 'verification' | 'panels' | 'reports' | 'rejected' | 'settings';

const AVAILABLE_PARAMS: { id: PanelParameter, label: string }[] = [
  { id: 'voltage', label: 'Voltage (V)' },
  { id: 'current', label: 'Current (A)' },
  { id: 'power', label: 'Power (kW)' },
  { id: 'temperature', label: 'Temperature (°C)' },
  { id: 'humidity', label: 'Humidity (%)' },
];

const WebDashboard: React.FC<Props> = ({
  readings, panels, googleSheetUrl, onUpdateGoogleSheetUrl, onUpdateReading, onDeleteReading, onAddPanel, onUpdatePanel, onDeletePanel
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
  const yoloTextRef = useRef<HTMLInputElement>(null);
  const yoloDeviceRef = useRef<HTMLInputElement>(null);
  const tesseractRef = useRef<HTMLInputElement>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const BACKEND_URL = 'http://localhost:8000';

  // Open verification modal: fetch OCR results from backend first
  const openVerification = async (reading: InstrumentReading) => {
    setOcrLoading(true);
    let enrichedReading = { ...reading };

    try {
      // Try to fetch OCR result using the ocrFilename or imageUrl
      const filename = (reading as any).ocrFilename
        || (reading.imageUrl?.includes('localhost') ? reading.imageUrl.split('/').pop() : null);

      if (filename) {
        const res = await fetch(`${BACKEND_URL}/api/reading/${filename}`);
        const data = await res.json();

        if (data && data.readings && !data.status) {
          // Store original OCR readings separately
          enrichedReading.ocrReadings = data.readings;

          // Merge OCR readings into the editing copy
          const panel = panels.find(p => p.id === reading.panelId);
          const params = panel?.parameters || [];

          for (const param of params) {
            if (data.readings[param] !== undefined && enrichedReading[param] === undefined) {
              enrichedReading[param] = data.readings[param];
            }
          }

          // Store labeled_pairs and rows_debug for display
          if (data.labeled_pairs) {
            (enrichedReading as any).labeled_pairs = data.labeled_pairs;
          }
          if (data.rows_debug) {
            (enrichedReading as any).rows_debug = data.rows_debug;
          }

        }
      }
    } catch (e) {
      console.warn('Could not fetch OCR results:', e);
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
    if (!googleSheetUrl) return true; // Skip if no URL configured

    try {
      // Prepare payload enriched with location data for the "PAC" sheet requirement
      const payload = {
        ...reading,
        location: panelLocation || ""
      };

      const response = await fetch(googleSheetUrl, {
        method: 'POST',
        mode: 'no-cors', // Important for Google Apps Script Web App
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      // With no-cors, we can't check response.ok, so we assume success if no network error
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

    // Persist to local "database" (mock)
    onUpdateReading(editingReading);

    // --- SMART MEMORY TRIGGER ---
    // 1. Fetch the raw JSON associated with this image to get 'raw_text'
    // The image URL is like: http://localhost:8000/images/2024.../time_panel_file.jpg
    // The backend saves JSON as ...file.jpg.json. 
    // We need to ask backend for it.

    try {
      if (editingReading.imageUrl && editingReading.imageUrl.includes("localhost")) {
        const filename = editingReading.imageUrl.split('/').pop();
        if (filename) {
          // Fetch OCR result to get raw text
          // Removing extension from URL param logic if needed, but backend handles it
          const res = await fetch(`http://localhost:8000/api/reading/${filename}`);
          const data = await res.json();

          if (data.raw_text) {
            // 2. Send Correction to Learning Endpoint
            await fetch('http://localhost:8000/api/learn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                panel_name: editingReading.panelName,
                readings: {
                  voltage: editingReading.voltage,
                  current: editingReading.current,
                  power: editingReading.power,
                  temperature: editingReading.temperature,
                  humidity: editingReading.humidity
                },
                raw_text: data.raw_text
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
    // Ensure parameters are saved
    const params = panelForm.parameters && panelForm.parameters.length > 0
      ? panelForm.parameters
      : ['voltage', 'current', 'temperature', 'humidity', 'power']; // Default to all if none selected (fallback)

    if (panelForm.id) {
      onUpdatePanel({ ...panelForm, parameters: params } as Panel);
    } else {
      onAddPanel({ ...panelForm, parameters: params, id: crypto.randomUUID() } as Panel);
    }
    setIsPanelModalOpen(false);
    setPanelForm({});
  };

  const openPanelModal = (panel?: Panel) => {
    setPanelForm(panel || {
      name: '',
      location: '',
      type: 'Digital',
      parameters: ['voltage', 'current', 'power', 'temperature', 'humidity'] // Default check all
    });
    setCustomParamInput('');
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
        <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
          {pendingReadings.length} Pending
        </span>
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
                return (
                  <div className="grid grid-cols-2 gap-2 text-sm mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    {params.slice(0, 5).map(p => (
                      <div key={p} className="truncate">
                        <span className="text-gray-400 text-xs">{p}:</span> {reading[p] ?? '-'}
                      </div>
                    ))}
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
    // Prioritize order from AVAILABLE_PARAMS
    AVAILABLE_PARAMS.forEach(ap => {
      if (reportData.some(r => r.panelId && panels.find(p => p.id === r.panelId)?.parameters?.includes(ap.id))) {
        usedParamsSet.add(ap.id);
      }
    });
    // Add others
    reportData.forEach(r => {
      const panel = panels.find(p => p.id === r.panelId);
      panel?.parameters?.forEach(p => usedParamsSet.add(p));
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
                    const available = AVAILABLE_PARAMS.find(ap => ap.id === paramId);
                    const label = available ? available.label : (paramId.charAt(0).toUpperCase() + paramId.slice(1));
                    return <th key={paramId} className="px-6 py-4 text-right">{label}</th>
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
                    {usedParams.map(paramId => (
                      <td key={paramId} className="px-6 py-4 text-right font-mono text-gray-900">
                        {r[paramId] !== undefined && r[paramId] !== null ?
                          (typeof r[paramId] === 'number' ? r[paramId].toFixed(1) : r[paramId]) : '-'}
                      </td>
                    ))}
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
              <td className="px-6 py-4 text-xs text-gray-500">
                {panel.parameters?.length ? panel.parameters.map(p => p.slice(0, 3)).join(', ') : 'All'}
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
            <p className="text-sm text-gray-500">Upload model hasil pelatihan (YOLO & Tesseract) ke server.</p>
          </div>
        </div>

        <div className="space-y-4">
          {[
            { label: 'YOLO Text/Digit Detection (.pt)', key: 'yolo-text', endpoint: '/api/models/upload/yolo-text', accept: '.pt', ref: yoloTextRef },
            { label: 'YOLO Device Detection (.pt)', key: 'yolo-device', endpoint: '/api/models/upload/yolo-device', accept: '.pt', ref: yoloDeviceRef },
            { label: 'Tesseract Custom Model (.traineddata)', key: 'tesseract', endpoint: '/api/models/upload/tesseract', accept: '.traineddata', ref: tesseractRef },
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
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label="Overview" />
          <NavItem active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<FileSpreadsheet size={20} />} label="Shift Reports" />
          <NavItem active={activeTab === 'verification'} onClick={() => setActiveTab('verification')} icon={<CheckSquare size={20} />} label="Verification" badge={pendingReadings.length} />
          <NavItem active={activeTab === 'rejected'} onClick={() => setActiveTab('rejected')} icon={<XCircle size={20} />} label="Rejected" badge={rejectedReadings.length > 0 ? rejectedReadings.length : undefined} />
          <NavItem active={activeTab === 'panels'} onClick={() => setActiveTab('panels')} icon={<Server size={20} />} label="Panels" />
        </nav>
        <div className="p-4 border-t border-slate-800">
          <NavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={20} />} label="Settings" />
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
        </div>
      </main>

      {/* Verification Modal */}
      {editingReading && (() => {
        // Determine which fields to show based on the panel config
        const panel = panels.find(p => p.id === editingReading.panelId);
        const showParams = panel?.parameters || ['voltage', 'current', 'temperature', 'humidity', 'power'];

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
                  {showParams.map(paramId => {
                    const available = AVAILABLE_PARAMS.find(ap => ap.id === paramId);
                    const label = available ? available.label : (paramId.charAt(0).toUpperCase() + paramId.slice(1));
                    return (
                      <InputGroup
                        key={paramId}
                        label={label}
                        value={editingReading[paramId]}
                        onChange={(v: string) => setEditingReading({ ...editingReading, [paramId]: v === '' ? undefined : parseFloat(v) })}
                      />
                    );
                  })}

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
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1">
                  {[
                    ...AVAILABLE_PARAMS,
                    ...(panelForm.parameters || [])
                      .filter(p => !AVAILABLE_PARAMS.find(ap => ap.id === p))
                      .map(p => ({ id: p, label: p }))
                  ].map(param => (
                    <label key={param.id} className="flex items-center space-x-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={panelForm.parameters ? panelForm.parameters.includes(param.id) : true}
                        onChange={(e) => {
                          const current = panelForm.parameters || AVAILABLE_PARAMS.map(p => p.id);
                          const updated = e.target.checked
                            ? [...current, param.id]
                            : current.filter(p => p !== param.id);
                          setPanelForm({ ...panelForm, parameters: updated });
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 truncate" title={param.label}>{param.label}</span>
                    </label>
                  ))}
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Add Custom Parameter</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Frequency (Hz)"
                      className="flex-1 p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={customParamInput}
                      onChange={e => setCustomParamInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const newParam = customParamInput.trim();
                          if (newParam) {
                            const currentParams = panelForm.parameters || [];
                            if (!currentParams.includes(newParam)) {
                              setPanelForm({ ...panelForm, parameters: [...currentParams, newParam] });
                            }
                            setCustomParamInput('');
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newParam = customParamInput.trim();
                        if (newParam) {
                          const currentParams = panelForm.parameters || [];
                          if (!currentParams.includes(newParam)) {
                            setPanelForm({ ...panelForm, parameters: [...currentParams, newParam] });
                          }
                          setCustomParamInput('');
                        }
                      }}
                      className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
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