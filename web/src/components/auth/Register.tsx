import { Navigate, useSearchParams } from 'react-router-dom';

/** Redirects to the unified auth page; preserves `?invite=` for invite signup. */
export function Register() {
  const [searchParams] = useSearchParams();
  const invite = searchParams.get('invite');
  const to = invite
    ? `/login-register?tab=invite&invite=${encodeURIComponent(invite)}`
    : '/login-register?tab=register';
  return <Navigate to={to} replace />;
}
