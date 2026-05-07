import React, { useState, useRef } from 'react';
import { Camera, ChevronRight, Search, CheckCircle, Wifi, Battery, Server, ArrowLeft, Loader2, User, Clock, Briefcase, RotateCcw, UploadCloud } from 'lucide-react';
import { InstrumentReading, Panel, ReadingStatus, Shift } from '../types';
import { performBackendOCR } from '../services/backendService';

interface Props {
  panels: Panel[];
  readings: InstrumentReading[];
  onSave: (reading: InstrumentReading) => void;
}

interface OperatorSession {
  name: string;
  shift: Shift;
}

const MobileOperatorView: React.FC<Props> = ({ panels, readings, onSave }) => {
  // Session State
  const [session, setSession] = useState<OperatorSession | null>(null);
  const [tempName, setTempName] = useState('');
  const [tempShift, setTempShift] = useState<Shift>('Morning');

  // App State
  const [selectedPanel, setSelectedPanel] = useState<Panel | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [step, setStep] = useState<'login' | 'list' | 'camera' | 'success'>('login');
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredPanels = panels.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Login Handler
  const handleLogin = () => {
    if (tempName.trim()) {
      setSession({ name: tempName, shift: tempShift });
      setStep('list');
    } else {
      alert("Please enter your name");
    }
  };

  const handlePanelSelect = (panel: Panel) => {
    setSelectedPanel(panel);
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
        // Do not upload immediately, wait for user confirmation
      };
      reader.readAsDataURL(file);
    }
    // Reset file input so the same file can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRetake = () => {
    setImage(null);
    setSelectedFile(null);
  };

  const handleSavePhoto = () => {
    if (selectedFile && image) {
      processAndUpload(selectedFile, image);
    }
  };

  const processAndUpload = async (file: File, base64Preview: string) => {
    setIsUploading(true);

    try {
      let ocrResult = {};

      // Try OCR from Python Backend
      try {
        ocrResult = await performBackendOCR(
          file,
          selectedPanel!.name,
          session?.shift || 'Morning',
          session?.name || 'Unknown'
        );
      } catch (ocrError) {
        console.warn("OCR Service failed, proceeding with manual upload", ocrError);
      }

      const newReading: InstrumentReading = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        imageUrl: (ocrResult as any).imageUrl || base64Preview,
        panelId: selectedPanel!.id,
        panelName: selectedPanel!.name,
        operatorName: session?.name || 'Unknown',
        shift: session?.shift || 'Morning',
        status: ReadingStatus.PENDING,
        ...ocrResult
      };

      onSave(newReading);
      setStep('success');
    } catch (e) {
      console.error("Critical Upload Error:", e);
      alert("Failed to upload data. Please try again.");
    } finally {
      setIsUploading(false);
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
    if (!session) return false;
    // Check if there is a reading for this panel, this shift, and today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return readings.some(r =>
      r.panelId === panelId &&
      r.shift === session.shift &&
      r.timestamp >= todayStart.getTime()
    );
  };

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
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Operator Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl py-3 pl-10 pr-4 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Select Shift</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Morning', 'Afternoon', 'Night'] as Shift[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setTempShift(s)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors border ${tempShift === s
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-slate-900 border-slate-600 text-slate-400 hover:border-slate-500'
                      }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleLogin}
              className="w-full bg-blue-500 hover:bg-blue-400 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all mt-4"
            >
              Start Shift
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
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Upload Complete</h2>
        <p className="text-gray-600 mb-8 max-w-xs">
          Reading for <span className="font-semibold text-gray-900">{selectedPanel?.name}</span> captured successfully.
        </p>
        <button
          onClick={reset}
          className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg active:scale-95 transition-transform"
        >
          Next Panel
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
            <button onClick={() => setStep('list')} className="p-1 hover:bg-slate-800 rounded-full">
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
              {session?.name} • <span className="text-blue-400">{session?.shift} Shift</span>
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
                placeholder="Search panel..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            {/* List */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Assigned Panels</h3>
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
                  <p>No panels found.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- View: Camera / Upload --- */}
        {step === 'camera' && (
          <div className="flex flex-col h-full justify-center">

            {isUploading ? (
              <div className="flex flex-col items-center justify-center animate-pulse">
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-4" />
                <h3 className="text-xl font-bold text-gray-800">Uploading...</h3>
                <p className="text-sm text-gray-500">Syncing to server</p>
              </div>
            ) : image ? (
              // --- Preview Mode ---
              <div className="flex flex-col items-center h-full">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center mb-6 w-full">
                  <h3 className="text-lg font-semibold text-gray-800 mb-1">{selectedPanel?.name}</h3>
                  <p className="text-sm text-gray-500">Preview Capture</p>
                </div>

                <div className="w-full bg-black rounded-3xl overflow-hidden mb-6 flex items-center justify-center relative shadow-lg flex-1 min-h-[300px]">
                  <img src={image} alt="Preview" className="w-full h-full object-contain" />
                </div>

                <div className="flex gap-4 w-full">
                  <button
                    onClick={handleRetake}
                    className="flex-1 py-4 border border-gray-300 bg-white text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={20} />
                    Retake
                  </button>
                  <button
                    onClick={handleSavePhoto}
                    className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <UploadCloud size={20} />
                    Save
                  </button>
                </div>
              </div>
            ) : (
              // --- Camera/Select Mode ---
              <>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-1">{selectedPanel?.name}</h3>
                  <p className="text-sm text-gray-500">Capture the display clearly.</p>
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
                  <span className="text-blue-700 font-bold z-10">Tap to Take Photo</span>
                  <span className="text-xs text-blue-400 mt-1 z-10">or select from gallery</span>

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