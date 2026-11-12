import { supabase } from './supabase';

const EMAIL_PRO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function lienStripePro() {
  const brut = (process.env.EXPO_PUBLIC_STRIPE_LINK ?? '').trim();
  return /^https:\/\//i.test(brut) ? brut : '';
}

export async function envoyerDemandePro(email: string, entreprise: string): Promise<void> {
  const adresse = email.trim();
  const societe = entreprise.trim();
  if (!EMAIL_PRO.test(adresse) || adresse.length > 320) {
    throw new Error('Indiquez un e-mail professionnel valide.');
  }
  if (!societe || societe.length > 200) {
    throw new Error("Indiquez le nom de l'entreprise (200 caractères maximum).");
  }
  const { data, error: erreurSession } = await supabase.auth.getUser();
  if (erreurSession || !data.user) throw new Error('Veuillez vous reconnecter.');
  const { error } = await supabase.from('pro_requests').insert({
    user_id: data.user.id,
    email: adresse,
    entreprise: societe,
  });
  if (error) throw new Error("Impossible d'enregistrer la demande. Réessayez dans un instant.");
}
