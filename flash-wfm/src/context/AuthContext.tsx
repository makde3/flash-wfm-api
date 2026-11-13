import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '../lib/supabase';

export type ProfilAuth = {
  plan: 'free' | 'pro';
  role?: 'admin';
};

const ESSAI_MS = 48 * 60 * 60 * 1000;

type AuthContextValue = {
  userId: string | null;
  profile: ProfilAuth | null;
  devForcePro: boolean;
  toggleDevPro: () => void;
  isPro: boolean;
  hasProAccess: boolean;
  heuresEssaiRestantes: number;
  abonnementActif: boolean;
  finEssai: number | null;
  assurerDroits: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function profilLu(ligne: { plan?: string | null; role?: string | null } | null): ProfilAuth {
  return {
    plan: ligne?.plan === 'pro' ? 'pro' : 'free',
    role: ligne?.role === 'admin' ? 'admin' : undefined,
  };
}

async function profilUtilisateur(id: string, email: string | null): Promise<ProfilAuth> {
  const complet = await supabase.from('profiles').select('plan, role').eq('user_id', id).maybeSingle();
  if (!complet.error) {
    if (complet.data) return profilLu(complet.data);
  } else {
    const simple = await supabase.from('profiles').select('plan').eq('user_id', id).maybeSingle();
    if (simple.error) return { plan: 'free' };
    if (simple.data) return profilLu(simple.data);
  }
  const { error } = await supabase.from('profiles').insert({ user_id: id, email, plan: 'free' });
  if (error && !/duplicate|unique/i.test(error.message)) console.error(error);
  return { plan: 'free' };
}

function instantCreation(createdAt?: string) {
  if (!createdAt) return null;
  const instant = new Date(createdAt).getTime();
  return Number.isFinite(instant) ? instant : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [devForcePro, setDevForcePro] = useState(false);
  const [profile, setProfile] = useState<ProfilAuth | null>(null);
  const [abonnementActif, setAbonnementActif] = useState(false);
  const [finEssai, setFinEssai] = useState<number | null>(null);
  const [instant, setInstant] = useState(() => Date.now());
  const toggleDevPro = () => setDevForcePro((prev) => !prev);
  const isPro = profile?.plan === 'pro' || profile?.role === 'admin';
  const resteEssai = finEssai == null ? 0 : finEssai - instant;
  const hasProAccess = isPro || resteEssai > 0;
  const heuresEssaiRestantes = resteEssai > 0 ? Math.ceil(resteEssai / (60 * 60 * 1000)) : 0;
  const assurerDroits = () => {
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user) {
          setProfile({ plan: 'free' });
          return;
        }
        setProfile(await profilUtilisateur(user.id, user.email ?? null));
      } catch (error) {
        console.error(error);
        setProfile({ plan: 'free' });
      }
    })();
  };

  useEffect(() => {
    let actif = true;
    const charger = async (id: string | null, createdAt?: string, email?: string | null) => {
      if (!actif) return;
      if (!id) {
        setUserId(null);
        setProfile(null);
        setAbonnementActif(false);
        setFinEssai(null);
        return;
      }
      setUserId(id);
      const [{ data: abonnements }, profil] = await Promise.all([
        supabase.from('subscriptions').select('status').eq('user_id', id),
        profilUtilisateur(id, email ?? null),
      ]);
      if (!actif) return;
      const creation = instantCreation(createdAt);
      setFinEssai(creation == null ? null : creation + ESSAI_MS);
      setAbonnementActif((abonnements ?? []).some((ligne) => ligne.status === 'active'));
      setProfile(profil);
    };
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      void charger(user?.id ?? null, user?.created_at, user?.email);
    });
    const { data: ecoute } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && event !== 'SIGNED_OUT') return;
      const user = session?.user;
      setTimeout(() => {
        void charger(user?.id ?? null, user?.created_at, user?.email);
      }, 0);
    });
    return () => {
      actif = false;
      ecoute.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const minute = setInterval(() => setInstant(Date.now()), 60_000);
    return () => clearInterval(minute);
  }, []);

  return (
    <AuthContext.Provider value={{ userId, profile, devForcePro, toggleDevPro, isPro, hasProAccess, heuresEssaiRestantes, abonnementActif, finEssai, assurerDroits }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexte = useContext(AuthContext);
  if (!contexte) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return contexte;
}
