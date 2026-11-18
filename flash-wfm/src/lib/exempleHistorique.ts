export const ENTETE_MODELE = ['Date', 'File', 'Volume', 'DMT'] as const;
export const SKILLS_EXEMPLE = ['Accueil', 'Support'] as const;

export type JourEtpExemple = { date: string; etp: number };

function ancreMidi(aujourdHui: Date): Date {
  const ancre = new Date(aujourdHui);
  ancre.setHours(12, 0, 0, 0);
  return ancre;
}

function ajouterJours(date: Date, jours: number): Date {
  const copie = new Date(date);
  copie.setDate(copie.getDate() + jours);
  return copie;
}

function formaterJour(date: Date): string {
  const jour = String(date.getDate()).padStart(2, '0');
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  return `${jour}/${mois}/${date.getFullYear()}`;
}

export function lignesModele(aujourdHui = new Date()): (string | number)[][] {
  const ancre = ancreMidi(aujourdHui);
  const ligne = (decalage: number, file: string, volume: number, dmt: number) => {
    return [formaterJour(ajouterJours(ancre, -decalage)), file, volume, dmt];
  };
  return [
    [...ENTETE_MODELE],
    ligne(2, SKILLS_EXEMPLE[0], 128, 360),
    ligne(2, SKILLS_EXEMPLE[1], 42, 480),
    ligne(1, SKILLS_EXEMPLE[0], 116, 340),
    ligne(1, SKILLS_EXEMPLE[1], 38, 450),
  ];
}

export function historiqueExemple(aujourdHui = new Date()): Record<string, string | number>[] {
  const ancre = ancreMidi(aujourdHui);
  const lignes: Record<string, string | number>[] = [];
  for (let decalage = 21; decalage >= 1; decalage -= 1) {
    const date = ajouterJours(ancre, -decalage);
    const index = 21 - decalage;
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const volume = weekend ? 35 + (index % 4) * 5 : 95 + ((index * 13) % 55);
    const dmt = 300 + ((index * 17) % 90);
    const dateTexte = formaterJour(date);
    lignes.push({ Date: dateTexte, File: SKILLS_EXEMPLE[0], Volume: volume, DMT: dmt });
    lignes.push({ Date: dateTexte, File: SKILLS_EXEMPLE[1], Volume: Math.max(8, Math.round(volume * 0.42)), DMT: dmt + 80 });
  }
  return lignes;
}

/** Effectif combiné Accueil + Support, plus bas le week-end pour laisser voir des écarts. */
function etpCombine(date: Date): number {
  const semaine = [4, 9, 8, 8, 8, 7, 4];
  return semaine[date.getDay()] ?? 8;
}

/**
 * Planning futur aligné sur les deux horizons du moteur :
 * court terme = 30 jours à partir du 1er du mois prochain,
 * long terme = 365 jours à partir du 1er du mois en cours.
 * Les jours déjà passés sont exclus : la série commence demain.
 */
export function planningEtpExemple(aujourdHui = new Date()): JourEtpExemple[] {
  const ancre = ancreMidi(aujourdHui);
  const debutMois = new Date(ancre.getFullYear(), ancre.getMonth(), 1, 12, 0, 0, 0);
  const finLongTerme = ajouterJours(debutMois, 365);
  const debutCourtTerme = new Date(ancre.getFullYear(), ancre.getMonth() + 1, 1, 12, 0, 0, 0);
  const finCourtTerme = ajouterJours(debutCourtTerme, 12 * 30);
  const fin = finLongTerme.getTime() > finCourtTerme.getTime() ? finLongTerme : finCourtTerme;
  const planning: JourEtpExemple[] = [];
  for (let date = ajouterJours(ancre, 1); date < fin; date = ajouterJours(date, 1)) {
    planning.push({ date: formaterJour(date), etp: etpCombine(date) });
  }
  return planning;
}

export function lignesModeleEtp(aujourdHui = new Date()): (string | number)[][] {
  const planning = planningEtpExemple(aujourdHui);
  return [
    ['Date', 'ETP'],
    ...planning.slice(0, 2).map((ligne) => [ligne.date, ligne.etp]),
  ];
}
