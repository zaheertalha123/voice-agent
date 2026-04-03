import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { login } from '@/services/auth';
import { useAuth } from '@/contexts/AuthContext';
import { FormInput } from '@/components/forms/FormInput';
import { SubmitButton } from '@/components/forms/SubmitButton';
import './Auth.css';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setFormError(null);
    try {
      await login(data);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Login failed');
    }
  };

  return (
    <>
      {formError && <div className="auth-form-error">{formError}</div>}

      <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
        <FormInput
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email}
          {...register('email')}
        />

        <FormInput
          id="password"
          label="Password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          showPasswordToggle
          error={errors.password}
          {...register('password')}
        />

        <SubmitButton isLoading={isSubmitting}>Sign In</SubmitButton>
      </form>
    </>
  );
}
