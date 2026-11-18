import { jourSemaine, type FerieColonne, type OuvertureWeekend } from './feries';
import { couvertureLigne, type LigneCouverture, type PlanLigne } from './wizard';

export type MoisHorizon = 1 | 3 | 6 | 12;
export type VuePlan = 'journalier' | 'hebdo' | 'mensuel';

export const MOIS_HORIZON: MoisHorizon[] = [1, 3, 6, 12];
export const JOURS_PAR_MOIS_HORIZON = 30;

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export type LignePresentee = {
  periode: string;
  periodeExcel: string;
  volumeBrut: number;
  volumeAjuste: number;
  etpRequis: number;
  etpPlanifie: number | null;
  ecart: number | null;
  couverture: number | null;
  ferie: FerieColonne | null;
};

export type MoisFiltrable = { id: string; libelle: string };

export type PresentationPlan = {
  lignes: LignePresentee[];
  mois: MoisFiltrable[];
  plan: PlanLigne[];
  etpPlanifies: (number | null)[];
  couvertures: LigneCouverture[] | null;
};

type Jour = {
  brut: PlanLigne;
  ajuste: PlanLigne;
  etpPlanifie: number | null;
};

function parserJour(date: string) {
  const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
}

function semaineIso(date: Date) {
  const cible = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const jour = cible.getUTCDay() || 7;
  cible.setUTCDate(cible.getUTCDate() + 4 - jour);
  const annee = cible.getUTCFullYear();
  const debut = new Date(Date.UTC(annee, 0, 1));
  const semaine = Math.ceil(((cible.getTime() - debut.getTime()) / 86400000 + 1) / 7);
  return { annee, semaine };
}

function moyenne(valeurs: number[]) {
  if (!valeurs.length) return null;
  return valeurs.reduce((somme, valeur) => somme + valeur, 0) / valeurs.length;
}

function arrondir(valeur: number, decimales: number) {
  const puissance = 10 ** decimales;
  return Math.round(valeur * puissance) / puissance;
}

export function jourRetenu(date: string, volume: number, etp: number) {
  const jour = parserJour(date);
  if (!jour) return volume > 0 || etp > 0;
  const weekend = jour.getUTCDay() === 0 || jour.getUTCDay() === 6;
  if (!weekend) return true;
  return volume > 0 || etp > 0;
}

function idMois(date: string) {
  const jour = date.match(/^\d{2}\/(\d{2})\/(\d{4})$/);
  if (jour) return `${jour[1]}/${jour[2]}`;
  const mois = date.match(/^(\d{2})\/(\d{4})$/);
  return mois ? `${mois[1]}/${mois[2]}` : null;
}

function libelleMois(id: string) {
  const match = id.match(/^(\d{2})\/(\d{4})$/);
  if (!match) return id;
  const nom = NOMS_MOIS[Number(match[1]) - 1] ?? match[1];
  return `${nom.charAt(0).toUpperCase()}${nom.slice(1)} ${match[2]}`;
}

function ligneDepuisJours(periode: string, periodeExcel: string, jours: Jour[], avecCouverture: boolean): LignePresentee {
  const retenus = jours.filter((jour) => jourRetenu(jour.ajuste.date, jour.ajuste.volume_prevu, jour.ajuste.etp_moyen_requis));
  const base = retenus.length ? retenus : jours;
  const etpRequis = moyenne(base.map((jour) => jour.ajuste.etp_moyen_requis)) ?? 0;
  const planifies = base.map((jour) => jour.etpPlanifie).filter((valeur): valeur is number => valeur != null);
  const etpPlanifie = moyenne(planifies);
  const ecarts = base
    .filter((jour) => jour.etpPlanifie != null)
    .map((jour) => (jour.etpPlanifie as number) - jour.ajuste.etp_moyen_requis);
  const ecartMoyen = moyenne(ecarts);
  const requisAffiche = arrondir(etpRequis, 1);
  const planifieAffiche = etpPlanifie == null ? null : arrondir(etpPlanifie, 1);
  const ecartAffiche = !avecCouverture || ecartMoyen == null ? null : arrondir(ecartMoyen, 2);
  const couverture = avecCouverture && planifieAffiche != null ? couvertureLigne(planifieAffiche, requisAffiche).couverture : null;
  return {
    periode,
    periodeExcel,
    volumeBrut: jours.reduce((somme, jour) => somme + jour.brut.volume_prevu, 0),
    volumeAjuste: jours.reduce((somme, jour) => somme + jour.ajuste.volume_prevu, 0),
    etpRequis: requisAffiche,
    etpPlanifie: planifieAffiche,
    ecart: ecartAffiche,
    couverture,
    ferie: null,
  };
}

