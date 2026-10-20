import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const TYPES_CONFIRMATION = new Set(['signup', 'email', 'email_change', 'invite']);

export type RetourConfirmation = {
  confirme: boolean;
  erreur: string | null;
};

function lireParametresPage(): { type: string | null; erreur: string | null } {
  if (typeof window === 'undefined') return { type: null, erreur: null };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const brut = hash.get('error_description') || query.get('error_description');
  return {
    type: hash.get('type') || query.get('type'),
    erreur: brut ? decodeURIComponent(brut.replace(/\+/g, ' ')) : null,
  };
}

const retourPage = lireParametresPage();

export const retourConfirmation: RetourConfirmation = {
  confirme: Boolean(retourPage.type && TYPES_CONFIRMATION.has(retourPage.type) && !retourPage.erreur),
  erreur: retourPage.erreur,
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
