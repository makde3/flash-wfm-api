import { nombre, normaliserJour, type PlanLigne } from './wizard';

export const SKILL_DEFAUT = 'Général';
export const VUE_GLOBALE = 'globale';

export type SkillConfig = {
  etp: string;
  dmt: string;
  sla: string;
  delaiCible: string;
  shrinkage: string;
  occupation: string;
  amplitude: string;
  delaiTraitement: string;
  backlog: string;
  heuresTravaillees: string;
};

export type CibleSkill = SkillConfig;

export type SerieSkill = {
  skill: string;
  lignes: { date: string; volume: number }[];
  dmtMoyen: number | null;
  volumeTotal: number;
};

type LigneBrute = {
  date: string;
  skill: string;
  volume: number;
  dmt: number | null;
};

function sansAccent(valeur: string) {
  return valeur.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function estSkill(cle: string) {
  return /^(skill|file|activite)(s)?(\b.*)?$/.test(sansAccent(cle));
}

function estDate(cle: string) {
  return /date|jour/.test(sansAccent(cle));
}

function estVolume(cle: string) {
  return /volume|appel|contact|ticket/.test(sansAccent(cle));
}

function estDmt(cle: string) {
  return /dmt|aht|duree|tmo|temps moyen/.test(sansAccent(cle));
}

function lireLigne(row: Record<string, unknown>): LigneBrute | null {
  const entrees = Object.entries(row);
  const valeurs = Object.values(row);
  const parNom = (test: (cle: string) => boolean) => entrees.find(([cle]) => test(cle));
  const date = normaliserJour(parNom(estDate)?.[1] ?? valeurs[0]);
  if (!date) return null;
  const dmtNomme = nombre(parNom(estDmt)?.[1]);
  const skillNomme = parNom(estSkill);
  const volumeNomme = parNom(estVolume);
  if (skillNomme) {
    const volume = nombre(volumeNomme?.[1] ?? valeurs[2]);
    if (volume == null || volume < 0) return null;
    const libelle = String(skillNomme[1] ?? '').trim();
    return { date, skill: libelle || SKILL_DEFAUT, volume, dmt: dmtNomme != null && dmtNomme > 0 ? dmtNomme : null };
  }
  if (volumeNomme) {
    const volume = nombre(volumeNomme[1]);
    if (volume == null || volume < 0) return null;
    return { date, skill: SKILL_DEFAUT, volume, dmt: dmtNomme != null && dmtNomme > 0 ? dmtNomme : null };
  }
  const deuxieme = nombre(valeurs[1]);
  const troisieme = nombre(valeurs[2]);
  if (troisieme != null && troisieme >= 0 && deuxieme == null) {
    const libelle = String(valeurs[1] ?? '').trim();
    const dmt = dmtNomme != null && dmtNomme > 0 ? dmtNomme : nombre(valeurs[3]);
    return { date, skill: libelle || SKILL_DEFAUT, volume: troisieme, dmt: dmt != null && dmt > 0 ? dmt : null };
  }
  if (deuxieme != null && deuxieme >= 0) {
    const dmt = dmtNomme != null && dmtNomme > 0 ? dmtNomme : nombre(valeurs[2]);
    return { date, skill: SKILL_DEFAUT, volume: deuxieme, dmt: dmt != null && dmt > 0 ? dmt : null };
  }
  return null;
}

export function analyserHistorique(lignes: Record<string, unknown>[]): SerieSkill[] {
  const groupes = new Map<string, Map<string, { volume: number; dmtSomme: number; dmtPoids: number }>>();
  const ordre: string[] = [];
  for (const row of lignes) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) continue;
    const ligne = lireLigne(row);
    if (!ligne) continue;
    if (!groupes.has(ligne.skill)) {
      groupes.set(ligne.skill, new Map());
      ordre.push(ligne.skill);
    }
    const jours = groupes.get(ligne.skill)!;
    const jour = jours.get(ligne.date) ?? { volume: 0, dmtSomme: 0, dmtPoids: 0 };
    jour.volume += ligne.volume;
    if (ligne.dmt != null) {
      const poids = ligne.volume > 0 ? ligne.volume : 1;
      jour.dmtSomme += ligne.dmt * poids;
      jour.dmtPoids += poids;
    }
    jours.set(ligne.date, jour);
  }
  return ordre.map((skill) => {
    const jours = [...(groupes.get(skill)?.entries() ?? [])];
    let dmtSomme = 0;
    let dmtPoids = 0;
    let volumeTotal = 0;
    const series = jours.map(([date, jour]) => {
      volumeTotal += jour.volume;
      dmtSomme += jour.dmtSomme;
      dmtPoids += jour.dmtPoids;
      return { date, volume: jour.volume };
    });
    return {
      skill,
      lignes: series,
      dmtMoyen: dmtPoids > 0 ? Math.round(dmtSomme / dmtPoids) : null,
      volumeTotal,
    };
  });
}

