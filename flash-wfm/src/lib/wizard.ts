import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CibleSkill } from './skills';

export type Horizon = 'court_terme' | 'long_terme';
export type TypeFlux = 'chaud' | 'froid';
export type Etape = 1 | 2 | 3 | 4;
export type StatutEtp = 'vide' | 'valide' | 'passee';

export type PlanLigne = {
  date: string;
  volume_prevu: number;
  etp_moyen_requis: number;
};

export type EtpJour = {
  date: string;
  etp: number;
};

export type LigneCouverture = {
  etpDispo: number | null;
  ecart: number | null;
  couverture: number | null;
};

export type CacheWizard = {
  version: 1;
  userId: string;
  currentStep: Etape;
  etapeMax: Etape;
  fileName: string | null;
  dataPreview: Record<string, unknown>[] | null;
  etpFileName: string | null;
  etpPlanning: EtpJour[] | null;
  etpStatut: StatutEtp;
  typeFlux: TypeFlux;
  heuresOuverture: string;
  aht: string;
  sla: string;
  tempsCible: string;
  shrinkage: string;
  backlog: string;
  delaiSlaJours: string;
  delaiTraitementHeures: string;
  tauxOccupation: string;
  selectedModel: string | null;
  horizon: Horizon;
  plans: Record<Horizon, PlanLigne[] | null>;
  plansParSkill: Record<Horizon, Record<string, PlanLigne[]> | null>;
  ciblesSkills: Record<string, CibleSkill>;
  skillActif: string;
  etpMoyens: string;
  etpMoyensAppliques: number | null;
};

export const CLE_WIZARD = 'flash_wfm_state';
const CLE_ANCIENNE = 'flash-wfm-wizard-v2';

const TEST_DMT = /dmt|aht|dur[ée]e|tmo|temps moyen/i;
const TEST_DATE = /date|jour/i;
const TEST_ETP = /etp|effectif|pr[ée]sent|dispo|planning/i;

function estCleTravail(cle: string) {
  return cle === CLE_WIZARD || cle === CLE_ANCIENNE || cle.startsWith('flash_wfm') || cle.startsWith('flash-wfm');
}

async function lireBrut(): Promise<string | null> {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(CLE_WIZARD) ?? window.localStorage.getItem(CLE_ANCIENNE);
  }
  return (await AsyncStorage.getItem(CLE_WIZARD)) ?? (await AsyncStorage.getItem(CLE_ANCIENNE));
}

export async function cacheDuProprietaire(userId: string): Promise<CacheWizard | null> {
  try {
    const brut = await lireBrut();
    if (!brut) return null;
    const cache = assainirCache(JSON.parse(brut));
    if (!cache || cache.userId !== userId) {
      await purgerDonneesTravail();
      return null;
    }
    return cache;
  } catch {
    await purgerDonneesTravail();
    return null;
  }
}

export async function ecrireCache(cache: CacheWizard) {
  const json = JSON.stringify(cache);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(CLE_WIZARD, json);
    } catch {
      try {
        window.localStorage.setItem(CLE_WIZARD, JSON.stringify({ ...cache, dataPreview: null }));
      } catch {
        /* quota plein : la session en cours reste en mémoire */
      }
    }
    return;
  }
  await AsyncStorage.setItem(CLE_WIZARD, json);
}

export async function purgerDonneesTravail() {
  if (typeof window !== 'undefined' && window.localStorage) {
    const cles: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const cle = window.localStorage.key(index);
      if (cle && estCleTravail(cle)) cles.push(cle);
    }
    cles.forEach((cle) => window.localStorage.removeItem(cle));
  }
  try {
    const cles = await AsyncStorage.getAllKeys();
    const cibles = cles.filter(estCleTravail);
    if (cibles.length) await AsyncStorage.multiRemove(cibles);
  } catch {
    /* le stockage natif peut être indisponible dans le navigateur */
  }
}

export function effacerCache() {
  void purgerDonneesTravail();
}

