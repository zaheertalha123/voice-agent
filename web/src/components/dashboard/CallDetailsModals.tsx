import type { Call } from '@/services/supabase/calls';
import { countToolsCalled } from './callFormatters';
import { Modal } from './Modal';

interface CallDetailsModalsProps {
  call: Call;
  showTranscript: boolean;
  onCloseTranscript: () => void;
  showRecording: boolean;
  onCloseRecording: () => void;
  showAnalysis: boolean;
  onCloseAnalysis: () => void;
  copied: boolean;
  onCopyTranscript: () => void;
  /** When set, Tools modal is available (Call Records). Omit on Call Card. */
  showTools?: boolean;
  onCloseTools?: () => void;
  /** Hide recording modal (Call Records uses inline audio instead). */
  hideRecordingModal?: boolean;
}

export function CallDetailsModals({
  call,
  showTranscript,
  onCloseTranscript,
  showRecording,
  onCloseRecording,
  showAnalysis,
  onCloseAnalysis,
  copied,
  onCopyTranscript,
  showTools = false,
  onCloseTools = () => {},
  hideRecordingModal = false,
}: CallDetailsModalsProps) {
  const toolEntries = Array.from(countToolsCalled(call.tools_called || []).entries());

  return (
    <>
      <Modal isOpen={showTranscript} onClose={onCloseTranscript} title="Call Transcript">
        <div className="transcript-modal">
          <div className="transcript-modal-actions">
            <button
              type="button"
              className="transcript-copy-btn"
              onClick={onCopyTranscript}
              disabled={!call.transcription}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="transcript-modal-content">
            {call.transcription ?? 'No transcript available for this call.'}
          </pre>
        </div>
      </Modal>

      <Modal isOpen={showTools} onClose={onCloseTools} title="Tools used on this call">
        <div className="call-tools-modal">
          {toolEntries.length === 0 ? (
            <p className="call-tools-modal-empty">No tools were called on this call.</p>
          ) : (
            <ul className="call-tools-modal-list">
              {toolEntries.map(([name, count]) => (
                <li key={name} className="call-tools-modal-item">
                  <span className="call-tools-modal-name">{name.replace(/_/g, ' ')}</span>
                  <span className="call-tools-modal-count" title={`Called ${count} time${count === 1 ? '' : 's'}`}>
                    {count}×
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {!hideRecordingModal && (
        <Modal isOpen={showRecording} onClose={onCloseRecording} title="Call Recording">
          <div className="recording-modal">
            <audio controls className="recording-player">
              <source src={call.recording_url ?? undefined} type="audio/wav" />
              Your browser does not support the audio element.
            </audio>
          </div>
        </Modal>
      )}

      <Modal isOpen={showAnalysis} onClose={onCloseAnalysis} title="Call Analysis">
        <div className="analysis-modal">
          {call.call_analysis ? (
            <div className="analysis-content">
              {(call.call_analysis.interest_level ||
                call.call_analysis.qualified_lead !== undefined ||
                call.call_analysis.want_demo ||
                call.call_analysis.demo_booked ||
                call.call_analysis.company_size_category) && (
                <div className="analysis-status-grid">
                  {call.call_analysis.interest_level && (
                    <div className="status-card">
                      <span className="status-card-label">Interest</span>
                      <span className={`analysis-badge interest-${call.call_analysis.interest_level}`}>
                        {call.call_analysis.interest_level.charAt(0).toUpperCase() +
                          call.call_analysis.interest_level.slice(1)}
                      </span>
                    </div>
                  )}
                  {call.call_analysis.qualified_lead !== undefined && (
                    <div className="status-card">
                      <span className="status-card-label">Qualified</span>
                      <span
                        className={`analysis-badge ${call.call_analysis.qualified_lead ? 'badge-success' : 'badge-warning'}`}
                      >
                        {call.call_analysis.qualified_lead ? 'Yes' : 'No'}
                      </span>
                    </div>
                  )}
                  {call.call_analysis.want_demo !== undefined && (
                    <div className="status-card">
                      <span className="status-card-label">Demo Interest</span>
                      <span
                        className={`analysis-badge ${call.call_analysis.want_demo ? 'badge-success' : 'badge-neutral-dim'}`}
                      >
                        {call.call_analysis.want_demo ? 'Yes' : 'No'}
                      </span>
                    </div>
                  )}
                  {call.call_analysis.demo_booked !== undefined && (
                    <div className="status-card">
                      <span className="status-card-label">Demo Booked</span>
                      <span
                        className={`analysis-badge ${call.call_analysis.demo_booked ? 'badge-success' : 'badge-neutral-dim'}`}
                      >
                        {call.call_analysis.demo_booked ? 'Yes' : 'No'}
                      </span>
                    </div>
                  )}
                  {call.call_analysis.company_size_category && (
                    <div className="status-card">
                      <span className="status-card-label">Company Size</span>
                      <span className="analysis-badge badge-neutral-dim">
                        {call.call_analysis.company_size_category.charAt(0).toUpperCase() +
                          call.call_analysis.company_size_category.slice(1)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {(call.call_analysis.call_sentiment !== undefined ||
                call.call_analysis.pitch_delivery_score !== undefined ||
                call.call_analysis.customer_satisfaction_estimate !== undefined) && (
                <div className="analysis-scores-grid">
                  {call.call_analysis.call_sentiment !== undefined && (
                    <div className="score-card">
                      <span className="score-card-label">Sentiment</span>
                      <span className="score-card-value">{call.call_analysis.call_sentiment}</span>
                      <div className="analysis-score-bar">
                        <div
                          className="score-fill"
                          style={{ width: `${call.call_analysis.call_sentiment}%` }}
                        />
                      </div>
                      <span className="score-card-sub">out of 100</span>
                    </div>
                  )}
                  {call.call_analysis.pitch_delivery_score !== undefined && (
                    <div className="score-card">
                      <span className="score-card-label">Pitch Delivery</span>
                      <span className="score-card-value">{call.call_analysis.pitch_delivery_score}</span>
                      <div className="analysis-score-bar">
                        <div
                          className="score-fill"
                          style={{ width: `${call.call_analysis.pitch_delivery_score}%` }}
                        />
                      </div>
                      <span className="score-card-sub">out of 100</span>
                    </div>
                  )}
                  {call.call_analysis.customer_satisfaction_estimate !== undefined && (
                    <div className="score-card">
                      <span className="score-card-label">Satisfaction</span>
                      <span className="score-card-value">
                        {call.call_analysis.customer_satisfaction_estimate}
                      </span>
                      <div className="analysis-score-bar">
                        <div
                          className="score-fill"
                          style={{ width: `${call.call_analysis.customer_satisfaction_estimate}%` }}
                        />
                      </div>
                      <span className="score-card-sub">out of 100</span>
                    </div>
                  )}
                </div>
              )}

              {call.call_analysis.pain_points_mentioned && call.call_analysis.pain_points_mentioned.length > 0 && (
                <div className="analysis-section">
                  <label className="analysis-label">Pain Points Mentioned</label>
                  <div className="analysis-tag-list">
                    {call.call_analysis.pain_points_mentioned.map((point, idx) => (
                      <span key={idx} className="analysis-tag">
                        {point}
                      </span>
                    ))}
                  </div>
                </div>
              )}

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

              {call.call_analysis.extracted_info && (
                <div className="analysis-section">
                  <label className="analysis-label">Extracted Info</label>
                  <div className="analysis-info-grid">
                    {call.call_analysis.extracted_info.decision_maker !== undefined && (
                      <div className="info-item">
                        <span className="info-key">Decision Maker</span>
                        <span className="info-value">
                          {call.call_analysis.extracted_info.decision_maker ? 'Yes' : 'No'}
                        </span>
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
                        <span className="info-value">
                          {call.call_analysis.extracted_info.monthly_inquiries.toLocaleString()}
                        </span>
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
