import { useState, useEffect, useRef } from 'react';
import { registerVehicle, getVehicles, deleteVehicle, updateVehicle } from '../services/api';
import { CheckCircle2, Ban, Clock, Trash2, ArrowUpRight, ArrowDownLeft, ChevronDown, Edit2, X } from 'lucide-react';
import './RegisterPage.css';

const VEHICLE_TYPES = ['Car', 'Motorcycle', 'Van', 'Truck', 'Other'];
const VEHICLE_STATUSES = ['Approved (Normal)', 'Blacklisted (Test breach)'];

const VEHICLE_BRANDS = [
  '', 'Alfa Romeo', 'Aston Martin', 'Audi', 'BMW', 'BYD', 'Brilliance', 'Bugatti', 'Changan', 'Chery', 'Chevrolet', 'Citroen', 'DS', 'Daewoo', 'Daihatsu', 'Dodge', 'Dongfeng', 'Fiat', 'Ford', 'GMC', 'Gac', 'Geely', 'Honda', 'Hyundai', 'Infiniti', 'Isuzu', 'JAC', 'Jaecoo', 'Jaguar', 'Jeep', 'Jetour', 'KIA', 'Lada', 'Lamborghini', 'Land Rover', 'Lexus', 'MG', 'Maxus', 'Mazda', 'Mercedes', 'Mini Cooper', 'Mitsubishi', 'Neta', 'Nissan', 'Omoda', 'Opel', 'Peugeot', 'Porsche', 'Proton', 'Renault', 'Scania', 'Seat', 'Skoda', 'Subaru', 'Suzuki', 'Tesla', 'Toyota', 'Vinfast', 'Volkswagen', 'Volvo'
];

const VEHICLE_COLORS = [
  '', 'Beige', 'Black', 'Blue', 'Brown', 'Gold', 'Green', 'Grey', 'Orange', 'Pink', 'Purple', 'Red', 'Silver', 'Tan', 'White', 'Yellow'
];

const SearchableSelect = ({ options, value, onChange, placeholder, name, id, searchable = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = searchable 
    ? options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()) && opt !== '')
    : options.filter(opt => opt !== '');

  const handleBlur = () => {
    if (searchable && searchTerm) {
      // Auto-correct casing if they typed an exact match
      const exactMatch = options.find(opt => opt.toLowerCase() === searchTerm.toLowerCase());
      if (exactMatch) {
        const displayMatch = exactMatch.charAt(0).toUpperCase() + exactMatch.slice(1);
        setSearchTerm(displayMatch);
        onChange({ target: { name, value: exactMatch } });
      }
    }
  };

  const handleKeyDown = (e) => {
    if (!searchable) return;
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      if (isOpen && filteredOptions.length > 0) {
        // Prefer exact match, fallback to first filtered option
        const exactMatch = filteredOptions.find(opt => opt.toLowerCase() === searchTerm.toLowerCase());
        const match = exactMatch || filteredOptions[0];
        const displayMatch = match.charAt(0).toUpperCase() + match.slice(1);
        setSearchTerm(displayMatch);
        onChange({ target: { name, value: match } });
        setIsOpen(false);
      }
    }
  };

  return (
    <div className="searchable-select" ref={wrapperRef}>
      <input
        id={id}
        name={name}
        type="text"
        className={`form-input ${!searchable ? 'cursor-pointer' : ''}`}
        style={!searchable ? { cursor: 'pointer' } : {}}
        placeholder={placeholder}
        value={searchable ? searchTerm : (value ? value.charAt(0).toUpperCase() + value.slice(1) : '')}
        onChange={(e) => {
          if (searchable) {
            setSearchTerm(e.target.value);
            onChange({ target: { name, value: e.target.value } });
            setIsOpen(true);
          }
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={() => setIsOpen(!isOpen)}
        autoComplete="off"
        readOnly={!searchable}
        required
      />
      <ChevronDown 
        className="select-arrow-icon" 
        size={16} 
        onClick={() => setIsOpen(!isOpen)} 
      />
      
      {isOpen && (
        <ul className="select-dropdown">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <li 
                key={opt} 
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents input blur before click registers
                  const displayMatch = opt.charAt(0).toUpperCase() + opt.slice(1);
                  onChange({ target: { name, value: opt } });
                  setSearchTerm(displayMatch);
                  setIsOpen(false);
                }}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </li>
            ))
          ) : (
            <li className="no-options">No matches found</li>
          )}
        </ul>
      )}
    </div>
  );
};

