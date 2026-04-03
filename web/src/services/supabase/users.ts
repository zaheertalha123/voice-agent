import { supabase } from './client';
import type { User, UserRole } from '@/types/auth';

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

export interface CreateUserParams {
  userId: string;
  fullName: string;
  orgId: string;
  role: UserRole;
}

export async function createUser(
  params: CreateUserParams
): Promise<{ data: User | null; error: DbError | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('users')
    .upsert({
      user_id: params.userId,
      full_name: params.fullName,
      org_id: params.orgId,
      role: params.role,
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  return {
    data: {
      user_id: data.user_id,
      full_name: data.full_name,
      org_id: data.org_id,
      role: data.role,
      is_superadmin: data.is_superadmin ?? false,
      created_at: data.created_at,
      updated_at: data.updated_at,
    },
    error: null,
  };
}

export async function getUserById(
  userId: string
): Promise<{ data: User | null; error: DbError | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  return {
    data: {
      user_id: data.user_id,
      full_name: data.full_name,
      org_id: data.org_id,
      role: data.role,
      is_superadmin: data.is_superadmin ?? false,
      created_at: data.created_at,
      updated_at: data.updated_at,
    },
    error: null,
  };
}

export async function deleteUser(
  userId: string
): Promise<{ error: DbError | null }> {
  const client = ensureSupabase();

  const { error } = await client
    .from('users')
    .delete()
    .eq('user_id', userId);

  if (error) {
    return { error: { message: error.message, code: error.code } };
  }

  return { error: null };
}
