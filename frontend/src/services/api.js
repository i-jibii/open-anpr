/**
 * api.js
 *
 * Axios instance pre-configured with:
 *  - Base URL pointing to the FastAPI backend
 *  - X-Session-ID header automatically attached to every request
 *
 * Usage:
 *   import api from '../services/api';
 *   const res = await api.post('/detect', { plate: 'ABC 123' });
 */
import axios from 'axios';
import { getSessionId } from './sessionStore';

// Dynamic backend URL: Uses local proxy in development, Hugging Face in production
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '/api/public' : 'https://burn2179-open-anpr-api.hf.space/api/public');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Attach session ID to every request automatically
api.interceptors.request.use((config) => {
  const sid = getSessionId();
  config.headers['X-Session-ID'] = sid;
  return config;
});

export default api;

// ── Typed helpers (mirrors the backend endpoints) ──────────────────────────

export const registerVehicle = (data) => api.post('/register', data);

export const detectPlate = (plate, confidence_score = null) =>
  api.post('/detect', { plate, confidence_score });

export const detectPlateImage = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/detect-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Fast scan: sends a frame to the backend for vehicle + plate bounding box detection.
 * Returns in ~200ms. Does NOT run OCR.
 */
export const scanFrame = (blob, zonePoints = null) => {
  const formData = new FormData();
  formData.append('file', blob, 'frame.jpg');
  if (zonePoints && zonePoints.length >= 3) {
    formData.append('zone_points', JSON.stringify(zonePoints));
  }
  return api.post('/scan-frame', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 15000,
  });
};

/**
 * Deep analysis: sends the confirmed capture frame for full processing
 * (OCR, color, brand, annotated preview). Takes 3-8 seconds on first call.
 */
export const analyzeCapture = (blob, zonePoints = null) => {
  const formData = new FormData();
  formData.append('file', blob, 'capture.jpg');
  if (zonePoints && zonePoints.length >= 3) {
    formData.append('zone_points', JSON.stringify(zonePoints));
  }
  return api.post('/analyze-capture', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
};

export const getLogs = (limit = 100, offset = 0) =>
  api.get('/logs', { params: { limit, offset } });

export const getVehicles = () => api.get('/vehicles');

export const deleteVehicle = (vehicleId) => api.delete(`/vehicles/${vehicleId}`);

export const updateVehicle = (vehicleId, data) => api.put(`/vehicles/${vehicleId}`, data);

export const getStats = () => api.get('/stats');

