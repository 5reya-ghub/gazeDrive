import os
import json
import cv2
import numpy as np
from ultralytics import YOLO

# 1. Paths configuration
POSITIVE_DIR = "my_clips/train/positive"
NEGATIVE_DIR = "my_clips/train/negative"
OUTPUT_DIR = "public/scenarios"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(os.path.join(OUTPUT_DIR, "frames"), exist_ok=True)

# 2. Load standard YOLOv8 nano model
model = YOLO("yolov8n.pt")

# Standard driving object classes (COCO indices: person, bicycle, car, motorcycle, bus, truck)
TARGET_CLASSES = [0, 1, 2, 3, 5, 7]

def process_hazard_clip(video_path, scenario_id):
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps

    print(f"\nAnalyzing {os.path.basename(video_path)} ({duration:.1f}s)...")

    max_expansion_rate = -1.0
    hazard_frame_idx = int(total_frames * 0.45) # fallback near mid-point
    best_bbox = None
    prev_boxes = {}

    frame_idx = 0
    # Step 1: Scan video to locate hazard expansion point
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        
        # Analyze every 3rd frame for speed
        if frame_idx % 3 == 0:
            results = model(frame, verbose=False, classes=TARGET_CLASSES)
            curr_boxes = []
            
            for box in results[0].boxes:
                xyxy = box.xyxy[0].cpu().numpy()
                w = xyxy[2] - xyxy[0]
                h = xyxy[3] - xyxy[1]
                area = w * h
                curr_boxes.append((xyxy, area))

            # Look for sharp growth in vehicle scale (TTC cue)
            if curr_boxes:
                largest_current = max(curr_boxes, key=lambda x: x[1])
                # Enforce alert window between 8s and 30s
                current_time = frame_idx / fps
                if 8.0 <= current_time <= (duration - 3.0):
                    if largest_current[1] > max_expansion_rate:
                        max_expansion_rate = largest_current[1]
                        hazard_frame_idx = frame_idx
                        best_bbox = largest_current[0]

        frame_idx += 1

    # Extract exact critical freeze frame
    cap.set(cv2.CAP_PROP_POS_FRAMES, hazard_frame_idx)
    ret, freeze_frame = cap.read()
    cap.release()

    if not ret or freeze_frame is None:
        return None

    h, w, _ = freeze_frame.shape
    hazard_timestamp = round(hazard_frame_idx / fps, 2)

    # Fallback box if none detected
    if best_bbox is None:
        best_bbox = np.array([w * 0.35, h * 0.4, w * 0.65, h * 0.75])

    # Step 2: Interactive Review Window (Demo Precision Guard)
    display_frame = freeze_frame.copy()
    x1, y1, x2, y2 = [int(v) for v in best_bbox]
    cv2.rectangle(display_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
    
    cv2.putText(display_frame, f"Freeze @ {hazard_timestamp}s", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
    cv2.putText(display_frame, "Press 'y' to KEEP green box as Primary, 'n' to REDRAW everything.", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
    
    cv2.imshow(f"Verify Hazard: {scenario_id}", display_frame)
    key = cv2.waitKey(0) & 0xFF
    cv2.destroyAllWindows()

    hazard_bounding_boxes = []

    if key == ord('y'):
        # Keep YOLO as primary
        hazard_bounding_boxes.append({
            "role": "primary_hazard",
            "x_min": round(x1 / w, 4),
            "y_min": round(y1 / h, 4),
            "x_max": round(x2 / w, 4),
            "y_max": round(y2 / h, 4)
        })
        # Ask for secondary using a loop so it stays on screen
        sec_frame = freeze_frame.copy()
        cv2.rectangle(sec_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(sec_frame, "Draw Secondary Hazard -> SPACE (or ESC to finish)", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        
        sec_rois = []
        while True:
            roi = cv2.selectROI(f"Secondary Hazard: {scenario_id}", sec_frame, fromCenter=False, showCrosshair=True)
            if roi == (0, 0, 0, 0):
                break
            sec_rois.append(roi)
            rx, ry, rw, rh = roi
            cv2.rectangle(sec_frame, (rx, ry), (rx+rw, ry+rh), (255, 0, 0), 2)
        cv2.destroyAllWindows()
        
        for roi in sec_rois:
            rx, ry, rw, rh = roi
            hazard_bounding_boxes.append({
                "role": "secondary_hazard",
                "x_min": round(rx / w, 4),
                "y_min": round(ry / h, 4),
                "x_max": round((rx + rw) / w, 4),
                "y_max": round((ry + rh) / h, 4)
            })
    else:
        # User wants to redraw everything
        redraw_frame = freeze_frame.copy()
        cv2.putText(redraw_frame, "Draw Box -> SPACE. Press ESC when finished.", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        
        rois = []
        while True:
            roi = cv2.selectROI(f"Redraw Hazards: {scenario_id}", redraw_frame, fromCenter=False, showCrosshair=True)
            if roi == (0, 0, 0, 0):
                break
            rois.append(roi)
            rx, ry, rw, rh = roi
            cv2.rectangle(redraw_frame, (rx, ry), (rx+rw, ry+rh), (255, 0, 0), 2)
        cv2.destroyAllWindows()
        
        for i, roi in enumerate(rois):
            rx, ry, rw, rh = roi
            role = "primary_hazard" if i == 0 else "secondary_hazard"
            hazard_bounding_boxes.append({
                "role": role,
                "x_min": round(rx / w, 4),
                "y_min": round(ry / h, 4),
                "x_max": round((rx + rw) / w, 4),
                "y_max": round((ry + rh) / h, 4)
            })
            
        # Fallback if they pressed 'n' but then drew nothing
        if len(rois) == 0:
            hazard_bounding_boxes.append({
                "role": "primary_hazard",
                "x_min": round(x1 / w, 4),
                "y_min": round(y1 / h, 4),
                "x_max": round(x2 / w, 4),
                "y_max": round(y2 / h, 4)
            })

    # Save final freeze-frame image
    frame_filename = f"freeze_{scenario_id}.jpg"
    frame_path = os.path.join(OUTPUT_DIR, "frames", frame_filename)
    cv2.imwrite(frame_path, freeze_frame)

    return {
        "id": scenario_id,
        "video_url": f"/videos/{os.path.basename(video_path)}",
        "type": "hazard",
        "freeze_frame": f"/scenarios/frames/{frame_filename}",
        "time_of_alert": max(0.0, round(hazard_timestamp - 2.5, 2)),
        "time_of_freeze": hazard_timestamp,
        "reaction_window": 2.5,
        "hazard_bounding_boxes": hazard_bounding_boxes,
        "ground_truth_rubric": {
            "primary_agent": "car",
            "primary_action": "sudden_braking",
            "secondary_agent": "motorcycle",
            "secondary_action": "lane_filtering",
            "hazard_direction": "center_lane",
            "ego_action_required": "emergency_brake",
            "explanation": "Lead vehicle brakes abruptly while an overtaking motorcycle limits evasive lane changes."
        }
    }

def main():
    scenarios = []
    
    # Process 10 Hazard Clips
    pos_files = sorted([os.path.join(POSITIVE_DIR, f) for f in os.listdir(POSITIVE_DIR) if f.endswith(".mp4")])
    for idx, path in enumerate(pos_files, start=1):
        scenario_id = f"scenario_hazard_{idx:02d}"
        data = process_hazard_clip(path, scenario_id)
        if data:
            scenarios.append(data)

    # Process 2 Control Clips (Negative Drives)
    neg_files = sorted([os.path.join(NEGATIVE_DIR, f) for f in os.listdir(NEGATIVE_DIR) if f.endswith(".mp4")])
    for idx, path in enumerate(neg_files, start=1):
        scenario_id = f"scenario_control_{idx:02d}"
        scenarios.append({
            "id": scenario_id,
            "video_url": f"/videos/{os.path.basename(path)}",
            "type": "control",
            "freeze_frame": None,
            "time_of_alert": None,
            "time_of_freeze": None,
            "reaction_window": None,
            "hazard_bounding_boxes": [],
            "ground_truth_rubric": {
                "primary_agent": "none",
                "primary_action": "none",
                "secondary_agent": "none",
                "secondary_action": "none",
                "hazard_direction": "center_lane",
                "ego_action_required": "none",
                "explanation": "Safe cruising condition maintained with no immediate hazards present."
            }
        })

    # Save to scenarios.json
    out_file = os.path.join(OUTPUT_DIR, "scenarios.json")
    with open(out_file, "w") as f:
        json.dump(scenarios, f, indent=2)

    print(f"\nCreated: {out_file}")
    print(f"Generated {len(scenarios)} total demo-ready scenarios.")

if __name__ == "__main__":
    main()