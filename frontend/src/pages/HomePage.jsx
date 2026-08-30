import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getStats } from '../services/api';
import { ClipboardList, Camera, BarChart3, ShieldCheck, Terminal, User, Briefcase, Mail, Sun, Wind, AlertTriangle, ListOrdered } from 'lucide-react';
import './HomePage.css';

const GithubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

const LinkedinIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

const JobStreetIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <circle cx="3.25" cy="9.5" r="0.5"/><circle cx="3.25" cy="12" r="0.5"/><circle cx="3.25" cy="14.5" r="0.5"/>
    <circle cx="5.75" cy="9.5" r="0.7"/><circle cx="5.75" cy="12" r="0.7"/><circle cx="5.75" cy="14.5" r="0.7"/>
    <circle cx="8.25" cy="9.5" r="0.9"/><circle cx="8.25" cy="12" r="0.9"/><circle cx="8.25" cy="14.5" r="0.9"/>
    <circle cx="10.75" cy="9.5" r="1.1"/><circle cx="10.75" cy="12" r="1.1"/><circle cx="10.75" cy="14.5" r="1.1"/>
    <circle cx="13.25" cy="4.5" r="1.3"/><circle cx="13.25" cy="7" r="1.3"/><circle cx="13.25" cy="9.5" r="1.3"/>
    <circle cx="13.25" cy="12" r="1.3"/><circle cx="13.25" cy="14.5" r="1.3"/><circle cx="13.25" cy="17" r="1.3"/>
    <circle cx="13.25" cy="19.5" r="1.3"/>
    <circle cx="15.75" cy="7" r="1.3"/><circle cx="15.75" cy="9.5" r="1.3"/><circle cx="15.75" cy="12" r="1.3"/>
    <circle cx="15.75" cy="14.5" r="1.3"/><circle cx="15.75" cy="17" r="1.3"/>
    <circle cx="18.25" cy="9.5" r="1.3"/><circle cx="18.25" cy="12" r="1.3"/><circle cx="18.25" cy="14.5" r="1.3"/>
    <circle cx="20.75" cy="12" r="1.3"/>
  </svg>
);

export default function HomePage() {
  const [stats, setStats] = useState({ total_detections: 0, registered_vehicles: 0, anomalies: 0, blacklisted_hits: 0 });

  useEffect(() => {
    getStats()
      .then(res => setStats(res.data))
      .catch(err => console.error("Stats error:", err));
  }, []);

  return (
    <div className="home-page">
      <div className="home-hero">
        <div className="home-badge">Portfolio Demo</div>
        <h1 className="home-title">
          OpenANPR <span className="home-title-accent">Detection System</span>
        </h1>
        <p className="home-subtitle">
          A public, session-isolated Automatic Number Plate Recognition system.
          Register your vehicles, scan plates via webcam or phone camera, 
          and view your detection logs — all without signing up.
        </p>
        <div className="home-actions">
          <Link to="/register" className="btn btn-primary">
            <ClipboardList size={18} /> Register a Vehicle
          </Link>
          <Link to="/detect" className="btn btn-secondary">
            <Camera size={18} /> Open Detection Camera
          </Link>
        </div>
      </div>

      <div className="home-stats">
        <div className="stat-card access">
          <div className="stat-value">{stats.total_detections}</div>
          <div className="stat-label">My Detections</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.registered_vehicles}</div>
          <div className="stat-label">Registered</div>
        </div>
        <div className="stat-card anomaly">
          <div className="stat-value">{stats.anomalies}</div>
          <div className="stat-label">Anomalies</div>
        </div>
        <div className="stat-card anomaly">
          <div className="stat-value">{stats.blacklisted_hits}</div>
          <div className="stat-label">Blacklisted Hits</div>
        </div>
      </div>

      <div className="home-features">
        <div className="feature-card">
          <div className="feature-icon"><Camera style={{ color: 'var(--accent)' }} size={32} /></div>
          <h3>Auto-Scan Camera</h3>
          <p>Scan plates dynamically using any connected webcam or your phone camera.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon"><ClipboardList style={{ color: 'var(--accent)' }} size={32} /></div>
          <h3>Vehicle Registry</h3>
          <p>Maintain an active list of approved vehicles for immediate access checking.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon"><BarChart3 style={{ color: 'var(--accent)' }} size={32} /></div>
          <h3>Deep Insights</h3>
          <p>Advanced CNN models automatically classify vehicle type, color, and brand.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon"><ShieldCheck style={{ color: 'var(--accent)' }} size={32} /></div>
          <h3>Session Isolated</h3>
          <p>No login required. All your data is privately isolated to your current browser session.</p>
        </div>
      </div>

      <div className="home-constraints">
        <div className="constraints-header-wrap">
          <AlertTriangle className="constraints-icon" size={24} />
          <h2 className="constraints-header">System Capabilities & Constraints</h2>
        </div>
        <p className="constraints-intro">
          To achieve optimal detection accuracy, please keep the following computer vision limitations in mind when testing:
        </p>
        <div className="constraints-grid">
          <div className="constraint-item">
            <h4><Camera size={16} /> Camera Quality</h4>
            <p>Detection relies heavily on hardware. Blurry or low-resolution webcam feeds will severely reduce OCR accuracy.</p>
          </div>
          <div className="constraint-item">
            <h4><Sun size={16} /> Lighting & Glare</h4>
            <p>Extreme glare, reflections, or very low-light environments can obscure plate characteristics.</p>
          </div>
          <div className="constraint-item">
            <h4><Wind size={16} /> Motion Blur</h4>
            <p>Fast-moving vehicles require higher shutter speeds. Simulating fast motion with a webcam may cause unreadable blur.</p>
          </div>
          <div className="constraint-item">
            <h4><AlertTriangle size={16} /> Non-Standard Plates</h4>
            <p>Heavily customized vanity plates or damaged plates may fall outside the standard alphanumeric detection threshold.</p>
          </div>
          <div className="constraint-item">
            <h4><ListOrdered size={16} /> Single-File Processing</h4>
            <p>Designed for one vehicle at a time in a queue fashion (e.g., single lane entry/exit). If multiple cars enter side-by-side, they will be processed sequentially.</p>
          </div>
        </div>
      </div>

      <div className="developer-profile">
        <h2 className="dev-header">About the Developer</h2>
        <div className="dev-content">
          <h3 className="dev-name">Jessie Bryn M. Vasquez</h3>
          <p className="dev-title">Junior Software Engineer</p>
          <p className="dev-bio">
            A solutions-driven engineer specializing in full-stack web development and computer vision pipelines. 
            BSIT Graduate from Caraga State University. OpenANPR is a portfolio project showcasing expertise 
            in architecting automated detection systems, stateless APIs, and secure application design.
          </p>
          <div className="dev-links">
            <a href="https://github.com/i-jibii" target="_blank" rel="noopener noreferrer" className="dev-link" title="GitHub">
              <GithubIcon />
            </a>
            <a href="https://www.linkedin.com/in/jessie-bryn-vasquez-14067a373" target="_blank" rel="noopener noreferrer" className="dev-link" title="LinkedIn">
              <LinkedinIcon />
            </a>
            <a href="https://ph.jobstreet.com/profiles/jessiebryn-vasquez-k0v54cvy83" target="_blank" rel="noopener noreferrer" className="dev-link" title="JobStreet">
              <JobStreetIcon />
            </a>
            <a href="mailto:jvasquezpd@gmail.com" className="dev-link" title="Email">
              <Mail size={20} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
