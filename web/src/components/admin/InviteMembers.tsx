import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormInput } from '@/components/forms/FormInput';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { useAuth } from '@/contexts/AuthContext';
import { createInvite, getInvitesByOrgId, deleteInvite, type Invite } from '@/services/supabase/invites';
import type { UserRole } from '@/types/auth';
import '@/components/auth/Auth.css';

const inviteSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  role: z.enum(['admin', 'employee'] as const),
});

type InviteFormData = z.infer<typeof inviteSchema>;

async function generateToken(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function InviteMembers() {
  const { user, organization } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      role: 'employee',
    },
  });

  const loadInvites = async () => {
    if (!organization?.org_id) return;

    setIsLoadingInvites(true);
    const { data, error } = await getInvitesByOrgId(organization.org_id);
    if (data && !error) {
      // Filter to only show unused, non-expired invites
      const now = new Date();
      const pending = data.filter(
        (inv) => !inv.used_at && new Date(inv.expires_at) > now
      );
      setPendingInvites(pending);
    }
    setIsLoadingInvites(false);
  };

  useEffect(() => {
    loadInvites();
  }, [organization?.org_id]);

  const onSubmit = async (data: InviteFormData) => {
    setFormError(null);
    setSuccessMessage(null);
    setInviteLink(null);

    if (!organization?.org_id) {
      setFormError('No organization found');
      return;
    }

    try {
      const token = await generateToken();
      const tokenHash = await hashToken(token);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const { error } = await createInvite({
        orgId: organization.org_id,
        email: data.email,
        role: data.role as UserRole,
        tokenHash,
        expiresAt,
      });

      if (error) {
        setFormError(error.message);
        return;
      }

      const link = `${window.location.origin}/register?invite=${token}`;
      setInviteLink(link);
      setSuccessMessage(`Invite created for ${data.email}`);
      reset();
      loadInvites();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create invite');
    }
  };

  const copyToClipboard = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setSuccessMessage('Link copied to clipboard!');
    } catch {
      setFormError('Failed to copy link');
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    const { error } = await deleteInvite(inviteId);
    if (error) {
      setFormError(error.message);
    } else {
      loadInvites();
    }
  };

  const canInvite = user?.role === 'admin' || user?.is_superadmin;

  if (!canInvite) {
    return (
      <AuthLayout subtitle="Access Denied">
        <div className="auth-invite-info">
          <p>You don't have permission to invite members.</p>
          <p>Only admins can send invitations.</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle={`Invite to ${organization?.name || 'Organization'}`}>
      {formError && <div className="auth-form-error">{formError}</div>}
      {successMessage && <div className="auth-form-success">{successMessage}</div>}

      <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
        <FormInput
          id="email"
          label="Email Address"
          type="email"
          placeholder="colleague@example.com"
          autoComplete="email"
          error={errors.email}
          {...register('email')}
        />

        <div className="auth-field">
          <label htmlFor="role" className="auth-label">
            Role
          </label>
          <select
            id="role"
            className={`auth-input ${errors.role ? 'error' : ''}`}
            {...register('role')}
          >
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
          {errors.role && <span className="auth-error">{errors.role.message}</span>}
        </div>

        <SubmitButton isLoading={isSubmitting}>Generate Invite Link</SubmitButton>
      </form>

      {inviteLink && (
        <div className="auth-invite-link">
          <label className="auth-label">Invite Link</label>
          <div className="auth-invite-link-box">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="auth-input"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button type="button" className="auth-copy-btn" onClick={copyToClipboard}>
              Copy
            </button>
          </div>
          <p className="auth-invite-note">This link expires in 7 days.</p>
        </div>
      )}

      {!isLoadingInvites && pendingInvites.length > 0 && (
        <div className="auth-pending-invites">
          <h3>Pending Invites</h3>
          <ul className="auth-invite-list">
            {pendingInvites.map((invite) => (
              <li key={invite.id} className="auth-invite-item">
                <div className="auth-invite-details">
                  <span className="auth-invite-email">{invite.email}</span>
                  <span className="auth-invite-role">{invite.role}</span>
                  <span className="auth-invite-expires">
                    Expires: {new Date(invite.expires_at).toLocaleDateString()}
                  </span>
                </div>
                <button
                  type="button"
                  className="auth-invite-delete"
                  onClick={() => handleDeleteInvite(invite.id)}
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AuthLayout>
  );
}
