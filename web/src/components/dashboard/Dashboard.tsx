import { useEffect, useState } from 'react';
import { MetricCard } from './MetricCard';
import { CallCard } from './CallCard';
import { getCalls, getCallsAnalytics } from '../../services/supabase/calls';
import type { Call, CallsAnalytics } from '../../services/supabase/calls';
import { PageLayout, PageSection } from '@/components/layout/PageLayout';
import './Dashboard.css';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function Dashboard() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [analytics, setAnalytics] = useState<CallsAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);

      const [callsResult, analyticsResult] = await Promise.all([
        getCalls(50),
        getCallsAnalytics(),
      ]);

      if (callsResult.error) {
        setError(callsResult.error);
      } else {
        setCalls(callsResult.data || []);
      }

      if (analyticsResult.data) {
        setAnalytics(analyticsResult.data);
      }

      setIsLoading(false);
    }

    fetchData();
  }, []);

  const shellProps = {
    className: 'dashboard',
    variant: 'wide' as const,
    eyebrow: 'Overview',
    title: 'Call Analytics',
    subtitle: 'Monitor voice agent performance and call outcomes',
  };

  if (isLoading) {
    return (
      <PageLayout {...shellProps}>
        <div className="dashboard-loading">
          <div className="dashboard-loading-spinner" />
          <p>Loading analytics...</p>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout {...shellProps}>
        <PageSection title="Could not load data">
          <div className="dashboard-empty dashboard-empty--inline">
            <p>Error loading data: {error}</p>
          </div>
        </PageSection>
      </PageLayout>
    );
  }

  const completionRate = analytics && analytics.totalCalls > 0
    ? ((analytics.completedCalls / analytics.totalCalls) * 100).toFixed(1)
    : '0';

  return (
    <PageLayout {...shellProps}>
      {analytics && (
        <PageSection title="Key metrics" subtitle="Rollups for your organization">
          <div className="metrics-grid">
            <MetricCard
              label="Total Calls"
              value={analytics.totalCalls}
              icon="📞"
            />
            <MetricCard
              label="Completed"
              value={analytics.completedCalls}
              icon="✓"
              trend={`${completionRate}% completion rate`}
              trendUp={parseFloat(completionRate) >= 70}
            />
            <MetricCard
              label="Abrupt Ends"
              value={analytics.abruptCalls}
              icon="⚠"
            />
            <MetricCard
              label="Voicemail"
              value={analytics.voicemailCalls}
              icon="📬"
            />
            <MetricCard
              label="Transferred"
              value={analytics.transferredCalls}
              icon="↗"
            />
            <MetricCard
              label="Total Cost"
              value={formatCurrency(analytics.totalCost)}
              icon="💰"
            />
            <MetricCard
              label="Avg Cost/Call"
              value={`$${analytics.avgCostPerCall.toFixed(4)}`}
              icon="📊"
            />
            <MetricCard
              label="Avg Duration"
              value={formatDuration(analytics.avgDuration)}
              icon="⏱"
            />
          </div>
        </PageSection>
      )}

      {analytics && Object.keys(analytics.toolUsage).length > 0 && (
        <PageSection title="Tool usage" subtitle="Function calls during conversations">
          <div className="tool-usage-grid">
            {Object.entries(analytics.toolUsage)
              .sort(([, a], [, b]) => b - a)
              .map(([tool, count]) => (
                <div key={tool} className="tool-usage-item">
                  <span className="tool-usage-name">{tool.replace(/_/g, ' ')}</span>
                  <span className="tool-usage-count">{count}</span>
                </div>
              ))}
          </div>
        </PageSection>
      )}

      <PageSection
        title="Recent calls"
        subtitle="Latest activity from your workspace"
        headerExtra={<span className="page-section__meta">{calls.length} calls</span>}
      >
        {calls.length === 0 ? (
          <div className="dashboard-empty dashboard-empty--inline">
            <p>No calls recorded yet</p>
          </div>
        ) : (
          <div className="calls-grid">
            {calls.map(call => (
              <CallCard key={call.id} call={call} />
            ))}
          </div>
        )}
      </PageSection>
    </PageLayout>
  );
}
