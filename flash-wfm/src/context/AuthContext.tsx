import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '../lib/supabase';

export type ProfilAuth = {
  plan: 'free' | 'pro';
};

type AuthContextValue = {
  userId: string | null;
  profile: ProfilAuth | null;
  devForcePro: boolean;
  toggleDevPro: () => void;
  isPro: boolean;
  abonnementActif: boolean;
  finEssai: number | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [devForcePro, setDevForcePro] = useState(false);
  const [profile, setProfile] = useState<ProfilAuth | null>(null);
  const [abonnementActif, setAbonnementActif] = useState(false);
  const [finEssai, setFinEssai] = useState<number | null>(null);
  const toggleDevPro = () => setDevForcePro((prev) => !prev);
  const isPro = true;

  useEffect(() => {
    let actif = true;
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) {
        if (actif) setUserId(null);
        return;
      }
      if (actif) setUserId(user.id);
      const { data: abonnements } = await supabase.from('subscriptions').select('status').eq('user_id', user.id);
      if (!actif) return;
      const creation = user.created_at ? new Date(user.created_at).getTime() : Date.now();
      setFinEssai(creation + 3 * 24 * 60 * 60 * 1000);
      setAbonnementActif((abonnements ?? []).some((ligne) => ligne.status === 'active'));
      setProfile({ plan: 'pro' });
    });
    return () => {
      actif = false;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ userId, profile, devForcePro, toggleDevPro, isPro, abonnementActif, finEssai }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexte = useContext(AuthContext);
  if (!contexte) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return contexte;
}
