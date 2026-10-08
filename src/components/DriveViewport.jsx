import React, { useState, useEffect, useRef } from 'react';
import { gazeEngine } from '../lib/GazeEngine';
import { LayoutDashboard, CarFront, Video, Activity, User, Search, Bell, Settings, Crosshair, AlertTriangle } from 'lucide-react';

export default function DriveViewport({ scenario, onScenarioComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [viewportTransform, setViewportTransform] = useState('scale(1) translate(0, 0)');
  const [gazeCoords, setGazeCoords] = useState({ x: 0, y: 0 });
  const [speed, setSpeed] = useState(62);
  
  const videoRef = useRef(null);
  const webcamRef = useRef(null);
  const requestRef = useRef(null);

  // We use a ref to track metrics across frames without causing React re-renders
  const metricsRef = useRef({
     freezeTriggered: false,
     primaryHitTime: null,
     secondaryGazeStart: null,
     secondaryTotalTime: 0,
     secondarySpotted: false,
     latestNormX: 0,
     latestNormY: 0,
     lastCameraPing: Date.now()
  });

  // Reset metrics when scenario changes
  useEffect(() => {
    metricsRef.current = {
       freezeTriggered: false,
       primaryHitTime: null,
       secondaryGazeStart: null,
       secondaryTotalTime: 0,
       secondarySpotted: false,
       latestNormX: 0,
       latestNormY: 0,
       lastCameraPing: Date.now(),
       faceDetected: true,
       actionTaken: null,
       actionCorrect: null,
       bypassSensors: false
    };
  }, [scenario]);

  useEffect(() => {
    // 1. Initialize MediaPipe
    if (webcamRef.current) {
        gazeEngine.initialize(webcamRef.current);
    }

    // 2. Gaze Data Callback (Updates Coordinates Asynchronously)
    gazeEngine.onGazeData = (data) => {
        metricsRef.current.lastCameraPing = Date.now(); // Ping! The camera hardware is alive.
        if (!data) {
             metricsRef.current.faceDetected = false;
             return;
        }
        
        metricsRef.current.faceDetected = true;
        if (!videoRef.current) return;
        setGazeCoords(data);
        
        const rect = videoRef.current.getBoundingClientRect();
        metricsRef.current.latestNormX = (data.x - rect.left) / rect.width;
        metricsRef.current.latestNormY = (data.y - rect.top) / rect.height;
    };

    // 3. High-Frequency Video Time Loop
    const checkVideoState = () => {
        if (!videoRef.current || !scenario) {
            requestRef.current = requestAnimationFrame(checkVideoState);
            return;
        }

        // --- SENSOR & DRIVER VALIDATION ---
        if (!metricsRef.current.bypassSensors) {
            const timeSinceLastPing = Date.now() - metricsRef.current.lastCameraPing;
            
            if (timeSinceLastPing > 4000) {
                 // Camera hardware is completely disconnected, frozen, or still loading
                 videoRef.current.pause();
                 setFeedback({ text: 'OPTICAL SENSORS OFFLINE', type: 'system_alert', allowBypass: true });
                 requestRef.current = requestAnimationFrame(checkVideoState);
                 return;
            } else if (!metricsRef.current.faceDetected) {
                 // Camera works, but driver looked away or face is obstructed
                 videoRef.current.pause();
                 setFeedback({ text: 'DRIVER TRACKING LOST: RE-ACQUIRING...', type: 'system_alert', allowBypass: true });
                 requestRef.current = requestAnimationFrame(checkVideoState);
                 return;
            }
        }
        
        if (videoRef.current.paused && !metricsRef.current.freezeTriggered) {
             // Driver face found again (or sensors bypassed)! Seamlessly resume.
             videoRef.current.play();
             setFeedback(null);
        }

        const ct = videoRef.current.currentTime;

        // --- FREEZE TRIGGER LOGIC (If they didn't evade in time) ---
        if (scenario.time_of_freeze && ct >= scenario.time_of_freeze) {
            if (!metricsRef.current.freezeTriggered) {
                metricsRef.current.freezeTriggered = true;
                videoRef.current.pause();
                
                // Calculate final metrics
                const pLatency = metricsRef.current.primaryHitTime ? (metricsRef.current.primaryHitTime - scenario.time_of_alert) : null;
                const passedLatency = pLatency !== null && pLatency <= 1.2;

                setFeedback({ 
                    text: 'COLLISION REGISTERED', 
                    type: 'error' 
                });
                
                if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 500]); 

                // Transition to VIVA after 2 seconds
                setTimeout(() => {
                    onScenarioComplete({
                        scenarioId: scenario.id,
                        primaryLatency: pLatency,
                        passedLatency: passedLatency,
                        secondarySpotted: metricsRef.current.secondarySpotted,
                        actionCorrect: false // Collision happened
                    });
                }, 2000);
            }
            return; // Stop processing loop for this frame if frozen
        }

        // --- GAZE EVALUATION LOGIC (Between Alert & Freeze) ---
        if (scenario.time_of_alert && ct >= scenario.time_of_alert && ct < scenario.time_of_freeze) {
            const { latestNormX, latestNormY } = metricsRef.current;
            
            let lookingAtPrimary = false;
            let lookingAtSecondary = false;

            if (scenario.hazard_bounding_boxes) {
                for (let box of scenario.hazard_bounding_boxes) {
                    if (latestNormX >= box.x_min && latestNormX <= box.x_max && latestNormY >= box.y_min && latestNormY <= box.y_max) {
                        if (box.role === 'primary_hazard') lookingAtPrimary = true;
                        if (box.role === 'secondary_hazard') lookingAtSecondary = true;
                    }
                }
            }

            // Primary Hazard: Hit within 1.2 seconds?
            if (lookingAtPrimary && !metricsRef.current.primaryHitTime) {
                metricsRef.current.primaryHitTime = ct;
                setFeedback({ text: 'PRIMARY HAZARD SPOTTED', type: 'success' });
                setTimeout(() => setFeedback(null), 1000);
            }

            // Secondary Hazard: Must look for > 150ms
            if (lookingAtSecondary) {
                if (!metricsRef.current.secondaryGazeStart) {
                    metricsRef.current.secondaryGazeStart = ct;
                } else {
                    const delta = ct - metricsRef.current.secondaryGazeStart;
                    metricsRef.current.secondaryTotalTime += delta;
                    metricsRef.current.secondaryGazeStart = ct; // Reset for next delta
                    
                    if (metricsRef.current.secondaryTotalTime >= 0.15 && !metricsRef.current.secondarySpotted) {
                        metricsRef.current.secondarySpotted = true;
                        setFeedback({ text: 'SITUATIONAL AWARENESS: +BONUS', type: 'success' });
                        setTimeout(() => setFeedback(null), 1000);
                    }
                }
            } else {
                metricsRef.current.secondaryGazeStart = null; // Reset if they look away
            }
        }

        requestRef.current = requestAnimationFrame(checkVideoState);
    };

    requestRef.current = requestAnimationFrame(checkVideoState);
    
    // --- KEYBOARD EVASION LOGIC ---
    const handleKeyDown = (e) => {
      if (!videoRef.current || !scenario || metricsRef.current.freezeTriggered) return;
      const ct = videoRef.current.currentTime;
      
      let action = null;
      if (e.code === 'Space') action = 'emergency_brake';
      if (e.code === 'ArrowLeft') action = 'steer_left';
      if (e.code === 'ArrowRight') action = 'steer_right';

      if (action) {
        // Dynamic Viewport Inertia FX (Applied immediately on any action)
        if (action === 'steer_left') setViewportTransform('scale(1.15) translateX(6%) rotate(1.5deg)');
        if (action === 'steer_right') setViewportTransform('scale(1.15) translateX(-6%) rotate(-1.5deg)');
        if (action === 'emergency_brake') setViewportTransform('scale(1.15) translateY(-8%) rotate(-0.5deg)');
        
        const anticipation_start = scenario.time_of_alert ? scenario.time_of_alert - 3.5 : 0;
        const too_late_end = scenario.time_of_freeze || videoRef.current.duration;
        
        if (ct >= anticipation_start && ct < too_late_end) {
           const requiredAction = scenario.ground_truth_rubric?.ego_action_required || 'emergency_brake';
           
           if (action === requiredAction || action === 'emergency_brake') {
               // PERFECT ACTION!
               setFeedback({ text: 'PERFECT EVASION!', type: 'success' });
               if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
               
               videoRef.current.pause();
               metricsRef.current.freezeTriggered = true;
               metricsRef.current.actionCorrect = true;
               
               const pLatency = metricsRef.current.primaryHitTime ? (metricsRef.current.primaryHitTime - scenario.time_of_alert) : null;
               
               setTimeout(() => {
                  onScenarioComplete({
                      scenarioId: scenario.id,
                      primaryLatency: pLatency,
                      passedLatency: pLatency !== null && pLatency <= 1.2,
                      secondarySpotted: metricsRef.current.secondarySpotted,
                      actionCorrect: true
                  });
               }, 1500); 
           } else {
               // WRONG ACTION - Let it play out to the collision
               setFeedback({ text: 'WRONG MANEUVER!', type: 'error' });
               if (navigator.vibrate) navigator.vibrate(400);
               setTimeout(() => setFeedback(null), 1000);
           }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        cancelAnimationFrame(requestRef.current);
        gazeEngine.onGazeData = null;
    };
  }, [scenario]);

  // Simulate dynamic speed changes
  useEffect(() => {
     const interval = setInterval(() => {
         setSpeed(s => Math.max(30, Math.min(120, s + (Math.random() * 4 - 2))));
     }, 1000);
     return () => clearInterval(interval);
  }, []);

  const handleVideoEnded = () => {
      onScenarioComplete({
          scenarioId: scenario.id,
          controlClipFinished: true
      });
  };

  if (!scenario) return <div style={{ color: 'white' }}>Loading scenarios...</div>;

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', backgroundColor: '#111827', color: 'white', overflow: 'hidden', fontFamily: "'Inter', sans-serif" }}>
      
      {/* LEFT SIDEBAR */}
      <aside style={{ width: '80px', backgroundColor: '#1f2937', borderRight: '1px solid #374151', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
         <div style={{ width: '40px', height: '40px', backgroundColor: '#10b981', borderRadius: '8px', marginBottom: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity color="white" />
         </div>
         <div className="sidebar-icon active" style={{ padding: '15px', color: '#10b981', cursor: 'pointer' }}><LayoutDashboard /></div>
         <div className="sidebar-icon" style={{ padding: '15px', color: '#6b7280', cursor: 'pointer' }}><Video /></div>
         <div className="sidebar-icon" style={{ padding: '15px', color: '#6b7280', cursor: 'pointer' }}><CarFront /></div>
         <div className="sidebar-icon" style={{ padding: '15px', color: '#6b7280', cursor: 'pointer', marginTop: 'auto' }}><Settings /></div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
         
         <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', backgroundColor: '#1f2937', padding: '10px 20px', borderRadius: '8px', border: '1px solid #374151', width: '40%' }}>
               <Search size={18} color="#9ca3af" />
               <input type="text" placeholder="Driving assessment by department..." style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none' }} />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                   <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>SYSTEM LOAD</div>
                      <div style={{ color: '#10b981', fontWeight: 'bold' }}>3.75 %</div>
                   </div>
                   <div style={{ textAlign: 'right', marginLeft: '20px' }}>
                      <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>SAFE DISTANCE</div>
                      <div style={{ color: '#10b981', fontWeight: 'bold' }}>20.8 m</div>
                   </div>
               </div>
               <Bell size={20} color="#9ca3af" style={{ marginLeft: '20px' }} />
               <User size={24} color="#9ca3af" style={{ backgroundColor: '#374151', borderRadius: '50%', padding: '5px' }} />
            </div>
         </header>

         {/* Video Player Container */}
         <div style={{ flex: 1, position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '1px solid #374151', backgroundColor: '#000', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
             <video 
               ref={videoRef}
               src={scenario.video_url} 
               autoPlay 
               muted 
               onEnded={handleVideoEnded}
               style={{ 
                 width: '100%', height: '100%', objectFit: 'cover',
                 transform: viewportTransform,
                 transition: 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
               }}
             />
             
             {/* WATERMARK HIDER & HUD - Positioned at TOP to block Nexar stamps */}
             <div style={{ 
               position: 'absolute', top: 0, left: 0, width: '100%', height: '100px', 
               background: 'linear-gradient(to bottom, rgba(17, 24, 39, 1) 30%, rgba(17, 24, 39, 0))',
               display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '15px 30px 0 30px'
             }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                       <span style={{ fontSize: '0.75rem', color: '#10b981', letterSpacing: '2px', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>GAZE TRACKING ACTIVE</span>
                       <span style={{ fontFamily: 'monospace', color: '#e5e7eb', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>X: {gazeCoords.x.toFixed(0)} | Y: {gazeCoords.y.toFixed(0)}</span>
                    </div>
                 </div>
                 
                 <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
                    <div style={{ width: '150px', height: '4px', background: 'rgba(55, 65, 81, 0.8)', borderRadius: '2px', overflow: 'hidden' }}>
                       <div style={{ width: '65%', height: '100%', background: '#10b981' }}></div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                       <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>{speed.toFixed(0)}</span>
                       <span style={{ fontSize: '0.9rem', color: '#9ca3af', marginLeft: '5px', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>km/h</span>
                    </div>
                 </div>
             </div>

             {/* Interaction Feedback Overlay */}
             {feedback && (
               <div style={{
                 position: 'absolute', top: '15%', left: '50%', transform: 'translate(-50%, -50%)',
                 background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 
                             feedback.type === 'error' ? 'rgba(220, 38, 38, 0.95)' : 'rgba(245, 158, 11, 0.95)',
                 color: feedback.type === 'system_alert' ? '#000' : 'white', 
                 padding: feedback.type === 'system_alert' ? '10px 24px' : '15px 40px', 
                 borderRadius: feedback.type === 'system_alert' ? '30px' : '8px', 
                 fontSize: feedback.type === 'system_alert' ? '1rem' : '2.5rem', 
                 fontWeight: '900',
                 boxShadow: feedback.type === 'system_alert' ? '0 10px 25px rgba(0,0,0,0.5)' : '0 15px 50px rgba(0,0,0,0.7)', 
                 border: feedback.type === 'system_alert' ? 'none' : '3px solid rgba(255,255,255,0.3)',
                 display: 'flex', alignItems: 'center', gap: '20px', letterSpacing: '2px', textTransform: 'uppercase'
               }}>
                 {feedback.type === 'success' ? <Crosshair size={feedback.type === 'system_alert' ? 20 : 40} /> : <AlertTriangle size={feedback.type === 'system_alert' ? 20 : 40} />}
                 {feedback.text}
                 {feedback.allowBypass && (
                     <button 
                        onClick={() => { metricsRef.current.bypassSensors = true; }}
                        style={{ marginLeft: '10px', padding: '6px 12px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(0,0,0,0.5)', borderRadius: '15px', color: '#000', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.8rem' }}
                     >
                        OVERRIDE
                     </button>
                 )}
               </div>
             )}
         </div>
      </main>

      {/* RIGHT SIDEBAR */}
      <aside style={{ width: '320px', backgroundColor: '#1f2937', borderLeft: '1px solid #374151', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h3 style={{ margin: 0, fontSize: '1rem', color: '#e5e7eb' }}>Driver Telemetry</h3>
             <span style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#10b981', borderRadius: '12px', color: '#000', fontWeight: 'bold' }}>LIVE</span>
          </div>

          <div style={{ width: '100%', height: '180px', backgroundColor: '#111827', borderRadius: '12px', overflow: 'hidden', position: 'relative', border: '1px solid #374151' }}>
              <video 
                 ref={webcamRef} 
                 style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} 
                 autoPlay playsInline muted 
              />
              <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                 <div style={{ width: '8px', height: '8px', backgroundColor: '#10b981', borderRadius: '50%', boxShadow: '0 0 10px #10b981' }}></div>
                 <span style={{ fontSize: '0.7rem', color: 'white', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>MediaPipe Mesh</span>
              </div>
          </div>

          <div style={{ backgroundColor: '#111827', padding: '15px', borderRadius: '12px', border: '1px solid #374151' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Primary Target</span>
                <span style={{ 
                    color: metricsRef.current.primaryHitTime ? '#10b981' : '#ef4444', 
                    fontWeight: 'bold', fontSize: '0.85rem' 
                }}>
                    {metricsRef.current.primaryHitTime ? 'LOCKED' : 'MISSED'}
                </span>
             </div>
             
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Latency Score</span>
                <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    {metricsRef.current.primaryHitTime ? ((metricsRef.current.primaryHitTime - scenario.time_of_alert).toFixed(2) + 's') : 'Waiting...'}
                </span>
             </div>
             <div style={{ width: '100%', height: '4px', background: '#374151', borderRadius: '2px' }}>
                <div style={{ width: metricsRef.current.primaryHitTime ? '100%' : '10%', height: '100%', background: '#10b981', borderRadius: '2px' }}></div>
             </div>
          </div>
          
          <div style={{ backgroundColor: '#111827', padding: '15px', borderRadius: '12px', border: '1px solid #374151' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Situational Awareness</span>
                <span style={{ color: metricsRef.current.secondarySpotted ? '#10b981' : '#ef4444', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    {metricsRef.current.secondarySpotted ? 'BONUS EARNED' : 'No Secondary Focus'}
                </span>
             </div>
             <div style={{ width: '100%', height: '4px', background: '#374151', borderRadius: '2px' }}>
                <div style={{ width: metricsRef.current.secondaryTotalTime >= 0.15 ? '100%' : `${(metricsRef.current.secondaryTotalTime / 0.15) * 100}%`, height: '100%', background: metricsRef.current.secondarySpotted ? '#10b981' : '#ef4444', borderRadius: '2px' }}></div>
             </div>
          </div>
      </aside>
    </div>
  );
}
