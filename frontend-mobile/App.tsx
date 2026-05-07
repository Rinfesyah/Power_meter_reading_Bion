import React, { useState, useEffect } from 'react';
import { InstrumentReading, Panel, ReadingStatus } from './types';
import MobileOperatorView from './components/MobileOperatorView';
import { fetchReadings, saveReading } from './services/backendService';

const DEFAULT_PANELS: Panel[] = [
  { id: 'p1', name: 'Panel-001', location: 'Zone A', type: 'Digital', parameters: ['voltage', 'current', 'power'] },
  { id: 'p2', name: 'Panel-002', location: 'Zone A', type: 'Digital', parameters: ['voltage', 'current', 'power'] },
  { id: 'p3', name: 'UPS A', location: 'Power Room', type: 'Analog', parameters: ['voltage', 'current', 'temperature'] },
  { id: 'p4', name: 'UPS B', location: 'Power Room', type: 'Analog', parameters: ['voltage', 'current', 'temperature'] },
  { id: 'p5', name: 'PAC A', location: 'Cooling', type: 'Digital', parameters: ['temperature', 'humidity'] },
  { id: 'p6', name: 'PAC B', location: 'Cooling', type: 'Digital', parameters: ['temperature', 'humidity'] },
];

const App: React.FC = () => {
  const [readings, setReadings] = useState<InstrumentReading[]>([]);
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

  // Load readings from backend
  useEffect(() => {
    loadReadings();
  }, []);

  const loadReadings = async () => {
    try {
      const data = await fetchReadings();
      if (Array.isArray(data)) {
        setReadings(data);
      }
    } catch (err) {
      console.error("Failed to load readings:", err);
    }
  };

  const handleSaveReading = async (newReading: InstrumentReading) => {
    try {
      // Save to backend
      await saveReading(newReading);
      // Update local state
      setReadings(prev => [newReading, ...prev]);
    } catch (err) {
      console.error("Failed to save reading:", err);
      // Still save locally even if backend fails
      setReadings(prev => [newReading, ...prev]);
    }
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
