import { supabase } from './client';

export interface BotPrompt {
  id: string;
  org_id: string;
  name: string;
  system_prompt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function ensureSupabase() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export async function getPromptsByOrg(
  orgId: string
): Promise<{ data: BotPrompt[] | null; error: string | null }> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from('bot_prompts')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data as BotPrompt[], error: null };
}

export async function setActivePrompt(
  promptId: string,
  orgId: string
): Promise<{ error: string | null }> {
  const client = ensureSupabase();

  // Deactivate all prompts for this org
  const { error: deactivateError } = await client
    .from('bot_prompts')
    .update({ is_active: false })
    .eq('org_id', orgId);

  if (deactivateError) return { error: deactivateError.message };

  // Activate the selected one
  const { error: activateError } = await client
    .from('bot_prompts')
    .update({ is_active: true })
    .eq('id', promptId);

  if (activateError) return { error: activateError.message };
  return { error: null };
}

export async function createPrompt(
  orgId: string,
  name: string,
  systemPrompt: string
): Promise<{ data: BotPrompt | null; error: string | null }> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from('bot_prompts')
    .insert({ org_id: orgId, name, system_prompt: systemPrompt, is_active: false })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as BotPrompt, error: null };
}

export async function updatePrompt(
  promptId: string,
  name: string,
  systemPrompt: string
): Promise<{ data: BotPrompt | null; error: string | null }> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from('bot_prompts')
    .update({ name, system_prompt: systemPrompt })
    .eq('id', promptId)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as BotPrompt, error: null };
}

export async function deletePrompt(
  promptId: string
): Promise<{ error: string | null }> {
  const client = ensureSupabase();
  const { error } = await client
    .from('bot_prompts')
    .delete()
    .eq('id', promptId);

  if (error) return { error: error.message };
  return { error: null };
}
