# 🎥 SecureWatch – CCTV Monitoring Dashboard

SecureWatch is a web-based CCTV monitoring dashboard designed to provide real-time video surveillance, intelligent event detection, and administrative control through an intuitive interface. The system integrates AI-powered modules to enhance situational awareness and automate monitoring tasks.

🔗 **Live Demo:** 

https://jinxuan-wong.github.io/SecureWatch/

https://qy248.github.io/SecureWatch/

---

## 🚀 Overview

SecureWatch is an intelligent surveillance system that combines computer vision and modern web technologies. It allows users to monitor multiple camera feeds, detect important events, and manage system configurations through a centralized dashboard.

The system supports both **live CCTV streams** and **offline video sources**, making it suitable for real-world environments such as campuses, offices, and public facilities.

---

## 🧩 Key Modules

### 🧍 Attire Compliance Monitoring
- Detects attire violations:
  - Sleeveless clothing  
  - Shorts  
  - Slippers  
- Real-time detection from live camera feeds
- Evidence snapshot generation
- Notification system with cooldown control
- Dashboard analytics (trends, statistics)

---

### 🎒 Lost & Found Detection
- Detects unattended or lost objects using AI tracking
- Supports **normal** and **fisheye camera views**
- Region-of-Interest (ROI) filtering
- Tracks object lifecycle (lost → resolved)
- Evidence storage with metadata
- Filtering, notes, and status management

---

### 📊 Dashboard & Analytics
- Real-time system overview
- Camera status indicators (online / offline / warning)
- Event summaries and statistics
- Interactive charts and visual insights

---

### 🎥 Live View Monitoring
- Multi-camera viewing interface
- Fisheye dewarping (multi-view support)
- Detection overlay toggle
- Adaptive layout for different camera types

---

### ⚙️ System Configuration
- Configure:
  - ROI zones
  - Detection thresholds
  - Object categories
  - Notification settings
- Dynamic updates without system restart
- User-friendly interface for configuration

---

### 📁 Video Upload & Management
- Upload offline videos for analysis
- Process recorded footage using detection pipeline
- View detection results within dashboard

---

## 🛠️ Technologies Used

### Frontend
- React (TypeScript)
- Vite
- Tailwind CSS
- Recharts
- Lucide React

### Backend Integration
- FastAPI (REST APIs)
- Real-time video streaming endpoints
- Detection and analytics services

### AI & Video Processing
- YOLO (Object Detection)
- OpenCV
- RTSP / Webcam / Video file processing

---

## 🌐 System Features

- Real-time AI-powered detection
- Multi-source video support (Live, RTSP, Offline)
- Modular architecture (Attire + Lost & Found)
- Evidence-based event logging
- Responsive and interactive UI
- Scalable multi-camera support

---

## 📌 Use Cases

- University campus monitoring  
- Workplace compliance enforcement  
- Smart building surveillance  
- Public safety monitoring  

---

## 📷 Screenshots
![Preview](example.png)
![Preview](example2.png)

---

## 📄 Notes

- This project is developed as part of an academic Final Year Project (FYP).
- The frontend is deployed on GitHub Pages, while backend services run separately.

---