function versPlan(lignes: LignePresentee[], avecCouverture: boolean): Pick<PresentationPlan, 'plan' | 'etpPlanifies' | 'couvertures'> {
  return {
    plan: lignes.map((ligne) => ({
      date: ligne.periode,
      volume_prevu: ligne.volumeAjuste,
      etp_moyen_requis: ligne.etpRequis,
    })),
    etpPlanifies: lignes.map((ligne) => ligne.etpPlanifie),
    couvertures: avecCouverture
      ? lignes.map((ligne) => ({ etpDispo: ligne.etpPlanifie, ecart: ligne.ecart, couverture: ligne.couverture }))
      : null,
  };
}

export function presenterPlan({
  brut,
  ajuste,
  etpPlanifies,
  avecCouverture,
  vue,
  moisFiltre,
  weekendOuvert = null,
  feries = null,
  masquerChomes = false,
}: {
  brut: PlanLigne[];
  ajuste: PlanLigne[];
  etpPlanifies: (number | null)[] | null;
  avecCouverture: boolean;
  vue: VuePlan;
  moisFiltre: string | null;
  weekendOuvert?: OuvertureWeekend | null;
  feries?: Record<string, FerieColonne> | null;
  masquerChomes?: boolean;
}): PresentationPlan {
  const jours: Jour[] = ajuste.map((ligne, index) => ({
    brut: brut[index] ?? ligne,
    ajuste: ligne,
    etpPlanifie: etpPlanifies?.[index] ?? null,
  })).filter((jour) => {
    if (!weekendOuvert) return true;
    const semaine = jourSemaine(jour.ajuste.date);
    if (semaine === 6 && !weekendOuvert.samedi) return false;
    if (semaine === 0 && !weekendOuvert.dimanche) return false;
    return true;
  });
  const mois: MoisFiltrable[] = [];
  const vus = new Set<string>();
  for (const jour of jours) {
    const id = idMois(jour.ajuste.date);
    if (!id || vus.has(id)) continue;
    vus.add(id);
    mois.push({ id, libelle: libelleMois(id) });
  }
  const apresMois = vue === 'journalier' && moisFiltre ? jours.filter((jour) => idMois(jour.ajuste.date) === moisFiltre) : jours;
  const periode = apresMois.length || !moisFiltre ? apresMois : jours;
  const chome = (date: string) => feries?.[date]?.chome === true;
  const source = vue !== 'journalier' || masquerChomes ? periode.filter((jour) => !chome(jour.ajuste.date)) : periode;

  if (vue === 'journalier') {
    const lignes = source.map((jour) => {
      const ecart = avecCouverture && jour.etpPlanifie != null ? arrondir(jour.etpPlanifie - jour.ajuste.etp_moyen_requis, 2) : null;
      const couverture = avecCouverture && jour.etpPlanifie != null
        ? couvertureLigne(jour.etpPlanifie, jour.ajuste.etp_moyen_requis).couverture
        : null;
      return {
        periode: jour.ajuste.date,
        periodeExcel: jour.ajuste.date,
        volumeBrut: jour.brut.volume_prevu,
        volumeAjuste: jour.ajuste.volume_prevu,
        etpRequis: jour.ajuste.etp_moyen_requis,
        etpPlanifie: jour.etpPlanifie,
        ecart,
        couverture,
        ferie: feries?.[jour.ajuste.date] ?? null,
      };
    });
    return { lignes, mois, ...versPlan(lignes, avecCouverture) };
  }

  const groupes = new Map<string, { periode: string; periodeExcel: string; jours: Jour[] }>();
  for (const jour of source) {
    const date = parserJour(jour.ajuste.date);
    const id = idMois(jour.ajuste.date);
    let cle = jour.ajuste.date;
    let periode = jour.ajuste.date;
    let periodeExcel = jour.ajuste.date;
    if (vue === 'hebdo' && date) {
      const iso = semaineIso(date);
      cle = `${iso.annee}-W${String(iso.semaine).padStart(2, '0')}`;
      periode = `S${iso.semaine}/${String(iso.annee).slice(2)}`;
      const court = `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
      periodeExcel = `S${iso.semaine} · ${court}`;
    } else if (vue === 'mensuel' && id) {
      cle = id;
      periode = id;
      periodeExcel = libelleMois(id);
    }
    const courant = groupes.get(cle) ?? { periode, periodeExcel, jours: [] };
    courant.jours.push(jour);
    groupes.set(cle, courant);
  }
  const lignes = [...groupes.values()].map((groupe) => ligneDepuisJours(groupe.periode, groupe.periodeExcel, groupe.jours, avecCouverture));
  return { lignes, mois, ...versPlan(lignes, avecCouverture) };
}
