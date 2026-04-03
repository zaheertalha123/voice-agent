import { supabase } from './client';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';

export interface SignUpResult {
  user: SupabaseUser | null;
  session: Session | null;
}

export interface AuthError {
  message: string;
  code?: string;
}

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}

export async function signUp(
  email: string,
  password: string,
  metadata?: Record<string, string>
): Promise<{ data: SignUpResult | null; error: AuthError | null }> {
  const client = ensureSupabase();

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: metadata ? { data: metadata } : undefined,
  });

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  return { data: { user: data.user, session: data.session }, error: null };
}

export async function signIn(
  email: string,
  password: string
): Promise<{ data: Session | null; error: AuthError | null }> {
  const client = ensureSupabase();

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  return { data: data.session, error: null };
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  const client = ensureSupabase();

  const { error } = await client.auth.signOut();

  if (error) {
    return { error: { message: error.message, code: error.code } };
  }

  return { error: null };
}

export async function getSession(): Promise<{ data: Session | null; error: AuthError | null }> {
  const client = ensureSupabase();

  const { data, error } = await client.auth.getSession();

  if (error) {
    return { data: null, error: { message: error.message, code: error.code } };
  }

  return { data: data.session, error: null };
}

export function onAuthStateChange(
  callback: (session: Session | null) => void
): { unsubscribe: () => void } {
  const client = ensureSupabase();

  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return { unsubscribe: subscription.unsubscribe };
}
