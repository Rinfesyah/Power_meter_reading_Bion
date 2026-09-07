import React, { useState, useEffect } from "react";
import { InstrumentReading, Panel, AuthUser } from "./types";
import MobileLoginView from "./components/MobileLoginView";
import MobileOperatorView from "./components/MobileOperatorView";
import { fetchReadings, saveReading } from "./services/backendService";

const BACKEND_URL = "http://localhost:8000";
const STORAGE_TOKEN_KEY = "bion_mobile_token";
const STORAGE_USER_KEY = "bion_mobile_user";

const DEFAULT_PANELS: Panel[] = [
  { id: "p1", name: "Panel-001", location: "Zone A",    type: "Digital", parameters: [{ name: "Vavg", unit: "V" }, { name: "Iavg", unit: "A" }, { name: "Ptot", unit: "kW" }] },
  { id: "p2", name: "Panel-002", location: "Zone A",    type: "Digital", parameters: [{ name: "Vavg", unit: "V" }, { name: "Iavg", unit: "A" }, { name: "Ptot", unit: "kW" }] },
  { id: "p3", name: "UPS A",    location: "Power Room", type: "Analog",  parameters: [{ name: "Vavg", unit: "V" }, { name: "Iavg", unit: "A" }, { name: "Temperature", unit: "°C" }] },
  { id: "p4", name: "UPS B",    location: "Power Room", type: "Analog",  parameters: [{ name: "Vavg", unit: "V" }, { name: "Iavg", unit: "A" }, { name: "Temperature", unit: "°C" }] },
  { id: "p5", name: "PAC A",    location: "Cooling",    type: "Digital", parameters: [{ name: "Temperature", unit: "°C" }, { name: "Humidity", unit: "%" }] },
  { id: "p6", name: "PAC B",    location: "Cooling",    type: "Digital", parameters: [{ name: "Temperature", unit: "°C" }, { name: "Humidity", unit: "%" }] },
];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const [readings, setReadings] = useState<InstrumentReading[]>([]);
  const [panels, setPanels] = useState<Panel[]>(DEFAULT_PANELS);

  // Restore session from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
    const storedUser = localStorage.getItem(STORAGE_USER_KEY);
    if (storedToken && storedUser) {
      try {
        const parsedUser: AuthUser = JSON.parse(storedUser);
        setToken(storedToken);
        setCurrentUser(parsedUser);
      } catch {
        localStorage.removeItem(STORAGE_TOKEN_KEY);
        localStorage.removeItem(STORAGE_USER_KEY);
      }
    }
    setIsInitializing(false);
  }, []);

  // Load panels and readings once authenticated
  useEffect(() => {
    if (!currentUser) return;
    fetch(`${BACKEND_URL}/api/panels`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setPanels(data); })
      .catch(err => console.error("Failed to load panels:", err));
    loadReadings();
  }, [currentUser]);

  const loadReadings = async () => {
    try {
      const data = await fetchReadings();
      if (Array.isArray(data)) setReadings(data);
    } catch (err) {
      console.error("Failed to load readings:", err);
    }
  };

  const handleLoginSuccess = (user: AuthUser, authToken: string) => {
    setCurrentUser(user);
    setToken(authToken);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
  };

  const handleSaveReading = async (newReading: InstrumentReading) => {
    try {
      await saveReading(newReading);
      setReadings(prev => [newReading, ...prev]);
    } catch (err) {
      console.error("Failed to save reading:", err);
      setReadings(prev => [newReading, ...prev]);
    }
  };

  // Loading screen while checking localStorage
  if (isInitializing) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0f172a, #1e3a5f)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16,
      }}>
        <div style={{
          width: 44, height: 44, border: "3px solid rgba(14,165,233,0.2)",
          borderTopColor: "#0ea5e9", borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <p style={{ color: "#475569", fontSize: 14, fontFamily: "Inter, sans-serif" }}>Memuat...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!currentUser) {
    return <MobileLoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
      {/* Logout bar */}
      <div style={{
        background: "#0f172a", padding: "8px 16px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#94a3b8", fontSize: 12 }}>
          👤 <strong style={{ color: "#e2e8f0" }}>{currentUser.fullName}</strong>
        </span>
        <button
          onClick={handleLogout}
          style={{
            background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
            color: "#fca5a5", padding: "4px 12px", borderRadius: 8,
            fontSize: 12, cursor: "pointer", fontWeight: 600,
          }}
        >
          Logout
        </button>
      </div>
      <MobileOperatorView
        panels={panels}
        readings={readings}
        onSave={handleSaveReading}
        defaultOperatorName={currentUser.fullName}
      />
    </div>
  );
};

export default App;
