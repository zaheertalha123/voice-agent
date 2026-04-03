import { supabase } from './client';
import type { UserRole } from '@/types/auth';

interface DbError {
  message: string;
  code?: string;
}

export interface Invite {
  id: string;
  org_id: string;
  email: string;
  role: UserRole;
  token_hash: string;
  used_at: string | null;
  expires_at: string;
  created_at: string;
}

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}

export interface CreateInviteParams {
  orgId: string;
  email: string;
  role: UserRole;
  tokenHash: string;
  expiresAt: Date;
}

export async function createInvite(
  params: CreateInviteParams
): Promise<{ data: Invite | null; error: DbError | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('invites')
    .insert({
      org_id: params.orgId,
      email: params.email,
      role: params.role,
      token_hash: params.tokenHash,
      expires_at: params.expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  return { data, error: null };
}

export async function getInviteByTokenHash(
  tokenHash: string
): Promise<{ data: Invite | null; error: DbError | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('invites')
    .select('*')
    .eq('token_hash', tokenHash)
    .is('used_at', null)
    .single();

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  return { data, error: null };
}

export async function markInviteAsUsed(
  inviteId: string
): Promise<{ error: DbError | null }> {
  const client = ensureSupabase();

  const { error } = await client
    .from('invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', inviteId);

  if (error) {
    return { error: { message: error.message, code: error.code } };
  }

  return { error: null };
}

export async function getInvitesByOrgId(
  orgId: string
): Promise<{ data: Invite[] | null; error: DbError | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('invites')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  return { data, error: null };
}

export async function deleteInvite(
  inviteId: string
): Promise<{ error: DbError | null }> {
  const client = ensureSupabase();

  const { error } = await client
    .from('invites')
    .delete()
    .eq('id', inviteId);

  if (error) {
    return { error: { message: error.message, code: error.code } };
  }

  return { error: null };
}
