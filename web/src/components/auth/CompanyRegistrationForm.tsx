import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerCompany } from '@/services/auth';
import { FormInput } from '@/components/forms/FormInput';
import { SubmitButton } from '@/components/forms/SubmitButton';

const companySchema = z
  .object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
    companySecret: z.string().min(1, 'Company registration code is required'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type CompanyFormData = z.infer<typeof companySchema>;

interface CompanyRegistrationFormProps {
  onError: (error: string | null) => void;
  onSuccess: () => void;
}

export function CompanyRegistrationForm({ onError, onSuccess }: CompanyRegistrationFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
  });

  const onSubmit = async (data: CompanyFormData) => {
    onError(null);
    try {
      await registerCompany({
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        organizationName: data.organizationName,
        companySecret: data.companySecret,
      });
      onSuccess();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Registration failed');
    }
  };

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
          error={errors.email}
          {...register('email')}
        />
      </div>

      <div className="auth-form-row">
        <FormInput
          id="organizationName"
          label="Organization Name"
          placeholder="Acme Inc."
          error={errors.organizationName}
          {...register('organizationName')}
        />

        <FormInput
          id="companySecret"
          label="Registration Code"
          type="password"
          placeholder="Enter code"
          error={errors.companySecret}
          {...register('companySecret')}
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

      <SubmitButton isLoading={isSubmitting}>Create Organization</SubmitButton>
    </form>
  );
}
