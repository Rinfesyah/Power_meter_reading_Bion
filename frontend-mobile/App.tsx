import React, { useState, useEffect } from 'react';
import { InstrumentReading, Panel, ReadingStatus } from './types';
import MobileOperatorView from './components/MobileOperatorView';

// Demo Data (Keep same for consistency)
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
  // Persistent State for Readings
  const [readings, setReadings] = useState<InstrumentReading[]>(() => {
    const saved = localStorage.getItem('dc_readings');
    return saved ? JSON.parse(saved) : DEMO_READINGS;
  });

  // State for Panels
  const [panels, setPanels] = useState<Panel[]>(DEFAULT_PANELS);

  // Load panels from backend
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

  // Persist Readings
  useEffect(() => {
    localStorage.setItem('dc_readings', JSON.stringify(readings));
  }, [readings]);

  const handleSaveReading = (newReading: InstrumentReading) => {
    setReadings(prev => [newReading, ...prev]);
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
      <MobileOperatorView
        panels={panels}
        readings={readings}
        onSave={handleSaveReading}
      />
    </div>
  );
};

export default App;