export function nombre(valeur: unknown): number | null {
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return valeur;
  if (typeof valeur !== 'string') return null;
  const texte = valeur.trim().replace(/\s/g, '').replace(',', '.');
  if (!texte) return null;
  const n = Number(texte);
  return Number.isFinite(n) ? n : null;
}

export function normaliserJour(valeur: unknown): string | null {
  if (valeur == null || valeur === '') return null;
  if (valeur instanceof Date && !Number.isNaN(valeur.getTime())) return formaterJourUtc(valeur);
  if (typeof valeur === 'number' && Number.isFinite(valeur)) return formaterJourUtc(dateDepuisSerieExcel(valeur));
  const texte = String(valeur).trim();
  if (/^-?\d+(\.\d+)?$/.test(texte)) return formaterJourUtc(dateDepuisSerieExcel(Number(texte)));
  const fr = texte.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (fr) {
    const jour = Number(fr[1]);
    const mois = Number(fr[2]);
    const annee = Number(fr[3]);
    if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
    return `${String(jour).padStart(2, '0')}/${String(mois).padStart(2, '0')}/${annee}`;
  }
  const iso = texte.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return null;
  return `${iso[3]}/${iso[2]}/${iso[1]}`;
}

export function historiqueExploitable(lignes: unknown[]): lignes is Record<string, unknown>[] {
  return lignes.length > 0 && lignes.every((row) => {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) return false;
    return Object.keys(row).length >= 2;
  });
}

export function dmtMoyenHistorique(lignes: Record<string, unknown>[]): number | null {
  let somme = 0;
  let poids = 0;
  for (const ligne of lignes) {
    const valeurs = Object.values(ligne);
    const nommee = Object.entries(ligne).find(([cle]) => TEST_DMT.test(cle));
    const dmt = nombre(nommee ? nommee[1] : valeurs[3]);
    if (dmt == null || dmt <= 0) continue;
    const volume = nombre(valeurs[2]);
    const ponderation = volume != null && volume > 0 ? volume : 1;
    somme += dmt * ponderation;
    poids += ponderation;
  }
  if (poids <= 0) return null;
  return Math.round(somme / poids);
}

export function parserPlanningEtp(lignes: Record<string, unknown>[]): EtpJour[] {
  const planning: EtpJour[] = [];
  for (const ligne of lignes) {
    const entrees = Object.entries(ligne);
    const colonneDate = entrees.find(([cle]) => TEST_DATE.test(cle));
    const colonneEtp = entrees.find(([cle]) => TEST_ETP.test(cle));
    const valeurs = Object.values(ligne);
    const date = normaliserJour(colonneDate ? colonneDate[1] : valeurs[0]);
    const etp = nombre(colonneEtp ? colonneEtp[1] : valeurs[1]);
    if (!date || etp == null || etp < 0) continue;
    planning.push({ date, etp });
  }
  return planning;
}

export function etpDispoPourPeriode(periode: string, planning: EtpJour[]): number | null {
  const jour = /^\d{2}\/\d{2}\/\d{4}$/.test(periode);
  const mois = /^\d{2}\/\d{4}$/.test(periode);
  const trouves = planning.filter((ligne) => (jour ? ligne.date === periode : mois ? ligne.date.slice(3) === periode : false));
  if (!trouves.length) return null;
  return trouves.reduce((somme, ligne) => somme + ligne.etp, 0) / trouves.length;
}

export function couvertureLigne(etpDispo: number | null, etpRequis: number): LigneCouverture {
  if (etpDispo == null || !Number.isFinite(etpDispo)) return { etpDispo: null, ecart: null, couverture: null };
  const ecart = etpDispo - etpRequis;
  const couverture = etpRequis === 0 ? null : (etpDispo / etpRequis) * 100;
  return { etpDispo, ecart, couverture };
}

