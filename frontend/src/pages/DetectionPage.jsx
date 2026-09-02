import { useEffect, useRef, useState, useCallback } from 'react';
import { detectPlate, scanFrame, analyzeCapture } from '../services/api';
import { 
  CheckCircle2, AlertTriangle, ShieldAlert, Camera, Square, RefreshCw, X, 
  Maximize, Play, Search, Loader2, Circle, ArrowDownLeft, ArrowUpRight, Info,
  PenTool, Undo2, Trash2, Check
} from 'lucide-react';
import './DetectionPage.css';

const ALERT_KIND_LABELS = {
  access: { label: 'AUTHORIZED', className: 'access', icon: CheckCircle2 },
  anomaly_unregistered: { label: 'UNREGISTERED', className: 'anomaly', icon: AlertTriangle },
  anomaly_low_confidence: { label: 'LOW CONFIDENCE', className: 'anomaly', icon: AlertTriangle },
  breach_blacklisted: { label: 'BLACKLISTED', className: 'breach', icon: ShieldAlert },
  breach_expired: { label: 'EXPIRED', className: 'breach', icon: ShieldAlert },
};

const SCAN_INTERVAL_MS = 400;

export default function DetectionPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);
  const scanningRef = useRef(false);
  const isAnalyzingRef = useRef(false);
  const cooldownRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const cameraPanelRef = useRef(null);
  const videoContainerRef = useRef(null);

  // Detection Zone state
  const [detectionZone, setDetectionZone] = useState([]);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const detectionZoneRef = useRef([]);
  useEffect(() => { detectionZoneRef.current = detectionZone; }, [detectionZone]);

  // Auto-scan state
  const [autoScanActive, setAutoScanActive] = useState(false);
  const [scanStatus, setScanStatus] = useState('idle');
  const [vehicleBox, setVehicleBox] = useState(null);
  const [plateBox, setPlateBox] = useState(null);

  // Analysis result
  const [analysisResult, setAnalysisResult] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // History tracking
  const [lastResult, setLastResult] = useState(null);
  const [history, setHistory] = useState([]);

  // Progress steps for the analysis phase
  const [analysisSteps, setAnalysisSteps] = useState([]);

  // ── Camera ───────────────────────────────────────────────────────────────
  const startCamera = useCallback(async (mode) => {
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode || facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : err.name === 'NotFoundError'
          ? 'No camera found. Make sure your webcam or phone camera is connected.'
          : `Camera error: ${err.message}`
      );
      setCameraActive(false);
    }
  }, [facingMode]);
  const stopAutoScan = useCallback(() => {
    scanningRef.current = false;
    setAutoScanActive(false);
    setScanStatus('idle');
    setVehicleBox(null);
    setPlateBox(null);
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsDrawingZone(false);
    setDetectionZone([]);
    stopAutoScan();
  }, [stopAutoScan]);

  const toggleFacing = useCallback(() => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    if (cameraActive) {
      startCamera(newMode);
    }
  }, [facingMode, cameraActive, startCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // ── Detection Zone Handlers ──────────────────────────────────────────────
  const handleZoneClick = (e) => {
    if (!isDrawingZone || !videoContainerRef.current) return;
    
    const rect = videoContainerRef.current.getBoundingClientRect();
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // Boundary Clamping
    const clamp = (val, min, max) => Math.max(min, Math.min(val, max));
    const rawX = clientX - rect.left;
    const rawY = clientY - rect.top;

    const clampedX = clamp(rawX, 0, rect.width);
    const clampedY = clamp(rawY, 0, rect.height);

    const x = clampedX / rect.width;
    const y = clampedY / rect.height;

    // Auto-complete if clicking near the first point
    if (detectionZone.length >= 3) {
      const first = detectionZone[0];
      const dist = Math.sqrt(Math.pow(first.x - x, 2) + Math.pow(first.y - y, 2));
      // 0.05 is roughly 5% of the frame size
      if (dist < 0.05) {
        setIsDrawingZone(false);
        return;
      }
    }

    setDetectionZone(prev => [...prev, { x, y }]);
  };

  const handleUndoZone = () => {
    setDetectionZone(prev => prev.slice(0, -1));
  };

  const handleClearZone = () => {
    setDetectionZone([]);
  };

  // ── Grab a frame as Blob ──────────────────────────────────────────────────
  const grabFrame = useCallback(() => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !cameraActive) {
        resolve(null);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
    });
  }, [cameraActive]);

  // ── AUTO-SCAN LOOP ────────────────────────────────────────────────────────
  const startAutoScan = useCallback(() => {
    if (!cameraActive) return;
    setAutoScanActive(true);
    setScanStatus('scanning');
    setAnalysisResult(null);
    setVehicleBox(null);
    setPlateBox(null);
    scanningRef.current = true;
    isAnalyzingRef.current = false;

    const loop = async () => {
      while (scanningRef.current) {
        const blob = await grabFrame();
        if (!blob || !scanningRef.current) break;

        try {
          const res = await scanFrame(blob, detectionZoneRef.current);
          const data = res.data;

          if (!scanningRef.current) break;

          if (data.vehicle_detected) {
            setVehicleBox(data.vehicle_box);
            setScanStatus('vehicle_found');

            if (data.plate_detected) {
              setPlateBox(data.plate_box);

              if (data.capture_ready && !isAnalyzingRef.current && !cooldownRef.current) {
                isAnalyzingRef.current = true;
                setScanStatus('capturing');

                const captureBlob = await grabFrame();
                if (captureBlob) {
                  runDeepAnalysis(captureBlob);
                }
              }
            } else {
              setPlateBox(null);
            }
          } else {
            setVehicleBox(null);
            setPlateBox(null);
            setScanStatus('scanning');
          }
        } catch (err) {
          console.error('Scan error:', err);
        }

        await new Promise((r) => setTimeout(r, SCAN_INTERVAL_MS));
      }
    };

    scanLoopRef.current = loop();
  }, [cameraActive, grabFrame]);

  // ── DEEP ANALYSIS ─────────────────────────────────────────────────────────
  const runDeepAnalysis = useCallback(async (blob) => {
    setScanStatus('analyzing');
    setAnalysisSteps([
      { label: 'Detecting vehicle type', status: 'active' },
      { label: 'Reading license plate (OCR)', status: 'pending' },
      { label: 'Detecting vehicle color', status: 'pending' },
      { label: 'Detecting vehicle brand', status: 'pending' },
      { label: 'Classifying plate', status: 'pending' },
    ]);

    try {
      const stepTimers = [500, 1200, 2000, 2800];
      stepTimers.forEach((ms, idx) => {
        setTimeout(() => {
          setAnalysisSteps((prev) => {
            const next = [...prev];
            if (idx < next.length) next[idx].status = 'done';
            if (idx + 1 < next.length) next[idx + 1].status = 'active';
            return next;
          });
        }, ms);
      });

      const res = await analyzeCapture(blob, detectionZoneRef.current);
      const data = res.data;

      setAnalysisSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })));

      // Only update the big result card and history if it's NOT a duplicate skipped by the backend
      if (!data.classification?.duplicate_skipped) {
        setAnalysisResult(data);
        if (data.classification) {
          setLastResult(data.classification);
          setHistory((prev) => [data, ...prev.slice(0, 19)]);
        }
      }

      // Immediately go back to scanning
      if (scanningRef.current) {
        setScanStatus('scanning');
        isAnalyzingRef.current = false;
        
        // Lock the deep analysis for 4 seconds (bumper-to-bumper failsafe cooldown)
        cooldownRef.current = true;
        setTimeout(() => {
          cooldownRef.current = false;
        }, 4000);
      } else {
        setAutoScanActive(false);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setAnalysisResult(null);
      if (scanningRef.current) {
        setScanStatus('scanning');
        isAnalyzingRef.current = false;
      } else {
        setScanStatus('idle');
        setAutoScanActive(false);
      }
    }
  }, []);


  const getScanStatusDisplay = () => {
    switch (scanStatus) {
      case 'scanning':
        return { text: 'Scanning for vehicles...', color: '#94a3b8', pulse: true };
      case 'vehicle_found':
        return { text: 'Vehicle detected — looking for plate...', color: '#00ffff', pulse: true };
      case 'capturing':
        return { text: 'Capturing...', color: '#fbbf24', pulse: false };
      case 'analyzing':
        return { text: 'Analyzing capture...', color: '#a78bfa', pulse: true };
      case 'done':
        return { text: 'Analysis complete', color: '#4ade80', pulse: false };
      default:
        return { text: 'Ready', color: '#64748b', pulse: false };
    }
  };

  const statusDisplay = getScanStatusDisplay();

  return (
    <div className="detection-page">
      <div className="detection-layout">
        <div className={`camera-panel ${isFullscreen ? 'fullscreen-mode' : ''}`} ref={cameraPanelRef}>
          <div className="camera-header">
            <h1 className="page-title">Detection Camera</h1>
            <div className="camera-controls">
              {!cameraActive ? (
                <button className="cam-btn primary" onClick={() => startCamera(facingMode)}>
                  <Camera size={14} /> Start Camera
                </button>
              ) : (
                <>
                  <button className="cam-btn danger" onClick={stopCamera} title="Stop Camera">
                    <Square size={14} /> Stop
                  </button>
                  {!isDrawingZone && (
                    <>
                      <button className="cam-btn secondary" onClick={toggleFacing} title="Flip Camera">
                        <RefreshCw size={14} />
                      </button>
                      <button className="cam-btn secondary" onClick={toggleFullscreen} title="Toggle Fullscreen">
                        {isFullscreen ? <X size={14} /> : <Maximize size={14} />}
                      </button>
                    </>
                  )}
                </>
              )}
              
              {cameraActive && !isDrawingZone && (
                <button 
                  className={`cam-btn ${detectionZone.length > 0 ? 'primary' : 'secondary'}`} 
                  onClick={() => { setIsDrawingZone(true); stopAutoScan(); }} 
                  title="Set Detection Zone"
                >
                  <PenTool size={14} /> Zone
                </button>
              )}
              {isDrawingZone && (
                <>
                  <button className="cam-btn secondary" onClick={handleUndoZone} title="Undo Point">
                    <Undo2 size={14} /> Undo
                  </button>
                  <button className="cam-btn danger" onClick={handleClearZone} title="Clear Zone">
                    <Trash2 size={14} /> Clear
                  </button>
                  <button className="cam-btn primary" onClick={() => setIsDrawingZone(false)} title="Finish Drawing">
                    <Check size={14} /> Done
                  </button>
                </>
              )}

              {!isDrawingZone && (
                <button className="cam-btn secondary" onClick={() => setShowInfo(true)} title="Best Practices">
                  <Info size={14} />
                </button>
              )}
              
              {/* Lightweight Full Detection UI Overlay */}
              {(scanStatus === 'capturing' || scanStatus === 'analyzing') && (
                <div className="full-detection-overlay">
                  <div className="detection-spinner"></div>
                  <span className="detection-text">Running Full Detection...</span>
                </div>
              )}

            </div>
          </div>

          <div className="video-container" ref={videoContainerRef}>
            <video ref={videoRef} autoPlay playsInline muted className="camera-feed" />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Detection Zone Drawing SVG */}
            {isDrawingZone && (
              <div 
                className="zone-drawing-overlay"
                onClick={handleZoneClick}
                onTouchStart={handleZoneClick}
              >
                <svg className="detection-zone-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {detectionZone.length > 0 && (
                    <polyline
                      points={detectionZone.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
                      className="detection-zone-polyline"
                    />
                  )}
                  {detectionZone.length > 2 && (
                    <line 
                      x1={detectionZone[detectionZone.length-1].x * 100} y1={detectionZone[detectionZone.length-1].y * 100}
                      x2={detectionZone[0].x * 100} y2={detectionZone[0].y * 100}
                      className="detection-zone-polyline dashed"
                    />
                  )}
                  {detectionZone.map((p, i) => (
                    <circle 
                      key={i} 
                      cx={p.x * 100} cy={p.y * 100} 
                      r={i === 0 ? "1.5" : "0.6"} 
                      fill="var(--accent)"
                      stroke="#fff"
                      strokeWidth="0.3"
                      className={`zone-point ${i === 0 ? 'pulse' : ''}`} 
                    />
                  ))}
                </svg>
                <div className="drawing-hint">Tap near the 1st point to complete the zone!</div>
              </div>
            )}
            {cameraActive && !isDrawingZone && detectionZone.length > 2 && (
              <svg className="detection-zone-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path
                  d={`M0,0 H100 V100 H0 Z M${detectionZone.map(p => `${p.x * 100},${p.y * 100}`).join(' ')} Z`}
                  fill="rgba(0, 0, 0, 0.75)"
                  fillRule="evenodd"
                />
                <polygon
                  points={detectionZone.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
                  className="detection-zone-polygon"
                />
              </svg>
            )}

            {!isDrawingZone && cameraActive && (
              <div className={`scan-status-bar ${statusDisplay.pulse ? 'pulse' : ''}`} style={{ '--status-color': statusDisplay.color, position: 'relative', zIndex: 60 }}>
                <span className="scan-status-dot" />
                <span className="scan-status-text">{statusDisplay.text}</span>
              </div>
            )}

            {!cameraActive && !cameraError && (
              <div className="camera-placeholder">
                <div className="camera-placeholder-icon"><Camera size={48} style={{ color: 'var(--text-muted)' }} /></div>
                <p>Click <strong>Start Camera</strong> to activate your webcam or phone camera.</p>
                <p className="camera-hint">On mobile, the rear camera will be used by default.</p>
              </div>
            )}
            {cameraError && (
              <div className="camera-error">
                <div className="camera-error-icon"><AlertTriangle size={48} style={{ color: 'var(--red)' }} /></div>
                <p>{cameraError}</p>
              </div>
            )}
          </div>

          {cameraActive && (
            <div className="autoscan-controls">
              {!autoScanActive ? (
                <button className="autoscan-btn start" onClick={startAutoScan}>
                  <Play size={16} /> Start Auto-Scan
                </button>
              ) : (
                <button className="autoscan-btn stop" onClick={stopAutoScan}>
                  <Square size={16} /> Stop Scanning
                </button>
              )}
            </div>
          )}
        </div>

        <div className="detection-panel">
          {(scanStatus === 'analyzing' || scanStatus === 'capturing') && (
            <div className="analysis-progress-card">
              <h2 className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Search size={18} /> Analyzing Vehicle
              </h2>
              <p className="panel-subtitle">Running detections on captured frame...</p>
              <div className="analysis-steps">
                {analysisSteps.map((step, idx) => (
                  <div key={idx} className={`analysis-step ${step.status}`}>
                    <span className="step-indicator">
                      {step.status === 'done' ? <CheckCircle2 size={16} style={{ color: 'var(--green)' }} /> : 
                       step.status === 'active' ? <Loader2 size={16} className="spinning" style={{ color: 'var(--accent)' }} /> : 
                       <Circle size={16} style={{ color: 'var(--text-muted)' }} />}
                    </span>
                    <span className="step-label">{step.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysisResult && scanStatus !== 'analyzing' && scanStatus !== 'capturing' && (
            <div className="analysis-result-card">
              <h2 className="panel-title">Detection Result</h2>
              {analysisResult.preview_b64 && (
                <div className="preview-container" onClick={() => setPreviewOpen(true)}>
                  <img src={`data:image/jpeg;base64,${analysisResult.preview_b64}`} alt="Annotated capture" className="preview-thumb" />
                  <div className="preview-overlay-hint">Click to enlarge</div>
                </div>
              )}

              <div className="vehicle-details-grid">
                <div className="detail-row">
                  <span className="detail-label">Vehicle Type</span>
                  <span className="detail-value">{analysisResult.vehicle_type || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Vehicle Brand</span>
                  <span className="detail-value">{analysisResult.vehicle_brand || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Vehicle Color</span>
                  <span className="detail-value">{analysisResult.vehicle_color || 'N/A'}</span>
                </div>
                <div className="detail-row plate-row">
                  <span className="detail-label">Plate Number</span>
                  <span className="detail-value plate-number">{analysisResult.plate || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">OCR Confidence</span>
                  <span className="detail-value">{analysisResult.confidence?.toFixed(1) || 0}%</span>
                </div>
              </div>

              {analysisResult.classification && (() => {
                const kindInfo = ALERT_KIND_LABELS[analysisResult.classification.alert_kind] || { label: analysisResult.classification.alert_kind, className: 'anomaly', icon: AlertTriangle };
                const IconComponent = kindInfo.icon;
                return (
                  <div className={`result-card ${kindInfo.className}`}>
                    <div className="result-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <IconComponent size={12} /> {kindInfo.label}
                    </div>
                    {analysisResult.classification.direction && (
                      <span className="result-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
                        {analysisResult.classification.direction === 'entry' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                        {analysisResult.classification.direction === 'entry' ? 'Entry' : 'Exit'}
                      </span>
                    )}
                    <div className="result-message">{analysisResult.classification.message}</div>
                  </div>
                );
              })()}
            </div>
          )}



          {lastResult && !lastResult.error && scanStatus === 'idle' && !analysisResult && (() => {
            const kindInfo = ALERT_KIND_LABELS[lastResult.alert_kind] || { label: lastResult.alert_kind, className: 'anomaly', icon: AlertTriangle };
            const IconComponent = kindInfo.icon;
            return (
              <div className={`result-card ${kindInfo.className}`}>
                <div className="result-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <IconComponent size={12} /> {kindInfo.label}
                </div>
                <div className="result-plate">{lastResult.plate_display}</div>
                <div className="result-meta">
                  {lastResult.direction && (
                    <span className="result-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {lastResult.direction === 'entry' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                      {lastResult.direction === 'entry' ? 'Entry' : 'Exit'}
                    </span>
                  )}
                  {lastResult.confidence_score != null && (
                    <span className="result-tag">Conf: {lastResult.confidence_score}%</span>
                  )}
                </div>
                {lastResult.vehicle && (
                  <div className="result-vehicle">
                    {[lastResult.vehicle.brand, lastResult.vehicle.color, lastResult.vehicle.type].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div className="result-message">{lastResult.message}</div>
              </div>
            );
          })()}

          {lastResult?.error && scanStatus === 'idle' && (
            <div className="result-card breach">
              <div className="result-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><ShieldAlert size={12} /> ERROR</div>
              <div className="result-message">{lastResult.error}</div>
            </div>
          )}

          {history.length > 0 && (
            <div className="history-panel">
              <h3 className="history-title">Recent Detections</h3>
              {history.map((dataItem, idx) => {
                const item = dataItem.classification;
                const kindInfo = ALERT_KIND_LABELS[item.alert_kind] || { label: item.alert_kind, className: 'anomaly', icon: AlertTriangle };
                return (
                  <div 
                    key={idx} 
                    className={`history-item ${kindInfo.className}`}
                    onClick={() => setAnalysisResult(dataItem)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="history-plate">{item.plate_display}</span>
                    <span className="history-kind" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {kindInfo.label}
                    </span>
                    {item.direction && (
                      <span className="history-dir" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}>
                        {item.direction === 'entry' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {previewOpen && analysisResult?.preview_b64 && (
        <div className="preview-modal-backdrop" onClick={() => setPreviewOpen(false)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <button className="preview-close" onClick={() => setPreviewOpen(false)}><X size={18} /></button>
            <img src={`data:image/jpeg;base64,${analysisResult.preview_b64}`} alt="Full annotated capture" className="preview-full" />
            <div className="preview-info-bar">
              <span>Vehicle: {analysisResult.vehicle_type || 'N/A'}</span>
              <span>Brand: {analysisResult.vehicle_brand || 'N/A'}</span>
              <span>Color: {analysisResult.vehicle_color || 'N/A'}</span>
              <span className="preview-plate">Plate: {analysisResult.plate || 'N/A'}</span>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="info-modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="info-modal-content" onClick={e => e.stopPropagation()}>
            <div className="info-modal-header">
              <h3><Info size={18} style={{ color: 'var(--accent)' }} /> Optimal Scanning Conditions</h3>
              <button className="info-close-btn" onClick={() => setShowInfo(false)}><X size={18} /></button>
            </div>
            <div className="info-modal-body">
              <p>To achieve the highest ANPR accuracy, please keep these constraints in mind:</p>
              <ul className="info-constraints-list">
                <li><strong>Camera Quality:</strong> Blurry or low-resolution webcams will reduce text clarity.</li>
                <li><strong>Lighting & Brand Similarity:</strong> Extreme glare or low-light environments can obscure plate characteristics. Highly similar car brand logos might also cause occasional misclassification by the AI.</li>
                <li><strong>Detection Zones:</strong> Use the <b>Zone</b> tool to draw a boundary that restricts detection to a specific area (e.g., a gate entrance) to avoid scanning parked cars in the background.</li>
                <li><strong>Single-File Processing:</strong> Designed for one vehicle at a time in a queue fashion (e.g., single lane entry/exit). Multiple cars side-by-side will be processed sequentially.</li>
                <li><strong>Standard Formats:</strong> The system enforces alphanumeric mixture rules; purely text banners will be ignored.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
