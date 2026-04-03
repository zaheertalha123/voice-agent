import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormInput } from '@/components/forms/FormInput';
import { SubmitButton } from '@/components/forms/SubmitButton';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { checkSuperadminExists, createSuperadmin } from '@/services/admin';
import '@/components/auth/Auth.css';

const setupSchema = z
  .object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    setupSecret: z.string().min(1, 'Setup secret is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type SetupFormData = z.infer<typeof setupSchema>;

export function AdminSetup() {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetupFormData>({
    resolver: zodResolver(setupSchema),
  });

  useEffect(() => {
    checkSuperadminExists()
      .then((exists) => {
        if (exists) {
          setIsLocked(true);
        }
      })
      .catch(() => {
        // If check fails, allow setup attempt
      })
      .finally(() => setIsChecking(false));
  }, []);

  const onSubmit = async (data: SetupFormData) => {
    setFormError(null);
    try {
      await createSuperadmin({
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        organizationName: data.organizationName,
        setupSecret: data.setupSecret,
      });
      navigate('/login', { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Setup failed');
    }
  };

  const subtitle = isChecking ? 'Checking setup status...' : isLocked ? 'Setup Complete' : 'Initial Setup';

  return (
    <AuthLayout subtitle={subtitle}>
      {isChecking ? (
        <div className="auth-loading">
          <div className="auth-loading-spinner" />
        </div>
      ) : isLocked ? (
        <div className="auth-invite-info">
          <p>A superadmin already exists.</p>
          <p>Please use the regular login page.</p>
          <a href="/login" className="auth-submit" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center', marginTop: '1rem' }}>
            Go to Login
          </a>
        </div>
      ) : (
        <>
          {formError && <div className="auth-form-error">{formError}</div>}
          <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
            <div className="auth-form-row">
              <FormInput
                id="fullName"
                label="Your Name"
                placeholder="John Doe"
                autoComplete="name"
                error={errors.fullName}
                {...register('fullName')}
              />
              <FormInput
                id="email"
                label="Email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                error={errors.email}
                {...register('email')}
              />
            </div>
            <FormInput
              id="organizationName"
              label="Organization Name"
              placeholder="Your Company"
              error={errors.organizationName}
              {...register('organizationName')}
            />
            <FormInput
              id="setupSecret"
              label="Setup Secret"
              type="password"
              placeholder="Enter setup secret from .env"
              error={errors.setupSecret}
              {...register('setupSecret')}
            />
            <div className="auth-form-row">
              <FormInput
                id="password"
                label="Password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                showPasswordToggle
                error={errors.password}
                {...register('password')}
              />
              <FormInput
                id="confirmPassword"
                label="Confirm Password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                showPasswordToggle
                error={errors.confirmPassword}
                {...register('confirmPassword')}
              />
            </div>
            <SubmitButton isLoading={isSubmitting}>Create Superadmin Account</SubmitButton>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
