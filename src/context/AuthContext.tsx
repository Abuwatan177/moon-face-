import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../lib/supabase';

export type UserProfile = { id: string; email: string; display_name: string; is_store_owner: boolean };
type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  isGuest: boolean;
  loading: boolean;
  configured: boolean;
  error: string;
  signUp: (email: string, password: string, displayName: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (email: string, code: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isGuest, setIsGuest] = useState(() => sessionStorage.getItem('moon-face-guest') === 'true');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;

    let active = true;
    const profileRequests = new Map<string, Promise<UserProfile | null>>();
    const loadProfile = async (nextUser: User | null) => {
      if (!nextUser) {
        if (active) setProfile(null);
        return;
      }
      let request = profileRequests.get(nextUser.id);
      if (!request) {
        const userId = nextUser.id;
        request = (async () => {
          try {
            const { data } = await client.from('profiles').select('id,email,display_name,is_store_owner').eq('id', userId).maybeSingle();
            return data as UserProfile | null;
          } finally {
            profileRequests.delete(userId);
          }
        })();
        profileRequests.set(nextUser.id, request);
      }
      const profile = await request;
      if (active) setProfile(profile);
    };

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const nextUser = data.session?.user || null;
      setUser(nextUser);
      if (nextUser) setIsGuest(false);
      await loadProfile(nextUser);
      if (active) setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user || null;
      setUser(nextUser);
      if (nextUser) setIsGuest(false);
      void loadProfile(nextUser).finally(() => { if (active) setLoading(false); });
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, displayName: string) => {
    if (!supabase) throw new Error('Supabase auth is not configured.');
    setError('');
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (authError) throw authError;
    return Boolean(data.session);
  };

  const signIn = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase auth is not configured.');
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) throw authError;
  };

  const requestPasswordReset = async (email: string) => {
    if (!supabase) throw new Error('Supabase auth is not configured.');
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email);
    if (authError) throw authError;
  };

  const completePasswordReset = async (email: string, code: string, password: string) => {
    if (!supabase) throw new Error('Supabase auth is not configured.');
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'recovery' });
    if (verifyError) throw verifyError;
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;
  };

  const signInWithGoogle = async () => {
    if (!supabase) throw new Error('Supabase auth is not configured.');
    setError('');
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (authError) throw authError;
  };

  const signOut = async () => {
    if (supabase && user) {
      const { error: authError } = await supabase.auth.signOut();
      if (authError) throw authError;
    }
    setUser(null);
    setProfile(null);
    setIsGuest(false);
    sessionStorage.removeItem('moon-face-guest');
  };

  const continueAsGuest = () => {
    setIsGuest(true);
    sessionStorage.setItem('moon-face-guest', 'true');
  };

  return <AuthContext.Provider value={{
    user, profile, isGuest, loading, configured: supabaseConfigured, error,
    signUp: async (...args) => { try { return await signUp(...args); } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إنشاء الحساب.'); throw cause; } },
    signIn: async (...args) => { try { await signIn(...args); } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تسجيل الدخول.'); throw cause; } },
    requestPasswordReset: async (...args) => { try { await requestPasswordReset(...args); } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إرسال رمز الاستعادة.'); throw cause; } },
    completePasswordReset: async (...args) => { try { await completePasswordReset(...args); } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تغيير كلمة المرور.'); throw cause; } },
    signInWithGoogle: async () => { try { await signInWithGoogle(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تسجيل الدخول عبر Google.'); throw cause; } },
    signOut,
    continueAsGuest,
    clearError: () => setError(''),
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
