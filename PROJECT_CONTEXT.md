# OpenANPR - Project Context & Goals

## 📖 Project Background
This document serves as the persistent context for the **OpenANPR** project. It was created to summarize the transition from the legacy school project (`campus-anpr-system`) to this standalone portfolio showcase, ensuring all goals and technical requirements are clearly documented when opening this directory as a new workspace.

## 🎯 Primary Purpose
The main goal of **OpenANPR** is to recreate the core capabilities of the original campus ANPR system (specifically the logic from `api/smart_anpr`) but repackaged as a **public-facing, interactive portfolio piece**. 

Instead of operating as a permanent security system with persistent database records, OpenANPR functions as an ephemeral sandbox to showcase your computer vision engineering skills to recruiters and peers.

## ✨ Core Requirements & Functionality

1. **Hardware Flexibility (Webcam/Mobile Camera)**
   - The system must use the client's native camera (webcam on a PC, or the rear/front camera on a smartphone).
   - The frontend must seamlessly stream this video feed to the backend for processing.

2. **Core Detection Parity**
   - Must use the **exact same dataset and detection models** (YOLO, OpenCV, Tesseract/OCR) that made the original `smart_anpr` successful.
   - It needs to detect and extract:
     - License Plate Number (Characters)
     - Vehicle Color
     - Vehicle Type
     - Vehicle Brand

3. **Ephemeral "Showcase" State (No Persistent Storage)**
   - Because this is a portfolio showcase, data is **NOT** permanently saved to a central database.
   - When a detection occurs, the system should simply "flash" the captured image and the extracted data (plate, color, type, brand).
   - Results are temporarily saved/cached as a preview for the user's current session only.

4. **Architecture**
   - **Frontend:** React / Vite (Handling the UI, camera access, and displaying temporary results).
   - **Backend:** FastAPI / Python (Handling the heavy lifting: OpenCV, YOLO, OCR inference).

## 🚀 Next Steps (When you reopen this workspace)
1. Open `C:\Portfolio\open-anpr` directly in your IDE.
2. Review the frontend camera integration to ensure it properly captures and sends frames to the backend.
3. Port over the core detection logic from `smart_anpr` into the new FastAPI backend, ensuring the models (YOLO weights, OCR logic) are correctly linked.
4. Update the frontend UI to display the "flashed" preview (Plate, Color, Type, Brand) ephemerally.
