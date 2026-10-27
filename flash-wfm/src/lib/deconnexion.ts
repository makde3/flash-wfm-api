import { resetWizardState } from './wizardStore';
import { supabase } from './supabase';

export async function deconnecter() {
  await resetWizardState();
  await supabase.auth.signOut();
}
