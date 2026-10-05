import React, { useState, useEffect, useRef } from 'react';

export default function DriveViewport({ scenarios, onLapComplete }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const videoRef = useRef(null);

  // We only run hazards that have valid video URLs
  const validScenarios = scenarios.filter(s => s.video_url);
  const currentScenario = validScenarios[currentIndex];

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if video isn't playing or hasn't loaded
      if (!videoRef.current) return;
      const ct = videoRef.current.currentTime;
      
      // Basic interaction mapping
      let action = null;
      if (e.code === 'Space') action = 'emergency_brake';
      if (e.code === 'ArrowLeft') action = 'steer_left';
      if (e.code === 'ArrowRight') action = 'steer_right';
      if (e.code === 'ArrowDown' || e.key === 's') action = 'decelerate';

      if (action && currentScenario) {
        // Check if the user pressed the key inside the 2.5s reaction window!
        const isInsideWindow = ct >= currentScenario.time_of_alert && ct <= currentScenario.time_of_freeze;
        
        if (isInsideWindow) {
           // We will accept emergency_brake as a universal safe fallback for the MVP
           if (action === currentScenario.ground_truth_rubric?.ego_action_required || action === 'emergency_brake') {
               setFeedback({ text: 'PERFECT EVASION!', type: 'success' });
               // Trigger hardware haptic feedback (works on Android and supported Gamepads)
               if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
           } else {
               setFeedback({ text: 'WRONG MANEUVER!', type: 'error' });
               if (navigator.vibrate) navigator.vibrate(400);
           }
        } else {
           setFeedback({ text: 'FALSE ALARM!', type: 'warning' });
        }
        
        // Clear feedback after 1.5 seconds
        setTimeout(() => setFeedback(null), 1500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentScenario]);

  const handleVideoEnded = () => {
    if (currentIndex < validScenarios.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Lap finished! Trigger Viva.
      onLapComplete();
    }
  };

  if (!currentScenario) return <div style={{ color: 'white' }}>Loading scenarios...</div>;

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      maxWidth: '1200px', 
      margin: '0 auto', 
      borderRadius: '16px', 
      overflow: 'hidden', 
      border: '1px solid rgba(255,255,255,0.1)', 
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' 
    }}>
       {/* 
         The video automatically plays. When it finishes, it loads the next one.
         This creates the "Continuous Lap" effect.
       */}
       <video 
         ref={videoRef}
         src={currentScenario.video_url} 
         autoPlay 
         muted 
         onEnded={handleVideoEnded}
         style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}
       />
       
       {/* Haptic / Interaction Overlay */}
       {feedback && (
         <div style={{
           position: 'absolute', top: '30px', left: '50%', transform: 'translateX(-50%)',
           background: feedback.type === 'success' ? 'rgba(16, 185, 129, 0.9)' : 
                       feedback.type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(245, 158, 11, 0.9)',
           color: 'white', padding: '12px 32px', borderRadius: '40px', fontSize: '1.5rem', fontWeight: '800',
           boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 10, backdropFilter: 'blur(4px)'
         }}>
           {feedback.text}
         </div>
       )}

       {/* UI Steering indicator */}
       <div style={{ 
         position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
         background: 'rgba(0,0,0,0.6)', padding: '10px 24px', borderRadius: '20px',
         color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', fontWeight: '600', backdropFilter: 'blur(4px)'
       }}>
         Controls: [SPACE] Emergency Brake &nbsp;•&nbsp; [ARROWS] Steer
       </div>
    </div>
  );
}
