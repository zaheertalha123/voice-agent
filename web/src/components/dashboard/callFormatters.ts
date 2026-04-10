import type { Call } from '@/services/supabase/calls';

export const END_REASON_STYLES: Record<string, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'badge-success' },
  abrupt: { label: 'Abrupt', className: 'badge-warning' },
  voicemail: { label: 'Voicemail', className: 'badge-info' },
};

export function formatCallDuration(startDate: string, endDate: string | null): string {
  if (!endDate) return 'In progress';
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const seconds = Math.floor((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatCallDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Full date + time for call records tables. */
export function formatCallDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatCallPhone(phone: string): string {
  if (!phone) return 'Unknown';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export function countToolsCalled(tools: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  tools.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
  return counts;
}

export function formatCallCost(call: Call): string {
  const v = call.analytics?.total_cost_usd;
  return v != null && !Number.isNaN(v) ? `$${v.toFixed(4)}` : '—';
}
