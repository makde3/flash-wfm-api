import { supabase } from './supabase';

export type LiensProfil = {
  historique: string | null;
  etp: string | null;
};

function urlHttp(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null;
  const propre = valeur.trim();
  return /^https?:\/\//i.test(propre) ? propre : null;
}

export async function lireLiensProfil(userId: string): Promise<LiensProfil> {
  const vide: LiensProfil = { historique: null, etp: null };
  const { data, error } = await supabase
    .from('profiles')
    .select('last_source_url, last_etp_source_url')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return vide;
  return {
    historique: urlHttp(data.last_source_url),
    etp: urlHttp(data.last_etp_source_url),
  };
}

export async function enregistrerLienSource(userId: string, url: string): Promise<void> {
  const propre = url.trim();
  if (!propre) return;
  const { error } = await supabase
    .from('profiles')
    .update({ last_source_url: propre })
    .eq('user_id', userId);
  if (error) console.error(error);
}

export async function enregistrerLienEtp(userId: string, url: string): Promise<void> {
  const propre = url.trim();
  if (!/^https?:\/\//i.test(propre)) return;
  const { error } = await supabase
    .from('profiles')
    .update({ last_etp_source_url: propre })
    .eq('user_id', userId);
  if (error) console.error(error);
}
