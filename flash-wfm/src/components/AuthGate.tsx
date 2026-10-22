import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { retourConfirmation, supabase } from '../lib/supabase';
import AuthScreen from './AuthScreen';

const INACTIVITE_MS = 30 * 60 * 1000;
const MESSAGE_SESSION_EXPIREE = "Votre session a expiré pour cause d'inactivité. Veuillez vous reconnecter.";

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [emailConfirme, setEmailConfirme] = useState(retourConfirmation.confirme);
  const [sessionExpiree, setSessionExpiree] = useState<string | null>(null);
  const bloquerSessionLien = useState({ courant: retourConfirmation.confirme })[0];

  useEffect(() => {
    let actif = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!actif) return;
      if (retourConfirmation.confirme && data.session) {
        await supabase.auth.signOut();
        if (!actif) return;
        setSession(null);
        setEmailConfirme(true);
        setReady(true);
        return;
      }
      setSession(bloquerSessionLien.courant ? null : data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (bloquerSessionLien.courant) {
        setSession(null);
        setReady(true);
        return;
      }
      if (next) setSessionExpiree(null);
      setSession(next);
      setReady(true);
    });
    return () => {
      actif = false;
      data.subscription.unsubscribe();
    };
  }, [bloquerSessionLien]);

  useEffect(() => {
    if (!session || typeof window === 'undefined') return;
    let identifiant = 0;
    const expirer = () => {
      window.clearTimeout(identifiant);
      setSessionExpiree(MESSAGE_SESSION_EXPIREE);
      void supabase.auth.signOut();
    };
    const reinitialiser = () => {
      window.clearTimeout(identifiant);
      identifiant = window.setTimeout(expirer, INACTIVITE_MS);
    };
    const noms = ['mousemove', 'keydown', 'click', 'scroll'] as const;
    reinitialiser();
    noms.forEach((nom) => window.addEventListener(nom, reinitialiser, true));
    return () => {
      window.clearTimeout(identifiant);
      noms.forEach((nom) => window.removeEventListener(nom, reinitialiser, true));
    };
  }, [session]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6E9EE' }}>
        <ActivityIndicator color="#0F2D46" />
      </View>
    );
  }

  if (!session) {
    return (
      <AuthScreen
        emailConfirme={emailConfirme}
        erreurConfirmation={retourConfirmation.erreur}
        sessionExpiree={sessionExpiree}
        onConnexion={() => {
          bloquerSessionLien.courant = false;
        }}
      />
    );
  }
  return <>{children}</>;
}
