import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/services/supabase/client';
import { getPhoneNumbersByOrg, updatePhoneNumber, addPhoneNumber } from '@/services/supabase/phoneNumbers';
import { PageLayout } from '@/components/layout/PageLayout';
import { PhoneGradientIcon } from '@/components/icons/PhoneGradientIcon';
import './ManagePhoneNumber.css';

interface PhoneNumber {
  id: string;
  phone_number: string;
  org_id: string;
  label: string | null;
  direction: 'inbound' | 'outbound';
  created_at: string;
}

export function ManagePhoneNumber() {
  const { organization, isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [currentPhone, setCurrentPhone] = useState<PhoneNumber | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newPhoneInput, setNewPhoneInput] = useState('');
  const [newLabelInput, setNewLabelInput] = useState('');
  const [newDirectionInput, setNewDirectionInput] = useState<'inbound' | 'outbound'>('outbound');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'add' | 'update'>('add');

  // Refresh phone pool on webhook server when phone number changes
  const refreshPhonePool = async () => {
    try {
      console.log('🔄 Refreshing phone pool on webhook server...');

      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      if (!authToken) {
        console.error('❌ No auth token available for refresh');
        return;
      }

      const webhookUrl = import.meta.env.VITE_WEBHOOK_SERVER_URL || 'http://localhost:8080';
      const response = await fetch(`${webhookUrl}/refresh-phone-pool`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Phone pool refreshed successfully:`, data.stats);
      } else {
        console.error(`❌ Failed to refresh phone pool (HTTP ${response.status})`, await response.text());
      }
    } catch (error) {
      console.error('❌ Error refreshing phone pool:', error);
    }
  };

  // Auto-dismiss messages after 3 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Fetch phone number for organization
  useEffect(() => {
    if (organization?.org_id) {
      setIsLoading(true);
      getPhoneNumbersByOrg(organization.org_id).then(result => {
        if (result.data && result.data.length > 0) {
          const rows = result.data;
          const primary = rows.find(p => p.direction === 'outbound') ?? rows[0];
          setCurrentPhone(primary);
          setNewPhoneInput(primary.phone_number);
          setNewLabelInput(primary.label || '');
          setNewDirectionInput(primary.direction);
        } else {
          setCurrentPhone(null);
          setNewPhoneInput('');
          setNewLabelInput('');
          setNewDirectionInput('outbound');
        }
        setIsLoading(false);
      });
    }
  }, [organization?.org_id]);

  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/[^\d+]/g, '');
    return cleaned;
  };

  const isValidPhoneNumber = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10;
  };

  const handleAddClick = () => {
    setConfirmAction('add');
    setShowConfirmDialog(true);
  };

  const handleUpdateClick = () => {
    setConfirmAction('update');
    setShowConfirmDialog(true);
  };

  const handleConfirmAdd = async () => {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'Only admins can add phone numbers' });
      return;
    }

    if (!isValidPhoneNumber(newPhoneInput)) {
      setMessage({ type: 'error', text: 'Please enter a valid phone number' });
      return;
    }

    if (!organization?.org_id) {
      setMessage({ type: 'error', text: 'Organization not found' });
      return;
    }

    setIsSaving(true);
    setShowConfirmDialog(false);

    try {
      const formattedPhone = newPhoneInput.startsWith('+') ? newPhoneInput : `+${newPhoneInput}`;
      const result = await addPhoneNumber(
        formattedPhone,
        organization.org_id,
        newLabelInput || undefined,
        newDirectionInput
      );

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Phone number added successfully!' });
        setCurrentPhone(result.data || null);
        setNewPhoneInput(formattedPhone);
        // Refresh phone pool on webhook server
        await refreshPhonePool();
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to add phone number',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmUpdate = async () => {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'Only admins can update phone numbers' });
      return;
    }

    if (!isValidPhoneNumber(newPhoneInput)) {
      setMessage({ type: 'error', text: 'Please enter a valid phone number' });
      return;
    }

    if (!organization?.org_id || !currentPhone) {
      setMessage({ type: 'error', text: 'Organization or phone not found' });
      return;
    }

    setIsSaving(true);
    setShowConfirmDialog(false);

    try {
      const formattedPhone = newPhoneInput.startsWith('+') ? newPhoneInput : `+${newPhoneInput}`;
      const result = await updatePhoneNumber(
        currentPhone.phone_number,
        formattedPhone,
        organization.org_id,
        newLabelInput || undefined,
        newDirectionInput
      );

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Phone number updated successfully!' });
        setCurrentPhone(result.data || null);
        setNewPhoneInput(formattedPhone);
        // Refresh phone pool on webhook server
        await refreshPhonePool();
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to update phone number',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading) {
    return (
      <PageLayout
        className="manage-phone"
        variant="default"
        eyebrow="Settings"
        title="Phone numbers"
        subtitle="Configure your organization's phone numbers"
        icon={<PhoneGradientIcon gradientId="manage-phone-grad" />}
      >
        <div className="manage-phone-loading">
          <div className="loading-spinner" />
        </div>
      </PageLayout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="manage-phone">
      {message && (
        <div className={`toast-container toast-${message.type}`}>
          <span className="toast-content">
            {message.type === 'success' && '✓ '}
            {message.type === 'error' && '✗ '}
            {message.text}
          </span>
          <button
            type="button"
            className="toast-close"
            onClick={() => setMessage(null)}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      <PageLayout
        className="manage-phone"
        variant="wide"
        eyebrow="Settings"
        title="Phone numbers"
        subtitle="Configure your organization's outbound and inbound numbers"
        icon={<PhoneGradientIcon gradientId="manage-phone-grad" />}
      >
        <div className="manage-phone-page-grid">
          <aside className="manage-phone-page-aside">
            {organization && (
              <div className="org-info-card">
                <div className="info-row">
                  <label>Organization:</label>
                  <span className="info-value">{organization.name}</span>
                </div>
                <div className="info-row">
                  <label>Permission:</label>
                  <span className={`status ${isAdmin ? 'authorized' : 'restricted'}`}>
                    {isAdmin ? '✓ You can manage phone numbers' : '✗ Only admins can manage phone numbers'}
                  </span>
                </div>
              </div>
            )}
          </aside>

          <div className="manage-phone-page-main">
        <div className="manage-phone-card">
          {isLoading ? (
            <div className="loading-state">
              <div className="loading-spinner" />
              <p>Loading phone number...</p>
            </div>
          ) : !currentPhone ? (
            // No Phone Number State - Show form to add number
            <div className="no-phone-state">
              {!isAdmin ? (
                <>
                  <div className="empty-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="rgba(255, 255, 255, 0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 3l18 18" stroke="rgba(255, 255, 255, 0.3)" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <h3>No Phone Number Configured</h3>
                  <p>Contact an administrator to configure the phone number</p>
                </>
              ) : (
                <>
                  <h3>Add Your First Phone Number</h3>
                  <p>Configure your organization's phone number to enable calls</p>

                  <div className="form-group">
                    <label htmlFor="phone-input">Phone Number</label>
                    <div className="phone-input-wrapper">
                      <span className="phone-prefix">📞</span>
                      <input
                        id="phone-input"
                        type="tel"
                        value={newPhoneInput}
                        onChange={(e) => setNewPhoneInput(formatPhoneNumber(e.target.value))}
                        placeholder="+1 (555) 123-4567"
                        className="phone-input"
                        disabled={isSaving}
                      />
                    </div>
                    <span className="input-hint">Include country code (e.g., +1 for US)</span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="label-input">Label (Optional)</label>
                    <input
                      id="label-input"
                      type="text"
                      value={newLabelInput}
                      onChange={(e) => setNewLabelInput(e.target.value)}
                      placeholder="e.g., Outbound, Support"
                      className="label-input"
                      disabled={isSaving}
                    />
                    <span className="input-hint">Friendly name for identification</span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="direction-input">Call Direction</label>
                    <select
                      id="direction-input"
                      value={newDirectionInput}
                      onChange={(e) => setNewDirectionInput(e.target.value as 'inbound' | 'outbound')}
                      className="direction-input"
                      disabled={isSaving}
                    >
                      <option value="inbound">Inbound</option>
                      <option value="outbound">Outbound</option>
                    </select>
                    <span className="input-hint">Whether this number handles incoming or outgoing calls</span>
                  </div>

                  <button
                    className="update-button"
                    onClick={handleAddClick}
                    disabled={isSaving || !isValidPhoneNumber(newPhoneInput)}
                  >
                    {isSaving ? 'Adding...' : 'Add Phone Number'}
                  </button>
                </>
              )}
            </div>
          ) : (
            // Current Phone Number State
            <div className="phone-display">
              <div className="phone-section">
                <label className="section-label">Current Phone Number</label>
                <div className="phone-card-display">
                  <div className="phone-display-content">
                    <span className="phone-display-number">{currentPhone.phone_number}</span>
                    {currentPhone.label && (
                      <span className="phone-display-label">{currentPhone.label}</span>
                    )}
                    <span className="phone-display-direction">
                      Direction: <span className={`direction-badge ${currentPhone.direction}`}>{currentPhone.direction.charAt(0).toUpperCase() + currentPhone.direction.slice(1)}</span>
                    </span>
                  </div>
                  <div className="phone-display-meta">
                    <span className="configured-badge">✓ Configured</span>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <>
                  <div className="divider" />

                  <div className="edit-section">
                    <label className="section-label">Edit Phone Number</label>

                    <div className="form-group">
                      <label htmlFor="phone-input">Phone Number</label>
                      <div className="phone-input-wrapper">
                        <span className="phone-prefix">📞</span>
                        <input
                          id="phone-input"
                          type="tel"
                          value={newPhoneInput}
                          onChange={(e) => setNewPhoneInput(formatPhoneNumber(e.target.value))}
                          placeholder="+1 (555) 123-4567"
                          className="phone-input"
                          disabled={isSaving}
                        />
                      </div>
                      <span className="input-hint">Include country code (e.g., +1 for US)</span>
                    </div>

                    <div className="form-group">
                      <label htmlFor="label-input">Label (Optional)</label>
                      <input
                        id="label-input"
                        type="text"
                        value={newLabelInput}
                        onChange={(e) => setNewLabelInput(e.target.value)}
                        placeholder="e.g., Outbound, Support"
                        className="label-input"
                        disabled={isSaving}
                      />
                      <span className="input-hint">Friendly name for identification</span>
                    </div>

                    <div className="form-group">
                      <label htmlFor="direction-input">Call Direction</label>
                      <select
                        id="direction-input"
                        value={newDirectionInput}
                        onChange={(e) => setNewDirectionInput(e.target.value as 'inbound' | 'outbound')}
                        className="direction-input"
                        disabled={isSaving}
                      >
                        <option value="inbound">Inbound</option>
                        <option value="outbound">Outbound</option>
                      </select>
                      <span className="input-hint">Whether this number handles incoming or outgoing calls</span>
                    </div>

                    <button
                      className="update-button"
                      onClick={handleUpdateClick}
                      disabled={isSaving || !isValidPhoneNumber(newPhoneInput)}
                    >
                      {isSaving ? 'Updating...' : 'Update Phone Number'}
                    </button>
                  </div>
                </>
              )}

              {!isAdmin && (
                <div className="admin-only-message">
                  <p>Only administrators can modify phone numbers. Contact your organization admin for changes.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirmation Dialog */}
        {showConfirmDialog && (
          <div className="confirmation-overlay">
            <div className="confirmation-dialog">
              <div className="dialog-header">
                <h3>{confirmAction === 'add' ? 'Confirm Add Phone Number' : 'Confirm Update Phone Number'}</h3>
              </div>

              <div className="dialog-content">
                <p>You are about to {confirmAction === 'add' ? 'add' : 'update'} the phone number:</p>
                <div className="phone-preview">
                  <span className="preview-number">{newPhoneInput}</span>
                  {newLabelInput && <span className="preview-label">{newLabelInput}</span>}
                  <span className="preview-direction">{newDirectionInput.charAt(0).toUpperCase() + newDirectionInput.slice(1)}</span>
                </div>
                <p className="confirm-warning">
                  {confirmAction === 'add'
                    ? `This number will be used for ${newDirectionInput} calls from your organization.`
                    : 'This will replace the current phone number. Existing calls may be affected.'}
                </p>
              </div>

              <div className="dialog-actions">
                <button
                  className="cancel-button"
                  onClick={() => setShowConfirmDialog(false)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  className="confirm-button"
                  onClick={confirmAction === 'add' ? handleConfirmAdd : handleConfirmUpdate}
                  disabled={isSaving}
                >
                  {isSaving ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="manage-phone-info">
          <h4>Information</h4>
          <ul>
            <li>Your organization can have only ONE outbound phone number</li>
            <li>This number is used for all outbound calls to customers</li>
            <li>Only administrators can configure or change the phone number</li>
            <li>Changes take effect immediately</li>
            <li>Include the country code (e.g., +1 for US phone numbers)</li>
          </ul>
        </div>
          </div>
        </div>
      </PageLayout>
    </div>
  );
}
