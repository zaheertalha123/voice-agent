import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { isSupabaseConfigured } from '@/services/supabase/client';
import {
  fetchUserProfile,
  getSession,
  onAuthStateChange,
  logout as authLogout,
} from '@/services/auth';
import type { User, Organization } from '@/types/auth';

interface AuthState {
  user: User | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSuperadmin: boolean;
}

interface AuthContextValue extends AuthState {
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string, email?: string) => {
    const profile = await fetchUserProfile(userId, email);
    if (profile) {
      setUser(profile.user);
      setOrganization(profile.organization);
    } else {
      setUser(null);
      setOrganization(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.user_id) {
      await loadProfile(user.user_id, user.email);
    }
  }, [user, loadProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    // Get initial session
    getSession().then(({ data: session }) => {
      if (session?.user) {
        loadProfile(session.user.id, session.user.email ?? undefined).finally(() => {
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    // Subscribe to auth changes
    const { unsubscribe } = onAuthStateChange((userId, email) => {
      if (userId) {
        loadProfile(userId, email);
      } else {
        setUser(null);
        setOrganization(null);
      }
    });

    return unsubscribe;
  }, [loadProfile]);

  const logout = async () => {
    await authLogout();
    setUser(null);
    setOrganization(null);
  };

  const value: AuthContextValue = {
    user,
    organization,
    isLoading,
    isAuthenticated: !!user,
    isSuperadmin: user?.is_superadmin ?? false,
    logout,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
