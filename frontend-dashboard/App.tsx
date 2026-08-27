import React, { useState, useEffect, useCallback } from 'react';
import { InstrumentReading, Panel, ReadingStatus } from './types';
import WebDashboard from './components/WebDashboard';

const BACKEND_URL = 'http://localhost:8000';

const DEFAULT_PANELS: Panel[] = [
  { id: 'p1', name: 'Panel-001', location: 'Zone A',     type: 'Digital', parameters: [{ name: 'Vavg', unit: 'V' }, { name: 'Iavg', unit: 'A' }, { name: 'Ptot', unit: 'kW' }] },
  { id: 'p2', name: 'Panel-002', location: 'Zone A',     type: 'Digital', parameters: [{ name: 'Vavg', unit: 'V' }, { name: 'Iavg', unit: 'A' }, { name: 'Ptot', unit: 'kW' }] },
  { id: 'p3', name: 'UPS A',    location: 'Power Room',  type: 'Analog',  parameters: [{ name: 'Vavg', unit: 'V' }, { name: 'Iavg', unit: 'A' }, { name: 'Temperature', unit: '°C' }] },
  { id: 'p4', name: 'UPS B',    location: 'Power Room',  type: 'Analog',  parameters: [{ name: 'Vavg', unit: 'V' }, { name: 'Iavg', unit: 'A' }, { name: 'Temperature', unit: '°C' }] },
  { id: 'p5', name: 'PAC A',    location: 'Cooling',     type: 'Digital', parameters: [{ name: 'Temperature', unit: '°C' }, { name: 'Humidity', unit: '%' }] },
  { id: 'p6', name: 'PAC B',    location: 'Cooling',     type: 'Digital', parameters: [{ name: 'Temperature', unit: '°C' }, { name: 'Humidity', unit: '%' }] },
];

const App: React.FC = () => {
  const [readings, setReadings] = useState<InstrumentReading[]>([]);
  const [panels, setPanels] = useState<Panel[]>(DEFAULT_PANELS);

  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>(() => {
    return localStorage.getItem('dc_sheet_url') || '';
  });

  // Load panels from backend
  const loadPanels = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/panels`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setPanels(data);
      }
    } catch (err) {
      console.error("Failed to load panels:", err);
    }
  }, []);

  useEffect(() => {
    loadPanels();
  }, [loadPanels]);

  // Load readings from backend
  const loadReadings = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/readings`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setReadings(data);
      }
    } catch (err) {
      console.error("Failed to load readings:", err);
    }
  }, []);

  // Initial load + Real-time Server-Sent Events (SSE) Listener
  useEffect(() => {
    loadReadings();

    // Setup SSE connection
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`${BACKEND_URL}/api/events`);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (['READING_CREATED', 'READING_UPDATED', 'READING_DELETED'].includes(payload.type)) {
            loadReadings();
          } else if (payload.type === 'PANELS_UPDATED') {
            loadPanels();
          }
        } catch (e) {
          // Heartbeat or raw message
        }
      };

      eventSource.onerror = () => {
        // Browser automatically reconnects EventSource
      };
    } catch (e) {
      console.warn("SSE not supported or connection error, falling back to window focus sync:", e);
    }

    // Gentle sync when user focuses the tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadReadings();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadReadings, loadPanels]);

  // Persist sheet URL
  useEffect(() => {
    localStorage.setItem('dc_sheet_url', googleSheetUrl);
  }, [googleSheetUrl]);

  const handleUpdateReading = async (updatedReading: InstrumentReading) => {
    // Update on backend
    try {
      await fetch(`${BACKEND_URL}/api/readings/${updatedReading.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedReading),
      });
    } catch (e) {
      console.error("Failed to update reading on backend:", e);
    }
    // Update local state
    setReadings(prev => prev.map(r => r.id === updatedReading.id ? updatedReading : r));
  };

  const handleDeleteReading = async (id: string) => {
    // Delete from backend
    try {
      await fetch(`${BACKEND_URL}/api/readings/${id}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.error("Failed to delete reading on backend:", e);
    }
    // Update local state
    setReadings(prev => prev.filter(r => r.id !== id));
  };

  const handleAddPanel = async (newPanel: Panel) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/panels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPanel)
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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPanel)
      });
      const updatedPanels = await res.json();
      if (Array.isArray(updatedPanels)) setPanels(updatedPanels);
    } catch (e) {
      console.error("Failed to update panel:", e);
    }
  };

  const handleDeletePanel = async (id: string) => {
    if (confirm('Are you sure?')) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/panels/${id}`, {
          method: 'DELETE'
        });
        const updatedPanels = await res.json();
        if (Array.isArray(updatedPanels)) setPanels(updatedPanels);
      } catch (e) {
        console.error("Failed to delete panel:", e);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
      <WebDashboard
        readings={readings}
        panels={panels}
        googleSheetUrl={googleSheetUrl}
        onUpdateGoogleSheetUrl={setGoogleSheetUrl}
        onUpdateReading={handleUpdateReading}
        onDeleteReading={handleDeleteReading}
        onAddPanel={handleAddPanel}
        onUpdatePanel={handleUpdatePanel}
        onDeletePanel={handleDeletePanel}
        onRefreshReadings={loadReadings}
      />
    </div>
  );
};

export default App;
