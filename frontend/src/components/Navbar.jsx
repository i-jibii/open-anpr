import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ScanLine, Menu, X } from 'lucide-react';
import './Navbar.css';

export default function Navbar() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const links = [
    { to: '/', label: 'Home' },
    { to: '/register', label: 'Register Vehicle' },
    { to: '/detect', label: 'Detection' },
    { to: '/logs', label: 'Logs' },
  ];

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <ScanLine className="navbar-logo-icon" size={24} />
        <span className="navbar-title">OpenANPR</span>
      </div>

      {/* Hamburger button for mobile */}
      <button 
        className="mobile-menu-btn" 
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label="Toggle menu"
      >
        {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <div className={`navbar-links ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`navbar-link${location.pathname === link.to ? ' active' : ''}`}
            onClick={closeMenu}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
