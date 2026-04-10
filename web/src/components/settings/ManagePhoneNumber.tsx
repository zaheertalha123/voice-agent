import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/services/supabase/client';
import {
  getPhoneNumbersByOrgAndDirection,
  updatePhoneNumber,
  addPhoneNumber,
  type PhoneNumber,
} from '@/services/supabase/phoneNumbers';
import {
  formatPhoneInput,
  formatPhoneForDisplay,
  formatStoredPhoneForInput,
  validatePhoneNumber,
} from '@/utils/phoneValidation';
import { PageLayout } from '@/components/layout/PageLayout';
import { PhoneGradientIcon } from '@/components/icons/PhoneGradientIcon';
import './ManagePhoneNumber.css';

const OUTBOUND_DIRECTION = 'outbound' as const;

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

export function ManagePhoneNumber() {
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
    getPhoneNumbersByOrgAndDirection(organization.org_id, OUTBOUND_DIRECTION).then(result => {
      const row = result.data?.[0] ?? null;
      setCurrentPhone(row);
      if (row) {
        setPhoneInput(formatStoredPhoneForInput(row.phone_number));
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
        OUTBOUND_DIRECTION,
      );

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Outbound number saved.' });
        setCurrentPhone(result.data || null);
        setPhoneInput(formatStoredPhoneForInput(normalized));
        await refreshPhonePool();
      }
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to add phone number',
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
        OUTBOUND_DIRECTION,
      );

      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Outbound number updated.' });
        setCurrentPhone(result.data || null);
        setPhoneInput(formatStoredPhoneForInput(normalized));
        await refreshPhonePool();
      }
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to update phone number',
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
        eyebrow="Outbound"
        title="Config number"
        subtitle="Outbound phone number for your organization"
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

  if (!isAdmin) {
    return (
      <PageLayout
        className="manage-phone"
        variant="wide"
        eyebrow="Outbound"
        title="Config number"
        subtitle="Outbound phone number for your organization"
        icon={<PhoneGradientIcon gradientId="manage-phone-grad" />}
      >
        <div className="inbound-config-layout">
          <div className="manage-phone-card inbound-access-denied">
            <p className="inbound-access-denied__text">You are not allowed to view this page.</p>
          </div>
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
        eyebrow="Outbound"
        title="Config number"
        subtitle="Set the phone number used for outbound calls from your organization"
        icon={<PhoneGradientIcon gradientId="manage-phone-grad" />}
      >
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
                <p>Loading outbound number…</p>
              </div>
            ) : !currentPhone ? (
              <div className="no-phone-state">
                <h3>Set outbound number</h3>
                <p>This number is stored as your organization&apos;s outbound caller ID.</p>

                <div className="form-group">
                  <label htmlFor="outbound-phone-input">Phone number</label>
                  <div className="phone-input-wrapper">
                    <span className="phone-prefix">📞</span>
                    <input
                      id="outbound-phone-input"
                      type="tel"
                      value={phoneInput}
                      onChange={e => setPhoneInput(formatPhoneInput(e.target.value))}
                      placeholder="+1 (555) 123-4567"
                      className="phone-input"
                      disabled={isSaving}
                    />
                  </div>
                  <span className="input-hint">Include country code (e.g. +1 for US)</span>
                </div>

                <div className="form-group">
                  <label htmlFor="outbound-label-input">Label (optional)</label>
                  <input
                    id="outbound-label-input"
                    type="text"
                    value={labelInput}
                    onChange={e => setLabelInput(e.target.value)}
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
                  {isSaving ? 'Saving…' : 'Save outbound number'}
                </button>
              </div>
            ) : (
              <div className="phone-display">
                <div className="phone-section">
                  <label className="section-label">Outbound number</label>
                  <div className="phone-card-display">
                    <div className="phone-display-content">
                      <span className="phone-display-number">
                        {formatPhoneForDisplay(currentPhone.phone_number) || currentPhone.phone_number}
                      </span>
                      {currentPhone.label && (
                        <span className="phone-display-label">{currentPhone.label}</span>
                      )}
                      <span className="phone-display-direction">
                        Direction: <span className="direction-badge outbound">Outbound</span>
                      </span>
                    </div>
                    <div className="phone-display-meta">
                      <span className="configured-badge">✓ Configured</span>
                    </div>
                  </div>
                </div>

                <div className="divider" />
                <div className="edit-section">
                  <label className="section-label">Update outbound number</label>

                  <div className="form-group">
                    <label htmlFor="outbound-phone-edit">Phone number</label>
                    <div className="phone-input-wrapper">
                      <span className="phone-prefix">📞</span>
                      <input
                        id="outbound-phone-edit"
                        type="tel"
                        value={phoneInput}
                        onChange={e => setPhoneInput(formatPhoneInput(e.target.value))}
                        placeholder="+1 (555) 123-4567"
                        className="phone-input"
                        disabled={isSaving}
                      />
                    </div>
                    <span className="input-hint">Include country code (e.g. +1 for US)</span>
                  </div>

                  <div className="form-group">
                    <label htmlFor="outbound-label-edit">Label (optional)</label>
                    <input
                      id="outbound-label-edit"
                      type="text"
                      value={labelInput}
                      onChange={e => setLabelInput(e.target.value)}
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
                    {isSaving ? 'Updating…' : 'Update outbound number'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="manage-phone-info">
            <h4>Information</h4>
            <ul>
              <li>This page only configures your outbound number (direction is always outbound).</li>
              <li>Inbound numbers are configured under Inbound → Config Number.</li>
              <li>Include the country code (e.g. +1 for US).</li>
            </ul>
          </div>
        </div>
      </PageLayout>

      {showConfirmDialog && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog">
            <div className="dialog-header">
              <h3>{confirmAction === 'add' ? 'Confirm outbound number' : 'Confirm update'}</h3>
            </div>
            <div className="dialog-content">
              <p>You are about to {confirmAction === 'add' ? 'save' : 'update'}:</p>
              <div className="phone-preview">
                <span className="preview-number">
                  {formatPhoneForDisplay(phoneInput) || phoneInput}
                </span>
                {labelInput && <span className="preview-label">{labelInput}</span>}
                <span className="preview-direction">Outbound</span>
              </div>
              <p className="confirm-warning">
                {confirmAction === 'add'
                  ? 'This number will be used as your organization outbound caller ID.'
                  : 'This replaces the current outbound number. Existing calls may be affected.'}
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
