export type OuvertureWeekend = { samedi: boolean; dimanche: boolean };

export type JourFerie = {
  date: string;
  nom: string;
  pentecote: boolean;
};

export type FerieColonne = { nom: string; chome: boolean };

export function jourSemaine(date: string): number | null {
  const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const jour = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  if (Number.isNaN(jour.getTime())) return null;
  return jour.getUTCDay();
}

export function ouvertureWeekend(lignes: { date: string; volume: number }[]): OuvertureWeekend {
  let samedi = false;
  let dimanche = false;
  for (const ligne of lignes) {
    if (!(ligne.volume > 0)) continue;
    const jour = jourSemaine(ligne.date);
    if (jour === 6) samedi = true;
    if (jour === 0) dimanche = true;
  }
  return { samedi, dimanche };
}

function formaterUtc(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

function ajouterJoursUtc(date: Date, jours: number) {
  const copie = new Date(date.getTime());
  copie.setUTCDate(copie.getUTCDate() + jours);
  return copie;
}

/** Dimanche de Pâques, calendrier grégorien. */
export function paques(annee: number) {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}

export function feriesFrancais(annee: number): JourFerie[] {
  const paque = paques(annee);
  const fixe = (mois: number, jour: number, nom: string): JourFerie => ({
    date: formaterUtc(new Date(Date.UTC(annee, mois - 1, jour))),
    nom,
    pentecote: false,
  });
  return [
    fixe(1, 1, 'Jour de l\'an'),
    { date: formaterUtc(ajouterJoursUtc(paque, 1)), nom: 'Lundi de Pâques', pentecote: false },
    fixe(5, 1, '1er mai'),
    fixe(5, 8, '8 mai'),
    { date: formaterUtc(ajouterJoursUtc(paque, 39)), nom: 'Ascension', pentecote: false },
    { date: formaterUtc(ajouterJoursUtc(paque, 50)), nom: 'Lundi de Pentecôte', pentecote: true },
    fixe(7, 14, '14 juillet'),
    fixe(8, 15, 'Assomption'),
    fixe(11, 1, 'Toussaint'),
    fixe(11, 11, '11 novembre'),
    fixe(12, 25, 'Noël'),
  ];
}

const indexAnnees = new Map<number, Map<string, JourFerie>>();

export function ferieDuJour(date: string): JourFerie | null {
  const match = date.match(/^\d{2}\/\d{2}\/(\d{4})$/);
  if (!match) return null;
  const annee = Number(match[1]);
  let index = indexAnnees.get(annee);
  if (!index) {
    index = new Map(feriesFrancais(annee).map((jour) => [jour.date, jour]));
    indexAnnees.set(annee, index);
  }
  return index.get(date) ?? null;
}

export function estChomeParDefaut(ferie: JourFerie, etpPlanifie: number | null) {
  if (etpPlanifie != null && Number.isFinite(etpPlanifie)) return etpPlanifie <= 0;
  return !ferie.pentecote;
}
