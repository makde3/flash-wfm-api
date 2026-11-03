import type { PlanLigne } from './wizard';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export type PeriodeAjustement = {
  cle: string;
  libelle: string;
  volumeBrut: number;
  volumeAjuste: number;
};

export function pourcentageLu(texte: string) {
  const propre = texte.trim().replace(/\s/g, '').replace(',', '.').replace(/^\+/, '');
  if (!propre || propre === '-' || propre === '.' || propre === '-.') return 0;
  const valeur = Number(propre);
  return Number.isFinite(valeur) ? valeur : 0;
}

export function saisiePourcentageValide(texte: string) {
  const propre = texte.replace(/\s/g, '');
  return propre === '' || /^[+-]?\d*(?:[.,]\d*)?$/.test(propre);
}

function jourUtc(date: string) {
  const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
}

function semaineIso(date: Date) {
  const cible = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const jour = cible.getUTCDay() || 7;
  cible.setUTCDate(cible.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(cible.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((cible.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7);
  return { annee: cible.getUTCFullYear(), semaine };
}

function clePeriode(date: string) {
  const mois = date.match(/^(\d{2})\/(\d{4})$/);
  if (mois) return `M${mois[1]}/${mois[2]}`;
  const jour = jourUtc(date);
  if (!jour) return date;
  const { annee, semaine } = semaineIso(jour);
  return `S${annee}-${String(semaine).padStart(2, '0')}`;
}

function libelleMois(date: string) {
  const mois = date.match(/^(\d{2})\/(\d{4})$/);
  if (!mois) return date;
  const nom = MOIS[Number(mois[1]) - 1] ?? mois[1];
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${mois[2]}`;
}

function jourMois(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function pourcentagePeriode(date: string, saisies: Record<string, string>) {
  return pourcentageLu(saisies[clePeriode(date)] ?? '');
}

export function ajusterLigne(ligne: PlanLigne, pourcentage: number): PlanLigne {
  if (!pourcentage) return ligne;
  const volume = Math.max(0, Math.round(ligne.volume_prevu * (1 + pourcentage / 100)));
  const etp = ligne.volume_prevu > 0
    ? Math.max(0, Math.round(ligne.etp_moyen_requis * (volume / ligne.volume_prevu) * 10) / 10)
    : ligne.etp_moyen_requis;
  return { ...ligne, volume_prevu: volume, etp_moyen_requis: etp };
}

export function appliquerAjustements(plan: PlanLigne[], saisies: Record<string, string>) {
  if (!Object.values(saisies).some((texte) => pourcentageLu(texte) !== 0)) return plan;
  return plan.map((ligne) => ajusterLigne(ligne, pourcentagePeriode(ligne.date, saisies)));
}

export function periodesAjustables(plan: PlanLigne[], saisies: Record<string, string>): PeriodeAjustement[] {
  const groupes = new Map<string, { libelle: string; brut: number; ajuste: number; debut: Date | null; fin: Date | null; semaine: number | null }>();
  for (const ligne of plan) {
    const cle = clePeriode(ligne.date);
    const jour = jourUtc(ligne.date);
    const courant = groupes.get(cle) ?? {
      libelle: libelleMois(ligne.date),
      brut: 0,
      ajuste: 0,
      debut: jour,
      fin: jour,
      semaine: jour ? semaineIso(jour).semaine : null,
    };
    const ajuste = ajusterLigne(ligne, pourcentageLu(saisies[cle] ?? ''));
    courant.brut += ligne.volume_prevu;
    courant.ajuste += ajuste.volume_prevu;
    if (jour) {
      if (!courant.debut || jour < courant.debut) courant.debut = jour;
      if (!courant.fin || jour > courant.fin) courant.fin = jour;
    }
    groupes.set(cle, courant);
  }
  return [...groupes.entries()].map(([cle, groupe]) => ({
    cle,
    libelle: groupe.debut && groupe.fin && groupe.semaine != null
      ? `Semaine ${groupe.semaine} · ${jourMois(groupe.debut)}${groupe.debut.getTime() === groupe.fin.getTime() ? '' : ` – ${jourMois(groupe.fin)}`}`
      : groupe.libelle,
    volumeBrut: groupe.brut,
    volumeAjuste: groupe.ajuste,
  }));
}
