import { purgerDonneesTravail } from './wizard';

type ResetWizard = () => void;

let resetInscrit: ResetWizard | null = null;

export function enregistrerResetWizard(reset: ResetWizard | null) {
  resetInscrit = reset;
}

export async function resetWizardState() {
  resetInscrit?.();
  await purgerDonneesTravail();
}
