import React, { useState, useEffect } from 'react';
import { Crosshair, Mic, LayoutDashboard, CarFront } from 'lucide-react';
import DriveViewport from './components/DriveViewport';
import './index.css';

function App() {
  // Global State Machine for the Simulation Flow
  const [appState, setAppState] = useState('START'); // START, CALIBRATE, DRIVE, VIVA, REPORT
  
  const [scenarios, setScenarios] = useState([]);

  useEffect(() => {
    // Load scenarios on mount from the public directory
    fetch('/scenarios/scenarios.json')
      .then(res => res.json())
      .then(data => setScenarios(data))
      .catch(err => console.error("Could not load scenarios", err));
  }, []);

  const renderScreen = () => {
    switch (appState) {
      case 'START':
        return (
          <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', maxWidth: '600px' }}>
            <h1 className="title">Gaze<span>Drive</span></h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '3rem', fontSize: '1.2rem', lineHeight: '1.6' }}>
              Advanced Driver Hazard Perception Simulator. Featuring real-time eye tracking, interactive maneuver evaluation, and AI-driven oral vivas.
            </p>
            <button className="btn" onClick={() => setAppState('CALIBRATE')}>
              <Crosshair size={20} style={{ marginRight: '10px' }} />
              Initialize Eye Tracking
            </button>
          </div>
        );
      
      case 'CALIBRATE':
        return (
          <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', maxWidth: '600px' }}>
            <Crosshair size={48} color="var(--accent)" style={{ marginBottom: '1.5rem' }} />
            <h2>WebGazer Calibration</h2>
            <p style={{ color: 'var(--text-muted)', margin: '1.5rem 0' }}>
              Please look at the cursor and click the 9 dots that will appear on your screen to calibrate the eye-tracking model.
            </p>
            {/* We will build the 9-dot grid here later */}
            <button className="btn" onClick={() => setAppState('DRIVE')}>
               Bypass Calibration (Dev Mode)
            </button>
          </div>
        );
      
      case 'DRIVE':
        return (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
             <DriveViewport 
                scenarios={scenarios} 
                onLapComplete={() => setAppState('VIVA')} 
             />
             
             {/* Temporary dev button to skip the lap */}
             <button className="btn" style={{ position: 'absolute', bottom: '2rem', right: '2rem', padding: '10px 20px', fontSize: '0.9rem' }} onClick={() => setAppState('VIVA')}>
                Skip to Viva
             </button>
          </div>
        );
      
      case 'VIVA':
        return (
          <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', minWidth: '600px' }}>
            <Mic size={56} color="var(--accent)" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>AI Oral Assessment</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '1.1rem' }}>
              "Please summarize the primary hazards you evaded during this lap."
            </p>
            {/* 3D R3F Avatar Canvas goes here */}
            <div style={{ height: '200px', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '8px', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>[ 3D Avatar Rendering Space ]</span>
            </div>
            
            <button className="btn" onClick={() => setAppState('REPORT')}>
               Generate Final Score
            </button>
          </div>
        );
      
      case 'REPORT':
        return (
          <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', minWidth: '600px' }}>
            <LayoutDashboard size={56} color="var(--success)" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Assessment Complete</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
              Final telemetry, gaze latency charts, and AI feedback generated.
            </p>
            <button className="btn" onClick={() => setAppState('START')}>
               Start New Candidate
            </button>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      {renderScreen()}
    </div>
  );
}

export default App;
