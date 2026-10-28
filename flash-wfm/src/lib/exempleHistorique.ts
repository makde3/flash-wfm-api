export const ENTETE_MODELE = ['Date', 'File', 'Volume', 'DMT'] as const;

export function lignesModele(): (string | number)[][] {
  return [
    [...ENTETE_MODELE],
    ['06/10/2026', 'Accueil', 128, 360],
    ['06/10/2026', 'Support', 42, 480],
    ['07/10/2026', 'Accueil', 116, 340],
    ['07/10/2026', 'Support', 38, 450],
  ];
}

export function historiqueExemple(aujourdHui = new Date()): Record<string, string | number>[] {
  const ancre = new Date(aujourdHui);
  ancre.setHours(12, 0, 0, 0);
  const lignes: Record<string, string | number>[] = [];
  for (let decalage = 21; decalage >= 1; decalage -= 1) {
    const date = new Date(ancre);
    date.setDate(ancre.getDate() - decalage);
    const index = 21 - decalage;
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const volume = weekend ? 35 + (index % 4) * 5 : 95 + ((index * 13) % 55);
    const dmt = 300 + ((index * 17) % 90);
    const jour = String(date.getDate()).padStart(2, '0');
    const mois = String(date.getMonth() + 1).padStart(2, '0');
    const dateTexte = `${jour}/${mois}/${date.getFullYear()}`;
    lignes.push({ Date: dateTexte, File: 'Accueil', Volume: volume, DMT: dmt });
    lignes.push({ Date: dateTexte, File: 'Support', Volume: Math.max(8, Math.round(volume * 0.42)), DMT: dmt + 80 });
  }
  return lignes;
}
