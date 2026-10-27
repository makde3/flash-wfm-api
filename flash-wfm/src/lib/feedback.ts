import { supabase } from './supabase';

export const TYPES_RETOUR = ['Amélioration / Suggestion', 'Signalement de bug', 'Autre'] as const;

export type TypeRetour = (typeof TYPES_RETOUR)[number];

export async function envoyerRetour(type: TypeRetour, message: string): Promise<void> {
  const texte = message.trim();
  if (!texte) throw new Error('Message vide.');
  const { data, error: erreurSession } = await supabase.auth.getUser();
  if (erreurSession || !data.user) throw new Error('Session absente.');
  const { error } = await supabase.from('feedbacks').insert({
    user_id: data.user.id,
    user_email: data.user.email ?? null,
    type,
    message: texte,
  });
  if (error) throw error;
}
