import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/services/supabase/client';
import {
  getPhoneNumbersByOrgAndDirection,
  addPhoneNumber,
  updatePhoneNumber,
  type PhoneNumber,
} from '@/services/supabase/phoneNumbers';
import {
  formatPhoneInput,
  formatPhoneForDisplay,
  validatePhoneNumber,
} from '@/utils/phoneValidation';
import { PageLayout } from '@/components/layout/PageLayout';
import { PhoneGradientIcon } from '@/components/icons/PhoneGradientIcon';
import '@/components/settings/ManagePhoneNumber.css';

const INBOUND_DIRECTION = 'inbound' as const;

function InboundDailyLogPanel() {
  return (
    <aside className="inbound-daily-log-panel" aria-label="Daily phone configuration log">
      <div className="inbound-daily-log-panel__head">
        <h3 className="inbound-daily-log-panel__title">Log</h3>
      </div>
      <div className="inbound-daily-log-panel__body">
        <p className="inbound-daily-log-panel__placeholder">Daily Phone Config will show here</p>
      </div>
    </aside>
  );
}

async function refreshPhonePool() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const authToken = session?.access_token;
    if (!authToken) return;

    const webhookUrl = import.meta.env.VITE_WEBHOOK_SERVER_URL || 'http://localhost:8080';
    await fetch(`${webhookUrl}/refresh-phone-pool`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });
  } catch {
    /* non-fatal */
  }
}

