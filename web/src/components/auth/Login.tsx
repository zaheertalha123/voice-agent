import { Navigate, useLocation } from 'react-router-dom';

/** Redirects to the unified auth page (preserves `from` for post-login navigation). */
export function Login() {
  const location = useLocation();
  return <Navigate to="/login-register?tab=login" replace state={location.state} />;
}
