import { useState, useEffect, useCallback, useMemo } from 'react';
import { getLogs } from '../services/api';
import { RefreshCw, CheckCircle2, AlertTriangle, ShieldAlert, ArrowUpRight, ArrowDownLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import './LogsPage.css';

const KIND_LABELS = {
  access: { label: 'Authorized', className: 'access' },
  anomaly_unregistered: { label: 'Unregistered', className: 'anomaly' },
  anomaly_low_confidence: { label: 'Low Confidence', className: 'anomaly' },
  breach_blacklisted: { label: 'Blacklisted', className: 'breach' },
  breach_expired: { label: 'Expired', className: 'breach' },
};

export default function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage, setEntriesPerPage] = useState(5);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLogs(200);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchFilter =
        filter === 'all' ||
        (filter === 'access' && log.alert_kind === 'access') ||
        (filter === 'anomaly' && log.alert_kind?.startsWith('anomaly_')) ||
        (filter === 'breach' && log.alert_kind?.startsWith('breach_'));
      const matchSearch =
        !search.trim() || log.detected_plate?.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [logs, filter, search]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search]);

  // --- Pagination Logic ---
  const totalFiltered = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / entriesPerPage));

  // Ensure current page is valid after data changes
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const currentLogs = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage;
    return filteredLogs.slice(start, start + entriesPerPage);
  }, [filteredLogs, currentPage, entriesPerPage]);

  // Dynamic dropdown options logic
  const availableOptions = useMemo(() => {
    const baseOptions = [5, 10, 30, 40];
    return baseOptions.filter((opt, idx) => {
      if (idx === 0) return true; // Always show 5
      // Show option only if total entries truly reaches this threshold
      return totalFiltered >= opt;
    });
  }, [totalFiltered]);

  // Ensure entriesPerPage stays valid if options shrink
  useEffect(() => {
    if (!availableOptions.includes(entriesPerPage)) {
      setEntriesPerPage(availableOptions[availableOptions.length - 1]);
    }
  }, [availableOptions, entriesPerPage]);

  // Page numbers logic (max 5 buttons visible)
  const getPageNumbers = () => {
    const pages = [];
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleString();
  };

  return (
    <div className="logs-page">
      <div className="logs-header">
        <div>
          <h1 className="page-title">Detection Logs</h1>
          <p className="page-subtitle">
            All plate scans from your current session.
            <strong> {total} total entries.</strong>
          </p>
        </div>
        <button className="refresh-btn" onClick={fetchLogs} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Filter bar */}
      <div className="logs-filters">
        <div className="filter-tabs">
          <button className={`filter-tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
            All
          </button>
          <button className={`filter-tab${filter === 'access' ? ' active' : ''}`} onClick={() => setFilter('access')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={14} /> Authorized
          </button>
          <button className={`filter-tab${filter === 'anomaly' ? ' active' : ''}`} onClick={() => setFilter('anomaly')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle size={14} /> Anomaly
          </button>
          <button className={`filter-tab${filter === 'breach' ? ' active' : ''}`} onClick={() => setFilter('breach')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ShieldAlert size={14} /> Breach
          </button>
        </div>
        <input
          type="text"
          className="search-input"
          placeholder="Search plate..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="loading-state">Loading logs...</div>
      ) : filteredLogs.length === 0 ? (
        <div className="empty-state">
          {total === 0
            ? 'No detections yet. Go to the Detection page and scan a plate!'
            : 'No logs match your current filter.'}
        </div>
      ) : (
        <div className="logs-table-wrap">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Plate</th>
                <th>Status</th>
                <th>Direction</th>
                <th>Brand</th>
                <th>Color</th>
                <th>Type</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {currentLogs.map((log) => {
                const kindInfo = KIND_LABELS[log.alert_kind] || { label: log.alert_kind, className: 'anomaly' };
                return (
                  <tr key={log.id} className={`log-row ${kindInfo.className}`}>
                    <td className="log-time">{formatTime(log.timestamp)}</td>
                    <td className="log-plate">{log.detected_plate}</td>
                    <td>
                      <span className={`status-chip ${kindInfo.className}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}>
                        {kindInfo.className === 'access' && <CheckCircle2 size={12} />}
                        {kindInfo.className === 'anomaly' && <AlertTriangle size={12} />}
                        {kindInfo.className === 'breach' && <ShieldAlert size={12} />}
                        {kindInfo.label}
                      </span>
                    </td>
                    <td className="log-dir">
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {log.direction === 'entry' ? <ArrowDownLeft size={14} /> : log.direction === 'exit' ? <ArrowUpRight size={14} /> : ''}
                        {log.direction === 'entry' ? 'Entry' : log.direction === 'exit' ? 'Exit' : '—'}
                      </span>
                    </td>
                    <td>{log.vehicle_brand || '—'}</td>
                    <td>{log.vehicle_color || '—'}</td>
                    <td className="capitalize">{log.vehicle_type || '—'}</td>
                    <td>
                      {log.confidence_score != null
                        ? `${Number(log.confidence_score).toFixed(1)}%`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {totalFiltered > 0 && (
        <div className="pagination-container">
          <div className="pagination-dropdown">
            <span>Show</span>
            <select 
              value={entriesPerPage} 
              onChange={(e) => {
                setEntriesPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="entries-select"
            >
              {availableOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <span>entries</span>
          </div>

          <div className="pagination-buttons">
            <button 
              className="pagination-btn icon-btn" 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              title="Previous"
            >
              <ChevronLeft size={16} />
            </button>
            
            {getPageNumbers().map(num => (
              <button 
                key={num}
                className={`pagination-btn ${num === currentPage ? 'active' : ''}`}
                onClick={() => setCurrentPage(num)}
              >
                {num}
              </button>
            ))}

            <button 
              className="pagination-btn icon-btn" 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              title="Next"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
