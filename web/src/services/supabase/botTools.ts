import { supabase } from './client';

export interface BotTool {
  id: string;
  org_id: string;
  tool_name: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  label: string;
  description: string;
}

function ensureSupabase() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export async function getToolsByOrg(
  orgId: string
): Promise<{ data: BotTool[] | null; error: string | null }> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from('bot_tools')
    .select('*')
    .eq('org_id', orgId)
    .order('tool_name');

  if (error) return { data: null, error: error.message };
  return { data: data as BotTool[], error: null };
}

export async function saveToolsEnabled(
  updates: { id: string; enabled: boolean }[]
): Promise<{ error: string | null }> {
  const client = ensureSupabase();

  // Run updates in parallel
  const results = await Promise.all(
    updates.map(({ id, enabled }) =>
      client.from('bot_tools').update({ enabled }).eq('id', id)
    )
  );

  const failed = results.find(r => r.error);
  if (failed?.error) return { error: failed.error.message };
  return { error: null };
}

export async function saveToolSettings(
  toolId: string,
  settings: Record<string, unknown>
): Promise<{ error: string | null }> {
  const client = ensureSupabase();

  const { error } = await client
    .from('bot_tools')
    .update({ settings })
    .eq('id', toolId);

  if (error) return { error: error.message };
  return { error: null };
}
