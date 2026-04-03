import { supabase } from './client';
import type { Organization } from '@/types/auth';

interface DbError {
  message: string;
  code?: string;
}

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}

export async function createOrganization(
  name: string
): Promise<{ data: Organization | null; error: DbError | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('organizations')
    .insert({ name })
    .select()
    .single();

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  return { data, error: null };
}

export async function getOrganizationById(
  orgId: string
): Promise<{ data: Organization | null; error: DbError | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('organizations')
    .select('*')
    .eq('org_id', orgId)
    .single();

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  return { data, error: null };
}

export async function deleteOrganization(
  orgId: string
): Promise<{ error: DbError | null }> {
  const client = ensureSupabase();

  const { error } = await client
    .from('organizations')
    .delete()
    .eq('org_id', orgId);

  if (error) {
    return { error: { message: error.message, code: error.code } };
  }

  return { error: null };
}
