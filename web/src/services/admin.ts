import * as supabaseAuth from '@/services/supabase/auth';
import * as supabaseOrganizations from '@/services/supabase/organizations';
import * as supabaseUsers from '@/services/supabase/users';
import { supabase } from '@/services/supabase/client';
import { validateSetupSecret } from '@/services/secretApi';

export interface CreateSuperadminParams {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
  setupSecret: string;
}

export async function checkSuperadminExists(): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase
    .from('users')
    .select('user_id')
    .eq('is_superadmin', true)
    .limit(1);

  if (error) {
    console.error('Error checking superadmin:', error);
    return false;
  }

  return data && data.length > 0;
}

export async function createSuperadmin(params: CreateSuperadminParams): Promise<void> {
  // Validate setup secret via server
  const isValid = await validateSetupSecret(params.setupSecret);
  if (!isValid) {
    throw new Error('Invalid setup secret');
  }

  // Check if superadmin already exists
  const exists = await checkSuperadminExists();
  if (exists) {
    throw new Error('A superadmin already exists');
  }

  // Create auth user
  const { data: authData, error: authError } = await supabaseAuth.signUp(
    params.email,
    params.password
  );

  if (authError || !authData?.user) {
    throw new Error(authError?.message || 'Failed to create account');
  }

  // If no session (email confirmation enabled), sign in to get a session
  if (!authData.session) {
    const { error: signInError } = await supabaseAuth.signIn(params.email, params.password);
    if (signInError) {
      throw new Error('Account created but could not sign in. Check if email confirmation is required.');
    }
  }

  // Create organization
  const { data: orgData, error: orgError } = await supabaseOrganizations.createOrganization(
    params.organizationName
  );

  if (orgError || !orgData) {
    await supabaseAuth.signOut();
    throw new Error(orgError?.message || 'Failed to create organization');
  }

  // Create superadmin user profile
  const { error: userError } = await supabaseUsers.createUser({
    userId: authData.user.id,
    fullName: params.fullName,
    orgId: orgData.org_id,
    role: 'admin',
  });

  if (userError) {
    await supabaseOrganizations.deleteOrganization(orgData.org_id);
    await supabaseAuth.signOut();
    throw new Error(userError.message || 'Failed to create user profile');
  }

  // Set superadmin flag directly
  if (supabase) {
    const { error: updateError } = await supabase
      .from('users')
      .update({ is_superadmin: true })
      .eq('user_id', authData.user.id);

    if (updateError) {
      console.error('Failed to set superadmin flag:', updateError);
      // Don't fail the whole setup, user can be updated manually
    }
  }

  // Sign out so user can login fresh
  await supabaseAuth.signOut();
}
