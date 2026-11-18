import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '../lib/supabase';

export type ProfilAuth = {
  plan: 'free' | 'pro';
  role: 'user' | 'admin';
};

type AuthContextValue = {
  userId: string | null;
  profile: ProfilAuth | null;
  devForcePro: boolean;
  toggleDevPro: () => void;
  isPro: boolean;
  hasProAccess: boolean;
  profilPret: boolean;
  abonnementActif: boolean;
  assurerDroits: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function profilLibre(): ProfilAuth {
  return { plan: 'free', role: 'user' };
}

function profilLu(ligne: { plan?: string | null; role?: string | null } | null): ProfilAuth {
  return {
    plan: ligne?.plan === 'pro' ? 'pro' : 'free',
    role: ligne?.role === 'admin' ? 'admin' : 'user',
  };
}

async function profilUtilisateur(id: string, email: string | null): Promise<ProfilAuth> {
  try {
    const complet = await supabase.from('profiles').select('plan, role').eq('user_id', id).maybeSingle();
    if (!complet.error) {
      if (complet.data) return profilLu(complet.data);
    } else {
      const simple = await supabase.from('profiles').select('plan').eq('user_id', id).maybeSingle();
      if (simple.error || !simple.data) return profilLibre();
      return profilLu(simple.data);
    }
    await supabase.from('profiles').insert({ user_id: id, email, plan: 'free' });
    return profilLibre();
  } catch {
    return profilLibre();
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [devForcePro, setDevForcePro] = useState(false);
  const [profile, setProfile] = useState<ProfilAuth | null>(null);
  const [abonnementActif, setAbonnementActif] = useState(false);
  const [profilPret, setProfilPret] = useState(false);
  const toggleDevPro = () => setDevForcePro((prev) => !prev);
  const isPro = profile?.plan === 'pro' || profile?.role === 'admin';
  const hasProAccess = profilPret && isPro;
  const assurerDroits = () => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user) {
          setProfile(profilLibre());
          return;
        }
        setProfile(await profilUtilisateur(user.id, user.email ?? null));
      } catch {
        setProfile(profilLibre());
      }
    })();
  };

  useEffect(() => {
    let actif = true;
    const charger = async (id: string | null, email?: string | null) => {
      if (!actif) return;
      if (!id) {
        setUserId(null);
        setProfile(null);
        setAbonnementActif(false);
        setProfilPret(true);
        return;
      }
      setUserId(id);
      setProfilPret(false);
      try {
        const [{ data: abonnements }, profil] = await Promise.all([
          supabase.from('subscriptions').select('status').eq('user_id', id),
          profilUtilisateur(id, email ?? null),
        ]);
        if (!actif) return;
        setAbonnementActif((abonnements ?? []).some((ligne) => ligne.status === 'active'));
        setProfile(profil);
        setProfilPret(true);
      } catch {
        if (!actif) return;
        setAbonnementActif(false);
        setProfile(profilLibre());
        setProfilPret(true);
      }
    };
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      void charger(user?.id ?? null, user?.email);
    });
    const { data: ecoute } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && event !== 'SIGNED_OUT') return;
      const user = session?.user;
      setTimeout(() => {
        void charger(user?.id ?? null, user?.email);
      }, 0);
    });
    return () => {
      actif = false;
      ecoute.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ userId, profile, devForcePro, toggleDevPro, isPro, hasProAccess, profilPret, abonnementActif, assurerDroits }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexte = useContext(AuthContext);
  if (!contexte) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return contexte;
}
