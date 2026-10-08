# GazeDrive: Comprehensive Project Context & Technical Blueprint

## 1. Executive Overview
**GazeDrive** is an AI-driven driver hazard perception simulator that pairs real-time eye-tracking gaze verification with automated oral viva assessments. The system evaluates a driver's situational awareness, anticipation of critical hazards, and decision-making capabilities using real-world dashcam footage.

---

## 2. Completed Architecture: Data & Backend Annotation
* **Dataset:** 12 curated real-world driving clips from the Nexar collision prediction dataset (10 positive hazard clips, 2 negative control clips).
* **Ingestion Model:** YOLOv8 (Ultralytics) for candidate hazard bounding box proposals.
* **Human-in-the-Loop Verification:** Custom OpenCV GUI pipeline allowing human verification to redraw and lock in multi-hazard annotations over the AI proposals.
* **Output Artifact:** `scenarios.json`. Utilizes normalized bounding box coordinates and adheres to the strict **DRAMA-X evaluation rubric format** (containing primary/secondary agent actions, hazard directions, and required ego-vehicle maneuvers).

---

## 3. Current Architecture: Frontend Runtime (React SPA)
* **Framework:** React Single Page Application (SPA) scaffolded with Vite.
* **Styling:** Custom CSS Modules with modern Glassmorphism, translucent panels, and Dark Mode aesthetics for a premium simulator feel.
* **Simulation Loop:** HTML5 `<video>` API with React `useRef` for continuous-lap playback. It seamlessly buffers consecutive video clips without pausing.
* **Interaction Mapping:** Custom `keydown` event listeners mapped to evasion maneuvers (Spacebar for Emergency Brake, Arrow Keys for Swerving/Decelerating).

---

## 4. Evaluation Framework (Immediate Next Steps)
We are immediately implementing the **Drive Viewport & WebGazer Canvas**:
* **Tracking Engine:** WebGazer.js mapping webcam pupil inputs to screen `(X,Y)` pixel coordinates.
* **Hierarchical Logic:** Evaluates Primary hazard latency (benchmark: ≤1200ms) and Secondary situational awareness glances (benchmark: ≥150ms).
* **Scoring Logic:** Mathematical engine checking if the WebGazer `(X,Y)` coordinate intersects the normalized JSON bounding boxes exclusively during the critical `[t_alert, t_freeze]` temporal reaction window (the 2.5 seconds before collision).

---

## 5. AI Oral Viva & 3D Rendering (Upcoming)
* **STT Pipeline:** Browser native Web Speech API (`SpeechRecognition`) for real-time, zero-latency audio transcription from the candidate's microphone.
* **LLM Evaluator:** Google Gemini Flash (via `@google/genai` SDK) cross-examining candidate speech transcripts against the DRAMA-X `ground_truth_rubric` from the JSON.
* **3D Canvas:** React Three Fiber (R3F) & Three.js for rendering a WebGL AI Avatar that pops up on screen to deliver the Gemini evaluation feedback with lip-syncing.

---

## 6. Hardware Interface & Haptics (Future Integration)
* **Haptics:** Custom ESP32 microcontroller wired to vibrating physical hardware modules (or Gamepad API for Xbox/PS controllers).
* **Protocol Bridge:** Browser Web Serial API (`navigator.serial`) or local WebSockets transmitting binary success/fail flags (e.g., `0x01` for Perfect Evasion) from the React state machine to trigger physical force-feedback in the user's hands during evasive maneuvers.
