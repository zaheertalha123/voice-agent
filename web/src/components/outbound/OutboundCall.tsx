import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getPhoneNumbersByOrg } from '@/services/supabase/phoneNumbers';
import { supabase } from '@/services/supabase/client';
import {
  formatPhoneInput,
  formatPhoneForDisplay,
  validatePhoneNumber,
} from '@/utils/phoneValidation';
import { PageLayout } from '@/components/layout/PageLayout';
import { PhoneGradientIcon } from '@/components/icons/PhoneGradientIcon';
import './OutboundCall.css';

interface CallState {
  status: 'idle' | 'calling' | 'connected' | 'error';
  message?: string;
  callId?: string;
}

interface PhoneNumber {
  id: string;
  phone_number: string;
  org_id: string;
  label: string | null;
  direction: 'inbound' | 'outbound';
  created_at: string;
}

interface PoolStats {
  rooms: {
    available: number;
    total: number;
    health: number;
  };
}

export function OutboundCall() {
  const { organization, isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callState, setCallState] = useState<CallState>({ status: 'idle' });
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string>('');
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolError, setPoolError] = useState<{ type: 'error'; text: string } | null>(null);
  const [webhookOnline, setWebhookOnline] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Fetch phone numbers for the organization
  useEffect(() => {
    if (organization?.org_id) {
      getPhoneNumbersByOrg(organization.org_id).then(result => {
        if (result.data) {
          setPhoneNumbers(result.data);
          const outboundPhone =
            result.data.find(p => p.direction === 'outbound') ??
            result.data.find(p => p.label?.toLowerCase().includes('outbound'));
          const pickRaw = outboundPhone ?? result.data[0];
          if (pickRaw) {
            const v = validatePhoneNumber(pickRaw.phone_number);
            setSelectedPhoneNumber(v.isValid ? v.normalized : pickRaw.phone_number);
          }
        }
      });
    }
  }, [organization?.org_id]);

  // Auto-dismiss pool error after 5 seconds
  useEffect(() => {
    if (poolError) {
      const timer = setTimeout(() => setPoolError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [poolError]);

  // Fetch phone pool statistics from webhook server
  useEffect(() => {
    const fetchPoolStats = async () => {
      if (!isAuthenticated) return;

      setPoolLoading(true);
      setPoolError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token;

        if (!authToken) return;

        const webhookUrl = import.meta.env.VITE_WEBHOOK_SERVER_URL || 'http://localhost:8080';
        const response = await fetch(`${webhookUrl}/pool/stats`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setPoolStats(data.stats);
          setPoolError(null);
          setWebhookOnline(true);
        } else {
          throw new Error(`Server error: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to fetch pool stats:', error);
        setPoolError({
          type: 'error',
          text: '⚠️ Webhook server is offline. Unable to load phone pool statistics.',
        });
        setPoolStats(null);
        setWebhookOnline(false);
      } finally {
        setPoolLoading(false);
      }
    };

    fetchPoolStats();
    // Retry every 30 seconds to check if webhook comes back online
    const interval = setInterval(fetchPoolStats, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const phoneTargetValidation = validatePhoneNumber(phoneNumber);
  const selectedCallerLabel =
    phoneNumbers.find(
      p => p.phone_number === selectedPhoneNumber && p.direction === 'outbound',
    )?.label ?? phoneNumbers.find(p => p.phone_number === selectedPhoneNumber)?.label;
  const calleeDisplay = formatPhoneForDisplay(phoneNumber) || phoneNumber;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneNumber(formatPhoneInput(e.target.value));
  };

  const initiateCall = async (targetPhone: string = phoneNumber) => {
    const finalPhone = targetPhone || phoneNumber;
    const v = validatePhoneNumber(finalPhone);
    if (!v.isValid) {
      setCallState({
        status: 'error',
        message: v.error || 'Please enter a valid phone number',
      });
      return;
    }

    if (!selectedPhoneNumber) {
      setCallState({ status: 'error', message: 'No outbound phone number configured' });
      return;
    }

    // Prefer outbound row when the same E.164 exists for inbound + outbound
    const selectedPhoneObj =
      phoneNumbers.find(
        p => p.phone_number === selectedPhoneNumber && p.direction === 'outbound',
      ) ?? phoneNumbers.find(p => p.phone_number === selectedPhoneNumber);
    if (selectedPhoneObj && selectedPhoneObj.direction === 'inbound') {
      setCallState({
        status: 'error',
        message: 'The configured phone number is set for inbound calls only. Please configure an outbound number in Phone settings.'
      });
      return;
    }

    // Update phone number in state if calling with test number (same formatted UX as manual entry)
    if (targetPhone && targetPhone !== phoneNumber) {
      setPhoneNumber(formatPhoneInput(targetPhone));
    }

    setCallState({ status: 'calling', message: 'Initiating call...' });

    try {
      // Get the current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      if (!authToken) {
        setCallState({ status: 'error', message: 'Authentication failed. Please log in again.' });
        return;
      }

      const webhookUrl = import.meta.env.VITE_WEBHOOK_SERVER_URL || 'http://localhost:8080';
      const response = await fetch(`${webhookUrl}/outbound-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          phone_number: v.normalized,
          caller_phone: selectedPhoneNumber,
          org_id: organization?.org_id,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setCallState({
          status: 'connected',
          message: 'Call initiated successfully! The bot will connect shortly.',
          callId: data.call_id,
        });
      } else {
        setCallState({
          status: 'error',
          message: data.detail || data.error || 'Failed to initiate call',
        });
      }
    } catch (error) {
      setCallState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Network error - please try again',
      });
    }
  };

  const resetCall = () => {
    setCallState({ status: 'idle' });
    setPhoneNumber('');
  };

  const testCall = () => {
    // Call directly with test number without updating state first
    initiateCall('+18382218584');
  };

  if (authLoading) {
    return (
      <PageLayout
        className="outbound-call"
        variant="wide"
        eyebrow="Outbound"
        title="Outbound Call"
        subtitle="Connect someone with the AI voice agent"
        icon={<PhoneGradientIcon gradientId="outbound-phone-grad" />}
      >
        <div className="outbound-loading">
          <div className="loading-spinner" />
        </div>
      </PageLayout>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      {poolError && (
        <div className="toast-container toast-error">
          <span className="toast-content">{poolError.text}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => setPoolError(null)}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      <PageLayout
        className="outbound-call"
        variant="wide"
        eyebrow="Outbound"
        title="Outbound Call"
        subtitle="Connect someone with the AI voice agent"
        icon={<PhoneGradientIcon gradientId="outbound-phone-grad" />}
      >
        {!webhookOnline && (
          <div className="webhook-offline-banner">
            <div className="banner-content">
              <span className="banner-icon">⚠️</span>
              <div className="banner-text">
                <p className="banner-title">Webhook Server Offline</p>
                <p className="banner-message">Outbound calls cannot be placed at this time. The system will automatically reconnect when the server is back online.</p>
              </div>
            </div>
          </div>
        )}

        <div className="outbound-page-grid">
          <div className="outbound-page-aside">
            {organization && (
              <div className="phone-info-card">
                <div className="info-item">
                  <label>Organization:</label>
                  <span className="info-value">{organization.name}</span>
                </div>
                <div className="info-item">
                  <label>Calling From:</label>
                  <span className="info-value">
                    {formatPhoneForDisplay(selectedPhoneNumber) || selectedPhoneNumber}
                    {selectedCallerLabel ? (
                      <span className="info-label"> ({selectedCallerLabel})</span>
                    ) : null}
                  </span>
                </div>
              </div>
            )}

            {poolStats && (
              <div className="pool-stats-card">
                <div className="pool-stats-row">
                  <div className="pool-stat">
                    <span className="stat-label">Available Rooms</span>
                    <span className="stat-value">
                      {poolStats.rooms.available}/{poolStats.rooms.total}
                    </span>
                  </div>
                  <div className="pool-stat health">
                    <span className="stat-label">Pool Health</span>
                    <div className="health-display">
                      <div className="health-bar">
                        <div
                          className="health-fill"
                          style={{
                            width: `${poolStats.rooms.health}%`,
                            backgroundColor:
                              poolStats.rooms.health >= 75
                                ? '#22c55e'
                                : poolStats.rooms.health >= 50
                                  ? '#eab308'
                                  : '#ef4444',
                          }}
                        />
                      </div>
                      <span className="health-percent">{poolStats.rooms.health}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {poolLoading && (
              <div className="pool-stats-card loading">
                <div className="loading-spinner small" />
                <p>Loading phone pool stats...</p>
              </div>
            )}
          </div>

          <div className="outbound-page-main">
        <div className="outbound-call-card">
          {callState.status === 'idle' && (
            <>
              <div className="input-group">
                <label htmlFor="phone-input">Phone Number to Call</label>
                <div className="phone-input-wrapper">
                  <span className="phone-prefix">📞</span>
                  <input
                    id="phone-input"
                    type="tel"
                    value={phoneNumber}
                    onChange={handlePhoneChange}
                    placeholder="+1 (555) 123-4567"
                    className="phone-input"
                    autoComplete="tel"
                  />
                </div>
                <span className="input-hint">Enter the phone number with country code (e.g., +1 for US)</span>
              </div>

              <div className="button-group">
                <button
                  className="call-button"
                  onClick={() => initiateCall()}
                  disabled={!phoneTargetValidation.isValid || !webhookOnline}
                  title={!webhookOnline ? 'Webhook server is offline' : undefined}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Start Call
                </button>

                <button
                  className="test-button"
                  onClick={testCall}
                  disabled={!webhookOnline}
                  title={!webhookOnline ? 'Webhook server is offline' : 'Test call to +18382218584'}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                    <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Test Call
                </button>
              </div>
            </>
          )}

          {callState.status === 'calling' && (
            <div className="call-status calling">
              <div className="calling-animation">
                <div className="pulse-ring"></div>
                <div className="pulse-ring delay-1"></div>
                <div className="pulse-ring delay-2"></div>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3>Calling {calleeDisplay}</h3>
              <p>{callState.message}</p>
            </div>
          )}

          {callState.status === 'connected' && (
            <div className="call-status connected">
              <div className="success-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2"/>
                  <path d="M8 12l2.5 2.5L16 9" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3>Call Initiated!</h3>
              <p>{callState.message}</p>
              <div className="call-details">
                <span className="detail-label">Calling:</span>
                <span className="detail-value">{calleeDisplay}</span>
              </div>
              <div className="call-details">
                <span className="detail-label">From:</span>
                <span className="detail-value">
                  {formatPhoneForDisplay(selectedPhoneNumber) || selectedPhoneNumber}
                </span>
              </div>
              <button className="new-call-button" onClick={resetCall}>
                Make Another Call
              </button>
            </div>
          )}

          {callState.status === 'error' && (
            <div className="call-status error">
              <div className="error-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/>
                  <path d="M15 9l-6 6M9 9l6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <h3>Call Failed</h3>
              <p>{callState.message}</p>
              <button className="retry-button" onClick={resetCall}>
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="outbound-call-info">
          <h4>How it works</h4>
          <ol>
            <li>Enter the phone number you want to call</li>
            <li>Click "Start Call" to initiate the outbound call</li>
            <li>The AI voice agent will connect and handle the conversation</li>
            <li>Use "Test Call" to test with the configured test number</li>
          </ol>
        </div>
          </div>
        </div>
      </PageLayout>
    </>
  );
}