export function InboundConfigNumber() {
  const { organization, isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [currentPhone, setCurrentPhone] = useState<PhoneNumber | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'add' | 'update'>('add');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [message]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (!organization?.org_id || !isAdmin) return;
    setIsLoading(true);
    getPhoneNumbersByOrgAndDirection(organization.org_id, INBOUND_DIRECTION).then((result) => {
      const row = result.data?.[0] ?? null;
      setCurrentPhone(row);
      if (row) {
        setPhoneInput(formatPhoneForDisplay(row.phone_number) || row.phone_number);
        setLabelInput(row.label || '');
      } else {
        setPhoneInput('');
        setLabelInput('');
      }
      setIsLoading(false);
    });
  }, [organization?.org_id, isAdmin]);

  const phoneValidation = validatePhoneNumber(phoneInput);

  const handleConfirmAdd = async () => {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'Only admins can add phone numbers' });
      return;
    }
    const v = validatePhoneNumber(phoneInput);
    if (!v.isValid) {
      setMessage({ type: 'error', text: v.error || 'Please enter a valid phone number' });
      return;
    }
    if (!organization?.org_id) {
      setMessage({ type: 'error', text: 'Organization not found' });
      return;
    }

    setIsSaving(true);
    setShowConfirmDialog(false);

    try {
      const normalized = v.normalized;
      const result = await addPhoneNumber(
        normalized,
        organization.org_id,
        labelInput || undefined,
        INBOUND_DIRECTION,
      );

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Inbound number saved.' });
        setCurrentPhone(result.data || null);
        setPhoneInput(formatPhoneForDisplay(normalized) || normalized);
        await refreshPhonePool();
      }
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to add number',
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
    const v = validatePhoneNumber(phoneInput);
    if (!v.isValid) {
      setMessage({ type: 'error', text: v.error || 'Please enter a valid phone number' });
      return;
    }
    if (!organization?.org_id || !currentPhone) {
      setMessage({ type: 'error', text: 'Organization or number not found' });
      return;
    }

    setIsSaving(true);
    setShowConfirmDialog(false);

    try {
      const normalized = v.normalized;
      const result = await updatePhoneNumber(
        currentPhone.phone_number,
        normalized,
        organization.org_id,
        labelInput || undefined,
        INBOUND_DIRECTION,
      );

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Inbound number updated.' });
        setCurrentPhone(result.data || null);
        setPhoneInput(formatPhoneForDisplay(normalized) || normalized);
        await refreshPhonePool();
      }
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to update number',
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
        eyebrow="Inbound"
        title="Config number"
        subtitle="Inbound phone number for your organization"
        icon={<PhoneGradientIcon gradientId="inbound-phone-grad" />}
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

  if (!isAdmin) {
    return (
      <PageLayout
        className="manage-phone"
        variant="wide"
        eyebrow="Inbound"
        title="Config number"
        subtitle="Inbound phone number for your organization"
        icon={<PhoneGradientIcon gradientId="inbound-phone-grad" />}
      >
        <div className="inbound-config-page">
          <div className="inbound-config-main">
            <div className="manage-phone-card inbound-access-denied">
              <p className="inbound-access-denied__text">You are not allowed to view this page.</p>
            </div>
          </div>
          <InboundDailyLogPanel />
        </div>
      </PageLayout>
    );
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
        eyebrow="Inbound"
        title="Config number"
        subtitle="Set the phone number that receives inbound calls for your organization"
        icon={<PhoneGradientIcon gradientId="inbound-phone-grad" />}
      >
        <div className="inbound-config-page">
          <div className="inbound-config-main">
            <div className="inbound-config-layout">
          {organization && (
            <div className="inbound-org-strip">
              <span className="inbound-org-strip__label">Organization</span>
              <span className="inbound-org-strip__name">{organization.name}</span>
            </div>
          )}

          <div className="manage-phone-card">
            {isLoading ? (
              <div className="loading-state">
                <div className="loading-spinner" />
                <p>Loading inbound number…</p>
              </div>
            ) : !currentPhone ? (
              <div className="no-phone-state">
                <h3>Set inbound number</h3>
                <p>This number is stored as your organization&apos;s inbound line.</p>

                <div className="form-group">
                  <label htmlFor="inbound-phone-input">Phone number</label>
                  <div className="phone-input-wrapper">
                    <span className="phone-prefix">📞</span>
                    <input
                      id="inbound-phone-input"
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(formatPhoneInput(e.target.value))}
                      placeholder="+1 (555) 123-4567"
                      className="phone-input"
                      disabled={isSaving}
                    />
                  </div>
                  <span className="input-hint">Include country code (e.g. +1 for US)</span>
                </div>

                <div className="form-group">
                  <label htmlFor="inbound-label-input">Label (optional)</label>
                  <input
                    id="inbound-label-input"
                    type="text"
                    value={labelInput}
                    onChange={(e) => setLabelInput(e.target.value)}
                    placeholder="e.g. Main line"
                    className="label-input"
                    disabled={isSaving}
                  />
                </div>

                <button
                  type="button"
                  className="update-button"
                  onClick={() => {
                    setConfirmAction('add');
                    setShowConfirmDialog(true);
                  }}
                  disabled={isSaving || !phoneValidation.isValid}
                >
                  {isSaving ? 'Saving…' : 'Save inbound number'}
                </button>
              </div>
            ) : (
              <div className="phone-display">
                <div className="phone-section">
                  <label className="section-label">Inbound number</label>
                  <div className="phone-card-display">
                    <div className="phone-display-content">
                      <span className="phone-display-number">
                        {formatPhoneForDisplay(currentPhone.phone_number) || currentPhone.phone_number}
                      </span>
                      {currentPhone.label && (
                        <span className="phone-display-label">{currentPhone.label}</span>
                      )}
                      <span className="phone-display-direction">
                        Direction: <span className="direction-badge inbound">Inbound</span>
                      </span>
                    </div>
                    <div className="phone-display-meta">
                      <span className="configured-badge">✓ Configured</span>
                    </div>
                  </div>
                </div>

                <div className="divider" />
                <div className="edit-section">
                  <label className="section-label">Update inbound number</label>

                  <div className="form-group">
                    <label htmlFor="inbound-phone-edit">Phone number</label>
                    <div className="phone-input-wrapper">
                      <span className="phone-prefix">📞</span>
                      <input
                        id="inbound-phone-edit"
                        type="tel"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(formatPhoneInput(e.target.value))}
                        placeholder="+1 (555) 123-4567"
                        className="phone-input"
                        disabled={isSaving}
                      />
                    </div>
                    <span className="input-hint">Include country code (e.g. +1 for US)</span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="inbound-label-edit">Label (optional)</label>
                    <input
                      id="inbound-label-edit"
                      type="text"
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      placeholder="e.g. Main line"
                      className="label-input"
                      disabled={isSaving}
                    />
                  </div>

                  <button
                    type="button"
                    className="update-button"
                    onClick={() => {
                      setConfirmAction('update');
                      setShowConfirmDialog(true);
                    }}
                    disabled={isSaving || !phoneValidation.isValid}
                  >
                    {isSaving ? 'Updating…' : 'Update inbound number'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="manage-phone-info">
            <h4>Information</h4>
            <ul>
              <li>This page only configures your inbound number (direction is always inbound).</li>
              <li>Outbound numbers are configured under Outbound → Config Number.</li>
              <li>Include the country code (e.g. +1 for US).</li>
            </ul>
          </div>
            </div>
          </div>
          <InboundDailyLogPanel />
        </div>
      </PageLayout>

      {showConfirmDialog && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog">
            <div className="dialog-header">
              <h3>{confirmAction === 'add' ? 'Confirm inbound number' : 'Confirm update'}</h3>
            </div>
            <div className="dialog-content">
              <p>You are about to {confirmAction === 'add' ? 'save' : 'update'}:</p>
              <div className="phone-preview">
                <span className="preview-number">
                  {formatPhoneForDisplay(phoneInput) || phoneInput}
                </span>
                {labelInput && <span className="preview-label">{labelInput}</span>}
                <span className="preview-direction">Inbound</span>
              </div>
              <p className="confirm-warning">
                {confirmAction === 'add'
                  ? 'This number will be stored as your organization inbound line.'
                  : 'This replaces the current inbound number.'}
              </p>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={() => setShowConfirmDialog(false)}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm-button"
                onClick={confirmAction === 'add' ? handleConfirmAdd : handleConfirmUpdate}
                disabled={isSaving}
              >
                {isSaving ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
