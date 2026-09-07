import React, { useState, useRef } from 'react';
import { Camera, ChevronRight, Search, CheckCircle, Wifi, Battery, Server, ArrowLeft, Loader2, User, Clock, Briefcase, RotateCcw, UploadCloud, ImageIcon, ScanLine } from 'lucide-react';
import { InstrumentReading, Panel, ReadingStatus, Shift } from '../types';
import { performBackendOCR, pollForOCRResult } from '../services/backendService';

interface Props {
  panels: Panel[];
  readings: InstrumentReading[];
  onSave: (reading: InstrumentReading) => void;
  defaultOperatorName?: string; // Auto-filled from logged-in user
}

interface OperatorSession {
  name: string;
  shift: Shift;
  hour: string;
}

const SHIFT_OPTIONS: { value: Shift; label: string }[] = [
  { value: '1', label: 'Shift 1' },
  { value: '2', label: 'Shift 2' },
  { value: '3', label: 'Shift 3' },
];

const MobileOperatorView: React.FC<Props> = ({ panels, readings, onSave, defaultOperatorName }) => {
  // Session State
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [tempName, setTempName] = useState(defaultOperatorName || '');
  const [tempShift, setTempShift] = useState<Shift>('1');
  const [tempHour, setTempHour] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  // App State
  const [selectedPanel, setSelectedPanel] = useState<Panel | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('Mengupload...');
  const [step, setStep] = useState<'login' | 'list' | 'camera' | 'success'>('login');
  const [searchTerm, setSearchTerm] = useState('');
  const [lastOcrResult, setLastOcrResult] = useState<Record<string, any> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPanels = panels.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper: Get existing reading for a panel in current shift+hour
  const getExistingReading = (panelId: string): InstrumentReading | undefined => {
    if (!session) return undefined;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return readings.find(r =>
      r.panelId === panelId &&
      r.shift === session.shift &&
      r.hour === session.hour &&
      r.timestamp >= todayStart.getTime()
    );
  };

  // Login Handler
  const handleLogin = () => {
    if (tempName.trim()) {
      setSession({ name: tempName, shift: tempShift, hour: tempHour });
      setStep('list');
    } else {
      alert("Masukkan nama Anda");
    }
  };

  const handlePanelSelect = (panel: Panel) => {
    setSelectedPanel(panel);

    // Check for existing reading
    const existing = getExistingReading(panel.id);
    if (existing && existing.imageUrl) {
      // Show existing photo
      setImage(existing.imageUrl);
      setSelectedFile(null); // No new file selected
    } else {
      setImage(null);
      setSelectedFile(null);
    }

    setStep('camera');
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setImage(base64);
        setSelectedFile(file);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRetake = () => {
    setImage(null);
    setSelectedFile(null);
  };

  const handleReupload = () => {
    // Reset to allow new upload
    setImage(null);
    setSelectedFile(null);
    // Open file picker
    setTimeout(() => fileInputRef.current?.click(), 100);
  };

  const handleSavePhoto = () => {
    if (selectedFile && image) {
      processAndUpload(selectedFile, image);
    }
  };

  /**
   * Maps standard OCR output keys (voltage, current, etc.) to the panel's
   * actual parameter names (e.g. "Vavg (V)", "Iavg (A)", "Ptot (kW)").
   * This ensures OCR results populate the correct fields in the dashboard.
   */
  const mapOcrToPanel = (
    ocrReadings: Record<string, any>,
    panelParams: string[] | undefined
  ): Record<string, any> => {
    if (!panelParams || panelParams.length === 0 || Object.keys(ocrReadings).length === 0) {
      return ocrReadings; // No mapping needed
    }

    // Standard OCR key → keywords that match panel parameter names
    const keywordMap: Record<string, string[]> = {
      voltage: ['voltage', 'volt', 'vavg', 'v avg', 'vln', 'vll', 'tegangan'],
      current: ['current', 'amp', 'iavg', 'i avg', 'arus'],
      power: ['power', 'ptot', 'p tot', 'pwr', 'watt', 'daya'],
      energy: ['energy', 'e del', 'edel', 'kwh', 'mwh', 'energi'],
      temperature: ['temperature', 'temp', 'suhu', 'celsius'],
      humidity: ['humidity', 'hum', 'kelembaban', 'rh'],
      frequency: ['frequency', 'freq', 'hz', 'frekuensi'],
      power_factor: ['power_factor', 'pf', 'cos', 'cosphi'],
    };

    const mapped: Record<string, any> = {};
    const usedOcrKeys = new Set<string>();

    for (const param of panelParams) {
      const pl = param.toLowerCase();

      // Direct match: param name IS a standard key
      if (ocrReadings[param] !== undefined) {
        mapped[param] = ocrReadings[param];
        usedOcrKeys.add(param);
        continue;
      }

      // Fuzzy match: check if param name contains any keyword for a standard key
      for (const [ocrKey, keywords] of Object.entries(keywordMap)) {
        if (usedOcrKeys.has(ocrKey) || ocrReadings[ocrKey] === undefined) continue;
        if (keywords.some(kw => pl.includes(kw))) {
          mapped[param] = ocrReadings[ocrKey];
          usedOcrKeys.add(ocrKey);
          break;
        }
      }
    }

    // Also include any remaining standard keys that weren't mapped
    for (const [k, v] of Object.entries(ocrReadings)) {
      if (!usedOcrKeys.has(k)) {
        mapped[k] = v;
      }
    }

    return mapped;
  };

  const processAndUpload = async (file: File, base64Preview: string) => {
    setIsUploading(true);
    setUploadStatus('Mengunggah gambar ke server...');

    try {
      let finalImageUrl = base64Preview;
      let uploadFilename = '';

      // Upload to backend — OCR runs in background, operator doesn't wait
      try {
        const uploadResult = await performBackendOCR(
          file,
          selectedPanel!.name,
          selectedPanel!.id,
          session?.shift || '1',
          session?.name || 'Unknown',
          (selectedPanel?.parameters || []) as any[] // send full {name, unit} objects
        );

        finalImageUrl = uploadResult.imageUrl || base64Preview;
        uploadFilename = uploadResult.filename || '';
      } catch (uploadError) {
        console.warn('Backend upload failed, saving with local image:', uploadError);
      }

      // Save reading immediately — OCR results will be fetched by dashboard later
      const newReading: InstrumentReading = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        imageUrl: finalImageUrl,
        panelId: selectedPanel!.id,
        panelName: selectedPanel!.name,
        operatorName: session?.name || 'Unknown',
        shift: session?.shift || '1',
        hour: session?.hour || '',
        ocrFilename: uploadFilename, // dashboard uses this to fetch OCR results
        status: ReadingStatus.PENDING,
        notes: '',
      };

      onSave(newReading);
      setStep('success');
    } catch (e) {
      console.error('Critical Upload Error:', e);
      alert('Gagal mengupload data. Silakan coba lagi.');
    } finally {
      setIsUploading(false);
      setUploadStatus('Mengupload...');
    }
  };

  const reset = () => {
    setSelectedPanel(null);
    setImage(null);
    setSelectedFile(null);
    setStep('list');
  };

  const handleLogout = () => {
    setSession(null);
    setStep('login');
  };

  // Helper to check completion status
  const isPanelCompleted = (panelId: string) => {
    return !!getExistingReading(panelId);
  };

  // Check if the current image is from an existing reading (not a new file)
  const isExistingImage = image && !selectedFile;

  // --- View: Login Screen ---
  if (step === 'login') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-10 text-center">
            <div className="w-20 h-20 bg-blue-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-900/50">
              <Briefcase className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold">DC Field Ops</h1>
            <p className="text-slate-400 mt-2">Instrument Data Collection</p>
          </div>

          <div className="bg-slate-800 p-6 rounded-2xl shadow-xl space-y-6 border border-slate-700">
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Nama Operator</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="Masukkan nama anda"
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl py-3 pl-10 pr-4 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Pilih Shift</label>
              <div className="grid grid-cols-3 gap-2">
                {SHIFT_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setTempShift(s.value)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors border ${tempShift === s.value
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-slate-900 border-slate-600 text-slate-400 hover:border-slate-500'
                      }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Pilih Jam</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="time"
                  value={tempHour}
                  onChange={(e) => setTempHour(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <button
              onClick={handleLogin}
              className="w-full bg-blue-500 hover:bg-blue-400 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all mt-4"
            >
              Mulai Shift
            </button>
          </div>

          <p className="text-center text-slate-600 text-xs mt-8">System v2.5.0 • Authorized Access Only</p>
        </div>
      </div>
    );
  }

  // --- View: Success Screen ---
  if (step === 'success') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-gray-50 min-h-screen">
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-sm">
          <CheckCircle className="w-12 h-12 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Upload Berhasil</h2>
        <p className="text-gray-600 mb-8 max-w-xs">
          Data untuk <span className="font-semibold text-gray-900">{selectedPanel?.name}</span> berhasil disimpan.
        </p>
        <button
          onClick={reset}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg active:scale-95 transition-transform"
        >
          Panel Berikutnya
        </button>
      </div>
    );
  }

  // --- View: Main App Wrapper ---
  return (
    <div className="flex flex-col bg-gray-50 max-w-md mx-auto shadow-2xl overflow-hidden min-h-screen relative">

      {/* Status Bar */}
      <div className="bg-slate-900 text-white p-4 pt-10 pb-4 rounded-b-3xl shadow-md z-20 flex justify-between items-center sticky top-0">
        <div className="flex items-center gap-3">
          {step === 'camera' ? (
            <button onClick={() => { setStep('list'); setImage(null); setSelectedFile(null); }} className="p-1 hover:bg-slate-800 rounded-full">
              <ArrowLeft size={20} />
            </button>
          ) : (
            <button onClick={handleLogout} className="p-1 hover:bg-slate-800 rounded-full">
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold">Field Ops</h1>
            <p className="text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-1">
              {session?.name} • <span className="text-blue-400">Shift {session?.shift}</span> • <span className="text-green-400">{session?.hour}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2 text-slate-400">
          <Wifi size={14} />
          <Battery size={14} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20">

        {/* --- View: Panel List --- */}
        {step === 'list' && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Cari panel..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            {/* List */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Daftar Panel</h3>
              {filteredPanels.map((panel) => {
                const isCompleted = isPanelCompleted(panel.id);
                return (
                  <div
                    key={panel.id}
                    onClick={() => handlePanelSelect(panel)}
                    className={`bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between active:bg-blue-50 transition-colors cursor-pointer ${isCompleted ? 'border-green-200 bg-green-50/30' : 'border-gray-100'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isCompleted ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                        <Server size={20} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-800">{panel.name}</h4>
                        <p className="text-xs text-gray-500">{panel.location}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCompleted && (
                        <CheckCircle className="text-green-500 fill-green-100" size={24} />
                      )}
                      <ChevronRight size={18} className="text-gray-300" />
                    </div>
                  </div>
                );
              })}

              {filteredPanels.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  <p>Panel tidak ditemukan.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- View: Camera / Upload --- */}
        {step === 'camera' && (
          <div className="flex flex-col h-full justify-center">

            {isUploading ? (
              <div className="flex flex-col items-center justify-center gap-4 p-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
                    <ScanLine className="w-10 h-10 text-blue-600 animate-pulse" />
                  </div>
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin absolute -bottom-1 -right-1" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-bold text-gray-800">Memproses...</h3>
                  <p className="text-sm text-blue-600 font-medium mt-1 animate-pulse">{uploadStatus}</p>
                  <p className="text-xs text-gray-400 mt-2">Pipeline: YOLO → Preprocessing → OCR</p>
                </div>
              </div>
            ) : image ? (
              // --- Preview Mode (new photo OR existing photo) ---
              <div className="flex flex-col items-center h-full">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center mb-6 w-full">
                  <h3 className="text-lg font-semibold text-gray-800 mb-1">{selectedPanel?.name}</h3>
                  <p className="text-sm text-gray-500">
                    {isExistingImage ? 'Foto yang sudah diupload' : 'Preview Foto'}
                  </p>
                </div>

                <div className="w-full bg-black rounded-3xl overflow-hidden mb-6 flex items-center justify-center relative shadow-lg flex-1 min-h-[300px]">
                  <img src={image} alt="Preview" className="w-full h-full object-contain" />
                  {isExistingImage && (
                    <div className="absolute top-3 right-3 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                      ✓ Sudah Diupload
                    </div>
                  )}
                </div>

                <div className="flex gap-4 w-full">
                  {isExistingImage ? (
                    // Existing photo: show reupload button
                    <button
                      onClick={handleReupload}
                      className="flex-1 py-4 bg-orange-500 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <RotateCcw size={20} />
                      Upload Ulang
                    </button>
                  ) : (
                    // New photo: show retake + save
                    <>
                      <button
                        onClick={handleRetake}
                        className="flex-1 py-4 border border-gray-300 bg-white text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                      >
                        <RotateCcw size={20} />
                        Ulangi
                      </button>
                      <button
                        onClick={handleSavePhoto}
                        className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <UploadCloud size={20} />
                        Simpan
                      </button>
                    </>
                  )}
                </div>

                {/* Hidden file input for reupload */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                />
              </div>
            ) : (
              // --- Camera/Select Mode ---
              <>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-1">{selectedPanel?.name}</h3>
                  <p className="text-sm text-gray-500">Ambil foto display dengan jelas.</p>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-4 border-dashed border-blue-200 bg-blue-50 rounded-3xl h-96 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-100 transition-colors relative overflow-hidden group"
                >
                  {/* Fake Camera UI Overlay */}
                  <div className="absolute inset-0 border-[30px] border-black/5 pointer-events-none group-hover:border-black/10 transition-all"></div>

                  <div className="bg-white p-5 rounded-full shadow-lg mb-4 z-10 group-active:scale-95 transition-transform">
                    <Camera className="w-12 h-12 text-blue-600" />
                  </div>
                  <span className="text-blue-700 font-bold z-10">Tap untuk Ambil Foto</span>
                  <span className="text-xs text-blue-400 mt-1 z-10">atau pilih dari galeri</span>

                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                  />
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default MobileOperatorView;