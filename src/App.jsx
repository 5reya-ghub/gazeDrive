import React, { useState, useEffect } from 'react';
import { Crosshair, Mic, LayoutDashboard, CarFront } from 'lucide-react';
import DriveViewport from './components/DriveViewport';
import CalibrationViewport from './components/CalibrationViewport';
import './index.css';

function App() {
  // Global State Machine for the Simulation Flow
  const [appState, setAppState] = useState('START'); // START, CALIBRATE, DRIVE, VIVA, REPORT
  const [scenarios, setScenarios] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastMetrics, setLastMetrics] = useState(null);

  useEffect(() => {
    // Load scenarios on mount from the public directory
    fetch('/scenarios/scenarios.json')
      .then(res => res.json())
      .then(data => setScenarios(data))
      .catch(err => console.error("Could not load scenarios", err));
  }, []);

  const validScenarios = scenarios.filter(s => s.video_url);

  const handleScenarioComplete = (metrics) => {
      setLastMetrics(metrics);
      setAppState('VIVA');
  };

  const handleNextScenario = () => {
      if (currentIndex < validScenarios.length - 1) {
          setCurrentIndex(curr => curr + 1);
          setAppState('DRIVE');
      } else {
          setAppState('REPORT');
      }
  };

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
          <>
            <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', maxWidth: '600px' }}>
              <Crosshair size={48} color="var(--accent)" style={{ marginBottom: '1.5rem' }} />
              <h2>Initializing Camera...</h2>
              <button className="btn" onClick={() => setAppState('DRIVE')} style={{ marginTop: '2rem' }}>
                 Bypass Calibration (Dev Mode)
              </button>
            </div>
            <CalibrationViewport onCalibrated={() => setAppState('DRIVE')} />
          </>
        );
      
      case 'DRIVE':
        return (
           <DriveViewport 
              scenario={validScenarios[currentIndex]} 
              onScenarioComplete={handleScenarioComplete} 
           />
        );
      
      case 'VIVA':
        return (
          <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', minWidth: '600px' }}>
            <Mic size={56} color="var(--accent)" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>AI Oral Assessment</h2>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '1.1rem' }}>
              "Please summarize the primary hazards you evaded during this lap."
            </p>
            
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px', marginBottom: '2rem', display: 'inline-block', textAlign: 'left' }}>
               <h4 style={{ color: '#10b981', margin: '0 0 10px 0' }}>Latest grading metrics:</h4>
               <p style={{ margin: '5px 0' }}>Physical Action: <strong style={{ color: lastMetrics?.actionCorrect ? '#10b981' : '#ef4444' }}>{lastMetrics?.actionCorrect ? 'Perfect Evasion' : 'Collision'}</strong></p>
               <p style={{ margin: '5px 0' }}>Primary Gaze Latency: <strong>{lastMetrics?.primaryLatency ? `${lastMetrics.primaryLatency.toFixed(2)}s` : 'Failed'}</strong></p>
               <p style={{ margin: '5px 0' }}>Situational Awareness: <strong>{lastMetrics?.secondarySpotted ? 'Bonus Earned' : 'None'}</strong></p>
            </div>

            {/* 3D R3F Avatar Canvas goes here */}
            <div style={{ height: '200px', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '8px', marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>[ 3D Avatar Rendering Space ]</span>
            </div>
            
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
               <button className="btn" style={{ background: '#374151', color: 'white' }} onClick={() => setAppState('CALIBRATE')}>
                  Re-calibrate
               </button>
               {!lastMetrics?.actionCorrect && (
                   <button className="btn" style={{ background: '#ef4444', color: 'white' }} onClick={() => setAppState('DRIVE')}>
                      Retry Scenario
                   </button>
               )}
               <button className="btn" onClick={handleNextScenario}>
                  {currentIndex < validScenarios.length - 1 ? 'Next Scenario' : 'Finish Assessment'}
               </button>
            </div>
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
            <button className="btn" onClick={() => {
                setCurrentIndex(0);
                setAppState('START');
            }}>
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
