import { useState } from 'react';
import type { Call } from '../../services/supabase/calls';
import {
  countToolsCalled,
  END_REASON_STYLES,
  formatCallDate,
  formatCallDuration,
  formatCallPhone,
} from './callFormatters';
import { CallDetailsModals } from './CallDetailsModals';

interface CallCardProps {
  call: Call;
}

export function CallCard({ call }: CallCardProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRecording, setShowRecording] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  const endReason = call.end_reason ? END_REASON_STYLES[call.end_reason] : null;
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
          <span className="call-date">{formatCallDate(call.created_at)}</span>
          <div className="call-badges">
            {endReason && (
              <span className={`call-badge ${endReason.className}`}>{endReason.label}</span>
            )}
            <span className="call-badge badge-neutral">
              {formatCallDuration(call.created_at, call.ended_at)}
            </span>
          </div>
        </div>

        <div className="call-card-body">
          <div className="call-info">
            <div className="call-phone">
              <span className="call-phone-label">Caller</span>
              <span className="call-phone-number">{formatCallPhone(call.caller_number)}</span>
            </div>

            <div className="call-tools">
              <span className="call-tools-label">Tools Used</span>
              <div className="call-tools-list">
                {call.tools_called?.length > 0 ? (
                  (() => {
                    const toolCounts = countToolsCalled(call.tools_called);
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
                            data-tooltip={entries
                              .map(([n, c]) => `${n.replace(/_/g, ' ')}${c > 1 ? ` ${c}x` : ''}`)
                              .join('\n')}
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
                  type="button"
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
            {call.call_transferred && <span className="call-badge badge-info">Transferred</span>}
            {call.call_analysis && (
              <button
                type="button"
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
                type="button"
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

      <CallDetailsModals
        call={call}
        showTranscript={showTranscript}
        onCloseTranscript={() => setShowTranscript(false)}
        showRecording={showRecording}
        onCloseRecording={() => setShowRecording(false)}
        showAnalysis={showAnalysis}
        onCloseAnalysis={() => setShowAnalysis(false)}
        copied={copied}
        onCopyTranscript={handleCopy}
      />
    </>
  );
}