export default function RegisterPage() {
  const [form, setForm] = useState({
    plate_number: '',
    type: 'Car',
    brand: '',
    color: '',
    status: 'Approved (Normal)',
  });
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text: '' }
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, plate_number }
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);

  const openEditModal = (v) => {
    setEditingVehicle(v);
    
    // Map backend enums back to dropdown options
    let statusLabel = 'Approved (Normal)';
    if (v.status === 'blacklisted' || v.status === 'expired') statusLabel = 'Blacklisted (Test breach)';
    
    setEditForm({
      plate_number: v.plate_number,
      type: v.type.charAt(0).toUpperCase() + v.type.slice(1),
      brand: v.brand ? v.brand.charAt(0).toUpperCase() + v.brand.slice(1) : '',
      color: v.color ? v.color.charAt(0).toUpperCase() + v.color.slice(1) : '',
      status: statusLabel,
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: name === 'plate_number' ? value.toUpperCase() : value,
    }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.plate_number.trim() || !editForm.type || !editForm.brand || !editForm.color || !editForm.status) {
      alert('All fields are required.');
      return;
    }
    
    if (!VEHICLE_BRANDS.includes(editForm.brand)) return alert('Invalid Brand.');
    if (!VEHICLE_COLORS.includes(editForm.color) && editForm.color !== '') return alert('Invalid Color.');
    if (!VEHICLE_TYPES.includes(editForm.type)) return alert('Invalid Type.');
    if (!VEHICLE_STATUSES.includes(editForm.status)) return alert('Invalid Status.');

    let backendStatus = 'approved';
    if (editForm.status.includes('Blacklisted')) backendStatus = 'blacklisted';
    if (editForm.status.includes('Expired')) backendStatus = 'expired';

    const payload = {
      ...editForm,
      type: editForm.type.toLowerCase(),
      color: editForm.color,
      status: backendStatus
    };

    setIsEditing(true);
    try {
      const res = await updateVehicle(editingVehicle.id, payload);
      setVehicles((prev) => prev.map(v => v.id === editingVehicle.id ? res.data.vehicle : v));
      setEditingVehicle(null);
      setEditForm(null);
    } catch (err) {
      alert(err?.response?.data?.detail || 'Update failed. Please try again.');
    } finally {
      setIsEditing(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      const res = await getVehicles();
      setVehicles(res.data.vehicles || []);
    } catch {
      // silently ignore on initial load
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: name === 'plate_number' ? value.toUpperCase() : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.plate_number.trim() || !form.type || !form.brand || !form.color || !form.status) {
      setMessage({ type: 'error', text: 'All fields are required.' });
      return;
    }
    
    // Strict validation for typeable dropdowns
    if (!VEHICLE_BRANDS.includes(form.brand)) {
      setMessage({ type: 'error', text: 'Please select a valid Brand from the dropdown.' });
      return;
    }
    
    if (!VEHICLE_COLORS.includes(form.color) && form.color !== '') {
      setMessage({ type: 'error', text: 'Please select a valid Color from the dropdown.' });
      return;
    }
    
    if (!VEHICLE_TYPES.includes(form.type)) {
      setMessage({ type: 'error', text: 'Please select a valid Vehicle Type from the dropdown.' });
      return;
    }

    if (!VEHICLE_STATUSES.includes(form.status)) {
      setMessage({ type: 'error', text: 'Please select a valid Status from the dropdown.' });
      return;
    }
    
    // Map status back to backend ENUM
    let backendStatus = 'approved';
    if (form.status.includes('Blacklisted')) backendStatus = 'blacklisted';
    if (form.status.includes('Expired')) backendStatus = 'expired';

    // Ensure the payload matches exact cases
    const payload = {
      ...form,
      type: form.type.toLowerCase(),
      color: form.color,
      status: backendStatus
    };

    setLoading(true);
    setMessage(null);
    try {
      const res = await registerVehicle(payload);
      setMessage({
        type: 'success',
        text: `Vehicle "${res.data.vehicle.plate_number}" registered successfully!`,
      });
      setForm({ plate_number: '', type: 'Car', brand: '', color: '', status: 'Approved (Normal)' });
      fetchVehicles();
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Registration failed. Please try again.';
      setMessage({ type: 'error', text: detail });
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteVehicle(deleteTarget.id);
      setVehicles((prev) => prev.filter((v) => v.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      alert('Could not delete vehicle. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-form-section">
        <h1 className="page-title">Register Vehicle</h1>
        <p className="page-subtitle">
          Add a plate to your session's registry. The detection system will use this
          to classify scanned plates as <strong>authorized</strong> or <strong>unregistered</strong>.
        </p>

        <form className="register-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="plate_number">Plate Number *</label>
            <input
              id="plate_number"
              name="plate_number"
              type="text"
              placeholder="e.g. ABC1234"
              value={form.plate_number}
              onChange={handleChange}
              className="form-input"
              maxLength={20}
              autoCapitalize="characters"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="type">Vehicle Type *</label>
              <SearchableSelect
                options={VEHICLE_TYPES}
                id="type"
                name="type"
                value={form.type}
                onChange={handleChange}
                placeholder="-- Select Type --"
                searchable={false}
              />
            </div>

            <div className="form-group">
              <label htmlFor="brand">Brand *</label>
              <SearchableSelect
                options={VEHICLE_BRANDS.filter(b => b)}
                id="brand"
                name="brand"
                value={form.brand}
                onChange={handleChange}
                placeholder="-- Type or Select Brand --"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="color">Color *</label>
              <SearchableSelect
                options={VEHICLE_COLORS.filter(c => c)}
                id="color"
                name="color"
                value={form.color}
                onChange={handleChange}
                placeholder="-- Type or Select Color --"
              />
            </div>

            <div className="form-group">
              <label htmlFor="status">Status *</label>
              <SearchableSelect
                options={VEHICLE_STATUSES}
                id="status"
                name="status"
                value={form.status}
                onChange={handleChange}
                placeholder="-- Select Status --"
                searchable={false}
              />
            </div>
          </div>

          {message && (
            <div className={`form-message ${message.type}`}>
              {message.text}
            </div>
          )}

          <button type="submit" className="btn-submit" disabled={loading || !form.plate_number.trim()}>
            {loading ? 'Registering...' : 'Register Vehicle'}
          </button>
        </form>
      </div>

      <div className="registered-vehicles-section">
        <h2 className="section-title">
          Your Registered Vehicles
          <span className="vehicle-count">{vehicles.length}</span>
        </h2>

        {vehicles.length === 0 ? (
          <div className="empty-state">
            No vehicles registered yet. Add one above to start testing detection.
          </div>
        ) : (
          <div className="vehicle-list">
            {vehicles.map((v) => (
              <div key={v.id} className={`vehicle-card status-${v.status}`}>
                <div className="vehicle-plate">{v.plate_number}</div>
                <div className="vehicle-details">
                  <span className="vehicle-meta">{v.type}</span>
                  {v.brand && <span className="vehicle-meta">{v.brand}</span>}
                  {v.color && <span className="vehicle-meta">{v.color}</span>}
                </div>
                <div className="vehicle-footer">
                  <span className={`status-badge ${v.status}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {v.status === 'approved' && <CheckCircle2 size={12} />}
                    {v.status === 'blacklisted' && <Ban size={12} />}
                    {v.status === 'expired' && <Clock size={12} />}
                    {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                  </span>
                  
                  {v.is_on_premises && (
                    <span className="on-premises-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ArrowDownLeft size={12} /> On Premises
                    </span>
                  )}
                  
                  <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                    <button
                      className="edit-btn"
                      onClick={() => openEditModal(v)}
                      title="Edit vehicle"
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      className="delete-btn"
                      onClick={() => setDeleteTarget(v)}
                      title="Remove vehicle"
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modern Confirmation Modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-wrap">
              <Trash2 size={24} />
            </div>
            <h3 className="modal-title">Remove Vehicle?</h3>
            <p className="modal-description">
              Are you sure you want to remove <span className="modal-plate-highlight">{deleteTarget.plate_number}</span> from your session's registry?
            </p>
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-modal-cancel" 
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-modal-delete" 
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : (
                  <>
                    <Trash2 size={16} /> Remove
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingVehicle && (
        <div className="modal-overlay" onClick={() => setEditingVehicle(null)}>
          <div className="modal-card edit-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Vehicle</h3>
              <button className="close-btn" onClick={() => setEditingVehicle(null)}>
                <X size={20} />
              </button>
            </div>
            
            <form className="register-form" onSubmit={handleEditSubmit} style={{ marginTop: '15px' }}>
              <div className="form-group">
                <label htmlFor="edit_plate_number">Plate Number *</label>
                <input
                  id="edit_plate_number"
                  name="plate_number"
                  type="text"
                  className="form-input"
                  placeholder="e.g. ABC1234"
                  value={editForm.plate_number}
                  onChange={handleEditChange}
                  autoComplete="off"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit_type">Vehicle Type *</label>
                  <SearchableSelect
                    id="edit_type"
                    name="type"
                    options={VEHICLE_TYPES}
                    value={editForm.type}
                    onChange={handleEditChange}
                    placeholder="Select Vehicle Type"
                    searchable={false}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edit_brand">Brand *</label>
                  <SearchableSelect
                    id="edit_brand"
                    name="brand"
                    options={VEHICLE_BRANDS}
                    value={editForm.brand}
                    onChange={handleEditChange}
                    placeholder="-- Type or Select Brand --"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit_color">Color *</label>
                  <SearchableSelect
                    id="edit_color"
                    name="color"
                    options={VEHICLE_COLORS}
                    value={editForm.color}
                    onChange={handleEditChange}
                    placeholder="-- Type or Select Color --"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edit_status">Status *</label>
                  <SearchableSelect
                    id="edit_status"
                    name="status"
                    options={VEHICLE_STATUSES}
                    value={editForm.status}
                    onChange={handleEditChange}
                    placeholder="Select Status"
                    searchable={false}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={isEditing}
                style={{ marginTop: '10px' }}
              >
                {isEditing ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
