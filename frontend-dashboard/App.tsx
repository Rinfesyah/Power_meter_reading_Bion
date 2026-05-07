import React, { useState, useEffect } from 'react';
import { InstrumentReading, Panel, ReadingStatus } from './types';
import WebDashboard from './components/WebDashboard';

// Demo Data
const DEFAULT_PANELS: Panel[] = [
  { id: 'p1', name: 'Panel-001', location: 'Zone A', type: 'Digital', parameters: ['voltage', 'current', 'power'] },
  { id: 'p2', name: 'Panel-002', location: 'Zone A', type: 'Digital', parameters: ['voltage', 'current', 'power'] },
  { id: 'p3', name: 'UPS A', location: 'Power Room', type: 'Analog', parameters: ['voltage', 'current', 'temperature'] },
  { id: 'p4', name: 'UPS B', location: 'Power Room', type: 'Analog', parameters: ['voltage', 'current', 'temperature'] },
  { id: 'p5', name: 'PAC A', location: 'Cooling', type: 'Digital', parameters: ['temperature', 'humidity'] },
  { id: 'p6', name: 'PAC B', location: 'Cooling', type: 'Digital', parameters: ['temperature', 'humidity'] },
];

const DEMO_READINGS: InstrumentReading[] = [
  {
    id: '1', timestamp: Date.now() - 10000000, imageUrl: 'https://picsum.photos/100', panelId: 'p1', panelName: 'Panel-001', operatorName: 'John', shift: 'Morning', status: ReadingStatus.VERIFIED,
    voltage: 220.5, current: 10.2, temperature: 24.5, power: 2.2
  }
];

const App: React.FC = () => {
  const [readings, setReadings] = useState<InstrumentReading[]>(() => {
    const saved = localStorage.getItem('dc_readings');
    return saved ? JSON.parse(saved) : DEMO_READINGS;
  });

  const [panels, setPanels] = useState<Panel[]>(DEFAULT_PANELS);

  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>(() => {
    return localStorage.getItem('dc_sheet_url') || '';
  });

  useEffect(() => {
    fetch('http://localhost:8000/api/panels')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setPanels(data);
        }
      })
      .catch(err => console.error("Failed to load panels:", err));
  }, []);

  useEffect(() => {
    localStorage.setItem('dc_readings', JSON.stringify(readings));
    localStorage.setItem('dc_sheet_url', googleSheetUrl);
  }, [readings, googleSheetUrl]);

  const handleUpdateReading = (updatedReading: InstrumentReading) => {
    setReadings(prev => prev.map(r => r.id === updatedReading.id ? updatedReading : r));
  };

  const handleDeleteReading = (id: string) => {
    setReadings(prev => prev.filter(r => r.id !== id));
  };

  const handleAddPanel = async (newPanel: Panel) => {
    try {
      const res = await fetch('http://localhost:8000/api/panels', {
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
      const res = await fetch(`http://localhost:8000/api/panels/${updatedPanel.id}`, {
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
        const res = await fetch(`http://localhost:8000/api/panels/${id}`, {
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
      />
    </div>
  );
};

export default App;
