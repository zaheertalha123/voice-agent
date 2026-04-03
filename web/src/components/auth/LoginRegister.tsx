import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { validateInvite } from '@/services/auth';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { CompanyRegistrationForm } from '@/components/auth/CompanyRegistrationForm';
import { UserRegistrationForm } from '@/components/auth/UserRegistrationForm';
import { LoginForm } from '@/components/auth/LoginForm';
import './Auth.css';

type AuthTab = 'login' | 'register' | 'invite';

const VALID_TABS: AuthTab[] = ['login', 'register', 'invite'];

function isAuthTab(s: string | null): s is AuthTab {
  return s !== null && VALID_TABS.includes(s as AuthTab);
}

export function LoginRegister() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const tabParam = searchParams.get('tab');

  const [formError, setFormError] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<{ email: string } | null>(null);
  const [isValidatingInvite, setIsValidatingInvite] = useState(!!inviteToken);

  const tab: AuthTab = useMemo(() => {
    if (isAuthTab(tabParam)) return tabParam;
    if (inviteToken) return 'invite';
    return 'login';
  }, [tabParam, inviteToken]);

  useEffect(() => {
    if (!inviteToken) {
      setIsValidatingInvite(false);
      setInviteData(null);
      return;
    }

    let cancelled = false;
    setIsValidatingInvite(true);

    validateInvite(inviteToken)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setInviteData({ email: data.email });
          setSearchParams(
            (prev) => {
              const p = new URLSearchParams(prev);
              p.set('tab', 'invite');
              return p;
            },
            { replace: true }
          );
        } else {
          setFormError('Invalid or expired invitation link');
          setInviteData(null);
          setSearchParams(
            (prev) => {
              const p = new URLSearchParams(prev);
              p.set('tab', 'register');
              p.delete('invite');
              return p;
            },
            { replace: true }
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setFormError('Failed to validate invitation');
        setInviteData(null);
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.set('tab', 'register');
            p.delete('invite');
            return p;
          },
          { replace: true }
        );
      })
      .finally(() => {
        if (!cancelled) setIsValidatingInvite(false);
      });

    return () => {
      cancelled = true;
    };
  }, [inviteToken, setSearchParams]);

  const setTab = (next: AuthTab, options?: { clearInvite?: boolean }) => {
    setFormError(null);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', next);
        if (options?.clearInvite) {
          p.delete('invite');
          setInviteData(null);
        }
        return p;
      },
      { replace: true }
    );
  };

  const handleSuccess = () => navigate('/', { replace: true });

  const subtitle =
    tab === 'login'
      ? 'Sign in to your account'
      : tab === 'register'
        ? 'Create your organization'
        : 'Join an organization';

  if (isValidatingInvite && inviteToken) {
    return (
      <AuthLayout subtitle="Validating invitation...">
        <div className="auth-loading">
          <div className="auth-loading-spinner" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle={subtitle}>
      <div className="auth-tabs auth-tabs--three">
        <button
          type="button"
          className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
          onClick={() => setTab('login', { clearInvite: true })}
        >
          Login
        </button>
        <button
          type="button"
          className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
          onClick={() => setTab('register', { clearInvite: true })}
        >
          Register
        </button>
        <button
          type="button"
          className={`auth-tab ${tab === 'invite' ? 'active' : ''}`}
          onClick={() => setTab('invite')}
        >
          Join via Invite
        </button>
      </div>

      {formError && <div className="auth-form-error">{formError}</div>}

      <div className="auth-tab-content">
        {tab === 'login' && <LoginForm />}
        {tab === 'register' && (
          <CompanyRegistrationForm onError={setFormError} onSuccess={handleSuccess} />
        )}
        {tab === 'invite' && (
          <UserRegistrationForm
            inviteToken={inviteToken}
            inviteEmail={inviteData?.email}
            onError={setFormError}
            onSuccess={handleSuccess}
          />
        )}
      </div>
    </AuthLayout>
  );
}
