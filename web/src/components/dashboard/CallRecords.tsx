import { useEffect, useState } from 'react';
import type { Call } from '@/services/supabase/calls';
import { getCalls } from '@/services/supabase/calls';
import { PageLayout } from '@/components/layout/PageLayout';
import {
  END_REASON_STYLES,
  formatCallDateTime,
  formatCallPhone,
} from './callFormatters';
import { CallRecordCostCell } from './CallRecordCostCell';
import { CallDetailsModals } from './CallDetailsModals';
import './Dashboard.css';
import './CallRecords.css';

const CALL_LIMIT = 100;

function CallDirectionIcon({ direction }: { direction: 'inbound' | 'outbound' }) {
  const label = direction === 'inbound' ? 'Inbound call' : 'Outbound call';
  const className =
    direction === 'inbound'
      ? 'call-records__dir-icon call-records__dir-icon--inbound'
      : 'call-records__dir-icon call-records__dir-icon--outbound';
  return (
    <span className={className} title={label} aria-label={label}>
      {direction === 'inbound' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M19 5L5 19M5 19v-5M5 19h5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 19L19 5M19 5h-5M19 5v5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

function CallRecordActions({
  call,
  variant,
}: {
  call: Call;
  variant: 'table' | 'card';
}) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const handleCopy = async () => {
    if (call.transcription) {
      await navigator.clipboard.writeText(call.transcription);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const btnClass = variant === 'table' ? 'call-records__action' : 'call-records__action call-records__action--card';

  return (
    <>
      <div className={variant === 'table' ? 'call-records__actions' : 'call-records__card-actions'}>
        <button
          type="button"
          className={btnClass}
          onClick={() => setShowTranscript(true)}
        >
          Transcript
        </button>
        <button type="button" className={btnClass} onClick={() => setShowTools(true)}>
          Tools
        </button>
        <button
          type="button"
          className={btnClass}
          onClick={() => setShowAnalysis(true)}
          disabled={!call.call_analysis}
          title={!call.call_analysis ? 'No analysis for this call' : 'View call analysis'}
        >
          Analysis
        </button>
      </div>

      <CallDetailsModals
        call={call}
        showTranscript={showTranscript}
        onCloseTranscript={() => setShowTranscript(false)}
        showRecording={false}
        onCloseRecording={() => {}}
        showAnalysis={showAnalysis}
        onCloseAnalysis={() => setShowAnalysis(false)}
        copied={copied}
        onCopyTranscript={handleCopy}
        showTools={showTools}
        onCloseTools={() => setShowTools(false)}
        hideRecordingModal
      />
    </>
  );
}

function CallRecordsTableRow({ call }: { call: Call }) {
  const endReason = call.end_reason ? END_REASON_STYLES[call.end_reason] : null;

  return (
    <tr className="call-records__row">
      <td className="call-records__td call-records__td--datetime">
        <span className="call-records__mono">{formatCallDateTime(call.created_at)}</span>
      </td>
      <td className="call-records__td">
        <span className="call-records__phone-cell">
          <CallDirectionIcon direction={call.call_direction} />
          <span className="call-records__phone" title={call.caller_number}>
            {formatCallPhone(call.caller_number)}
          </span>
        </span>
      </td>
      <td className="call-records__td call-records__td--status">
        {endReason ? (
          <span className={`call-badge ${endReason.className}`}>{endReason.label}</span>
        ) : (
          <span className="call-records__muted">—</span>
        )}
        {call.call_transferred && (
          <span className="call-badge badge-info call-records__xfer">Transferred</span>
        )}
      </td>
      <td className="call-records__td call-records__td--audio">
        {call.recording_url ? (
          <audio
            className="call-records__audio"
            controls
            preload="metadata"
            src={call.recording_url}
          />
        ) : (
          <span className="call-records__muted">—</span>
        )}
      </td>
      <td className="call-records__td call-records__td--cost">
        <CallRecordCostCell call={call} variant="table" />
      </td>
      <td className="call-records__td call-records__td--actions">
        <CallRecordActions call={call} variant="table" />
      </td>
    </tr>
  );
}

function CallRecordsMobileCard({ call }: { call: Call }) {
  const endReason = call.end_reason ? END_REASON_STYLES[call.end_reason] : null;

  return (
    <article className="call-records__card">
      <div className="call-records__card-datetime call-records__mono">{formatCallDateTime(call.created_at)}</div>

      <div className="call-records__card-row call-records__card-row--phone">
        <span className="call-records__card-label">Phone</span>
        <span className="call-records__phone-cell">
          <CallDirectionIcon direction={call.call_direction} />
          <span className="call-records__phone" title={call.caller_number}>
            {formatCallPhone(call.caller_number)}
          </span>
        </span>
      </div>

      <div className="call-records__card-row">
        <span className="call-records__card-label">Status</span>
        <span className="call-records__card-status">
          {endReason ? (
            <span className={`call-badge ${endReason.className}`}>{endReason.label}</span>
          ) : (
            <span className="call-records__muted">—</span>
          )}
          {call.call_transferred && (
            <span className="call-badge badge-info call-records__xfer">Transferred</span>
          )}
        </span>
      </div>

      <div className="call-records__card-audio-block">
        <span className="call-records__card-label">Recording</span>
        {call.recording_url ? (
          <audio className="call-records__audio call-records__audio--card" controls preload="metadata" src={call.recording_url} />
        ) : (
          <span className="call-records__muted">—</span>
        )}
      </div>

      <div className="call-records__card-row call-records__card-row--cost">
        <span className="call-records__card-label">Cost</span>
        <CallRecordCostCell call={call} variant="card" />
      </div>

      <CallRecordActions call={call} variant="card" />
    </article>
  );
}

export function CallRecords() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      const { data, error: err } = await getCalls(CALL_LIMIT);
      if (cancelled) return;
      if (err) setError(err);
      else setCalls(data || []);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shellProps = {
    className: 'call-records',
    variant: 'wide' as const,
    eyebrow: 'History',
    title: 'Call records',
    subtitle: 'Browse calls — use Transcript, Tools, and Analysis for details',
  };

  if (isLoading) {
    return (
      <PageLayout {...shellProps}>
        <div className="dashboard-loading">
          <div className="dashboard-loading-spinner" />
          <p>Loading call records…</p>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout {...shellProps}>
        <div className="call-records__message call-records__message--error">
          <p>{error}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout {...shellProps} contentFill>
      <div className="call-records__layout">
        <div className="call-records__toolbar">
          <span className="call-records__toolbar-sub">Newest first</span>
          <span className="call-records__toolbar-meta">{calls.length} shown</span>
        </div>

        <div className="call-records__scroll">
          {calls.length === 0 ? (
            <div className="call-records__empty">
              <p>No calls recorded yet</p>
            </div>
          ) : (
            <>
              <div className="call-records__desktop">
                <div className="call-records__table-wrap">
                  <table className="call-records__table">
                    <thead>
                      <tr>
                        <th scope="col">Date &amp; time</th>
                        <th scope="col">Phone number</th>
                        <th scope="col">Status</th>
                        <th scope="col">Recording</th>
                        <th scope="col">Cost</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calls.map(call => (
                        <CallRecordsTableRow key={call.id} call={call} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="call-records__mobile">
                <div className="call-records__card-list">
                  {calls.map(call => (
                    <CallRecordsMobileCard key={call.id} call={call} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
