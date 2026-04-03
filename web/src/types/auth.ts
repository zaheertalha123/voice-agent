export type UserRole = 'admin' | 'employee';

export interface Organization {
  org_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  user_id: string;
  full_name: string;
  org_id: string;
  role: UserRole;
  is_superadmin: boolean;
  created_at: string;
  updated_at: string;
  email?: string;
}

export interface AuthState {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
}
