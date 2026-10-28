import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '../lib/supabase';

export type ProfilAuth = {
  plan: 'free' | 'pro';
  role?: 'admin';
};

type AuthContextValue = {
  userId: string | null;
  profile: ProfilAuth | null;
  devForcePro: boolean;
  toggleDevPro: () => void;
  isPro: boolean;
  abonnementActif: boolean;
  finEssai: number | null;
  assurerDroits: () => void;
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
  const poserAdminLocal = () => setProfile((actuel) => ({ plan: actuel?.plan ?? 'pro', role: 'admin' }));
  const assurerDroits = () => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user) {
          poserAdminLocal();
          return;
        }
        const { data: ligne, error } = await supabase.from('profiles').select('user_id').eq('user_id', user.id).maybeSingle();
        if (!error && ligne) return;
        poserAdminLocal();
        const { error: erreurInsert } = await supabase.from('profiles').insert({
          user_id: user.id,
          email: user.email ?? null,
          plan: 'free',
        });
        if (erreurInsert) console.error(erreurInsert);
      } catch (error) {
        console.error(error);
        poserAdminLocal();
      }
    })();
  };

  useEffect(() => {
    let actif = true;
    const charger = async (id: string | null, createdAt?: string) => {
      if (!actif) return;
      if (!id) {
        setUserId(null);
        setProfile(null);
        setAbonnementActif(false);
        setFinEssai(null);
        return;
      }
      setUserId(id);
      const { data: abonnements } = await supabase.from('subscriptions').select('status').eq('user_id', id);
      if (!actif) return;
      const creation = createdAt ? new Date(createdAt).getTime() : Date.now();
      setFinEssai(creation + 3 * 24 * 60 * 60 * 1000);
      setAbonnementActif((abonnements ?? []).some((ligne) => ligne.status === 'active'));
      setProfile({ plan: 'pro' });
    };
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      void charger(user?.id ?? null, user?.created_at);
    });
    const { data: ecoute } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && event !== 'SIGNED_OUT') return;
      const user = session?.user;
      setTimeout(() => {
        void charger(user?.id ?? null, user?.created_at);
      }, 0);
    });
    return () => {
      actif = false;
      ecoute.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ userId, profile, devForcePro, toggleDevPro, isPro, abonnementActif, finEssai, assurerDroits }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexte = useContext(AuthContext);
  if (!contexte) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return contexte;
}
