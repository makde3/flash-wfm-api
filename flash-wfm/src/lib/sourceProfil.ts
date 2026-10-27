import { supabase } from './supabase';

export async function lireLienSource(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('last_source_url')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return null;
  const url = data?.last_source_url;
  if (typeof url !== 'string') return null;
  const propre = url.trim();
  return propre || null;
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
