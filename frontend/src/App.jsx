import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import useSecurity from './hooks/useSecurity';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import RegisterPage from './pages/RegisterPage';
import DetectionPage from './pages/DetectionPage';
import LogsPage from './pages/LogsPage';
import './index.css';
import './App.css';

function App() {
  useSecurity();
  const [privacyAccepted, setPrivacyAccepted] = useState(true);

  useEffect(() => {
    const accepted = localStorage.getItem('openanpr_privacy_accepted');
    if (!accepted) {
      setPrivacyAccepted(false);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('openanpr_privacy_accepted', 'true');
    setPrivacyAccepted(true);
  };

  return (
    <BrowserRouter>
      {!privacyAccepted && (
        <div className="privacy-modal-backdrop">
          <div className="privacy-modal">
            <div className="privacy-icon"><ShieldCheck size={48} /></div>
            <h2>Data Privacy & Security</h2>
            <p className="privacy-text">
              Welcome to <strong>OpenANPR</strong>, a portfolio demonstration system. Your privacy is taken seriously.
            </p>
            <ul className="privacy-list">
              <li><strong>Session Isolated:</strong> Text logs are strictly bound to your current browser session. Captured photos are NEVER saved to the database—they exist only in your device's temporary memory.</li>
              <li><strong>No Public Sharing:</strong> Nothing you capture or upload is shared publicly or shown to other users.</li>
              <li><strong>No Data Harvesting:</strong> This system does not collect, sell, or monitor any personal data.</li>
              <li><strong>Ephemeral Storage:</strong> Your session data is isolated and safely discarded over time.</li>
            </ul>
            <button className="btn btn-primary privacy-btn" onClick={handleAccept}>
              I Understand & Agree
            </button>
          </div>
        </div>
      )}

      <Navbar />
      <main className={!privacyAccepted ? 'blur-background' : ''}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/detect" element={<DetectionPage />} />
          <Route path="/logs" element={<LogsPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
