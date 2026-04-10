import { supabase } from './client';

// Note: Row Level Security (RLS) is enabled on the phone_numbers table.
// All queries automatically filter by the authenticated user's org_id.
// Only admins can add/update/delete phone numbers for their organization.
// Superadmins can see and manage all phone numbers across organizations.

export interface PhoneNumber {
  id: string;
  phone_number: string;
  org_id: string;
  label: string | null;
  direction: 'inbound' | 'outbound';
  created_at: string;
}

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}

export async function getPhoneNumbersByOrg(orgId: string): Promise<{ data: PhoneNumber[] | null; error: string | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('phone_numbers')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as PhoneNumber[], error: null };
}

/** Numbers for an org filtered by call direction (e.g. inbound-only config page). */
export async function getPhoneNumbersByOrgAndDirection(
  orgId: string,
  direction: 'inbound' | 'outbound',
): Promise<{ data: PhoneNumber[] | null; error: string | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('phone_numbers')
    .select('*')
    .eq('org_id', orgId)
    .eq('direction', direction)
    .order('created_at', { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as PhoneNumber[], error: null };
}

export async function getOrgByPhoneNumber(phoneNumber: string): Promise<{ data: string | null; error: string | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('phone_numbers')
    .select('org_id')
    .eq('phone_number', phoneNumber)
    .limit(1);

  if (error) {
    return { data: null, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : null;
  return { data: row?.org_id ?? null, error: null };
}

export async function addPhoneNumber(
  phoneNumber: string,
  orgId: string,
  label?: string,
  direction?: 'inbound' | 'outbound'
): Promise<{ data: PhoneNumber | null; error: string | null }> {
  const client = ensureSupabase();

  const { data, error } = await client
    .from('phone_numbers')
    .insert({
      phone_number: phoneNumber,
      org_id: orgId,
      label: label || null,
      direction: direction || 'inbound'
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as PhoneNumber, error: null };
}

export async function updatePhoneNumber(
  oldPhoneNumber: string,
  newPhoneNumber: string,
  orgId: string,
  label?: string,
  direction?: 'inbound' | 'outbound'
): Promise<{ data: PhoneNumber | null; error: string | null }> {
  const client = ensureSupabase();
  const dir = direction ?? 'inbound';

  try {
    // Remove only this org's row for this direction (same E.164 can exist for inbound + outbound)
    const { error: deleteError } = await client
      .from('phone_numbers')
      .delete()
      .eq('phone_number', oldPhoneNumber)
      .eq('org_id', orgId)
      .eq('direction', dir);

    if (deleteError) {
      return { data: null, error: deleteError.message };
    }

    const { data: insertData, error: insertError } = await client
      .from('phone_numbers')
      .insert({
        phone_number: newPhoneNumber,
        org_id: orgId,
        label: label || null,
        direction: dir,
      })
      .select()
      .single();

    if (insertError) {
      return { data: null, error: insertError.message };
    }

    return { data: insertData as PhoneNumber, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function removePhoneNumber(
  phoneNumber: string,
  direction?: 'inbound' | 'outbound'
): Promise<{ error: string | null }> {
  const client = ensureSupabase();

  let q = client.from('phone_numbers').delete().eq('phone_number', phoneNumber);
  if (direction) {
    q = q.eq('direction', direction);
  }

  const { error } = await q;

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}
