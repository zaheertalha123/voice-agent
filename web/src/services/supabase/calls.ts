import { supabase } from './client';

// Note: Row Level Security (RLS) is enabled on the calls table.
// All queries automatically filter by the authenticated user's org_id.
// Superadmins can see all calls across organizations.

export type CallEndReason = 'completed' | 'abrupt' | 'voicemail';

export interface CallAnalytics {
  duration_sec: number;
  duration_min: number;
  llm?: {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  tts?: {
    characters: number;
    cost_usd: number;
  };
  stt?: {
    duration_sec: number;
    cost_usd: number;
  };
  daily?: {
    room_cost_usd: number;
    dial_handling_cost_usd: number;
    total_cost_usd: number;
  };
  total_cost_usd: number;
  price_per_min_usd: number;
}

export interface CallAnalysis {
  interest_level?: 'high' | 'medium' | 'low' | 'none' | null;
  want_demo?: boolean | null;
  transferred_to_human?: boolean;
  demo_booked?: boolean | null;
  qualified_lead?: boolean;
  objections?: Array<{
    type: string;
    quote: string;
    handled: boolean;
  }>;
  pain_points_mentioned?: string[];
  company_size_category?: 'small' | 'medium' | 'large' | null;
  call_sentiment?: number;
  customer_satisfaction_estimate?: number;
  pitch_delivery_score?: number;
  extracted_info?: {
    decision_maker?: boolean;
    current_provider?: string;
    monthly_inquiries?: number;
  };
}

export interface Call {
  id: string;
  org_id: string | null;
  caller_number: string;
  agent_phone_number: string;
  call_direction: 'inbound' | 'outbound';
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  end_reason: CallEndReason | null;
  call_transferred: boolean;
  tools_called: string[];
  transcription: string | null;
  analytics: CallAnalytics;
  recording_url: string | null;
  call_analysis: CallAnalysis | null;
}

export interface CallsAnalytics {
  totalCalls: number;
  completedCalls: number;
  abruptCalls: number;
  voicemailCalls: number;
  transferredCalls: number;
  totalCost: number;
  avgCostPerCall: number;
  avgDuration: number;
  toolUsage: Record<string, number>;
}

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}

export async function getCalls(limit = 50): Promise<{ data: Call[] | null; error: string | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('calls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as Call[], error: null };
}

export async function getCallsAnalytics(): Promise<{ data: CallsAnalytics | null; error: string | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('calls')
    .select('*');

  if (error) {
    return { data: null, error: error.message };
  }

  const calls = data as Call[];

  // Calculate analytics
  const totalCalls = calls.length;
  const completedCalls = calls.filter(c => c.end_reason === 'completed').length;
  const abruptCalls = calls.filter(c => c.end_reason === 'abrupt').length;
  const voicemailCalls = calls.filter(c => c.end_reason === 'voicemail').length;
  const transferredCalls = calls.filter(c => c.call_transferred).length;

  // Cost analytics
  const costsArray = calls
    .map(c => c.analytics?.total_cost_usd || 0)
    .filter(cost => !isNaN(cost));
  const totalCost = costsArray.reduce((sum, cost) => sum + cost, 0);
  const avgCostPerCall = totalCalls > 0 ? totalCost / totalCalls : 0;

  // Duration analytics - from analytics JSONB or calculated from timestamps
  const durations = calls
    .filter(c => c.ended_at)
    .map(c => {
      if (c.analytics?.duration_sec) {
        return c.analytics.duration_sec;
      }
      const start = new Date(c.created_at).getTime();
      const end = new Date(c.ended_at!).getTime();
      return (end - start) / 1000; // seconds
    });
  const avgDuration = durations.length > 0
    ? durations.reduce((sum, d) => sum + d, 0) / durations.length
    : 0;

  // Tool usage
  const toolUsage: Record<string, number> = {};
  calls.forEach(c => {
    (c.tools_called || []).forEach(tool => {
      toolUsage[tool] = (toolUsage[tool] || 0) + 1;
    });
  });

  return {
    data: {
      totalCalls,
      completedCalls,
      abruptCalls,
      voicemailCalls,
      transferredCalls,
      totalCost,
      avgCostPerCall,
      avgDuration,
      toolUsage,
    },
    error: null,
  };
}
