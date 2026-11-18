import { supabase } from './supabase';

const EMAIL_PRO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIEN_PAIEMENT_PRO = 'https://buy.stripe.com/00wdR1fLr10reWO7ol2ZO00';
const CLE_PAIEMENT_ATTENTE = 'paiement_pro_attente';

export function lienStripePro() {
  const brut = (process.env.EXPO_PUBLIC_STRIPE_LINK ?? '').trim();
  return /^https:\/\//i.test(brut) ? brut : LIEN_PAIEMENT_PRO;
}

export function urlPaiementPro(user: { id: string; email?: string | null }) {
  const url = new URL(lienStripePro());
  url.searchParams.set('client_reference_id', user.id);
  if (user.email) url.searchParams.set('prefilled_email', user.email);
  return url.toString();
}

export function noterPaiementApresConnexion() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(CLE_PAIEMENT_ATTENTE, '1');
}

export function annulerPaiementApresConnexion() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(CLE_PAIEMENT_ATTENTE);
}

export function consommerPaiementApresConnexion() {
  if (typeof window === 'undefined') return false;
  if (window.sessionStorage.getItem(CLE_PAIEMENT_ATTENTE) !== '1') return false;
  window.sessionStorage.removeItem(CLE_PAIEMENT_ATTENTE);
  return true;
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
