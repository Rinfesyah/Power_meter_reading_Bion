import React, { useState, useEffect, useCallback } from "react";
import { InstrumentReading, Panel } from "./types";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./components/LoginPage";
import WebDashboard from "./components/WebDashboard";

const BACKEND_URL = "http://localhost:8000";

const DEFAULT_PANELS: Panel[] = [
  { id: "p1", name: "Panel-001", location: "Zone A",     type: "Digital", parameters: [{ name: "Vavg", unit: "V" }, { name: "Iavg", unit: "A" }, { name: "Ptot", unit: "kW" }] },
  { id: "p2", name: "Panel-002", location: "Zone A",     type: "Digital", parameters: [{ name: "Vavg", unit: "V" }, { name: "Iavg", unit: "A" }, { name: "Ptot", unit: "kW" }] },
  { id: "p3", name: "UPS A",    location: "Power Room",  type: "Analog",  parameters: [{ name: "Vavg", unit: "V" }, { name: "Iavg", unit: "A" }, { name: "Temperature", unit: "°C" }] },
  { id: "p4", name: "UPS B",    location: "Power Room",  type: "Analog",  parameters: [{ name: "Vavg", unit: "V" }, { name: "Iavg", unit: "A" }, { name: "Temperature", unit: "°C" }] },
  { id: "p5", name: "PAC A",    location: "Cooling",     type: "Digital", parameters: [{ name: "Temperature", unit: "°C" }, { name: "Humidity", unit: "%" }] },
  { id: "p6", name: "PAC B",    location: "Cooling",     type: "Digital", parameters: [{ name: "Temperature", unit: "°C" }, { name: "Humidity", unit: "%" }] },
];

// Inner component that uses auth context
const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const [readings, setReadings] = useState<InstrumentReading[]>([]);
  const [panels, setPanels] = useState<Panel[]>(DEFAULT_PANELS);
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>(() => {
    return localStorage.getItem("dc_sheet_url") || "";
  });

  // Load panels from backend
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch(`${BACKEND_URL}/api/panels`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setPanels(data); })
      .catch(err => console.error("Failed to load panels:", err));
  }, [isAuthenticated]);

  // Load readings from backend
  const loadReadings = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/readings`);
      const data = await res.json();
      if (Array.isArray(data)) setReadings(data);
    } catch (err) {
      console.error("Failed to load readings:", err);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadReadings();
  }, [isAuthenticated, loadReadings]);

  // Persist sheet URL
  useEffect(() => {
    localStorage.setItem("dc_sheet_url", googleSheetUrl);
  }, [googleSheetUrl]);

  const handleUpdateReading = async (updatedReading: InstrumentReading) => {
    try {
      await fetch(`${BACKEND_URL}/api/readings/${updatedReading.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedReading),
      });
    } catch (e) {
      console.error("Failed to update reading on backend:", e);
    }
    setReadings(prev => prev.map(r => r.id === updatedReading.id ? updatedReading : r));
  };

  const handleDeleteReading = async (id: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/readings/${id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Failed to delete reading on backend:", e);
    }
    setReadings(prev => prev.filter(r => r.id !== id));
  };

  const handleAddPanel = async (newPanel: Panel) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/panels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPanel),
      });
      const updatedPanels = await res.json();
      if (Array.isArray(updatedPanels)) setPanels(updatedPanels);
    } catch (e) {
      console.error("Failed to add panel:", e);
    }
  };

  const handleUpdatePanel = async (updatedPanel: Panel) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/panels/${updatedPanel.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedPanel),
      });
      const updatedPanels = await res.json();
      if (Array.isArray(updatedPanels)) setPanels(updatedPanels);
    } catch (e) {
      console.error("Failed to update panel:", e);
    }
  };

  const handleDeletePanel = async (id: string) => {
    if (confirm("Are you sure?")) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/panels/${id}`, { method: "DELETE" });
        const updatedPanels = await res.json();
        if (Array.isArray(updatedPanels)) setPanels(updatedPanels);
      } catch (e) {
        console.error("Failed to delete panel:", e);
      }
    }
  };

  // Show loading spinner while checking stored session
  if (isLoading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f172a, #1e293b)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, border: "3px solid rgba(59,130,246,0.2)",
          borderTopColor: "#3b82f6", borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <p style={{ color: "#64748b", fontSize: 14 }}>Memuat sesi...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginPage />;
  }

  return (
    <WebDashboard
      readings={readings}
      panels={panels}
      googleSheetUrl={googleSheetUrl}
      currentUser={user}
      onLogout={logout}
      onUpdateGoogleSheetUrl={setGoogleSheetUrl}
      onUpdateReading={handleUpdateReading}
      onDeleteReading={handleDeleteReading}
      onAddPanel={handleAddPanel}
      onUpdatePanel={handleUpdatePanel}
      onDeletePanel={handleDeletePanel}
      onRefreshReadings={loadReadings}
    />
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
