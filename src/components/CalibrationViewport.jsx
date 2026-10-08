import React, { useState, useEffect, useRef } from 'react';
import { gazeEngine } from '../lib/GazeEngine';

export default function CalibrationViewport({ onCalibrated }) {
  const [clicks, setClicks] = useState({});
  const points = [
    { id: 1, top: '15%', left: '15%' }, { id: 2, top: '15%', left: '50%' }, { id: 3, top: '15%', left: '85%' },
    { id: 4, top: '50%', left: '15%' }, { id: 5, top: '50%', left: '50%' }, { id: 6, top: '50%', left: '85%' },
    { id: 7, top: '85%', left: '15%' }, { id: 8, top: '85%', left: '50%' }, { id: 9, top: '85%', left: '85%' },
  ];

  const videoRef = useRef(null);

  useEffect(() => {
    // Initialize our custom MediaPipe engine
    if (videoRef.current) {
      gazeEngine.initialize(videoRef.current);
    }
    
    return () => {
      // Keep the engine running for Drive Viewport, but clear the UI callback
      gazeEngine.onGazeData = null;
    };
  }, []);

  const handleClick = (id, event) => {
    // Record this exact pixel coordinate against the current 3D eye vector
    gazeEngine.recordCalibrationPoint(event.clientX, event.clientY);
    
    setClicks(prev => {
      const newClicks = { ...prev, [id]: (prev[id] || 0) + 1 };
      
      const allDone = points.every(p => newClicks[p.id] >= 3);
      if (allDone) {
        gazeEngine.trainModel(); // Train our 3D-to-2D math model
        onCalibrated();
      }
      return newClicks;
    });
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 50, background: 'rgba(11, 15, 25, 0.9)' }}>
      {/* Tiny invisible video element required by MediaPipe for processing */}
      <video ref={videoRef} style={{ position: 'absolute', top: 0, left: 0, width: '160px', height: '120px', transform: 'scaleX(-1)' }} autoPlay playsInline muted />
      
      <div style={{ position: 'absolute', top: '20px', width: '100%', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--accent)', fontSize: '2rem' }}>Calibrate Eye Tracking</h2>
          <p style={{ color: 'var(--text-main)', fontSize: '1.2rem', marginTop: '10px' }}>
              Please look directly at your mouse cursor and click each dot 3 times.
          </p>
      </div>
      
      {points.map(p => {
        const count = clicks[p.id] || 0;
        if (count >= 3) return null; // Hide dot when calibrated
        
        // Color shifts from Red -> Orange -> Yellow -> Hidden
        const bgColor = count === 0 ? '#ef4444' : count === 1 ? '#f97316' : '#eab308';
        
        return (
          <button
            key={p.id}
            onClick={(e) => handleClick(p.id, e)}
            style={{
              position: 'absolute', top: p.top, left: p.left,
              transform: 'translate(-50%, -50%)',
              width: '40px', height: '40px', borderRadius: '50%',
              backgroundColor: bgColor,
              border: '3px solid white', cursor: 'pointer',
              boxShadow: `0 0 15px ${bgColor}`
            }}
          />
        );
      })}
    </div>
  );
}