export function planMock(horizon: Horizon, volumesHistoriques: number[]): PlanLigne[] {
  const positifs = volumesHistoriques.filter((volume) => Number.isFinite(volume) && volume > 0);
  const base = positifs.length ? positifs.reduce((somme, volume) => somme + volume, 0) / positifs.length : 900;
  const maintenant = new Date();
  if (horizon === 'court_terme') {
    const debut = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + 1, 1));
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(debut.getTime() + index * 86400000);
      const volume = Math.max(0, Math.round(base * (0.82 + (index % 7) * 0.06)));
      return {
        date: formaterJourUtc(date),
        volume_prevu: volume,
        etp_moyen_requis: Math.max(1, Math.ceil(volume / 140)),
      };
    });
  }
  const debutMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1));
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(debutMois.getUTCFullYear(), debutMois.getUTCMonth() + index, 1));
    const volume = Math.max(0, Math.round(base * 30 * (0.9 + (index % 4) * 0.05)));
    const mois = String(date.getUTCMonth() + 1).padStart(2, '0');
    return {
      date: `${mois}/${date.getUTCFullYear()}`,
      volume_prevu: volume,
      etp_moyen_requis: Math.max(1, Math.ceil(volume / 30 / 140)),
    };
  });
}

export function couverturesDuPlan(
  plan: PlanLigne[],
  planning: EtpJour[] | null,
  etpMoyens: number | null,
): LigneCouverture[] | null {
  if (planning && planning.length > 0) {
    return plan.map((ligne) => couvertureLigne(etpDispoPourPeriode(ligne.date, planning), ligne.etp_moyen_requis));
  }
  if (etpMoyens == null) return null;
  return plan.map((ligne) => couvertureLigne(etpMoyens, ligne.etp_moyen_requis));
}

function dateDepuisSerieExcel(serie: number): Date {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serie) * 86400000);
}

