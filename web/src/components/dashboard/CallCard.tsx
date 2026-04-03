import { useState } from 'react';
import type { Call, CallAnalysis } from '../../services/supabase/calls';
import { Modal } from './Modal';

interface CallCardProps {
  call: Call;
}

const endReasonStyles: Record<string, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'badge-success' },
  abrupt: { label: 'Abrupt', className: 'badge-warning' },
  voicemail: { label: 'Voicemail', className: 'badge-info' },
};

function formatDuration(startDate: string, endDate: string | null): string {
  if (!endDate) return 'In progress';
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPhone(phone: string): string {
  if (!phone) return 'Unknown';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

function countTools(tools: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  tools.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
  return counts;
}

export function CallCard({ call }: CallCardProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRecording, setShowRecording] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  const endReason = call.end_reason ? endReasonStyles[call.end_reason] : null;
  const cost = call.analytics?.total_cost_usd ? call.analytics.total_cost_usd.toFixed(4) : null;

  const handleCopy = async () => {
    if (call.transcription) {
      await navigator.clipboard.writeText(call.transcription);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <article className="call-card">
        <div className="call-card-header">
          <span className="call-date">{formatDate(call.created_at)}</span>
          <div className="call-badges">
            {endReason && (
              <span className={`call-badge ${endReason.className}`}>
                {endReason.label}
              </span>
            )}
            <span className="call-badge badge-neutral">
              {formatDuration(call.created_at, call.ended_at)}
            </span>
          </div>
        </div>

        <div className="call-card-body">
          <div className="call-info">
            <div className="call-phone">
              <span className="call-phone-label">Caller</span>
              <span className="call-phone-number">{formatPhone(call.caller_number)}</span>
            </div>

            <div className="call-tools">
              <span className="call-tools-label">Tools Used</span>
              <div className="call-tools-list">
                {call.tools_called?.length > 0 ? (
                  (() => {
                    const toolCounts = countTools(call.tools_called);
                    const entries = Array.from(toolCounts.entries());
                    return (
                      <>
                        {entries.slice(0, 3).map(([name, count], idx) => (
                          <span key={idx} className="call-tool">
                            {name.replace(/_/g, ' ')}
                            {count > 1 && <span className="call-tool-count">{count}x</span>}
                          </span>
                        ))}
                        {entries.length > 3 && (
                          <span
                            className="call-tools-more"
                            data-tooltip={entries.map(([n, c]) => `${n.replace(/_/g, ' ')}${c > 1 ? ` ${c}x` : ''}`).join('\n')}
                          >
                            +{entries.length - 3} more
                          </span>
                        )}
                      </>
                    );
                  })()
                ) : (
                  <span className="call-tools-empty">None</span>
                )}
              </div>
            </div>
          </div>

          <div className="call-transcript">
            <div className="call-transcript-header">
              <span className="call-transcript-label">Transcript</span>
              {call.transcription && (
                <button
                  className="call-transcript-expand"
                  onClick={() => setShowTranscript(true)}
                >
                  Expand
                </button>
              )}
            </div>
            <p className="call-transcript-text">
              {call.transcription || 'No transcript available'}
            </p>
          </div>
        </div>

        <div className="call-card-footer">
          <div
            className="call-cost-container"
            onMouseEnter={() => setShowCostBreakdown(true)}
            onMouseLeave={() => setShowCostBreakdown(false)}
          >
            <span className="call-cost">{cost ? `$${cost}` : '—'}</span>
            {showCostBreakdown && call.analytics && (
              <div className="call-cost-breakdown">
                {call.analytics.llm && (
                  <div className="cost-item">
                    <span>LLM:</span>
                    <span>${call.analytics.llm.cost_usd.toFixed(4)}</span>
                  </div>
                )}
                {call.analytics.tts && (
                  <div className="cost-item">
                    <span>TTS:</span>
                    <span>${call.analytics.tts.cost_usd.toFixed(4)}</span>
                  </div>
                )}
                {call.analytics.stt && (
                  <div className="cost-item">
                    <span>STT:</span>
                    <span>${call.analytics.stt.cost_usd.toFixed(4)}</span>
                  </div>
                )}
                {call.analytics.daily && (
                  <div className="cost-item">
                    <span>Daily:</span>
                    <span>${call.analytics.daily.total_cost_usd.toFixed(4)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="call-footer-actions">
            {call.call_transferred && (
              <span className="call-badge badge-info">Transferred</span>
            )}
            {call.call_analysis && (
              <button
                onClick={() => setShowAnalysis(true)}
                className="call-analysis-link"
                title="View call analysis"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                  <path d="M3 21v-5h5" />
                </svg>
                Analysis
              </button>
            )}
            {call.recording_url && (
              <button
                onClick={() => setShowRecording(true)}
                className="call-recording-link"
                title="Play recording"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Recording
              </button>
            )}
          </div>
        </div>
      </article>

      <Modal
        isOpen={showTranscript}
        onClose={() => setShowTranscript(false)}
        title="Call Transcript"
      >
        <div className="transcript-modal">
          <div className="transcript-modal-actions">
            <button className="transcript-copy-btn" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="transcript-modal-content">{call.transcription}</pre>
        </div>
      </Modal>

      <Modal
        isOpen={showRecording}
        onClose={() => setShowRecording(false)}
        title="Call Recording"
      >
        <div className="recording-modal">
          <audio controls className="recording-player">
            <source src={call.recording_url} type="audio/wav" />
            Your browser does not support the audio element.
          </audio>
        </div>
      </Modal>

      <Modal
        isOpen={showAnalysis}
        onClose={() => setShowAnalysis(false)}
        title="Call Analysis"
      >
        <div className="analysis-modal">
          {call.call_analysis ? (
            <div className="analysis-content">

              {/* ── Status row: key boolean/categorical metrics ── */}
              {(call.call_analysis.interest_level || call.call_analysis.qualified_lead !== undefined || call.call_analysis.want_demo || call.call_analysis.demo_booked || call.call_analysis.company_size_category) && (
                <div className="analysis-status-grid">
                  {call.call_analysis.interest_level && (
                    <div className="status-card">
                      <span className="status-card-label">Interest</span>
                      <span className={`analysis-badge interest-${call.call_analysis.interest_level}`}>
                        {call.call_analysis.interest_level.charAt(0).toUpperCase() + call.call_analysis.interest_level.slice(1)}
                      </span>
                    </div>
                  )}
                  {call.call_analysis.qualified_lead !== undefined && (
                    <div className="status-card">
                      <span className="status-card-label">Qualified</span>
                      <span className={`analysis-badge ${call.call_analysis.qualified_lead ? 'badge-success' : 'badge-warning'}`}>
                        {call.call_analysis.qualified_lead ? 'Yes' : 'No'}
                      </span>
                    </div>
                  )}
                  {call.call_analysis.want_demo !== undefined && (
                    <div className="status-card">
                      <span className="status-card-label">Demo Interest</span>
                      <span className={`analysis-badge ${call.call_analysis.want_demo ? 'badge-success' : 'badge-neutral-dim'}`}>
                        {call.call_analysis.want_demo ? 'Yes' : 'No'}
                      </span>
                    </div>
                  )}
                  {call.call_analysis.demo_booked !== undefined && (
                    <div className="status-card">
                      <span className="status-card-label">Demo Booked</span>
                      <span className={`analysis-badge ${call.call_analysis.demo_booked ? 'badge-success' : 'badge-neutral-dim'}`}>
                        {call.call_analysis.demo_booked ? 'Yes' : 'No'}
                      </span>
                    </div>
                  )}
                  {call.call_analysis.company_size_category && (
                    <div className="status-card">
                      <span className="status-card-label">Company Size</span>
                      <span className="analysis-badge badge-neutral-dim">
                        {call.call_analysis.company_size_category.charAt(0).toUpperCase() + call.call_analysis.company_size_category.slice(1)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Score metrics ── */}
              {(call.call_analysis.call_sentiment !== undefined || call.call_analysis.pitch_delivery_score !== undefined || call.call_analysis.customer_satisfaction_estimate !== undefined) && (
                <div className="analysis-scores-grid">
                  {call.call_analysis.call_sentiment !== undefined && (
                    <div className="score-card">
                      <span className="score-card-label">Sentiment</span>
                      <span className="score-card-value">{call.call_analysis.call_sentiment}</span>
                      <div className="analysis-score-bar">
                        <div className="score-fill" style={{ width: `${call.call_analysis.call_sentiment}%` }} />
                      </div>
                      <span className="score-card-sub">out of 100</span>
                    </div>
                  )}
                  {call.call_analysis.pitch_delivery_score !== undefined && (
                    <div className="score-card">
                      <span className="score-card-label">Pitch Delivery</span>
                      <span className="score-card-value">{call.call_analysis.pitch_delivery_score}</span>
                      <div className="analysis-score-bar">
                        <div className="score-fill" style={{ width: `${call.call_analysis.pitch_delivery_score}%` }} />
                      </div>
                      <span className="score-card-sub">out of 100</span>
                    </div>
                  )}
                  {call.call_analysis.customer_satisfaction_estimate !== undefined && (
                    <div className="score-card">
                      <span className="score-card-label">Satisfaction</span>
                      <span className="score-card-value">{call.call_analysis.customer_satisfaction_estimate}</span>
                      <div className="analysis-score-bar">
                        <div className="score-fill" style={{ width: `${call.call_analysis.customer_satisfaction_estimate}%` }} />
                      </div>
                      <span className="score-card-sub">out of 100</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Pain points ── */}
              {call.call_analysis.pain_points_mentioned && call.call_analysis.pain_points_mentioned.length > 0 && (
                <div className="analysis-section">
                  <label className="analysis-label">Pain Points Mentioned</label>
                  <div className="analysis-tag-list">
                    {call.call_analysis.pain_points_mentioned.map((point, idx) => (
                      <span key={idx} className="analysis-tag">{point}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Objections ── */}
              {call.call_analysis.objections && call.call_analysis.objections.length > 0 && (
                <div className="analysis-section">
                  <label className="analysis-label">Objections</label>
                  <div className="analysis-list">
                    {call.call_analysis.objections.map((obj, idx) => (
                      <div key={idx} className="analysis-objection">
                        <div className="objection-header">
                          <span className="objection-type">{obj.type}</span>
                          <span className={`objection-handled ${obj.handled ? 'handled' : 'unhandled'}`}>
                            {obj.handled ? '✓ Handled' : '✗ Unhandled'}
                          </span>
                        </div>
                        {obj.quote && <p className="objection-quote">"{obj.quote}"</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Extracted info ── */}
              {call.call_analysis.extracted_info && (
                <div className="analysis-section">
                  <label className="analysis-label">Extracted Info</label>
                  <div className="analysis-info-grid">
                    {call.call_analysis.extracted_info.decision_maker !== undefined && (
                      <div className="info-item">
                        <span className="info-key">Decision Maker</span>
                        <span className="info-value">{call.call_analysis.extracted_info.decision_maker ? 'Yes' : 'No'}</span>
                      </div>
                    )}
                    {call.call_analysis.extracted_info.current_provider && (
                      <div className="info-item">
                        <span className="info-key">Current Provider</span>
                        <span className="info-value">{call.call_analysis.extracted_info.current_provider}</span>
                      </div>
                    )}
                    {call.call_analysis.extracted_info.monthly_inquiries && (
                      <div className="info-item">
                        <span className="info-key">Monthly Inquiries</span>
                        <span className="info-value">{call.call_analysis.extracted_info.monthly_inquiries.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <p className="analysis-empty">No analysis available for this call.</p>
          )}
        </div>
      </Modal>
    </>
  );
}
