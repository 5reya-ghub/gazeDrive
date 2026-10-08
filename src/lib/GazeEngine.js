class GazeEngine {
  constructor() {
    this.faceMesh = null;
    this.camera = null;
    this.videoElement = null;
    
    // Calibration Data
    this.calibrationPoints = []; 
    this.modelX = { a: 0, b: 0, c: 0 }; 
    this.modelY = { d: 0, e: 0, f: 0 };
    
    this.currentEyeX = null;
    this.currentEyeY = null;
    
    this.isCalibrated = false;
    this.onGazeData = null; // Callback for UI
  }

  async initialize(videoElement) {
    this.videoElement = videoElement;
    
    this.faceMesh = new window.FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    
    this.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true, // IMPORTANT: Enables 3D Iris tracking
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.faceMesh.onResults(this.onResults.bind(this));

    this.camera = new window.Camera(this.videoElement, {
      onFrame: async () => {
        await this.faceMesh.send({ image: this.videoElement });
      },
      width: 640,
      height: 480
    });

    this.camera.start();
  }

  onResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        if (this.onGazeData) this.onGazeData(null); // Ping UI that camera is alive, but no face detected
        return;
    }
    
    const landmarks = results.multiFaceLandmarks[0];
    
    // Left eye (MediaPipe face mesh indices)
    const l_iris = landmarks[468];
    const l_outer = landmarks[33];
    const l_inner = landmarks[133];
    const l_top = landmarks[159];
    const l_bottom = landmarks[145];
    
    // Right eye
    const r_iris = landmarks[473];
    const r_outer = landmarks[263];
    const r_inner = landmarks[362];
    const r_top = landmarks[386];
    const r_bottom = landmarks[374];
    
    // Calculate physical bounding boxes
    const l_width = Math.abs(l_outer.x - l_inner.x) || 1;
    const l_height = Math.abs(l_top.y - l_bottom.y) || 1;
    
    const r_width = Math.abs(r_outer.x - r_inner.x) || 1;
    const r_height = Math.abs(r_top.y - r_bottom.y) || 1;
    
    // Extract vectors (X is inverted for webcam mirroring)
    const l_x = 1.0 - ((l_iris.x - l_outer.x) / l_width);
    const l_y = (l_iris.y - l_top.y) / l_height;
    
    const r_x = 1.0 - ((r_iris.x - r_inner.x) / r_width);
    const r_y = (r_iris.y - r_top.y) / r_height;
    
    // CORE IMPROVEMENT: Average both eyes to massively reduce noise and jitter
    const eyeX = (l_x + r_x) / 2.0;
    const eyeY = (l_y + r_y) / 2.0;
    
    // Smooth the data slightly to prevent jitter (low-pass filter)
    this.currentEyeX = this.currentEyeX ? (this.currentEyeX * 0.7 + eyeX * 0.3) : eyeX;
    this.currentEyeY = this.currentEyeY ? (this.currentEyeY * 0.7 + eyeY * 0.3) : eyeY;

    if (this.isCalibrated) {
       // Apply our trained linear regression model to predict exact screen pixels
       const screenX = this.modelX.a + this.modelX.b * this.currentEyeX + this.modelX.c * this.currentEyeY;
       const screenY = this.modelY.d + this.modelY.e * this.currentEyeX + this.modelY.f * this.currentEyeY;
       
       if (this.onGazeData) this.onGazeData({ x: screenX, y: screenY });
    } else {
       // Dev Mode Fallback: If calibration was bypassed, just ping the UI with center screen
       // so the camera validation heartbeat stays alive.
       if (this.onGazeData) this.onGazeData({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }
  }
  
  recordCalibrationPoint(screenX, screenY) {
    if (this.currentEyeX && this.currentEyeY) {
      this.calibrationPoints.push({
        eyeX: this.currentEyeX,
        eyeY: this.currentEyeY,
        screenX,
        screenY
      });
    }
  }

  trainModel() {
    if (this.calibrationPoints.length < 9) return;

    // Find the eye's physical limits from the calibration points
    let minEyeX = Math.min(...this.calibrationPoints.map(p => p.eyeX));
    let maxEyeX = Math.max(...this.calibrationPoints.map(p => p.eyeX));
    let minEyeY = Math.min(...this.calibrationPoints.map(p => p.eyeY));
    let maxEyeY = Math.max(...this.calibrationPoints.map(p => p.eyeY));
    
    if (maxEyeX - minEyeX === 0) maxEyeX += 0.01;
    if (maxEyeY - minEyeY === 0) maxEyeY += 0.01;

    // Generate interpolation mappings from 3D Eye vectors -> 2D Screen pixels
    this.modelX = {
       a: - (minEyeX * window.innerWidth) / (maxEyeX - minEyeX),
       b: window.innerWidth / (maxEyeX - minEyeX),
       c: 0
    };
    
    this.modelY = {
       d: - (minEyeY * window.innerHeight) / (maxEyeY - minEyeY),
       e: 0,
       f: window.innerHeight / (maxEyeY - minEyeY)
    };

    this.isCalibrated = true;
  }
  
  stop() {
     if (this.camera) this.camera.stop();
  }
}

// Export a singleton instance so it persists between React routes
export const gazeEngine = new GazeEngine();
