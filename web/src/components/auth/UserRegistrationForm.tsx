import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerUser } from '@/services/auth';
import { FormInput } from '@/components/forms/FormInput';
import { SubmitButton } from '@/components/forms/SubmitButton';

const userSchema = z
  .object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type UserFormData = z.infer<typeof userSchema>;

interface UserRegistrationFormProps {
  inviteToken: string | null;
  inviteEmail?: string;
  onError: (error: string | null) => void;
  onSuccess: () => void;
}

export function UserRegistrationForm({
  inviteToken,
  inviteEmail,
  onError,
  onSuccess,
}: UserRegistrationFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      email: inviteEmail || '',
    },
  });

  const onSubmit = async (data: UserFormData) => {
    if (!inviteToken) {
      onError('No invitation token provided. Please use the invitation link sent to your email.');
      return;
    }

    onError(null);
    try {
      await registerUser({
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        inviteToken,
      });
      onSuccess();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Registration failed');
    }
  };

  if (!inviteToken) {
    return (
      <div className="auth-invite-info">
        <p>To join an existing organization, you need an invitation link.</p>
        <p>Please ask your organization admin to send you an invite.</p>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="auth-form-row">
        <FormInput
          id="fullName"
          label="Full Name"
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
          disabled={!!inviteEmail}
          error={errors.email}
          {...register('email')}
        />
      </div>

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

      <SubmitButton isLoading={isSubmitting}>Join Organization</SubmitButton>
    </form>
  );
}