export function consoliderPlans(plans: PlanLigne[][]): PlanLigne[] {
  const ordre: string[] = [];
  const acc = new Map<string, { volume: number; etp: number }>();
  for (const plan of plans) {
    for (const ligne of plan) {
      if (!acc.has(ligne.date)) {
        ordre.push(ligne.date);
        acc.set(ligne.date, { volume: 0, etp: 0 });
      }
      const cellule = acc.get(ligne.date)!;
      cellule.volume += ligne.volume_prevu;
      cellule.etp += ligne.etp_moyen_requis;
    }
  }
  return ordre.map((date) => {
    const cellule = acc.get(date)!;
    return { date, volume_prevu: cellule.volume, etp_moyen_requis: cellule.etp };
  });
}

export function wapePondere(entrees: { wape: number | null; volume: number }[]): number | null {
  let somme = 0;
  let poids = 0;
  for (const entree of entrees) {
    if (entree.wape == null || !Number.isFinite(entree.wape) || entree.volume <= 0) continue;
    somme += entree.wape * entree.volume;
    poids += entree.volume;
  }
  if (poids <= 0) return null;
  return Math.round((somme / poids) * 10) / 10;
}

export function vueDesPlans<T extends { plan: PlanLigne[]; wape: number | null }>(
  paquet: Record<string, T> | null,
  skill: string,
): { plan: PlanLigne[]; wape: number | null } | null {
  if (!paquet) return null;
  const valeurs = Object.values(paquet);
  if (!valeurs.length) return null;
  if (skill !== VUE_GLOBALE) {
    const cible = paquet[skill];
    return cible ? { plan: cible.plan, wape: cible.wape } : null;
  }
  return {
    plan: consoliderPlans(valeurs.map((item) => item.plan)),
    wape: wapePondere(valeurs.map((item) => ({
      wape: item.wape,
      volume: item.plan.reduce((somme, ligne) => somme + ligne.volume_prevu, 0),
    }))),
  };
}

export function dmtPondere(series: SerieSkill[]): number | null {
  let somme = 0;
  let poids = 0;
  for (const serie of series) {
    if (serie.dmtMoyen == null || serie.volumeTotal <= 0) continue;
    somme += serie.dmtMoyen * serie.volumeTotal;
    poids += serie.volumeTotal;
  }
  return poids > 0 ? Math.round(somme / poids) : null;
}

export function libellePerimetre(skill: string) {
  return skill === VUE_GLOBALE ? 'Vue globale (toutes les files)' : skill;
}

export function heuresTravailleesParDefaut(amplitude: string, shrinkage: string) {
  const heures = parseFloat(amplitude.replace(',', '.'));
  const perte = parseFloat(shrinkage.replace(',', '.'));
  const base = Number.isFinite(heures) && heures > 0 ? heures : 8;
  const taux = Number.isFinite(perte) ? perte : 25;
  return String(Math.round(base * (1 - taux / 100) * 10) / 10);
}

export function configSkill(
  dmtHistorique: number | null,
  socle: { dmt: string; sla: string; delaiCible: string; shrinkage: string; occupation: string; amplitude: string; delaiTraitement: string; backlog: string },
): SkillConfig {
  const dmt = dmtHistorique != null ? String(dmtHistorique) : socle.dmt || '360';
  const shrinkage = socle.shrinkage || '25';
  const amplitude = socle.amplitude || '8';
  return {
    etp: '',
    dmt,
    sla: socle.sla || '80',
    delaiCible: socle.delaiCible || '20',
    shrinkage,
    occupation: socle.occupation || '85',
    amplitude,
    delaiTraitement: socle.delaiTraitement || '24',
    backlog: socle.backlog || '0',
    heuresTravaillees: heuresTravailleesParDefaut(amplitude, shrinkage),
  };
}

export function payloadSkillConfigs(configs: Record<string, SkillConfig>) {
  const sortie: Record<string, Record<string, number | null>> = {};
  for (const [skill, cfg] of Object.entries(configs)) {
    sortie[skill] = {
      dmt: nombre(cfg.dmt),
      sla: nombre(cfg.sla),
      delai_cible: nombre(cfg.delaiCible),
      shrinkage: nombre(cfg.shrinkage),
      occupation: nombre(cfg.occupation),
      amplitude: nombre(cfg.amplitude),
      delai_traitement: nombre(cfg.delaiTraitement),
      backlog: nombre(cfg.backlog),
      heures_travaillees: nombre(cfg.heuresTravaillees),
      etp: nombre(cfg.etp),
    };
  }
  return sortie;
}

export function moyennePonderee(
  series: SerieSkill[],
  cibles: Record<string, CibleSkill>,
  volumes: Record<string, number>,
  champ: 'dmt' | 'sla' | 'shrinkage' | 'delaiCible' | 'occupation' | 'amplitude' | 'delaiTraitement' | 'heuresTravaillees',
): number | null {
  let somme = 0;
  let poids = 0;
  for (const serie of series) {
    const valeur = nombre(cibles[serie.skill]?.[champ] ?? '');
    const volume = volumes[serie.skill] ?? serie.volumeTotal;
    if (valeur == null || volume <= 0) continue;
    somme += valeur * volume;
    poids += volume;
  }
  if (poids <= 0) return null;
  const entier = champ === 'dmt' || champ === 'sla' || champ === 'delaiCible' || champ === 'shrinkage' || champ === 'occupation';
  return entier ? Math.round(somme / poids) : Math.round((somme / poids) * 10) / 10;
}
