---
title: Open ANPR API
emoji: 🚘
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# 🚘 OpenANPR — Cloud-Native License Plate Recognition

<div align="center">
  <p>A stateless, session-isolated, and scalable Automatic Number Plate Recognition (ANPR) system deployed entirely in the cloud. Built for demonstration and portfolio purposes.</p>
</div>

---

## 🌍 Live Demo
Experience the system live directly in your browser (Desktop or Mobile):

* **Frontend App:** [https://open-anpr.vercel.app](https://open-anpr.vercel.app)
* **Backend API Docs:** [https://burn2179-open-anpr-api.hf.space/docs](https://burn2179-open-anpr-api.hf.space/docs)

---

## 📌 Project Background & Leadership
* **Capstone Roots:** Originally conceptualized and built as a university campus ANPR (Automated Number Plate Recognition) system by a capstone engineering team to automate vehicle verification and entry logging.
* **Role:** **Lead Developer** — Engineered the core ANPR detection pipeline, OCR character recognition, license plate classification logic, and system architecture.
* **Portfolio Edition (`OpenANPR`):** Refactored from the original campus codebase into a decoupled, stateless, and cloud-native architecture to allow seamless public demonstration without requiring private campus infrastructure or hardware authentication.

---

## 🏗️ System Architecture

OpenANPR was engineered to transition a heavy machine-learning workload from a local environment to a completely serverless, stateless cloud architecture. 

### 1. The "Stateless" Challenge
Traditional ANPR systems are tightly coupled to hardware and local databases, making them impossible to host publicly for multiple simultaneous users without data collision. OpenANPR solves this through a **Zero-Auth Session Isolation Protocol**:
* When a user opens the web app, the React frontend generates a unique, cryptographically secure `UUID`.
* This UUID is stored in `localStorage` and injected into the `X-Session-ID` HTTP header for every API request.
* The backend API intercepts this header, dynamically scoping all database transactions (vehicle registrations, detection logs, camera frames) strictly to that specific session. 
* **Result:** 1,000 users can test the system simultaneously on the live public URL, and each user will only see their own mock data. No login required.

### 2. The Cloud Infrastructure Pipeline
Hosting an AI pipeline (YOLO + PaddleOCR) for free on the internet requires a distributed architecture to bypass memory limitations:

* **Frontend (Vercel):** Hosts the React 18 / Vite application. Handles the UI state, webcam native access, and responsive design.
* **Backend (Hugging Face Spaces):** The heavy-lifting FastApi server runs in a Dockerized environment on Hugging Face. This provides the necessary 16GB RAM and GPU acceleration required to run `OpenCV` and `PaddleOCR` inferences rapidly.
* **Database (Neon Serverless Postgres):** Provides persistent storage for the session data, allowing the system to scale infinitely without relying on local SQLite files.

---

## 💻 Tech Stack

### Frontend UI
* **React 18** (Vite build system for HMR and optimized bundling)
* **Axios** (Configured with custom interceptors for session header injection)
* **CSS3** (Responsive, glassmorphic UI with micro-animations)

### Backend API & ML
* **Python 3.10**
* **FastAPI** (Asynchronous, high-performance web framework)
* **PaddleOCR** (State-of-the-art optical character recognition)
* **OpenCV** (Image processing, Grayscale manipulation, Gaussian Blurring)
* **SQLAlchemy** (ORM mapped to the cloud database)
* **Neon PostgreSQL** (Cloud persistence)

---

## 🚀 Key Features

1. **Real-time Plate Scanning:** Uses the browser's native `navigator.mediaDevices` API to capture high-resolution frames from desktop webcams or mobile rear cameras.
2. **Cascaded AI Pipeline:** 
    * Captures raw base64 frame.
    * Backend decodes to OpenCV format and applies preprocessing (brightness balancing, noise reduction).
    * PaddleOCR runs inference to extract textual data with confidence scoring.
    * Text is scrubbed using regex rules specifically tuned to standard license plate formats.
3. **Database Lookups:** The system cross-references the extracted plate against the user's specific `session_vehicles` table to determine Authorization Status (Approved, Blacklisted, Expired).
4. **Historical Logging:** Every scan is recorded in `session_logs` complete with a timestamp, confidence score, and cropped image, viewable in the UI.

---

## 🛠️ Local Development

While the system is hosted in the cloud, you can run it locally for further development.

**1. Clone the repository**
```bash
git clone https://github.com/i-jibii/open-anpr.git
cd open-anpr
```

**2. Setup environment variables**
Create a `.env` file in the `backend` folder and provide your PostgreSQL connection string:
```ini
DATABASE_URL="postgresql://user:password@host/db_name?sslmode=require"
```

**3. Install Dependencies**
```bash
# Backend
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload

# Frontend
cd ../frontend
npm install
npm run dev
```

---
*Developed by Jessie Bryn M. Vasquez*
