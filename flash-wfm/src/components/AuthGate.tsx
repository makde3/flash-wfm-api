import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { retourConfirmation, supabase } from '../lib/supabase';
import AuthScreen from './AuthScreen';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [emailConfirme, setEmailConfirme] = useState(retourConfirmation.confirme);
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
      setSession(next);
      setReady(true);
    });
    return () => {
      actif = false;
      data.subscription.unsubscribe();
    };
  }, [bloquerSessionLien]);

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
        onConnexion={() => {
          bloquerSessionLien.courant = false;
        }}
      />
    );
  }
  return <>{children}</>;
}