function formaterJourUtc(date: Date): string {
  const jour = String(date.getUTCDate()).padStart(2, '0');
  const mois = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${jour}/${mois}/${date.getUTCFullYear()}`;
}

function estEtape(valeur: unknown): valeur is Etape {
  return valeur === 1 || valeur === 2 || valeur === 3 || valeur === 4;
}

function estPlan(valeur: unknown): valeur is PlanLigne[] {
  return Array.isArray(valeur) && valeur.every((ligne) => {
    if (ligne == null || typeof ligne !== 'object') return false;
    const row = ligne as PlanLigne;
    return typeof row.date === 'string' && typeof row.volume_prevu === 'number' && typeof row.etp_moyen_requis === 'number';
  });
}

function estPlanning(valeur: unknown): valeur is EtpJour[] {
  return Array.isArray(valeur) && valeur.every((ligne) => {
    if (ligne == null || typeof ligne !== 'object') return false;
    const row = ligne as EtpJour;
    return typeof row.date === 'string' && typeof row.etp === 'number' && row.etp >= 0;
  });
}

function texte(valeur: unknown, defaut: string) {
  return typeof valeur === 'string' ? valeur : defaut;
}

function assainirCache(brut: unknown): CacheWizard | null {
  if (brut == null || typeof brut !== 'object') return null;
  const source = brut as Partial<CacheWizard>;
  if (source.version !== 1 || !estEtape(source.currentStep) || !estEtape(source.etapeMax)) return null;
  const dataPreview = Array.isArray(source.dataPreview) && historiqueExploitable(source.dataPreview) ? source.dataPreview : null;
  const plans = {
    court_terme: estPlan(source.plans?.court_terme) ? source.plans.court_terme : null,
    long_terme: estPlan(source.plans?.long_terme) ? source.plans.long_terme : null,
  };
  let currentStep = source.currentStep;
  let etapeMax = source.etapeMax;
  if (currentStep > 1 && !dataPreview && !plans.court_terme && !plans.long_terme) {
    currentStep = 1;
    etapeMax = 1;
  }
  const etpPlanning = estPlanning(source.etpPlanning) ? source.etpPlanning : null;
  const etpStatut: StatutEtp = source.etpStatut === 'valide' && etpPlanning?.length ? 'valide' : source.etpStatut === 'passee' ? 'passee' : 'vide';
  const appliques = typeof source.etpMoyensAppliques === 'number' && Number.isFinite(source.etpMoyensAppliques) && source.etpMoyensAppliques >= 0
    ? source.etpMoyensAppliques
    : null;
  const plansParSkill = lirePlansParSkill(source.plansParSkill);
  return {
    version: 1,
    userId: typeof source.userId === 'string' ? source.userId : '',
    currentStep,
    etapeMax: Math.max(currentStep, etapeMax) as Etape,
    fileName: typeof source.fileName === 'string' ? source.fileName : null,
    dataPreview,
    etpFileName: typeof source.etpFileName === 'string' ? source.etpFileName : null,
    etpPlanning,
    etpStatut,
    typeFlux: source.typeFlux === 'froid' ? 'froid' : 'chaud',
    heuresOuverture: texte(source.heuresOuverture, '8'),
    aht: texte(source.aht, '360'),
    sla: texte(source.sla, '80'),
    tempsCible: texte(source.tempsCible, '20'),
    shrinkage: texte(source.shrinkage, '25'),
    backlog: texte(source.backlog, '0'),
    delaiSlaJours: texte(source.delaiSlaJours, '1'),
    delaiTraitementHeures: texte(
      source.delaiTraitementHeures,
      String((parseInt(texte(source.delaiSlaJours, '1'), 10) || 1) * 24),
    ),
    tauxOccupation: texte(source.tauxOccupation, '85'),
    selectedModel: typeof source.selectedModel === 'string' ? source.selectedModel : null,
    horizon: source.horizon === 'long_terme' ? 'long_terme' : 'court_terme',
    plans,
    plansParSkill,
    ciblesSkills: lireCibles(source.ciblesSkills),
    skillActif: typeof source.skillActif === 'string' && source.skillActif.trim() ? source.skillActif : 'globale',
    etpMoyens: texte(source.etpMoyens, ''),
    etpMoyensAppliques: appliques,
  };
}

function lireCibles(valeur: unknown): Record<string, CibleSkill> {
  if (valeur == null || typeof valeur !== 'object') return {};
  const sortie: Record<string, CibleSkill> = {};
  for (const [cle, item] of Object.entries(valeur)) {
    if (item == null || typeof item !== 'object') continue;
    const row = item as Partial<CibleSkill>;
    if (typeof row.dmt !== 'string' && typeof row.sla !== 'string' && typeof row.etp !== 'string') continue;
    const lire = (champ: keyof CibleSkill, defaut: string) => (typeof row[champ] === 'string' ? row[champ] : defaut);
    const amplitude = lire('amplitude', '8');
    const shrinkage = lire('shrinkage', '25');
    sortie[cle] = {
      etp: lire('etp', ''),
      dmt: lire('dmt', '360'),
      sla: lire('sla', '80'),
      delaiCible: lire('delaiCible', '20'),
      shrinkage,
      occupation: lire('occupation', '85'),
      amplitude,
      delaiTraitement: lire('delaiTraitement', '24'),
      backlog: lire('backlog', '0'),
      heuresTravaillees: lire('heuresTravaillees', String(Math.round((parseFloat(amplitude) || 8) * (1 - (parseFloat(shrinkage) || 0) / 100) * 10) / 10)),
    };
  }
  return sortie;
}

function lirePlansParSkill(valeur: unknown): Record<Horizon, Record<string, PlanLigne[]> | null> {
  const source = valeur != null && typeof valeur === 'object' ? valeur as Partial<Record<Horizon, Record<string, PlanLigne[]>>> : {};
  const lire = (horizon: Horizon) => {
    const paquet = source[horizon];
    if (paquet == null || typeof paquet !== 'object') return null;
    const sortie: Record<string, PlanLigne[]> = {};
    for (const [skill, plan] of Object.entries(paquet)) {
      if (estPlan(plan)) sortie[skill] = plan;
    }
    return Object.keys(sortie).length ? sortie : null;
  };
  return { court_terme: lire('court_terme'), long_terme: lire('long_terme') };
}
