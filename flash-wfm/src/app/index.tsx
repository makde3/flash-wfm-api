import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform, ScrollView, TextInput, ActivityIndicator, Linking, Modal, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import * as XLSXStyle from 'xlsx-js-style';
import CombinedChart from '../components/CombinedChart';
import SelecteurSkill from '../components/SelecteurSkill';
import SyntheseExecutive, { type ResultatModele } from '../components/SyntheseExecutive';
import { useAuth } from '../context/AuthContext';
import { LienReinitialisation } from '../lib/session';
import { deconnecter } from '../lib/deconnexion';
import { supabase } from '../lib/supabase';
import { envoyerRetour, TYPES_RETOUR, type TypeRetour } from '../lib/feedback';
import { envoyerDemandePro, lienStripePro } from '../lib/proRequest';
import PiedLegal from '../components/PiedLegal';
import { historiqueExemple, lignesModele } from '../lib/exempleHistorique';
import { appliquerAjustements, periodesAjustables, pourcentagePeriode, saisiePourcentageValide } from '../lib/ajustements';
import {
  SKILL_DEFAUT,
  VUE_GLOBALE,
  analyserHistorique,
  configSkill,
  consoliderPlans,
  dmtPondere,
  heuresTravailleesParDefaut,
  libellePerimetre,
  moyennePonderee,
  payloadSkillConfigs,
  vueDesPlans,
  type SerieSkill,
  type SkillConfig,
} from '../lib/skills';
import { marquerNouveautesVues, marquerTourVu, nouveautesDejaVues, tourDejaVu } from '../lib/nouveautes';
import { ETAPES_GUIDE, lancerTourDriver } from '../lib/tourGuide';
import { enregistrerLienEtp, enregistrerLienSource, lireLiensProfil } from '../lib/sourceProfil';
import { enregistrerResetWizard } from '../lib/wizardStore';
import { useInstallationPwa } from '../lib/installationPwa';
import {
  couverturesDuPlan,
  ecrireCache,
  cacheDuProprietaire,
  nombre,
  parserPlanningEtp,
  planMock,
  purgerDonneesTravail,
  type CacheWizard,
  type Etape,
  type EtpJour,
  type Horizon,
  type LigneCouverture,
  type PlanLigne,
  type StatutEtp,
  type TypeFlux,
} from '../lib/wizard';

const MESSAGE_HISTORIQUE = 'Format invalide. Colonnes attendues : Date et Volume. Une colonne Skill, File ou Activité est optionnelle. La DMT peut occuper une colonne dédiée.';

const API_BASE = __DEV__ && Platform.OS === 'web'
  ? 'http://127.0.0.1:8000'
  : Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'
    : 'https://flash-wfm-api.onrender.com';
const ETAPES: { id: Etape; titre: string }[] = [
  { id: 1, titre: 'Historique' },
  { id: 2, titre: 'ETP réels' },
  { id: 3, titre: 'Dimensionnement' },
  { id: 4, titre: 'Restitution' },
];

type PlansSkills = Record<Horizon, Record<string, PlanLigne[]> | null>;
type PaquetModele = Record<string, ResultatModele>;

function plansVides(): Record<Horizon, PlanLigne[] | null> {
  return { court_terme: null, long_terme: null };
}

function plansSkillsVides(): PlansSkills {
  return { court_terme: null, long_terme: null };
}

function skillAffiche(skill: string, multi: boolean, series: SerieSkill[]) {
  return multi && skill !== VUE_GLOBALE && series.some((serie) => serie.skill === skill) ? skill : VUE_GLOBALE;
}

function planDuSkill(
  skill: string,
  plansParSkill: PlansSkills,
  plans: Record<Horizon, PlanLigne[] | null>,
  horizon: Horizon,
) {
  const paquet = plansParSkill[horizon];
  if (paquet) {
    if (skill === VUE_GLOBALE) return consoliderPlans(Object.values(paquet));
    return paquet[skill] ?? null;
  }
  return plans[horizon];
}

function etpSaisiDuSkill(
  skill: string,
  multi: boolean,
  series: SerieSkill[],
  ciblesSkills: Record<string, SkillConfig>,
  etpMoyensAppliques: number | null,
) {
  const lire = (nom: string) => {
    const lu = nombre(ciblesSkills[nom]?.etp ?? '');
    return lu != null && lu >= 0 ? lu : null;
  };
  if (!multi) return etpMoyensAppliques;
  if (skill !== VUE_GLOBALE) return lire(skill);
  const valeurs = series.map((serie) => lire(serie.skill)).filter((valeur): valeur is number => valeur != null);
  if (!valeurs.length) return etpMoyensAppliques;
  return valeurs.reduce((somme, valeur) => somme + valeur, 0);
}

function ciblesDuSkill(
  skill: string,
  multi: boolean,
  series: SerieSkill[],
  ciblesSkills: Record<string, SkillConfig>,
  plansParSkill: PlansSkills,
  horizon: Horizon,
  socle: { aht: string; sla: string; shrinkage: string; tempsCible: string; tauxOccupation: string; heuresOuverture: string; delaiTraitementHeures: string },
) {
  const secours = {
    dmt: socle.aht || '360',
    sla: socle.sla || '80',
    shrinkage: socle.shrinkage || '25',
    delaiCible: socle.tempsCible || '20',
    occupation: socle.tauxOccupation || '85',
    amplitude: socle.heuresOuverture || '8',
    delaiTraitement: socle.delaiTraitementHeures || '24',
    heuresTravaillees: heuresTravailleesParDefaut(socle.heuresOuverture || '8', socle.shrinkage || '25'),
  };
  const lireConfig = (cible: SkillConfig | undefined) => ({
    dmt: cible?.dmt || secours.dmt,
    sla: cible?.sla || secours.sla,
    shrinkage: cible?.shrinkage || secours.shrinkage,
    delaiCible: cible?.delaiCible || secours.delaiCible,
    occupation: cible?.occupation || secours.occupation,
    amplitude: cible?.amplitude || secours.amplitude,
    delaiTraitement: cible?.delaiTraitement || secours.delaiTraitement,
    heuresTravaillees: cible?.heuresTravaillees || secours.heuresTravaillees,
  });
  const skillCible = !multi ? (series[0]?.skill ?? SKILL_DEFAUT) : (skill === VUE_GLOBALE ? null : skill);
  if (skillCible) return lireConfig(ciblesSkills[skillCible]);
  const paquet = plansParSkill[horizon];
  const volumes: Record<string, number> = {};
  for (const serie of series) {
    volumes[serie.skill] = (paquet?.[serie.skill] ?? []).reduce((somme, ligne) => somme + ligne.volume_prevu, 0) || serie.volumeTotal;
  }
  const lire = (champ: 'dmt' | 'sla' | 'shrinkage' | 'delaiCible' | 'occupation' | 'amplitude' | 'delaiTraitement' | 'heuresTravaillees') => {
    const valeur = moyennePonderee(series, ciblesSkills, volumes, champ);
    return valeur == null ? secours[champ] : String(valeur);
  };
  return {
    dmt: lire('dmt'),
    sla: lire('sla'),
    shrinkage: lire('shrinkage'),
    delaiCible: lire('delaiCible'),
    occupation: lire('occupation'),
    amplitude: lire('amplitude'),
    delaiTraitement: lire('delaiTraitement'),
    heuresTravaillees: lire('heuresTravaillees'),
  };
}

function etpDispoMoyenDe(planningVue: boolean, couvertures: LigneCouverture[] | null, etpSaisie: number | null) {
  if (planningVue && couvertures) {
    const valeurs = couvertures.map((ligne) => ligne.etpDispo).filter((valeur): valeur is number => valeur != null);
    const moy = moyenne(valeurs);
    if (moy != null) return moy;
  }
  if (!planningVue && etpSaisie != null) return etpSaisie;
  return null;
}

const AJUSTEMENTS_VIDES: Record<string, string> = {};

const MODES_PREVISION: { id: 'Auto' | 'LightGBM' | 'Holt-Winters' | 'Hybride'; titre: string; sous?: string }[] = [
  { id: 'Auto', titre: 'Auto (Recommandé)' },
  { id: 'LightGBM', titre: 'IA & Machine Learning' },
  { id: 'Holt-Winters', titre: 'Saisonnalité & Tendances' },
  { id: 'Hybride', titre: 'Modèle Hybride (Consensus)', sous: 'Fusion des modèles pour lisser les pics et réduire les risques.' },
];

function libelleModele(modele: string | null) {
  return MODES_PREVISION.find((mode) => mode.id === modele)?.titre ?? '';
}

function modeleConnu(modele: string | null): modele is 'Auto' | 'LightGBM' | 'Holt-Winters' | 'Hybride' {
  return MODES_PREVISION.some((mode) => mode.id === modele);
}

function retenirMeilleur(holt: ResultatModele | undefined, light: ResultatModele | undefined): PlanLigne[] {
  if (!holt) return light?.plan ?? [];
  if (!light) return holt.plan;
  if (holt.wape == null && light.wape == null) return holt.plan;
  if (holt.wape == null) return light.plan;
  if (light.wape == null) return holt.plan;
  return light.wape < holt.wape ? light.plan : holt.plan;
}

function poidsConsensus(wapeHolt: number | null, wapeLight: number | null) {
  if (wapeHolt == null || wapeLight == null) return [0.5, 0.5];
  const holt = 1 / Math.max(wapeHolt, 0.1);
  const light = 1 / Math.max(wapeLight, 0.1);
  const somme = holt + light;
  return [holt / somme, light / somme];
}

function fusionnerLignes(holt: PlanLigne[], light: PlanLigne[], poidsHolt: number, poidsLight: number): PlanLigne[] {
  const holtParDate = new Map(holt.map((ligne) => [ligne.date, ligne]));
  const lightParDate = new Map(light.map((ligne) => [ligne.date, ligne]));
  const ordre = [...holt.map((ligne) => ligne.date)];
  for (const ligne of light) {
    if (!holtParDate.has(ligne.date)) ordre.push(ligne.date);
  }
  return ordre.map((date) => {
    const ligneHolt = holtParDate.get(date);
    const ligneLight = lightParDate.get(date);
    if (!ligneLight) return ligneHolt!;
    if (!ligneHolt) return ligneLight;
    return {
      date,
      volume_prevu: Math.max(0, Math.round(ligneHolt.volume_prevu * poidsHolt + ligneLight.volume_prevu * poidsLight)),
      etp_moyen_requis: Math.max(0, Math.round((ligneHolt.etp_moyen_requis * poidsHolt + ligneLight.etp_moyen_requis * poidsLight) * 10) / 10),
    };
  });
}

function composerPlans(mode: 'Auto' | 'Hybride', holt: PaquetModele, light: PaquetModele): Record<string, PlanLigne[]> {
  const skills = new Set([...Object.keys(holt), ...Object.keys(light)]);
  const plans: Record<string, PlanLigne[]> = {};
  for (const skill of skills) {
    const serieHolt = holt[skill];
    const serieLight = light[skill];
    if (mode === 'Auto') {
      plans[skill] = retenirMeilleur(serieHolt, serieLight);
      continue;
    }
    const [poidsHolt, poidsLight] = poidsConsensus(serieHolt?.wape ?? null, serieLight?.wape ?? null);
    plans[skill] = fusionnerLignes(serieHolt?.plan ?? [], serieLight?.plan ?? [], poidsHolt, poidsLight);
  }
  return plans;
}

function dateCourte(date: string) {
  const jour = date.match(/^(\d{2}\/\d{2})\/\d{4}$/);
  if (jour) return jour[1];
  const mois = date.match(/^(\d{2})\/(\d{4})$/);
  if (mois) return `${mois[1]}/${mois[2].slice(2)}`;
  return date;
}

function texteEcart(valeur: number | null) {
  if (valeur == null || !Number.isFinite(valeur)) return '—';
  const signe = valeur > 0 ? '+' : '';
  return signe + valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function texteCouverture(valeur: number | null) {
  if (valeur == null || !Number.isFinite(valeur)) return '—';
  return `${valeur.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function couleurEcart(valeur: number | null) {
  if (valeur == null || valeur === 0) return '#0F2D46';
  return valeur < 0 ? '#A33B32' : '#1F7A4D';
}

function teinteCouverture(valeur: number | null): 'ok' | 'bas' | 'haut' | 'vide' {
  if (valeur == null || !Number.isFinite(valeur)) return 'vide';
  if (valeur < 95) return 'bas';
  if (valeur > 105) return 'haut';
  return 'ok';
}

function couleurCouverture(valeur: number | null) {
  const teinte = teinteCouverture(valeur);
  if (teinte === 'bas') return '#B91C1C';
  if (teinte === 'haut') return '#C2410C';
  if (teinte === 'ok') return '#15803D';
  return '#0F2D46';
}

function libelleCouverture(valeur: number | null) {
  const teinte = teinteCouverture(valeur);
  if (teinte === 'bas') return '< 95 %';
  if (teinte === 'haut') return '> 105 %';
  if (teinte === 'ok') return '95–105 %';
  return '';
}

const POINTS_NOUVEAUTES: { icone: React.ComponentProps<typeof Ionicons>['name']; titre: string; texte: string }[] = [
  { icone: 'bar-chart-outline', titre: 'Synthèse & Export Excel : ', texte: 'Comparez les modèles (IA vs Saisonnalité) et téléchargez la fiche A4 (.xlsx) en 1 clic.' },
  { icone: 'flash-outline', titre: 'Flux Chaud vs Froid : ', texte: 'Adaptabilité automatique des paramètres et delais cibles (20s vs 24h) selon le canal.' },
  { icone: 'bulb-outline', titre: 'Tunnel Épuré : ', texte: 'Saisie d\'ETP moyen directement sous le plan de prod pour simplifier le parcours.' },
  { icone: 'chatbubble-ellipses-outline', titre: 'Bouton Feedback : ', texte: 'Transmettez vos retours ou signalez un bug directement depuis le header.' },
];

function ModaleNouveautes({ visible, onFermer }: { visible: boolean; onFermer: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <View style={styles.nouveauteVoile}>
        <View style={styles.nouveaute}>
          <Text style={styles.nouveauteTitre}>Quoi de neuf dans Flash WFM ?</Text>
          {POINTS_NOUVEAUTES.map((point) => (
            <View key={point.titre} style={styles.nouveautePoint}>
              <Ionicons name={point.icone} size={15} color="#1E293B" />
              <Text style={styles.nouveauteTexte} numberOfLines={1}>
                <Text style={styles.nouveauteFort}>{point.titre}</Text>
                {point.texte}
              </Text>
            </View>
          ))}
          <TouchableOpacity style={styles.nouveauteBtn} onPress={onFermer}>
            <Text style={styles.nouveauteBtnTexte}>C'est parti !</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ModaleFeedback({
  visible,
  type,
  message,
  envoi,
  onType,
  onMessage,
  onFermer,
  onEnvoyer,
}: {
  visible: boolean;
  type: TypeRetour;
  message: string;
  envoi: boolean;
  onType: (type: TypeRetour) => void;
  onMessage: (valeur: string) => void;
  onFermer: () => void;
  onEnvoyer: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <View style={styles.voile}>
        <View style={styles.modale}>
          <Text style={styles.modaleTitre}>Une idée ? / Feedback</Text>
          <Text style={styles.modaleLead}>Dites-nous ce qui vous aiderait, ou ce qui bloque.</Text>
          <View style={styles.puces}>
            {TYPES_RETOUR.map((option) => {
              const actif = option === type;
              return (
                <TouchableOpacity key={option} style={[styles.puce, actif && styles.puceActive]} onPress={() => onType(option)} disabled={envoi}>
                  <Text style={[styles.puceTexte, actif && styles.puceTexteActif]}>{option}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.feedbackSaisie}
            value={message}
            onChangeText={onMessage}
            placeholder="Votre retour"
            placeholderTextColor="#94A3B8"
            multiline
            editable={!envoi}
            maxLength={4000}
          />
          <TouchableOpacity style={[styles.uploadBtn, envoi && styles.generateBtnDisabled]} onPress={onEnvoyer} disabled={envoi}>
            {envoi ? <ActivityIndicator color="#0F2D46" /> : <Text style={styles.uploadBtnText}>Envoyer mon retour</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.modaleFermer} onPress={onFermer} disabled={envoi}>
            <Text style={styles.resetText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const AVANTAGES_PRO = [
  { titre: 'Planning ETP réels', detail: 'Comparez le besoin calculé aux effectifs réellement présents, jour par jour.' },
  { titre: 'Exports Excel & PowerPoint', detail: 'Emportez le plan de production et la synthèse exécutive pour les revues d’équipe.' },
  { titre: 'Ajustements événementiels métier', detail: 'Intégrez soldes, campagnes ou incidents dans la prévision de volumes.' },
];

function ModalePro({ visible, onFermer }: { visible: boolean; onFermer: () => void }) {
  const lienStripe = lienStripePro();
  const [email, setEmail] = useState('');
  const [entreprise, setEntreprise] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [confirme, setConfirme] = useState(false);
  const [paiementOuvert, setPaiementOuvert] = useState(false);

  useEffect(() => {
    if (!visible) {
      setErreur('');
      setConfirme(false);
      setEnvoi(false);
      setPaiementOuvert(false);
      return;
    }
    let actif = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!actif) return;
      const adresse = data.user?.email ?? '';
      setEmail((actuel) => actuel || adresse);
    });
    return () => {
      actif = false;
    };
  }, [visible]);

  const activer = () => {
    if (lienStripe) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const onglet = window.open(lienStripe, '_blank', 'noopener,noreferrer');
        if (!onglet) {
          setErreur('Le navigateur a bloqué le nouvel onglet. Autorisez les pop-ups pour ouvrir le paiement.');
          setPaiementOuvert(false);
          return;
        }
      } else {
        void Linking.openURL(lienStripe);
      }
      setErreur('');
      setPaiementOuvert(true);
      return;
    }
    if (envoi || confirme) return;
    setEnvoi(true);
    setErreur('');
    void envoyerDemandePro(email, entreprise)
      .then(() => setConfirme(true))
      .catch((error: unknown) => {
        setErreur(error instanceof Error ? error.message : "Impossible d'enregistrer la demande. Réessayez dans un instant.");
      })
      .finally(() => setEnvoi(false));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!envoi) onFermer(); }}>
      <View style={styles.voile}>
        <View style={styles.modale}>
          <ScrollView style={styles.modaleScroll} contentContainerStyle={styles.modaleScrollContenu} keyboardShouldPersistTaps="handled">
            <Text style={styles.modaleTitre}>Passer en Pro</Text>
            <Text style={styles.modaleLead}>Flash WFM Pro débloque le pilotage au plus près du terrain.</Text>
            {AVANTAGES_PRO.map((avantage) => (
              <View key={avantage.titre} style={styles.modalePoint}>
                <Text style={styles.modalePuce}>•</Text>
                <View style={styles.modalePointCorps}>
                  <Text style={styles.modalePointTitre}>{avantage.titre}</Text>
                  <Text style={styles.modaleLead}>{avantage.detail}</Text>
                </View>
              </View>
            ))}
            {lienStripe ? null : confirme ? (
              <View style={styles.proConfirmation}>
                <Text style={styles.proConfirmationTexte}>Demande enregistrée. MakConsult a bien reçu votre e-mail professionnel et le nom de votre entreprise. L’accès Pro sera activé après traitement.</Text>
              </View>
            ) : (
              <View style={styles.proForm}>
                <View style={styles.proChamp}>
                  <Text style={styles.proLabel}>E-mail professionnel</Text>
                  <TextInput
                    style={styles.proInput}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    placeholder="prenom.nom@entreprise.com"
                    placeholderTextColor="#94A3B8"
                    editable={!envoi}
                  />
                </View>
                <View style={styles.proChamp}>
                  <Text style={styles.proLabel}>Entreprise</Text>
                  <TextInput
                    style={styles.proInput}
                    value={entreprise}
                    onChangeText={setEntreprise}
                    placeholder="Nom de l'entreprise"
                    placeholderTextColor="#94A3B8"
                    editable={!envoi}
                    maxLength={200}
                  />
                </View>
              </View>
            )}
            {erreur ? <Text style={styles.proErreur}>{erreur}</Text> : null}
            {paiementOuvert ? <Text style={styles.modaleLead}>Le paiement s’est ouvert dans un nouvel onglet.</Text> : null}
            {lienStripe && !paiementOuvert ? <Text style={styles.modaleLead}>Le paiement s’ouvre dans un nouvel onglet.</Text> : null}
            {confirme ? null : (
              <TouchableOpacity style={[styles.uploadBtn, envoi && styles.generateBtnDisabled]} onPress={activer} disabled={envoi}>
                {envoi ? <ActivityIndicator color="#0F2D46" /> : <Text style={styles.uploadBtnText}>Activer mon accès Pro</Text>}
              </TouchableOpacity>
            )}
            {!lienStripe && !confirme ? <Text style={styles.modaleLead}>Dès l’envoi, la demande est enregistrée et confirmée à l’écran.</Text> : null}
            <TouchableOpacity style={styles.modaleFermer} onPress={onFermer} disabled={envoi}>
              <Text style={styles.resetText}>Fermer</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ModaleInstallation({ visible, onFermer }: { visible: boolean; onFermer: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <View style={styles.voile}>
        <View style={styles.modale}>
          <Ionicons name="share-outline" size={28} color="#0F2D46" />
          <Text style={styles.modaleTitre}>Installer sur l'écran d'accueil</Text>
          <Text style={styles.modaleLead}>Sur iPhone et iPad, Safari n'ouvre pas de fenêtre d'installation. Ajoutez Flash WFM à la main :</Text>
          <Text style={styles.installEtape}>1. Touchez l'icône Partager (le carré avec la flèche).</Text>
          <Text style={styles.installEtape}>2. Faites défiler, puis touchez « Sur l'écran d'accueil ».</Text>
          <Text style={styles.installEtape}>3. Confirmez avec « Ajouter ».</Text>
          <TouchableOpacity style={styles.modaleFermer} onPress={onFermer}>
            <Text style={styles.resetText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function HeaderLogo({
  abonnementActif,
  paiementEnCours,
  onAbonnement,
  onPasserPro,
  onReinitialiser,
  onFeedback,
}: {
  abonnementActif: boolean;
  paiementEnCours: boolean;
  onAbonnement: () => void;
  onPasserPro: () => void;
  onReinitialiser: () => void;
  onFeedback: () => void;
}) {
  const { isPro } = useAuth();
  const installation = useInstallationPwa();
  const { width } = useWindowDimensions();
  const etroit = width < 760;
  return (
    <View style={styles.headerContainer}>
      <View style={[styles.headerBrand, etroit && styles.headerBrandEtroit]}>
        <View style={styles.logoBadge}>
          <Ionicons name="flash" size={28} color="#F4C430" />
        </View>
        <View style={styles.headerTextContainer}>
          <Text style={[styles.brandTitle, etroit && styles.brandTitleEtroit]}>
            FLASH <Text style={styles.brandTitleSub}>WFM</Text>
          </Text>
          <Text style={styles.brandByline}>by MakConsult</Text>
          <Text style={styles.brandSubtitle}>DATA · MÉTIER · PERFORMANCE</Text>
        </View>
      </View>
      <View style={[styles.headerActions, etroit && styles.headerActionsEtroit]}>
        {!isPro ? (
          <TouchableOpacity style={styles.proHeaderBtn} onPress={onPasserPro}>
            <Ionicons name="flash" size={16} color="#0F2D46" />
            <Text style={styles.proHeaderTexte}>Passer en Pro</Text>
          </TouchableOpacity>
        ) : null}
        {installation.visible ? (
          <TouchableOpacity style={styles.installBtn} onPress={installation.installer}>
            <Ionicons name="phone-portrait-outline" size={16} color="#0F2D46" />
            <Text style={styles.installBtnTexte}>Installer l'app</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.resetBtn} onPress={onFeedback}>
          <Text style={styles.resetText}>Une idée ? / Feedback</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetBtn} onPress={onReinitialiser}>
          <Text style={styles.resetText}>Réinitialiser</Text>
        </TouchableOpacity>
        {abonnementActif ? (
          <TouchableOpacity style={[styles.logoutBtn, paiementEnCours && styles.generateBtnDisabled]} onPress={onAbonnement} disabled={paiementEnCours}>
            <Text style={styles.logoutText} numberOfLines={1}>
              {paiementEnCours ? 'Connexion au serveur...' : 'Gérer mon abonnement'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {__DEV__ && (
          <View style={[styles.devBadge, isPro ? styles.devBadgePro : styles.devBadgeFree]}>
            <Text style={styles.devBadgeText}>{isPro ? 'DEV : PRO' : 'DEV : FREE'}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.logoutBtn} onPress={() => { void deconnecter(); }}>
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>
      </View>
      <ModaleInstallation visible={installation.aideIos} onFermer={installation.fermerAide} />
    </View>
  );
}

function ChampParam({ label, info, value, onChangeText, dense }: { label: string; info: string; value: string; onChangeText: (texte: string) => void; dense?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <View style={[styles.paramField, dense && styles.paramFieldDense, ouvert && styles.paramFieldOuvert]}>
      <View style={styles.labelRow}>
        <Text style={[styles.labelInline, dense && styles.labelDense]} numberOfLines={dense ? 2 : 1}>{label}</Text>
        <TouchableOpacity
          accessibilityLabel={info}
          accessibilityRole="button"
          onPress={() => setOuvert((actuel) => !actuel)}
          {...(Platform.OS === 'web' ? { onMouseEnter: () => setOuvert(true), onMouseLeave: () => setOuvert(false) } : {})}
          style={styles.infoIcon}
        >
          <Ionicons name="help-circle-outline" size={16} color="#687581" />
        </TouchableOpacity>
      </View>
      {ouvert ? (
        <View style={styles.bulle}>
          <Text style={styles.bulleTexte}>{info}</Text>
        </View>
      ) : null}
      <TextInput style={[styles.paramInput, dense && styles.paramInputDense]} value={value} onChangeText={onChangeText} keyboardType="numeric" />
    </View>
  );
}

function TourGuide({ index, onSuivant, onPasser }: { index: number; onSuivant: () => void; onPasser: () => void }) {
  const etape = ETAPES_GUIDE[index];
  if (!etape) return null;
  const dernier = index === ETAPES_GUIDE.length - 1;
  return (
    <View style={styles.tourDock} pointerEvents="box-none">
      <View style={styles.tourCarte}>
        <Text style={styles.tourKicker}>Visite guidée · {index + 1}/{ETAPES_GUIDE.length}</Text>
        <Text style={styles.tourTitre}>{etape.titre}</Text>
        <Text style={styles.tourTexte}>{etape.texte}</Text>
        <View style={styles.tourActions}>
          <TouchableOpacity onPress={onPasser}>
            <Text style={styles.tourPasser}>Passer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tourSuivant} onPress={onSuivant}>
            <Text style={styles.tourSuivantTexte}>{dernier ? 'Terminer' : 'Suivant'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function telechargerModele() {
  if (Platform.OS !== 'web') {
    alert("Veuillez ouvrir l'application depuis un navigateur web pour télécharger le fichier Excel.");
    return;
  }
  const feuille = XLSX.utils.aoa_to_sheet(lignesModele());
  feuille['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 10 }];
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'Historique');
  XLSX.writeFile(classeur, 'Flash-WFM-modele-historique.xlsx');
}

function telechargerModeleEtp() {
  if (Platform.OS !== 'web') {
    alert("Veuillez ouvrir l'application depuis un navigateur web pour télécharger le fichier Excel.");
    return;
  }
  const feuille = XLSX.utils.aoa_to_sheet([
    ['Date', 'ETP'],
    ['06/10/2026', 12],
    ['07/10/2026', 11.5],
  ]);
  feuille['!cols'] = [{ wch: 14 }, { wch: 10 }];
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, 'ETP');
  XLSX.writeFile(classeur, 'Flash-WFM-modele-etp.xlsx');
}

const TITRES_COMPACTS: Record<Etape, string> = { 1: 'Historique', 2: 'ETP', 3: 'Flux', 4: 'Résultat' };

function Stepper({ etape, etapeMax, peutOuvrir, onAller }: { etape: Etape; etapeMax: Etape; peutOuvrir: (id: Etape) => boolean; onAller: (id: Etape) => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  return (
    <View style={styles.stepper}>
      {ETAPES.map((item) => {
        const actif = item.id === etape;
        const fait = item.id < etape || (item.id <= etapeMax && !actif);
        const ouvert = peutOuvrir(item.id);
        return (
          <TouchableOpacity key={item.id} style={styles.stepItem} disabled={!ouvert || actif} onPress={() => onAller(item.id)}>
            <View style={[styles.stepDot, fait && styles.stepDotDone, actif && styles.stepDotOn]}>
              {fait && !actif ? (
                <Ionicons name="checkmark" size={16} color="#0F2D46" />
              ) : (
                <Text style={[styles.stepNum, actif && styles.stepNumOn]}>{item.id}</Text>
              )}
            </View>
            <Text style={[styles.stepCaption, actif && styles.stepCaptionOn]}>{compact ? TITRES_COMPACTS[item.id] : item.titre}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

type CellulePlan = { key: string; texte: string; couleur?: string; fort?: boolean };
type LignePlan = { libelle: string; alt: boolean; cellules: CellulePlan[] };

const FOND_LIGNE = '#FFFFFF';
const FOND_LIGNE_ALT = '#F8FAFC';
const FOND_ENTETE = '#0F172A';

const styleDefilement: CSSProperties = {
  width: '100%',
  overflowX: 'auto',
};

const styleTable: CSSProperties = {
  borderCollapse: 'collapse',
  whiteSpace: 'nowrap',
  width: 'max-content',
  minWidth: '100%',
};

const styleEnteteDate: CSSProperties = {
  position: 'relative',
  zIndex: 0,
  minWidth: 85,
  width: 85,
  boxSizing: 'border-box',
  textAlign: 'center',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
  padding: '12px 8px',
  backgroundColor: FOND_ENTETE,
  color: '#F8FAFC',
  fontWeight: 600,
  fontSize: 13,
};

const styleEnteteFixe: CSSProperties = {
  ...styleEnteteDate,
  position: 'sticky',
  left: 0,
  zIndex: 20,
  minWidth: 210,
  width: 210,
  textAlign: 'left',
  padding: '12px 16px',
  borderRight: '2px solid #E2E8F0',
  boxShadow: '4px 0 10px -2px rgba(0,0,0,0.1)',
};

function styleValeur(alt: boolean, couleur?: string, fort?: boolean): CSSProperties {
  return {
    position: 'relative',
    zIndex: 0,
    minWidth: 85,
    width: 85,
    boxSizing: 'border-box',
    textAlign: 'center',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    padding: '12px 8px',
    backgroundColor: alt ? FOND_LIGNE_ALT : FOND_LIGNE,
    color: couleur ?? '#1E293B',
    fontWeight: fort ? 700 : 400,
    fontSize: 14,
    borderBottom: '1px solid #E2E8F0',
  };
}

function styleLibelle(alt: boolean): CSSProperties {
  return {
    ...styleValeur(alt),
    position: 'sticky',
    left: 0,
    zIndex: 10,
    minWidth: 210,
    width: 210,
    textAlign: 'left',
    padding: '12px 16px',
    fontWeight: 500,
    color: '#1E293B',
    borderRight: '2px solid #E2E8F0',
    boxShadow: '4px 0 10px -2px rgba(0,0,0,0.1)',
  };
}

function lignesPlan(plan: PlanLigne[], couvertures: LigneCouverture[] | null, volumeAjuste = false): LignePlan[] {
  const lignes: LignePlan[] = [
    {
      libelle: volumeAjuste ? 'Volume ajusté' : 'Volume prévu',
      alt: false,
      cellules: plan.map((row, index) => ({ key: `v-${index}`, texte: row.volume_prevu.toLocaleString('fr-FR') })),
    },
    {
      libelle: 'ETP requis',
      alt: true,
      cellules: plan.map((row, index) => ({ key: `e-${index}`, texte: row.etp_moyen_requis.toLocaleString('fr-FR') })),
    },
  ];
  if (!couvertures) return lignes;
  lignes.push(
    {
      libelle: 'Écart ETP',
      alt: false,
      cellules: couvertures.map((ligne, index) => ({ key: `ec-${index}`, texte: texteEcart(ligne.ecart), couleur: couleurEcart(ligne.ecart), fort: true })),
    },
    {
      libelle: 'Taux de couverture (%)',
      alt: true,
      cellules: couvertures.map((ligne, index) => ({ key: `c-${index}`, texte: texteCouverture(ligne.couverture), couleur: couleurCouverture(ligne.couverture), fort: true })),
    },
  );
  return lignes;
}

function TableauPlanWeb({ plan, couvertures, volumeAjuste }: { plan: PlanLigne[]; couvertures: LigneCouverture[] | null; volumeAjuste: boolean }) {
  const lignes = lignesPlan(plan, couvertures, volumeAjuste);
  return React.createElement(
    'div',
    { id: 'flash-plan-scroll', style: styleDefilement },
    React.createElement(
      'table',
      { style: styleTable },
      React.createElement(
        'thead',
        null,
        React.createElement(
          'tr',
          null,
          React.createElement('th', { style: styleEnteteFixe }, 'Période'),
          plan.map((row, index) => React.createElement('th', { key: `d-${index}`, style: styleEnteteDate }, dateCourte(row.date))),
        ),
      ),
      React.createElement(
        'tbody',
        null,
        lignes.map((ligne) => React.createElement(
          'tr',
          { key: ligne.libelle },
          React.createElement('td', { style: styleLibelle(ligne.alt) }, ligne.libelle),
          ligne.cellules.map((cellule) => React.createElement('td', { key: cellule.key, style: styleValeur(ligne.alt, cellule.couleur, cellule.fort) }, cellule.texte)),
        )),
      ),
    ),
  );
}

function GrilleAjustements({ plan, saisies, onSaisie }: { plan: PlanLigne[]; saisies: Record<string, string>; onSaisie: (cle: string, texte: string) => void }) {
  const periodes = periodesAjustables(plan, saisies);
  return (
    <View style={styles.grilleAjust}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.grilleTable}>
          <View style={styles.grilleEntete}>
            <Text style={[styles.grilleCellule, styles.grillePeriode, styles.grilleEnteteTexte]}>Période</Text>
            <Text style={[styles.grilleCellule, styles.grilleNombre, styles.grilleEnteteTexte]}>Volume brut</Text>
            <Text style={[styles.grilleCellule, styles.grilleSaisie, styles.grilleEnteteTexte]}>Ajustement (%)</Text>
            <Text style={[styles.grilleCellule, styles.grilleNombre, styles.grilleEnteteTexte]}>Volume ajusté</Text>
          </View>
          {periodes.map((periode, index) => (
            <View key={periode.cle} style={[styles.grilleLigne, index % 2 === 1 && styles.grilleLigneAlt]}>
              <Text style={[styles.grilleCellule, styles.grillePeriode]}>{periode.libelle}</Text>
              <Text style={[styles.grilleCellule, styles.grilleNombre]}>{periode.volumeBrut.toLocaleString('fr-FR')}</Text>
              <View style={[styles.grilleCellule, styles.grilleSaisie]}>
                <TextInput
                  style={styles.grilleInput}
                  value={saisies[periode.cle] ?? ''}
                  onChangeText={(texte) => {
                    if (saisiePourcentageValide(texte)) onSaisie(periode.cle, texte.replace(/\s/g, ''));
                  }}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <Text style={[styles.grilleCellule, styles.grilleNombre, styles.grilleNombreFort]}>{periode.volumeAjuste.toLocaleString('fr-FR')}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={styles.grilleNote}>Saisissez un pourcentage d'évolution, positif ou négatif. L'ETP requis et les écarts suivent le volume ajusté.</Text>
    </View>
  );
}

function HorizontalPlan({ plan, couvertures, volumeAjuste }: { plan: PlanLigne[]; couvertures: LigneCouverture[] | null; volumeAjuste: boolean }) {
  if (plan.length === 0) return null;
  if (Platform.OS === 'web') {
    return <View style={styles.hTable}>{TableauPlanWeb({ plan, couvertures, volumeAjuste })}</View>;
  }

  const lignes = lignesPlan(plan, couvertures, volumeAjuste);
  return (
    <View style={styles.hTable}>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={styles.hScroll}>
        <View>
          <View style={styles.hRow}>
            <Text style={[styles.hLabel, styles.hLabelHead]} numberOfLines={1}>Période</Text>
            {plan.map((row, index) => (
              <Text key={`d-${index}`} style={styles.hHeadCell} numberOfLines={1}>{dateCourte(row.date)}</Text>
            ))}
          </View>
          {lignes.map((ligne) => (
            <View key={ligne.libelle} style={[styles.hRow, ligne.alt && styles.hRowAlt]}>
              <Text style={[styles.hLabel, ligne.alt && styles.hLabelAlt]} numberOfLines={1}>{ligne.libelle}</Text>
              {ligne.cellules.map((cellule) => (
                <Text key={cellule.key} numberOfLines={1} style={[styles.hCell, cellule.fort && styles.hCellFort, cellule.couleur ? { color: cellule.couleur } : null]}>{cellule.texte}</Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

type ExportPlan = {
  plan: PlanLigne[];
  saisies: Record<string, string>;
  aht: number;
  sla: number;
  tempsCible: number;
  shrinkage: number;
  heuresOuverture: number;
  modele: string;
  horizonLabel: string;
  typeFlux: TypeFlux;
  delaiSlaJours: number;
  tauxOccupation: number;
  couvertures: LigneCouverture[] | null;
  perimetre: string;
};

function exporterPlanExcel({ plan, saisies, aht, sla, tempsCible, shrinkage, heuresOuverture, modele, horizonLabel, typeFlux, delaiSlaJours, tauxOccupation, couvertures, perimetre }: ExportPlan) {
  const planAjuste = appliquerAjustements(plan, saisies);
  const volumeBrut = plan.reduce((somme, ligne) => somme + ligne.volume_prevu, 0);
  const volumeAjuste = planAjuste.reduce((somme, ligne) => somme + ligne.volume_prevu, 0);
  const etpMoyen = planAjuste.reduce((somme, ligne) => somme + ligne.etp_moyen_requis, 0) / planAjuste.length;
  const fluxFroid = typeFlux === 'froid';
  const libelleDelai = fluxFroid ? 'Délai SLA (jours)' : 'SLA cible (%)';
  const valeurDelai = fluxFroid ? delaiSlaJours : sla;
  const avecCouverture = !!couvertures;
  const lignes: (string | number)[][] = [
    ['Flash WFM — Plan de production'],
    [`Mak Consult · ${perimetre}`],
    [],
    ['Paramètre', 'Valeur'],
    ['AHT (secondes)', aht],
    ...(fluxFroid
      ? [
          ['Délai SLA (jours)', delaiSlaJours],
          ['Occupation (%)', tauxOccupation],
        ]
      : [
          ['SLA cible (%)', sla],
          ['Temps cible SLA (secondes)', tempsCible],
        ]),
    ['Shrinkage (%)', shrinkage],
    ["Heures d'ouverture", heuresOuverture],
    ['Modèle', modele],
    ['Horizon', horizonLabel],
    ['Volume brut modèle', volumeBrut],
    ['Volume ajusté manager', volumeAjuste],
    ['ETP moyen', Number(etpMoyen.toFixed(2))],
    [],
    ['Période', 'Volume brut modèle', 'Ajustement (%)', 'Volume ajusté manager', 'ETP requis', libelleDelai, ...(avecCouverture ? ['ETP disponible', 'Écart ETP', 'Couverture (%)'] : [])],
    ...plan.map((ligne, index) => {
      const ajuste = planAjuste[index] ?? ligne;
      const base: (string | number)[] = [ligne.date, ligne.volume_prevu, pourcentagePeriode(ligne.date, saisies), ajuste.volume_prevu, ajuste.etp_moyen_requis, valeurDelai];
      if (!couvertures) return base;
      const couverture = couvertures[index];
      base.push(
        couverture?.etpDispo != null ? Number(couverture.etpDispo.toFixed(2)) : '',
        couverture?.ecart != null ? Number(couverture.ecart.toFixed(2)) : '',
        couverture?.couverture != null ? Number(couverture.couverture.toFixed(1)) : '',
      );
      return base;
    }),
  ];
  const enteteTableau = lignes.findIndex((ligne) => ligne[0] === 'Période');
  const nbColonnes = avecCouverture ? 9 : 6;
  const feuille = XLSXStyle.utils.aoa_to_sheet(lignes);
  feuille['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: nbColonnes - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: nbColonnes - 1 } },
  ];
  feuille['!cols'] = [
    { wch: 32 },
    { wch: 22 },
    { wch: 16 },
    { wch: 24 },
    { wch: 14 },
    { wch: 18 },
    ...(avecCouverture ? [{ wch: 18 }, { wch: 14 }, { wch: 16 }] : []),
  ];
  feuille['!rows'] = [{ hpt: 28 }, { hpt: 18 }];
  feuille['!autofilter'] = {
    ref: XLSXStyle.utils.encode_range({ s: { r: enteteTableau, c: 0 }, e: { r: lignes.length - 1, c: nbColonnes - 1 } }),
  };
  feuille['!views'] = [{ state: 'frozen', ySplit: enteteTableau + 1, xSplit: 0, topLeftCell: `A${enteteTableau + 2}`, activePane: 'bottomLeft' }];

  const fin = { style: 'thin', color: { rgb: 'E6E9EE' } };
  const bordure = { top: fin, bottom: fin, left: fin, right: fin };
  const styleTitre = { font: { bold: true, sz: 18, color: { rgb: '0F2D46' }, name: 'Calibri' }, alignment: { vertical: 'center' } };
  const styleSousTitre = { font: { sz: 12, color: { rgb: '687581' }, name: 'Calibri' }, alignment: { vertical: 'center' } };
  const styleEntete = {
    font: { bold: true, sz: 12, color: { rgb: 'F4C430' }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: '0F2D46' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: bordure,
  };
  const styleLibelle = {
    font: { bold: true, sz: 11, color: { rgb: '0F2D46' }, name: 'Calibri' },
    alignment: { vertical: 'center' },
    border: bordure,
  };
  const styleValeur = {
    font: { sz: 11, color: { rgb: '0F2D46' }, name: 'Calibri' },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: bordure,
  };

  const poser = (ref: string, style: object, format?: string) => {
    const cellule = feuille[ref];
    if (!cellule) return;
    cellule.s = style;
    if (format) cellule.z = format;
  };

  poser('A1', styleTitre);
  poser('A2', styleSousTitre);
  poser('A4', styleEntete);
  poser('B4', styleEntete);
  for (let ligne = 5; ligne <= enteteTableau - 1; ligne += 1) {
    const libelle = String(lignes[ligne - 1]?.[0] ?? '');
    const fond = ligne % 2 === 0 ? { patternType: 'solid', fgColor: { rgb: 'F7F6F1' } } : undefined;
    poser(`A${ligne}`, { ...styleLibelle, fill: fond });
    const format = libelle.startsWith('Volume') ? '#,##0' : libelle.startsWith('ETP') ? '0.00' : libelle.startsWith('Heures') ? '0.0' : /AHT|SLA|Délai|Occupation|Shrinkage|Temps/.test(libelle) ? '0' : undefined;
    poser(`B${ligne}`, { ...styleValeur, fill: fond }, format);
  }
  for (let colonne = 0; colonne < nbColonnes; colonne += 1) {
    poser(XLSXStyle.utils.encode_cell({ r: enteteTableau, c: colonne }), styleEntete);
  }
  for (let ligne = enteteTableau + 1; ligne < lignes.length; ligne += 1) {
    const fond = (ligne - enteteTableau) % 2 === 0 ? { patternType: 'solid', fgColor: { rgb: 'F7F6F1' } } : undefined;
    const styleTexte = { font: { sz: 11, color: { rgb: '0F2D46' }, name: 'Calibri' }, alignment: { vertical: 'center' }, border: bordure, fill: fond };
    const styleNombre = { ...styleTexte, alignment: { horizontal: 'right', vertical: 'center' } };
    poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 0 }), styleTexte);
    poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 1 }), styleNombre, '#,##0');
    poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 2 }), styleNombre, '0.0');
    poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 3 }), styleNombre, '#,##0');
    poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 4 }), styleNombre, '0.0');
    poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 5 }), styleNombre, '0');
    if (avecCouverture) {
      poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 6 }), styleNombre, '0.00');
      poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 7 }), styleNombre, '0.00');
      poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 8 }), styleNombre, '0.0');
    }
  }

  const classeur = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(classeur, feuille, 'Plan de production');
  try {
    if (Platform.OS !== 'web') {
      alert("Veuillez ouvrir l'application depuis un navigateur web pour télécharger le fichier Excel.");
      return;
    }
    XLSXStyle.writeFile(classeur, 'Flash-WFM-plan-production.xlsx');
  } catch (error) {
    console.error(error);
    alert("Erreur lors de la génération du fichier Excel.");
  }
}

function echecApiSimulable(error: unknown) {
  if (error instanceof ErreurApi) return error.status === 404 || error.status >= 500;
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.name === 'TypeError') return true;
  return /failed to fetch|network|timeout|load failed/i.test(error.message);
}

class ErreurApi extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ErreurApi';
    this.status = status;
  }
}

function messageHttp(status: number, detail: string) {
  if (detail) return detail;
  if (status === 401) return "Vous n'êtes pas authentifié. Veuillez vous reconnecter.";
  if (status === 403) return "Accès refusé : abonnement Pro requis ou essai gratuit expiré.";
  return `Erreur HTTP ${status}`;
}

async function creerSessionCheckout(token: string) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
  } catch (error) {
    console.error(error);
    throw new Error('Impossible de joindre le serveur de paiement. Réessayez dans un instant.');
  }
  const texte = await response.text();
  let data: { url?: string; detail?: string; message?: string } | null = null;
  if (texte) {
    try {
      data = JSON.parse(texte);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : typeof data?.message === 'string' ? data.message : '';
    throw new ErreurApi(response.status, messageHttp(response.status, detail));
  }
  return data ?? {};
}

async function creerSessionPortail(token: string) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/create-portal-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });
  } catch (error) {
    console.error(error);
    throw new Error("Impossible d'ouvrir le portail de gestion. Réessayez dans un instant.");
  }
  const texte = await response.text();
  let data: { url?: string; detail?: string; message?: string } | null = null;
  if (texte) {
    try {
      data = JSON.parse(texte);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : typeof data?.message === 'string' ? data.message : '';
    throw new ErreurApi(response.status, messageHttp(response.status, detail));
  }
  return data ?? {};
}

async function postApi(path: string, body: unknown, timeoutMs = 5000, token: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const texte = await response.text();
    let data: { statut?: string; message?: string; plan?: PlanLigne[]; wape?: number | null; detail?: string } | null = null;
    if (texte) {
      try {
        data = JSON.parse(texte);
      } catch {
        data = null;
      }
    }
    if (!response.ok) {
      const detail = typeof data?.detail === 'string' ? data.detail : typeof data?.message === 'string' ? data.message : '';
      throw new ErreurApi(response.status, messageHttp(response.status, detail));
    }
    return data ?? {};
  } finally {
    clearTimeout(timer);
  }
}

async function lireFeuille(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Impossible de lire ce fichier.');
  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer.byteLength) throw new Error('Le fichier est vide.');
  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(arrayBuffer, { type: 'array' });
  } catch {
    throw new Error('Format invalide. Le fichier doit être un CSV ou un classeur Excel (.xlsx).');
  }
  const nom = workbook.SheetNames[0];
  const worksheet = nom ? workbook.Sheets[nom] : undefined;
  if (!worksheet) throw new Error('Le classeur ne contient aucune feuille.');
  const lignes = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
  if (!lignes.length) throw new Error('Le fichier est vide ou ne contient pas de tableau exploitable.');
  return lignes;
}

type SourceImport = 'fichier' | 'lien';

async function importerUrl(url: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new ErreurApi(401, 'Session expirée. Veuillez vous reconnecter.');
  const data = await postApi('/import', { url }, 20000, token) as { lignes?: Record<string, unknown>[] };
  if (!Array.isArray(data.lignes)) {
    throw new ErreurApi(400, 'Format invalide. Le fichier doit être un CSV ou un classeur Excel (.xlsx).');
  }
  return data.lignes;
}

function ZoneImport({
  mode,
  onMode,
  url,
  onUrl,
  onValider,
  enCours,
  titre,
  detail,
  onFichier,
  verrouille,
  onModele,
  onExemple,
}: {
  mode: SourceImport;
  onMode: (mode: SourceImport) => void;
  url: string;
  onUrl: (valeur: string) => void;
  onValider: () => void;
  enCours: boolean;
  titre: string;
  detail: string;
  onFichier: () => void;
  verrouille?: boolean;
  onModele?: () => void;
  onExemple?: () => void;
}) {
  return (
    <View style={styles.importBloc}>
      <View style={styles.importTabs}>
        <TouchableOpacity style={[styles.importTab, mode === 'fichier' && styles.importTabOn]} onPress={() => onMode('fichier')}>
          <Text style={[styles.importTabText, mode === 'fichier' && styles.importTabTextOn]}>Fichier local</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.importTab, mode === 'lien' && styles.importTabOn]} onPress={() => onMode('lien')}>
          <Text style={[styles.importTabText, mode === 'lien' && styles.importTabTextOn]}>Lien Web (Sheets / 365)</Text>
        </TouchableOpacity>
      </View>
      {mode === 'fichier' ? (
        <TouchableOpacity style={[styles.dropZone, verrouille && styles.modelBtnLocked]} onPress={onFichier}>
          <Ionicons name={verrouille ? 'lock-closed' : 'cloud-upload-outline'} size={28} color="#0F2D46" />
          <Text style={styles.dropTitle}>{titre}</Text>
          <Text style={styles.dropDetail}>{detail}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.lienBloc}>
          <TextInput
            style={styles.lienInput}
            value={url}
            onChangeText={onUrl}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!enCours}
          />
          <Text style={styles.hint}>Le document doit être accessible en lecture avec le lien de partage.</Text>
          <TouchableOpacity style={[styles.nextBtn, enCours && styles.generateBtnDisabled, verrouille && styles.modelBtnLocked]} onPress={onValider} disabled={enCours}>
            {enCours ? <ActivityIndicator color="#FFFFFF" /> : (
              <View style={styles.boutonLigne}>
                {verrouille ? <Ionicons name="lock-closed" size={16} color="#FFFFFF" /> : null}
                <Text style={styles.nextBtnText}>Importer le lien</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}
      {onModele || onExemple ? (
        <View style={styles.aideImport}>
          {onModele ? (
            <TouchableOpacity onPress={onModele}>
              <Text style={styles.lienDiscret}>Télécharger le modèle</Text>
            </TouchableOpacity>
          ) : null}
          {onExemple ? (
            <TouchableOpacity style={[styles.exempleBtn, verrouille && styles.modelBtnLocked]} onPress={onExemple}>
              <View style={styles.boutonLigne}>
                {verrouille ? <Ionicons name="lock-closed" size={14} color="#0F2D46" /> : null}
                <Text style={styles.exempleBtnText}>Charger des données d'exemple</Text>
              </View>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function FlashWFM() {
  const [currentStep, setCurrentStep] = useState<Etape>(1);
  const [etapeMax, setEtapeMax] = useState<Etape>(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dataPreview, setDataPreview] = useState<Record<string, unknown>[] | null>(null);
  const [etpFileName, setEtpFileName] = useState<string | null>(null);
  const [etpPlanning, setEtpPlanning] = useState<EtpJour[] | null>(null);
  const [etpBrouillon, setEtpBrouillon] = useState<EtpJour[] | null>(null);
  const [etpStatut, setEtpStatut] = useState<StatutEtp>('vide');
  const [typeFlux, setTypeFlux] = useState<TypeFlux>('chaud');
  const [heuresOuverture, setHeuresOuverture] = useState('8');
  const [aht, setAht] = useState('360');
  const [sla, setSla] = useState('80');
  const [tempsCible, setTempsCible] = useState('20');
  const [shrinkage, setShrinkage] = useState('25');
  const [backlog, setBacklog] = useState('0');
  const [delaiTraitementHeures, setDelaiTraitementHeures] = useState('24');
  const [tauxOccupation, setTauxOccupation] = useState('85');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>('court_terme');
  const [plans, setPlans] = useState<Record<Horizon, PlanLigne[] | null>>(plansVides());
  const [plansParSkill, setPlansParSkill] = useState<PlansSkills>(plansSkillsVides());
  const [ciblesSkills, setCiblesSkills] = useState<Record<string, SkillConfig>>({});
  const [skillActif, setSkillActif] = useState(VUE_GLOBALE);
  const [skillSynthese, setSkillSynthese] = useState(VUE_GLOBALE);
  const [remplissage, setRemplissage] = useState({ sla: '80', delai: '20', occupation: '85' });
  const [etpMoyens, setEtpMoyens] = useState('');
  const [etpMoyensAppliques, setEtpMoyensAppliques] = useState<number | null>(null);
  const [ajustementsOuverts, setAjustementsOuverts] = useState(false);
  const [ajustementsSaisis, setAjustementsSaisis] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const { userId, isPro, abonnementActif, assurerDroits } = useAuth();
  const [modalePro, setModalePro] = useState(false);
  const [paiementEnCours, setPaiementEnCours] = useState(false);
  const [messagePaiement, setMessagePaiement] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [nouveautesOuvertes, setNouveautesOuvertes] = useState(false);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [feedbackOuvert, setFeedbackOuvert] = useState(false);
  const [typeRetour, setTypeRetour] = useState<TypeRetour>(TYPES_RETOUR[0]);
  const [messageRetour, setMessageRetour] = useState('');
  const [envoiRetour, setEnvoiRetour] = useState(false);
  const [sourceHistorique, setSourceHistorique] = useState<SourceImport>('fichier');
  const [sourceEtp, setSourceEtp] = useState<SourceImport>('fichier');
  const [urlHistorique, setUrlHistorique] = useState('');
  const [urlEtp, setUrlEtp] = useState('');
  const [lienEnCours, setLienEnCours] = useState<'historique' | 'etp' | null>(null);
  const [syntheseOuverte, setSyntheseOuverte] = useState(false);
  const [syntheseChargement, setSyntheseChargement] = useState(false);
  const [syntheseErreur, setSyntheseErreur] = useState<string | null>(null);
  const [comparatif, setComparatif] = useState<{ cle: string; holt: PaquetModele | null; light: PaquetModele | null } | null>(null);
  const [cachePret, setCachePret] = useState(false);
  const suspendrePersistance = useRef(false);
  const series = useMemo(() => (dataPreview ? analyserHistorique(dataPreview) : []), [dataPreview]);
  const multi = series.length > 1;
  const skillCourant = skillAffiche(skillActif, multi, series);
  const skillSyntheseCourant = skillAffiche(skillSynthese, multi, series);
  const perimetre = series.length ? (multi ? libellePerimetre(skillCourant) : series[0].skill) : SKILL_DEFAUT;
  const plan = useMemo(
    () => planDuSkill(skillCourant, plansParSkill, plans, horizon),
    [skillCourant, plansParSkill, plans, horizon],
  );
  const ajustementsActifs = isPro && ajustementsOuverts;
  const saisiesAjustement = ajustementsActifs ? ajustementsSaisis : AJUSTEMENTS_VIDES;
  const planAjuste = useMemo(
    () => (plan ? appliquerAjustements(plan, saisiesAjustement) : null),
    [plan, saisiesAjustement],
  );
  const planningActif = isPro && etpStatut === 'valide' && !!etpPlanning?.length;
  const dmtFichier = useMemo(() => dmtPondere(series), [series]);
  const etpSaisieVue = useMemo(
    () => etpSaisiDuSkill(skillCourant, multi, series, ciblesSkills, etpMoyensAppliques),
    [skillCourant, multi, series, ciblesSkills, etpMoyensAppliques],
  );
  const planningVue = planningActif && (!multi || skillCourant === VUE_GLOBALE);
  const couvertures = useMemo(() => {
    if (!planAjuste) return null;
    if (planningVue) return couverturesDuPlan(planAjuste, etpPlanning, null);
    if (!isPro) return null;
    return couverturesDuPlan(planAjuste, null, etpSaisieVue);
  }, [planAjuste, planningVue, etpPlanning, isPro, etpSaisieVue]);
  const periodesSansEtp = !!couvertures && planningVue && couvertures.some((ligne) => ligne.etpDispo == null);
  const socleCibles = useMemo(() => ({
    aht, sla, shrinkage, tempsCible, tauxOccupation, heuresOuverture, delaiTraitementHeures,
  }), [aht, sla, shrinkage, tempsCible, tauxOccupation, heuresOuverture, delaiTraitementHeures]);
  const ciblesVue = useMemo(
    () => ciblesDuSkill(skillCourant, multi, series, ciblesSkills, plansParSkill, horizon, socleCibles),
    [skillCourant, multi, series, ciblesSkills, plansParSkill, horizon, socleCibles],
  );
  const etpDispoMoyen = useMemo(
    () => etpDispoMoyenDe(planningVue, couvertures, etpSaisieVue),
    [planningVue, couvertures, etpSaisieVue],
  );
  const cadreSynthese = useMemo(() => {
    const planCible = planDuSkill(skillSyntheseCourant, plansParSkill, plans, horizon);
    const etpSaisie = etpSaisiDuSkill(skillSyntheseCourant, multi, series, ciblesSkills, etpMoyensAppliques);
    const avecPlanning = planningActif && (!multi || skillSyntheseCourant === VUE_GLOBALE);
    const couverturesCible = !planCible
      ? null
      : avecPlanning
        ? couverturesDuPlan(planCible, etpPlanning, null)
        : isPro
          ? couverturesDuPlan(planCible, null, etpSaisie)
          : null;
    return {
      perimetre: series.length ? (multi ? libellePerimetre(skillSyntheseCourant) : series[0].skill) : SKILL_DEFAUT,
      cibles: ciblesDuSkill(skillSyntheseCourant, multi, series, ciblesSkills, plansParSkill, horizon, socleCibles),
      planning: avecPlanning ? etpPlanning : null,
      etpDispo: etpDispoMoyenDe(avecPlanning, couverturesCible, etpSaisie),
      holt: vueDesPlans(comparatif?.holt ?? null, skillSyntheseCourant),
      light: vueDesPlans(comparatif?.light ?? null, skillSyntheseCourant),
    };
  }, [skillSyntheseCourant, plansParSkill, plans, horizon, multi, series, ciblesSkills, etpMoyensAppliques, planningActif, etpPlanning, isPro, socleCibles, comparatif]);

  const appliquerVierge = useCallback(() => {
    setCurrentStep(1);
    setEtapeMax(1);
    setFileName(null);
    setDataPreview(null);
    setEtpFileName(null);
    setEtpPlanning(null);
    setEtpBrouillon(null);
    setEtpStatut('vide');
    setTypeFlux('chaud');
    setHeuresOuverture('8');
    setAht('360');
    setSla('80');
    setTempsCible('20');
    setShrinkage('25');
    setBacklog('0');
    setDelaiTraitementHeures('24');
    setTauxOccupation('85');
    setSelectedModel(null);
    setHorizon('court_terme');
    setPlans(plansVides());
    setPlansParSkill(plansSkillsVides());
    setCiblesSkills({});
    setSkillActif(VUE_GLOBALE);
    setSkillSynthese(VUE_GLOBALE);
    setEtpMoyens('');
    setEtpMoyensAppliques(null);
    setSourceHistorique('fichier');
    setSourceEtp('fichier');
    setUrlHistorique('');
    setUrlEtp('');
    setLienEnCours(null);
    setToast(null);
  }, []);

  const appliquerCache = useCallback((cache: CacheWizard) => {
    setCurrentStep(cache.currentStep);
    setEtapeMax(cache.etapeMax);
    setFileName(cache.fileName);
    setDataPreview(cache.dataPreview);
    setEtpFileName(cache.etpFileName);
    setEtpPlanning(cache.etpPlanning);
    setEtpBrouillon(cache.etpPlanning);
    setEtpStatut(cache.etpStatut);
    setTypeFlux(cache.typeFlux);
    setHeuresOuverture(cache.heuresOuverture);
    setAht(cache.aht);
    setSla(cache.sla);
    setTempsCible(cache.tempsCible);
    setShrinkage(cache.shrinkage);
    setBacklog(cache.backlog);
    setDelaiTraitementHeures(cache.delaiTraitementHeures);
    setTauxOccupation(cache.tauxOccupation);
    setSelectedModel(modeleConnu(cache.selectedModel) ? cache.selectedModel : null);
    setHorizon(cache.horizon);
    setPlans(cache.plans);
    setPlansParSkill(cache.plansParSkill);
    setCiblesSkills(cache.ciblesSkills);
    setSkillActif(cache.skillActif);
    setEtpMoyens(cache.etpMoyens);
    setEtpMoyensAppliques(cache.etpMoyensAppliques);
  }, []);

  useEffect(() => {
    if (currentStep === 4) setSkillSynthese(VUE_GLOBALE);
  }, [currentStep]);

  useEffect(() => {
    let ignore = false;
    nouveautesDejaVues().then((vues) => {
      if (!ignore && !vues) setNouveautesOuvertes(true);
    });
    return () => {
      ignore = true;
    };
  }, []);

  const fermerNouveautes = () => {
    setNouveautesOuvertes(false);
    void marquerNouveautesVues();
    void tourDejaVu().then((vu) => {
      if (vu) return;
      setCurrentStep(1);
      if (Platform.OS === 'web') {
        void lancerTourDriver((etape) => setCurrentStep(etape), () => {
          setCurrentStep(1);
          void marquerTourVu();
        });
        return;
      }
      setTourIndex(0);
    });
  };

  const terminerTour = () => {
    setTourIndex(null);
    setCurrentStep(1);
    void marquerTourVu();
  };

  const avancerTour = () => {
    if (tourIndex == null) return;
    if (tourIndex >= ETAPES_GUIDE.length - 1) {
      terminerTour();
      return;
    }
    const suivant = tourIndex + 1;
    setTourIndex(suivant);
    setCurrentStep(ETAPES_GUIDE[suivant].etape);
  };

  const envoyerFeedback = async () => {
    const message = messageRetour.trim();
    if (!message) {
      alert('Décrivez votre retour avant de l’envoyer.');
      return;
    }
    if (envoiRetour) return;
    setEnvoiRetour(true);
    try {
      await envoyerRetour(typeRetour, message);
      setFeedbackOuvert(false);
      setMessageRetour('');
      setTypeRetour(TYPES_RETOUR[0]);
      setToast('Merci, votre retour a bien été envoyé.');
    } catch (error) {
      console.error(error);
      alert('Impossible d’enregistrer votre retour. Réessayez dans un instant.');
    } finally {
      setEnvoiRetour(false);
    }
  };

  useEffect(() => {
    enregistrerResetWizard(() => {
      suspendrePersistance.current = true;
      appliquerVierge();
    });
    return () => enregistrerResetWizard(null);
  }, [appliquerVierge]);

  useEffect(() => {
    if (!userId) {
      suspendrePersistance.current = true;
      appliquerVierge();
      setCachePret(false);
      return;
    }
    let ignore = false;
    suspendrePersistance.current = true;
    appliquerVierge();
    setCachePret(false);
    Promise.all([cacheDuProprietaire(userId), lireLiensProfil(userId)]).then(([cache, liens]) => {
      if (ignore) return;
      if (cache) appliquerCache({ ...cache, currentStep: 1 });
      else appliquerVierge();
      if (liens.historique) {
        setUrlHistorique(liens.historique);
        setSourceHistorique('lien');
      }
      if (liens.etp) {
        setUrlEtp(liens.etp);
        setSourceEtp('lien');
      }
      suspendrePersistance.current = false;
      setCachePret(true);
    });
    return () => {
      ignore = true;
    };
  }, [userId, appliquerCache, appliquerVierge]);

  useEffect(() => {
    if (!cachePret || !userId || suspendrePersistance.current) return;
    void ecrireCache({
      version: 1,
      userId,
      currentStep,
      etapeMax,
      fileName,
      dataPreview,
      etpFileName,
      etpPlanning,
      etpStatut,
      typeFlux,
      heuresOuverture,
      aht,
      sla,
      tempsCible,
      shrinkage,
      backlog,
      delaiSlaJours: String(delaiJoursDepuisHeures(delaiTraitementHeures)),
      delaiTraitementHeures,
      tauxOccupation,
      selectedModel,
      horizon,
      plans,
      plansParSkill,
      ciblesSkills,
      skillActif,
      etpMoyens,
      etpMoyensAppliques,
    });
  }, [cachePret, userId, currentStep, etapeMax, fileName, dataPreview, etpFileName, etpPlanning, etpStatut, typeFlux, heuresOuverture, aht, sla, tempsCible, shrinkage, backlog, delaiTraitementHeures, tauxOccupation, selectedModel, horizon, plans, plansParSkill, ciblesSkills, skillActif, etpMoyens, etpMoyensAppliques]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setMessagePaiement("Paiement confirmé. Votre abonnement Pro est en cours d'activation.");
    } else if (params.get('canceled') === 'true') {
      setMessagePaiement("Paiement annulé. Aucun débit n'a été effectué.");
    } else {
      return;
    }
    params.delete('success');
    params.delete('canceled');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const identifiant = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(identifiant);
  }, [toast]);

  const oublierPlans = () => {
    setPlans(plansVides());
    setPlansParSkill(plansSkillsVides());
    setComparatif(null);
  };

  useEffect(() => {
    const base = series.length ? series : [{ skill: SKILL_DEFAUT, dmtMoyen: null as number | null }];
    setCiblesSkills((actuel) => {
      const suivant: Record<string, SkillConfig> = {};
      let change = Object.keys(actuel).length !== base.length;
      for (const serie of base) {
        const existante = actuel[serie.skill];
        suivant[serie.skill] = existante ?? configSkill(serie.dmtMoyen, {
          dmt: aht || '360',
          sla: sla || '80',
          delaiCible: tempsCible || '20',
          shrinkage: shrinkage || '25',
          occupation: tauxOccupation || '85',
          amplitude: heuresOuverture || '8',
          delaiTraitement: delaiTraitementHeures || '24',
          backlog: base.length > 1 ? '0' : (backlog || '0'),
        });
        if (!existante) change = true;
      }
      return change ? suivant : actuel;
    });
  }, [series, aht, sla, tempsCible, shrinkage, tauxOccupation, heuresOuverture, delaiTraitementHeures, backlog]);

  const chargerExemple = () => {
    const lignes = historiqueExemple();
    setFileName('Données d\'exemple');
    setDataPreview(lignes);
    setCiblesSkills({});
    setSkillActif(VUE_GLOBALE);
    oublierPlans();
    const moyenneDmt = dmtPondere(analyserHistorique(lignes));
    if (moyenneDmt != null) setAht(String(moyenneDmt));
    setToast('3 semaines d\'exemple sont chargées sur les files Accueil et Support.');
  };

  const chargerExempleEtp = () => {
    if (!isPro) {
      setModalePro(true);
      return;
    }
    const ancre = new Date();
    ancre.setHours(12, 0, 0, 0);
    const planning: EtpJour[] = [];
    for (let decalage = 10; decalage >= 1; decalage -= 1) {
      const date = new Date(ancre);
      date.setDate(ancre.getDate() - decalage);
      const weekend = date.getDay() === 0 || date.getDay() === 6;
      const jour = String(date.getDate()).padStart(2, '0');
      const mois = String(date.getMonth() + 1).padStart(2, '0');
      planning.push({ date: `${jour}/${mois}/${date.getFullYear()}`, etp: weekend ? 4 : 12 });
    }
    setEtpFileName('Données d\'exemple');
    setEtpBrouillon(planning);
    setEtpPlanning(null);
    setEtpStatut('vide');
    setToast('10 jours d\'exemple sont chargés. Validez le planning pour continuer.');
  };

  const avancer = (etape: Etape) => {
    setCurrentStep(etape);
    setEtapeMax((max) => (etape > max ? etape : max));
  };

  const peutOuvrir = (etape: Etape) => {
    if (etape > etapeMax) return false;
    if (etape === 1) return true;
    return !!dataPreview || !!plans.court_terme || !!plans.long_terme;
  };

  const reinitialiser = () => {
    const appliquer = () => {
      suspendrePersistance.current = false;
      appliquerVierge();
      void purgerDonneesTravail();
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Effacer la progression enregistrée et recommencer le tunnel au début ?')) appliquer();
      return;
    }
    appliquer();
  };

  const passerAuPro = async () => {
    if (paiementEnCours) return;
    setPaiementEnCours(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('Veuillez vous reconnecter');
        return;
      }
      const data = await creerSessionCheckout(session.access_token);
      if (typeof data?.url !== 'string' || !data.url) {
        alert('Session de paiement indisponible.');
        return;
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(data.url);
        return;
      }
      await Linking.openURL(data.url);
    } catch (error) {
      console.error(error);
      alert(error instanceof ErreurApi ? error.message : 'Impossible de joindre le serveur de paiement. Réessayez dans un instant.');
    } finally {
      setPaiementEnCours(false);
    }
  };

  const gererAbonnement = async () => {
    if (paiementEnCours) return;
    setPaiementEnCours(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('Veuillez vous reconnecter');
        return;
      }
      const data = await creerSessionPortail(session.access_token);
      if (typeof data?.url !== 'string' || !data.url) {
        alert('Portail de gestion indisponible.');
        return;
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(data.url);
        return;
      }
      await Linking.openURL(data.url);
    } catch (error) {
      console.error(error);
      alert(error instanceof ErreurApi ? error.message : "Impossible d'ouvrir le portail de gestion. Réessayez dans un instant.");
    } finally {
      setPaiementEnCours(false);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      const jsonData = await lireFeuille(asset.uri);
      const reconnu = analyserHistorique(jsonData);
      if (!reconnu.length) {
        setDataPreview(null);
        setFileName(null);
        alert(MESSAGE_HISTORIQUE);
        return;
      }
      setFileName(asset.name);
      setDataPreview(jsonData);
      setCiblesSkills({});
      setSkillActif(VUE_GLOBALE);
      oublierPlans();
      const moyenneDmt = dmtPondere(reconnu);
      if (moyenneDmt != null) setAht(String(moyenneDmt));
    } catch (error) {
      console.error(error);
      setDataPreview(null);
      alert(error instanceof Error ? error.message : 'Erreur lors de la lecture du fichier Excel.');
    }
  };

  const importerHistoriqueLien = async () => {
    const url = urlHistorique.trim();
    if (!url) {
      alert('Indiquez le lien du document.');
      return;
    }
    setLienEnCours('historique');
    try {
      const jsonData = await importerUrl(url);
      const reconnu = analyserHistorique(jsonData);
      if (!reconnu.length) {
        setDataPreview(null);
        setFileName(null);
        alert(MESSAGE_HISTORIQUE);
        return;
      }
      setFileName(url);
      setDataPreview(jsonData);
      setCiblesSkills({});
      setSkillActif(VUE_GLOBALE);
      if (userId) void enregistrerLienSource(userId, url);
      oublierPlans();
      const moyenneDmt = dmtPondere(reconnu);
      if (moyenneDmt != null) setAht(String(moyenneDmt));
    } catch (error) {
      console.error(error);
      setDataPreview(null);
      setFileName(null);
      alert(error instanceof ErreurApi ? error.message : 'Impossible de joindre le serveur pour lire ce lien.');
    } finally {
      setLienEnCours(null);
    }
  };

  const importerEtpLien = async () => {
    if (!isPro) {
      setModalePro(true);
      return;
    }
    const url = urlEtp.trim();
    if (!url) {
      alert('Indiquez le lien du document.');
      return;
    }
    setLienEnCours('etp');
    try {
      const jsonData = await importerUrl(url);
      const planning = parserPlanningEtp(jsonData);
      if (planning.length === 0) {
        alert('Format invalide. Le planning ETP doit contenir une date et un effectif : Col 1 = Date | Col 2 = ETP.');
        return;
      }
      setEtpFileName(url);
      setEtpBrouillon(planning);
      setEtpPlanning(null);
      setEtpStatut('vide');
      if (userId) void enregistrerLienEtp(userId, url);
    } catch (error) {
      console.error(error);
      alert(error instanceof ErreurApi ? error.message : 'Impossible de joindre le serveur pour lire ce lien.');
    } finally {
      setLienEnCours(null);
    }
  };

  const pickEtp = async () => {
    if (!isPro) {
      setModalePro(true);
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      const jsonData = await lireFeuille(asset.uri);
      const planning = parserPlanningEtp(jsonData);
      if (planning.length === 0) {
        alert('Format invalide. Le planning ETP doit contenir une date et un effectif : Col 1 = Date | Col 2 = ETP.');
        return;
      }
      setEtpFileName(asset.name);
      setEtpBrouillon(planning);
      setEtpPlanning(null);
      setEtpStatut('vide');
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Erreur lors de la lecture du planning ETP.');
    }
  };

  const validerEtp = () => {
    if (!isPro) {
      setModalePro(true);
      return;
    }
    if (!etpBrouillon?.length) {
      alert("Importez d'abord un planning d'ETP, ou passez cette étape.");
      return;
    }
    setEtpPlanning(etpBrouillon);
    setEtpStatut('valide');
    if (userId && etpFileName && /^https?:\/\//i.test(etpFileName)) void enregistrerLienEtp(userId, etpFileName);
    avancer(3);
  };

  const socleConfig = () => ({
    dmt: aht || '360',
    sla: sla || '80',
    delaiCible: tempsCible || '20',
    shrinkage: shrinkage || '25',
    occupation: tauxOccupation || '85',
    amplitude: heuresOuverture || '8',
    delaiTraitement: delaiTraitementHeures || '24',
    backlog: backlog || '0',
  });

  const majConfig = (skill: string, champ: keyof SkillConfig, valeur: string) => {
    const serie = series.find((item) => item.skill === skill);
    setCiblesSkills((actuel) => ({
      ...actuel,
      [skill]: { ...(actuel[skill] ?? configSkill(serie?.dmtMoyen ?? null, socleConfig())), [champ]: valeur },
    }));
    if (champ !== 'etp') oublierPlans();
  };

  const appliquerRemplissage = () => {
    const cibles = series.length ? series.map((serie) => serie.skill) : [SKILL_DEFAUT];
    setCiblesSkills((actuel) => {
      const suivant = { ...actuel };
      for (const skill of cibles) {
        const serie = series.find((item) => item.skill === skill);
        const cfg = suivant[skill] ?? configSkill(serie?.dmtMoyen ?? null, socleConfig());
        suivant[skill] = typeFlux === 'chaud'
          ? { ...cfg, sla: remplissage.sla, delaiCible: remplissage.delai, occupation: remplissage.occupation }
          : { ...cfg, delaiTraitement: remplissage.delai, occupation: remplissage.occupation };
      }
      return suivant;
    });
    oublierPlans();
  };

  const saisirEtpMoyen = (valeur: string) => {
    setEtpMoyens(valeur);
    if (!valeur.trim()) {
      setEtpMoyensAppliques(null);
      return;
    }
    const lu = nombre(valeur);
    if (lu != null && lu >= 0) setEtpMoyensAppliques(lu);
  };

  const passerEtp = () => {
    setEtpFileName(null);
    setEtpBrouillon(null);
    setEtpPlanning(null);
    setEtpStatut('passee');
    avancer(3);
  };

  const choisirFlux = (flux: TypeFlux) => {
    setTypeFlux(flux);
    oublierPlans();
  };

  const changerParam = (setter: (valeur: string) => void) => (valeur: string) => {
    setter(valeur);
    oublierPlans();
  };

  const choisirModele = (modele: string, autorise: boolean) => {
    if (!autorise) {
      setModalePro(true);
      return;
    }
    setSelectedModel(modele);
    oublierPlans();
  };

  const seriesActives = (): SerieSkill[] => (series.length ? series : [{ skill: SKILL_DEFAUT, lignes: [], dmtMoyen: null, volumeTotal: 0 }]);

  const poserPlans = (horizonDemande: Horizon, paquet: Record<string, PlanLigne[]>) => {
    setPlansParSkill((actuel) => ({ ...actuel, [horizonDemande]: paquet }));
    setPlans((actuel) => ({ ...actuel, [horizonDemande]: consoliderPlans(Object.values(paquet)) }));
  };

  const basculerMock = (horizonDemande: Horizon, mode: string) => {
    if (mode === 'Auto' || mode === 'Hybride') {
      const holt: PaquetModele = {};
      const light: PaquetModele = {};
      for (const serie of seriesActives()) {
        const fictif = comparatifMock(horizonDemande, serie.lignes.map((ligne) => ligne.volume));
        holt[serie.skill] = fictif.holt;
        light[serie.skill] = fictif.light;
      }
      poserPlans(horizonDemande, composerPlans(mode, holt, light));
    } else {
      const paquet: Record<string, PlanLigne[]> = {};
      for (const serie of seriesActives()) {
        paquet[serie.skill] = planMock(horizonDemande, serie.lignes.map((ligne) => ligne.volume));
      }
      poserPlans(horizonDemande, paquet);
    }
    setToast('API injoignable — Mode Mock Dev');
  };

  const parametresPour = (serie: SerieSkill) => {
    const cfg = ciblesSkills[serie.skill] ?? configSkill(serie.dmtMoyen, socleConfig());
    return {
      volume_horaire: 0,
      aht: parseInt(cfg.dmt, 10) || 360,
      sla_cible: parseInt(cfg.sla, 10) || 80,
      temps_cible: parseInt(cfg.delaiCible, 10) || 20,
      shrinkage: parseInt(cfg.shrinkage, 10) || 25,
      heures_ouverture: parseFloat(cfg.amplitude) || 8,
      type_flux: typeFlux,
      backlog: parseInt(cfg.backlog, 10) || 0,
      delai_sla_jours: delaiJoursDepuisHeures(cfg.delaiTraitement),
      taux_occupation: parseInt(cfg.occupation, 10) || 85,
      heures_travaillees: nombre(cfg.heuresTravaillees),
    };
  };

  const cleComparatif = () => JSON.stringify({
    horizon,
    fichier: fileName,
    skills: series.map((serie) => [serie.skill, serie.lignes.length, serie.volumeTotal]),
    cibles: ciblesSkills,
    tempsCible,
    heuresOuverture,
    typeFlux,
    backlog,
    delaiTraitementHeures,
    tauxOccupation,
  });

  const prevoirPaquet = async (modele: string, token: string, evaluer: boolean, horizonDemande: Horizon): Promise<PaquetModele> => {
    const actif = seriesActives().filter((serie) => serie.lignes.length > 0);
    if (!actif.length) throw new ErreurApi(400, 'Aucune série exploitable.');
    const entrees = await Promise.all(actif.map(async (serie) => {
      const data = await postApi('/prevision_plan', {
        modele,
        horizon: horizonDemande,
        donnees: serie.lignes.map((ligne) => ({ date: ligne.date, volume: ligne.volume, file: serie.skill })),
        parametres_erlang: parametresPour(serie),
        skill: serie.skill,
        skill_configs: payloadSkillConfigs(ciblesSkills),
        evaluer_wape: evaluer,
      }, 60000, token);
      if (!data || data.statut !== 'succès' || !Array.isArray(data.plan)) {
        throw new ErreurApi(400, typeof data?.message === 'string' ? data.message : 'Données invalides');
      }
      const resultat: ResultatModele = { plan: data.plan as PlanLigne[], wape: typeof data.wape === 'number' ? data.wape : null };
      return [serie.skill, resultat] as const;
    }));
    return Object.fromEntries(entrees);
  };

  const handleGenerate = async () => {
    if (loading) return;
    assurerDroits();
    const modeleChoisi = modeleConnu(selectedModel) ? selectedModel : (__DEV__ ? 'Auto' : null);
    if (!modeleChoisi) {
      alert('Veuillez sélectionner un algorithme de prévision.');
      return;
    }
    if (dataPreview && !series.length) {
      alert(MESSAGE_HISTORIQUE);
      return;
    }
    if (!dataPreview && !__DEV__) {
      alert("Aucune donnée importée. Revenez à l'étape 1 pour importer votre fichier Excel.");
      return;
    }
    const horizonDemande = horizon;
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (__DEV__) {
          basculerMock(horizonDemande, modeleChoisi);
          return;
        }
        alert('Session expirée. Veuillez vous reconnecter.');
        return;
      }
      let plansSeuls: Record<string, PlanLigne[]>;
      if (modeleChoisi === 'Auto' || modeleChoisi === 'Hybride') {
        const [holt, light] = await Promise.all([
          prevoirPaquet('Holt-Winters', token, true, horizonDemande),
          prevoirPaquet('LightGBM', token, true, horizonDemande),
        ]);
        plansSeuls = composerPlans(modeleChoisi, holt, light);
      } else {
        const paquet = await prevoirPaquet(modeleChoisi, token, false, horizonDemande);
        plansSeuls = Object.fromEntries(Object.entries(paquet).map(([skill, resultat]) => [skill, resultat.plan]));
      }
      poserPlans(horizonDemande, plansSeuls);
    } catch (error) {
      console.error(error);
      if (__DEV__ && (echecApiSimulable(error) || error instanceof ErreurApi)) {
        basculerMock(horizonDemande, modeleChoisi);
      } else if (error instanceof ErreurApi && error.status === 403 && error.message.includes('Droits utilisateur introuvables')) {
        assurerDroits();
      } else if (error instanceof ErreurApi && (error.status === 401 || error.status === 403)) {
        alert(error.message);
      } else if (error instanceof Error && error.name === 'AbortError') {
        alert('Le serveur met trop de temps à répondre. Veuillez réessayer.');
      } else if (error instanceof ErreurApi || (error instanceof Error && error.name !== 'TypeError')) {
        alert(error.message);
      } else {
        alert("Connexion au serveur backend impossible. Veuillez vérifier que l'API est active.");
      }
    } finally {
      setLoading(false);
    }
  };

  const ouvrirSynthese = async () => {
    setSkillSynthese(VUE_GLOBALE);
    setSyntheseOuverte(true);
    const cle = cleComparatif();
    if (comparatif?.cle === cle && (comparatif.holt || comparatif.light)) return;
    setSyntheseChargement(true);
    setSyntheseErreur(null);
    const poserMock = () => {
      const holt: PaquetModele = {};
      const light: PaquetModele = {};
      for (const serie of seriesActives()) {
        const fictif = comparatifMock(horizon, serie.lignes.map((ligne) => ligne.volume));
        holt[serie.skill] = fictif.holt;
        light[serie.skill] = fictif.light;
      }
      setComparatif({ cle, holt, light });
      setToast('API injoignable — Mode Mock Dev');
    };
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (__DEV__) {
          poserMock();
          return;
        }
        setSyntheseErreur('Session expirée. Veuillez vous reconnecter.');
        return;
      }
      const [holt, light] = await Promise.allSettled([
        prevoirPaquet('Holt-Winters', token, true, horizon),
        prevoirPaquet('LightGBM', token, true, horizon),
      ]);
      const holtOk = holt.status === 'fulfilled' ? holt.value : null;
      const lightOk = light.status === 'fulfilled' ? light.value : null;
      if (!holtOk && !lightOk) {
        const motif = holt.status === 'rejected' ? holt.reason : light.status === 'rejected' ? light.reason : new Error('Comparaison impossible.');
        if (__DEV__ && (echecApiSimulable(motif) || motif instanceof ErreurApi)) {
          poserMock();
          return;
        }
        setComparatif(null);
        const message = motif instanceof Error ? motif.message : 'Comparaison impossible.';
        if (!message.includes('Droits utilisateur introuvables')) {
          setSyntheseErreur(message);
        } else {
          assurerDroits();
        }
        return;
      }
      setComparatif({ cle, holt: holtOk, light: lightOk });
      if (!holtOk || !lightOk) setSyntheseErreur('Un des modèles sources n’a pas pu être calculé. Le comparatif affiche les modèles disponibles.');
    } catch (error) {
      console.error(error);
      if (__DEV__ && echecApiSimulable(error)) {
        poserMock();
        return;
      }
      setSyntheseErreur(error instanceof Error ? error.message : 'Comparaison impossible.');
    } finally {
      setSyntheseChargement(false);
    }
  };

  const handleExport = () => {
    if (!isPro) {
      setModalePro(true);
      return;
    }
    if (!plan || !planAjuste) return;
    exporterPlanExcel({
      plan,
      saisies: saisiesAjustement,
      aht: parseInt(ciblesVue.dmt, 10) || 360,
      sla: parseFloat(ciblesVue.sla) || 80,
      tempsCible: parseInt(ciblesVue.delaiCible, 10) || 20,
      shrinkage: parseFloat(ciblesVue.shrinkage) || 25,
      heuresOuverture: parseFloat(ciblesVue.amplitude) || 8,
      modele: libelleModele(selectedModel),
      horizonLabel: horizon === 'court_terme' ? 'Court terme' : 'Long terme',
      typeFlux,
      delaiSlaJours: delaiJoursDepuisHeures(ciblesVue.delaiTraitement),
      tauxOccupation: parseInt(ciblesVue.occupation, 10) || 85,
      couvertures,
      perimetre,
    });
  };

  const calculerMoyens = () => {
    if (!isPro) {
      setModalePro(true);
      return;
    }
    const valeur = nombre(etpMoyens);
    if (valeur == null || valeur < 0) {
      alert("Indiquez un nombre d'ETP moyens par jour.");
      return;
    }
    setEtpMoyensAppliques(valeur);
  };

  const retour = () => {
    if (currentStep > 1) setCurrentStep((currentStep - 1) as Etape);
  };

  const suite = () => {
    if (currentStep === 1) {
      if (!dataPreview?.length) {
        alert("Importez d'abord un historique Excel.");
        return;
      }
      if (userId && fileName && /^https?:\/\//i.test(fileName)) void enregistrerLienSource(userId, fileName);
      avancer(2);
      return;
    }
    if (currentStep === 2) {
      if (etpStatut === 'valide') {
        avancer(3);
        return;
      }
      if (etpBrouillon?.length && isPro) {
        validerEtp();
        return;
      }
      passerEtp();
      return;
    }
    if (currentStep === 3) {
      avancer(4);
      return;
    }
    void handleGenerate();
  };

  const volumeTotal = planAjuste?.reduce((somme, ligne) => somme + ligne.volume_prevu, 0) ?? 0;
  const etpMoyenRequis = planAjuste && planAjuste.length ? planAjuste.reduce((somme, ligne) => somme + ligne.etp_moyen_requis, 0) / planAjuste.length : 0;
  const couvertureMoyenne = couvertures
    ? moyenne(couvertures.map((ligne) => ligne.couverture).filter((valeur): valeur is number => valeur != null))
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.dashScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.dash}>
          <HeaderLogo
            abonnementActif={abonnementActif}
            paiementEnCours={paiementEnCours}
            onAbonnement={abonnementActif ? gererAbonnement : passerAuPro}
            onPasserPro={() => setModalePro(true)}
            onReinitialiser={reinitialiser}
            onFeedback={() => setFeedbackOuvert(true)}
          />
          <Stepper etape={currentStep} etapeMax={etapeMax} peutOuvrir={peutOuvrir} onAller={setCurrentStep} />
          {messagePaiement ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{messagePaiement}</Text>
            </View>
          ) : null}

          {currentStep === 1 ? (
            <View style={styles.card}>
              <Text style={styles.stepText}>Étape 1 : Import historique</Text>
              <Text style={styles.lead}>Historique de volumes et de DMT. Colonnes attendues : Date et Volume. Une colonne Skill, File ou Activité est optionnelle : sans elle, tout l'historique est rattaché à la file Général. La DMT peut occuper une colonne dédiée.</Text>
              <View nativeID="tour-source" style={tourIndex === 0 ? styles.tourCible : undefined}>
                <ZoneImport
                  mode={sourceHistorique}
                  onMode={setSourceHistorique}
                  url={urlHistorique}
                  onUrl={setUrlHistorique}
                  onValider={importerHistoriqueLien}
                  enCours={lienEnCours === 'historique'}
                  titre="Importer un historique Excel (.xlsx)"
                  detail="Date, volume et DMT. Une colonne File, Skill ou Activité est optionnelle."
                  onFichier={() => { void pickDocument(); }}
                  onModele={telechargerModele}
                  onExemple={chargerExemple}
                />
              </View>
              {fileName && dataPreview ? (
                <View style={styles.successBox}>
                  <Text style={styles.successText} numberOfLines={2}>{fileName.startsWith('http') ? 'Lien importé' : 'Fichier sélectionné'} : {fileName}</Text>
                  <Text style={styles.hint}>{dataPreview.length.toLocaleString('fr-FR')} ligne(s){series.length <= 1 ? ` · 1 file (${series[0]?.skill ?? SKILL_DEFAUT})` : ''}{dmtFichier != null ? ` · DMT moyenne ${dmtFichier.toLocaleString('fr-FR')} s` : ' · DMT non détectée, à saisir à l’étape 3'}</Text>
                  {multi ? (
                    <View style={styles.badgeFiles}>
                      <Ionicons name="layers-outline" size={16} color="#0F2D46" />
                      <Text style={styles.badgeFilesTexte}>{series.length.toLocaleString('fr-FR')} files détectées : {series.map((serie) => serie.skill).join(', ')}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}

          {currentStep === 2 ? (
            <View nativeID="tour-etp" style={[styles.panel, tourIndex === 1 && styles.tourCible]}>
              <View style={styles.titleRow}>
                <Text style={[styles.panelTitle, styles.panelTitleInline]}>Étape 2 : Planning ETP réels</Text>
                {!isPro ? <Ionicons name="lock-closed" size={16} color="#0F2D46" /> : null}
                <Text style={styles.proBadge}>Pro</Text>
              </View>
              <ZoneImport
                mode={sourceEtp}
                onMode={setSourceEtp}
                url={urlEtp}
                onUrl={setUrlEtp}
                onValider={importerEtpLien}
                enCours={lienEnCours === 'etp'}
                titre="Importer un planning d'ETP jour par jour (.xlsx)"
                detail="Colonne 1 = date, colonne 2 = ETP. Court terme : jour par jour. Long terme : moyenne du mois."
                onFichier={() => { void pickEtp(); }}
                verrouille={!isPro}
                onModele={telechargerModeleEtp}
                onExemple={chargerExempleEtp}
              />
              <View style={styles.encartInfo}>
                <View style={styles.fluxMessageLigne}>
                  <Ionicons name="information-circle-outline" size={18} color="#1E293B" />
                  <Text style={styles.encartInfoTexte}>Import de planning optionnel : Si vous n'avez pas de planning jour par jour, cliquez sur "Passer cette étape". Vous pourrez ajuster votre ETP moyen directement sur le plan de production.</Text>
                </View>
              </View>
              {etpFileName && (etpBrouillon?.length || etpPlanning?.length) ? (
                <View style={styles.successBox}>
                  <Text style={styles.successText} numberOfLines={2}>{etpStatut === 'valide' ? 'Planning validé' : 'Fichier prêt à valider'} : {etpFileName}</Text>
                  <Text style={styles.hint}>{(etpBrouillon ?? etpPlanning)?.length.toLocaleString('fr-FR')} jour(s) reconnu(s)</Text>
                </View>
              ) : null}
              <View style={styles.actionRow}>
                {etpBrouillon?.length ? (
                  <TouchableOpacity style={[styles.nextBtn, styles.actionBtn, !isPro && styles.modelBtnLocked]} onPress={validerEtp}>
                    <View style={styles.boutonLigne}>
                      {!isPro ? <Ionicons name="lock-closed" size={16} color="#FFFFFF" /> : null}
                      <Text style={styles.nextBtnText}>Valider</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={[styles.secondaryBtn, styles.actionBtn]} onPress={passerEtp}>
                  <Text style={styles.secondaryBtnText}>Passer cette étape</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {currentStep === 3 ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Étape 3 : Flux et dimensionnement</Text>
              <View style={styles.fluxRow}>
                <TouchableOpacity style={[styles.fluxCard, typeFlux === 'chaud' && styles.fluxCardOn]} onPress={() => choisirFlux('chaud')}>
                  <Text style={[styles.fluxTitle, typeFlux === 'chaud' && styles.fluxTitleOn]}>Flux Chaud (Téléphonie, Chat, Messaging)</Text>
                  <Text style={[styles.fluxDetail, typeFlux === 'chaud' && styles.fluxDetailOn]}>Calculs basés sur Erlang C.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.fluxCard, typeFlux === 'froid' && styles.fluxCardOn]} onPress={() => choisirFlux('froid')}>
                  <Text style={[styles.fluxTitle, typeFlux === 'froid' && styles.fluxTitleOn]}>Flux Froid (Mails, Tickets, Backlog)</Text>
                  <Text style={[styles.fluxDetail, typeFlux === 'froid' && styles.fluxDetailOn]}>Calculs basés sur un modèle linéaire.</Text>
                </TouchableOpacity>
              </View>
              <View nativeID="tour-leviers" style={tourIndex === 2 ? styles.tourCible : undefined}>
              <View style={styles.fluxMessageLigne}>
                <Ionicons name={typeFlux === 'chaud' ? 'flash-outline' : 'mail-outline'} size={16} color="#1E293B" />
                <Text style={styles.fluxMessage}>
                  {typeFlux === 'chaud'
                    ? 'Flux chaud : Calcul Erlang C basé sur votre objectif de décroché en temps réel.'
                    : 'Flux froid : Calcul de charge linéaire lissé selon votre délai de traitement cible.'}
                </Text>
              </View>
              <View style={styles.remplissage}>
                <Text style={styles.skillLabel}>Remplissage rapide</Text>
                <View style={styles.remplissageLigne}>
                  {typeFlux === 'chaud' ? (
                    <View style={styles.remplissageChamp}>
                      <Text style={styles.remplissageLabel}>SLA (%)</Text>
                      <TextInput style={[styles.skillInput, styles.remplissageInput]} value={remplissage.sla} onChangeText={(slaSaisie) => setRemplissage((actuel) => ({ ...actuel, sla: slaSaisie }))} keyboardType="decimal-pad" placeholder="SLA %" placeholderTextColor="#94A3B8" />
                    </View>
                  ) : null}
                  <View style={styles.remplissageChamp}>
                    <Text style={styles.remplissageLabel}>{typeFlux === 'chaud' ? 'Délai cible (s)' : 'Délai cible (h)'}</Text>
                    <TextInput style={[styles.skillInput, styles.remplissageInput]} value={remplissage.delai} onChangeText={(delai) => setRemplissage((actuel) => ({ ...actuel, delai }))} keyboardType="decimal-pad" placeholder={typeFlux === 'chaud' ? 'Délai (s)' : 'Délai (h)'} placeholderTextColor="#94A3B8" />
                  </View>
                  <View style={styles.remplissageChamp}>
                    <Text style={styles.remplissageLabel}>Occupation (%)</Text>
                    <TextInput style={[styles.skillInput, styles.remplissageInput]} value={remplissage.occupation} onChangeText={(occupation) => setRemplissage((actuel) => ({ ...actuel, occupation }))} keyboardType="decimal-pad" placeholder="Occupation %" placeholderTextColor="#94A3B8" />
                  </View>
                  <TouchableOpacity style={[styles.secondaryBtn, styles.remplissageBtn]} onPress={appliquerRemplissage}>
                    <Text style={styles.secondaryBtnText}>Appliquer à toutes les files</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.matrice}>
                  <View style={styles.matriceLigne}>
                    <Text style={[styles.matriceFile, styles.skillLabel]}>File</Text>
                    {(typeFlux === 'chaud'
                      ? [
                          ['dmt', 'DMT cible (s)'],
                          ['sla', 'SLA (%)'],
                          ['delaiCible', 'Délai cible (s)'],
                          ['shrinkage', 'Shrinkage (%)'],
                          ['occupation', 'Occupation (%)'],
                          ['amplitude', 'Amplitude (h)'],
                        ]
                      : [
                          ['dmt', 'DMT cible (s)'],
                          ['delaiTraitement', 'Délai (h)'],
                          ['backlog', 'Backlog'],
                          ['shrinkage', 'Shrinkage (%)'],
                          ['occupation', 'Occupation (%)'],
                          ['amplitude', 'Amplitude (h)'],
                          ['heuresTravaillees', 'Heures / jour / ETP'],
                        ]).map(([champ, label]) => (
                      <Text key={champ} style={[styles.matriceCell, styles.skillLabel]}>{label}</Text>
                    ))}
                  </View>
                  {(series.length ? series : [{ skill: SKILL_DEFAUT }]).map((serie) => {
                    const cfg = ciblesSkills[serie.skill] ?? configSkill('dmtMoyen' in serie ? serie.dmtMoyen : null, socleConfig());
                    const colonnes = typeFlux === 'chaud'
                      ? (['dmt', 'sla', 'delaiCible', 'shrinkage', 'occupation', 'amplitude'] as const)
                      : (['dmt', 'delaiTraitement', 'backlog', 'shrinkage', 'occupation', 'amplitude', 'heuresTravaillees'] as const);
                    return (
                      <View key={serie.skill} style={styles.matriceLigne}>
                        <Text style={[styles.matriceFile, styles.matriceNom]} numberOfLines={1}>{serie.skill}</Text>
                        {colonnes.map((champ) => (
                          <View key={champ} style={styles.matriceCell}>
                            <TextInput style={styles.skillInput} value={cfg[champ]} onChangeText={(valeur) => majConfig(serie.skill, champ, valeur)} keyboardType="decimal-pad" />
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
              </View>
            </View>
          ) : null}

          {currentStep === 4 ? (
            <View nativeID="tour-bilan" style={[styles.panel, tourIndex === 3 && styles.tourCible]}>
              <Text style={styles.panelTitle}>Étape 4 : Restitution et horizon</Text>
              <View style={styles.horizonRow}>
                <TouchableOpacity style={[styles.horizonBtn, horizon === 'court_terme' && styles.modelBtnActive]} onPress={() => setHorizon('court_terme')}>
                  <Text style={[styles.modelBtnText, horizon === 'court_terme' && styles.modelBtnTextActive]}>Court terme</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.horizonBtn, horizon === 'long_terme' && styles.modelBtnActive]} onPress={() => setHorizon('long_terme')}>
                  <Text style={[styles.modelBtnText, horizon === 'long_terme' && styles.modelBtnTextActive]}>Long terme</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>Court terme : 30 jours. Long terme : 12 mois. Le modèle sert à projeter les volumes avant le calcul d’ETP.</Text>

              <View style={styles.modelRow}>
                {MODES_PREVISION.map((mode) => {
                  const actif = selectedModel === mode.id;
                  return (
                    <TouchableOpacity
                      key={mode.id}
                      style={[styles.modelBtn, styles.modelBtnDash, styles.modelBtnPile, actif && styles.modelBtnActive]}
                      onPress={() => choisirModele(mode.id, true)}
                    >
                      <View style={styles.modelBtnTitre}>
                        <Text style={[styles.modelBtnText, actif && styles.modelBtnTextActive]}>{mode.titre}</Text>
                      </View>
                      {mode.sous ? <Text style={[styles.modelBtnSous, actif && styles.modelBtnSousActif]}>{mode.sous}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={[styles.generateBtn, loading && styles.generateBtnDisabled]} onPress={handleGenerate} disabled={loading}>
                {loading ? <ActivityIndicator color="#0F2D46" /> : <Text style={styles.generateBtnText}>{plan ? 'Recalculer le plan de production' : 'Générer le plan de production'}</Text>}
              </TouchableOpacity>

              {multi ? (
                <View style={styles.skillBloc}>
                  <SelecteurSkill skills={series.map((serie) => serie.skill)} actif={skillCourant} onChoisir={setSkillActif} />
                  <View style={styles.skillChamp}>
                    <Text style={styles.skillLabel}>ETP dispo</Text>
                    <TextInput
                      style={[styles.skillInput, skillCourant === VUE_GLOBALE && styles.skillInputLecture]}
                      value={skillCourant === VUE_GLOBALE ? (etpSaisieVue == null ? '' : etpSaisieVue.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })) : (ciblesSkills[skillCourant]?.etp ?? '')}
                      editable={skillCourant !== VUE_GLOBALE}
                      onChangeText={(texte) => { if (skillCourant !== VUE_GLOBALE) majConfig(skillCourant, 'etp', texte); }}
                      keyboardType="decimal-pad"
                      placeholder={skillCourant === VUE_GLOBALE ? '—' : '0'}
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  <Text style={styles.hint}>{skillCourant === VUE_GLOBALE ? 'Somme des ETP disponibles. Les paramètres de calcul se règlent à l’étape 3.' : 'ETP disponible de cette file. Les autres paramètres se règlent à l’étape 3.'}</Text>
                </View>
              ) : null}

              {plan ? (
                <View style={styles.resultat}>
                  <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                      <Text style={styles.statLabel}>{ajustementsActifs ? 'Volume ajusté' : 'Volume prévu'}</Text>
                      <Text style={styles.statValue}>{volumeTotal.toLocaleString('fr-FR')}</Text>
                    </View>
                    <View style={styles.statCard}>
                      <Text style={styles.statLabel}>ETP requis moyen</Text>
                      <Text style={styles.statValue}>{etpMoyenRequis.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</Text>
                    </View>
                    <View style={styles.statCard}>
                      <View style={styles.kpiHead}>
                        <Text style={styles.statLabel}>Couverture</Text>
                        {couvertureMoyenne != null ? (
                          <Text style={[styles.kpiBadge, teinteCouverture(couvertureMoyenne) === 'bas' && styles.kpiBadgeBas, teinteCouverture(couvertureMoyenne) === 'haut' && styles.kpiBadgeHaut, teinteCouverture(couvertureMoyenne) === 'ok' && styles.kpiBadgeOk]}>
                            {libelleCouverture(couvertureMoyenne)}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={[styles.statValue, { color: couleurCouverture(couvertureMoyenne) }]}>{couvertureMoyenne != null ? texteCouverture(couvertureMoyenne) : '—'}</Text>
                    </View>
                  </View>
                  <CombinedChart points={(planAjuste ?? plan).map((row) => ({ label: dateCourte(row.date), volume: row.volume_prevu, etp: row.etp_moyen_requis }))} />
                  <View style={styles.planHeader}>
                    <Text style={styles.planHeaderTitle}>Plan de production</Text>
                    <View style={styles.planActions}>
                      <TouchableOpacity
                        style={[styles.ajustToggle, ajustementsOuverts && styles.ajustToggleOn, !isPro && styles.modelBtnLocked]}
                        onPress={() => {
                          if (!isPro) {
                            setModalePro(true);
                            return;
                          }
                          setAjustementsOuverts((ouvert) => !ouvert);
                        }}
                      >
                        <Ionicons name={!isPro ? 'lock-closed' : 'options-outline'} size={16} color={ajustementsOuverts && isPro ? '#F8FAFC' : '#0F2D46'} />
                        <Text style={[styles.ajustToggleTexte, ajustementsOuverts && isPro && styles.ajustToggleTexteOn]}>Ajustements événementiels (% métier)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.syntheseBtn} onPress={() => { void ouvrirSynthese(); }}>
                        <Ionicons name="bar-chart-outline" size={16} color="#F4C430" />
                        <Text style={styles.syntheseBtnText}>Synthèse & Comparatif</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.exportBtn, !isPro && styles.modelBtnLocked]} onPress={handleExport}>
                        {!isPro ? <Ionicons name="lock-closed" size={16} color="#0F2D46" /> : null}
                        <Text style={styles.exportBtnText}>Exporter en Excel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {planningVue ? <Text style={styles.hint}>Écart et couverture calculés à partir du planning ETP importé.</Text> : null}
                  {multi && planningActif && skillCourant !== VUE_GLOBALE ? <Text style={styles.hint}>Cette file utilise l'ETP saisi ci-dessus. La vue globale conserve le planning jour par jour.</Text> : null}
                  {periodesSansEtp ? <Text style={styles.hint}>Certaines périodes du plan n’ont pas de correspondance dans le fichier ETP.</Text> : null}
                  {ajustementsActifs ? (
                    <GrilleAjustements
                      plan={plan}
                      saisies={ajustementsSaisis}
                      onSaisie={(cle, texte) => setAjustementsSaisis((actuel) => ({ ...actuel, [cle]: texte }))}
                    />
                  ) : null}
                  <HorizontalPlan plan={planAjuste ?? plan} couvertures={couvertures} volumeAjuste={ajustementsActifs} />

                  {!planningActif && !multi ? (
                    <View style={styles.ajustBloc}>
                      <View style={styles.titleRow}>
                        <Text style={styles.ajustTitre}>Ajuster ETP dispo</Text>
                        {!isPro ? <Text style={styles.proBadge}>Pro</Text> : null}
                      </View>
                      <Text style={styles.hint}>Sans planning importé, un effectif moyen est appliqué à chaque période du tableau.</Text>
                      <View style={styles.ajustRow}>
                        <View style={styles.ajustChamp}>
                          <ChampParam label="ETP Moyens par jour" info="Effectif présent sur le plateau : Nombre moyen de conseillers en ligne ou prêts à prendre des flux (FTE)." value={etpMoyens} onChangeText={saisirEtpMoyen} />
                        </View>
                        <TouchableOpacity style={[styles.generateBtn, styles.ajustBtn]} onPress={calculerMoyens}>
                          <Text style={styles.generateBtnText}>{etpMoyensAppliques == null ? 'Calculer' : 'Rafraîchir'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <TouchableOpacity style={[styles.footerBack, currentStep === 1 && styles.generateBtnDisabled]} onPress={retour} disabled={currentStep === 1}>
            <Text style={styles.footerBackText}>Retour</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.footerNext, loading && styles.generateBtnDisabled]} onPress={suite} disabled={loading && currentStep === 4}>
            {loading && currentStep === 4 ? <ActivityIndicator color="#F4C430" /> : <Text style={styles.footerNextText}>{currentStep === 4 ? (plan ? 'Recalculer' : 'Générer le plan') : 'Étape suivante'}</Text>}
          </TouchableOpacity>
        </View>
        <LienReinitialisation />
        <PiedLegal />
      </View>
      {toast ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
      {tourIndex != null ? <TourGuide index={tourIndex} onSuivant={avancerTour} onPasser={terminerTour} /> : null}
      <ModaleNouveautes visible={nouveautesOuvertes} onFermer={fermerNouveautes} />
      <SyntheseExecutive
        visible={syntheseOuverte}
        chargement={syntheseChargement}
        erreur={syntheseErreur}
        onFermer={() => setSyntheseOuverte(false)}
        typeFlux={typeFlux}
        aht={cadreSynthese.cibles.dmt}
        sla={cadreSynthese.cibles.sla}
        tempsCible={cadreSynthese.cibles.delaiCible}
        delaiTraitementHeures={cadreSynthese.cibles.delaiTraitement}
        tauxOccupation={cadreSynthese.cibles.occupation}
        shrinkage={cadreSynthese.cibles.shrinkage}
        heuresOuverture={cadreSynthese.cibles.amplitude}
        etpDispo={cadreSynthese.etpDispo}
        planning={cadreSynthese.planning}
        perimetre={cadreSynthese.perimetre}
        skills={series.map((serie) => serie.skill)}
        skillActif={skillSyntheseCourant}
        onSkill={setSkillSynthese}
        holt={cadreSynthese.holt}
        light={cadreSynthese.light}
        pourcentages={saisiesAjustement}
        exportsVerrouilles={!isPro}
        onExportsVerrouilles={() => setModalePro(true)}
      />
      <ModalePro visible={modalePro} onFermer={() => setModalePro(false)} />
      <ModaleFeedback
        visible={feedbackOuvert}
        type={typeRetour}
        message={messageRetour}
        envoi={envoiRetour}
        onType={setTypeRetour}
        onMessage={setMessageRetour}
        onFermer={() => { if (!envoiRetour) setFeedbackOuvert(false); }}
        onEnvoyer={() => { void envoyerFeedback(); }}
      />
    </SafeAreaView>
  );
}

function comparatifMock(horizonDemande: Horizon, volumes: number[]) {
  const base = planMock(horizonDemande, volumes);
  const varier = (facteur: number, wape: number): ResultatModele => ({
    wape,
    plan: base.map((ligne) => ({
      ...ligne,
      volume_prevu: Math.max(0, Math.round(ligne.volume_prevu * facteur)),
      etp_moyen_requis: Math.max(1, Math.round(ligne.etp_moyen_requis * facteur * 10) / 10),
    })),
  });
  return { holt: varier(1.08, 18.6), light: varier(0.94, 12.4) };
}

function delaiJoursDepuisHeures(heures: string) {
  const valeur = parseFloat(heures);
  if (!Number.isFinite(valeur) || valeur <= 0) return 1;
  return Math.max(1, Math.round(valeur / 24));
}

function moyenne(valeurs: number[]) {
  if (!valeurs.length) return null;
  return valeurs.reduce((somme, valeur) => somme + valeur, 0) / valeurs.length;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' },
  headerContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 20, gap: 12, flexWrap: 'wrap' },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, minWidth: 0 },
  headerBrandEtroit: { width: '100%' },
  logoBadge: { backgroundColor: '#0F2D46', padding: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#F4C430', alignItems: 'center', justifyContent: 'center' },
  headerTextContainer: { alignItems: 'flex-start' },
  brandTitle: { fontSize: 26, fontWeight: '700', color: '#0F2D46', letterSpacing: 1 },
  brandTitleEtroit: { fontSize: 22 },
  brandTitleSub: { color: '#F4C430', fontWeight: '300' },
  brandByline: { fontSize: 12, color: '#687581', fontWeight: '500', marginTop: 1 },
  brandSubtitle: { fontSize: 11, color: '#687581', fontWeight: '500', letterSpacing: 1.5, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 1, justifyContent: 'flex-end' },
  headerActionsEtroit: { width: '100%', justifyContent: 'flex-start' },
  logoutBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#0F2D46', justifyContent: 'center' },
  resetBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  resetText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  devBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  devBadgePro: { backgroundColor: '#1F7A4D' },
  devBadgeFree: { backgroundColor: '#A33B32' },
  devBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  logoutText: { color: '#0F2D46', fontSize: 12, fontWeight: '700' },
  voile: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.48)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modale: { width: '100%', maxWidth: 560, maxHeight: '88%', backgroundColor: '#FFFFFF', borderRadius: 8, padding: 24, gap: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  nouveauteVoile: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.48)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  nouveaute: { width: '100%', maxWidth: 640, backgroundColor: '#FFFFFF', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 10, gap: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  nouveauteTitre: { fontSize: 15, fontWeight: '600', color: '#0F2D46', marginBottom: 2 },
  nouveautePoint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nouveautePuce: { fontSize: 12, lineHeight: 15 },
  nouveauteTexte: { flex: 1, color: '#0F2D46', fontSize: 10.5, lineHeight: 14 },
  nouveauteFort: { fontWeight: '600' },
  nouveauteBtn: { backgroundColor: '#F4C430', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 4 },
  nouveauteBtnTexte: { color: '#0F2D46', fontSize: 14, fontWeight: '600' },
  modaleTitre: { fontSize: 20, fontWeight: '600', color: '#0F2D46' },
  modaleLead: { color: '#687581', fontSize: 14, lineHeight: 20 },
  modalePoint: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  modalePuce: { color: '#F4C430', fontSize: 18, fontWeight: '600', lineHeight: 22 },
  modalePointCorps: { flex: 1, gap: 2 },
  modalePointTitre: { color: '#0F2D46', fontSize: 15, fontWeight: '700', lineHeight: 22 },
  modalePointTexte: { flex: 1, color: '#0F2D46', fontSize: 15, lineHeight: 22 },
  modaleScroll: { flexGrow: 0, maxHeight: 560 },
  modaleScrollContenu: { gap: 12 },
  proForm: { gap: 10 },
  proChamp: { gap: 4 },
  proLabel: { color: '#64748B', fontSize: 12, fontWeight: '600' },
  proInput: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', height: 40, paddingHorizontal: 16, borderRadius: 8, fontSize: 14, color: '#1E293B', width: '100%' },
  proConfirmation: { backgroundColor: '#E7F6F4', borderWidth: 1, borderColor: '#2E8F86', borderRadius: 8, padding: 12 },
  proConfirmationTexte: { color: '#0F2D46', fontSize: 14, lineHeight: 20 },
  proErreur: { color: '#A33B32', fontSize: 13, lineHeight: 18 },
  modaleFermer: { alignItems: 'center', paddingVertical: 4 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FFFFFF' },
  puceActive: { backgroundColor: '#0F2D46', borderColor: '#0F2D46' },
  puceTexte: { color: '#0F2D46', fontSize: 13, fontWeight: '700' },
  puceTexteActif: { color: '#FFFFFF' },
  feedbackSaisie: { minHeight: 120, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#1E293B', textAlignVertical: 'top' },
  card: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', width: '100%', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  stepText: { fontSize: 18, color: '#0F2D46', marginBottom: 8, fontWeight: '700' },
  lead: { color: '#687581', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  importBloc: { width: '100%', gap: 12, marginTop: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, backgroundColor: '#F8FAFC' },
  importTabs: { flexDirection: 'row', gap: 8 },
  importTab: { flex: 1, minHeight: 42, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  importTabOn: { backgroundColor: '#0F2D46', borderColor: '#0F2D46' },
  importTabText: { color: '#0F2D46', fontWeight: '600', fontSize: 13, textAlign: 'center' },
  importTabTextOn: { color: '#FFFFFF' },
  lienBloc: { width: '100%', gap: 8 },
  lienInput: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', height: 40, paddingHorizontal: 16, borderRadius: 8, fontSize: 14, color: '#1E293B', width: '100%' },
  uploadBtn: { backgroundColor: '#F4C430', minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, width: '100%', alignItems: 'center', justifyContent: 'center' },
  uploadBtnText: { color: '#0F2D46', fontSize: 14, fontWeight: '600' },
  successBox: { marginTop: 16, backgroundColor: '#F8FAFC', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', width: '100%' },
  successText: { color: '#1E293B', fontWeight: '600' },
  nextBtn: { marginTop: 16, backgroundColor: '#0F2D46', minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  nextBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  backBtn: { alignSelf: 'flex-start', paddingBottom: 8 },
  backBtnText: { color: '#687581', fontWeight: '600', fontSize: 14 },
  secondaryBtn: { marginTop: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { color: '#1E293B', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  badgeFiles: { marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  badgeFilesTexte: { color: '#1E293B', fontSize: 13, fontWeight: '600' },
  remplissage: { marginTop: 12, gap: 8, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, backgroundColor: '#F8FAFC' },
  remplissageLigne: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  remplissageChamp: { width: 120 },
  remplissageLabel: { fontSize: 12, fontWeight: '500', color: '#64748B', marginBottom: 4 },
  remplissageInput: { width: 120 },
  remplissageBtn: { marginTop: 0 },
  matrice: { marginTop: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  matriceLigne: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  matriceFile: { width: 140, paddingHorizontal: 10, paddingVertical: 8 },
  matriceCell: { width: 128, paddingHorizontal: 8, paddingVertical: 8 },
  matriceNom: { color: '#0F2D46', fontSize: 13, fontWeight: '600' },
  skillBloc: { marginTop: 16, gap: 8 },
  skillBandeau: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChamp: { flexGrow: 1, flexBasis: 140, gap: 4 },
  skillLabel: { color: '#687581', fontSize: 11, fontWeight: '500' },
  skillInput: { height: 40, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, color: '#1E293B', fontSize: 14, backgroundColor: '#FFFFFF' },
  skillInputLecture: { backgroundColor: '#F8FAFC', color: '#1E293B' },
  actionBtn: { flexGrow: 1, flexBasis: 220 },
  modelBtn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  modelBtnPile: { flexDirection: 'column', alignItems: 'center', gap: 4 },
  modelBtnTitre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  modelBtnSous: { color: '#64748B', fontSize: 12, fontWeight: '500', lineHeight: 16, textAlign: 'center' },
  modelBtnSousActif: { color: '#E2E8F0' },
  modelBtnLocked: { opacity: 0.55 },
  proBadge: { backgroundColor: '#F4C430', color: '#0F2D46', fontSize: 11, fontWeight: '600', overflow: 'hidden', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15, 45, 70, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 20 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 24, width: '100%', maxWidth: 420 },
  modalTitle: { color: '#0F2D46', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  modelBtnActive: { backgroundColor: '#0F2D46', borderColor: '#0F2D46' },
  modelBtnText: { color: '#0F2D46', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  modelBtnTextActive: { color: '#F4C430', fontWeight: '600' },
  generateBtn: { marginTop: 10, backgroundColor: '#7FC8C0', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 40 },
  generateBtnDisabled: { opacity: 0.7 },
  generateBtnText: { color: '#0F2D46', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  horizonRow: { flexDirection: 'row', width: '100%', gap: 12, marginBottom: 8 },
  horizonBtn: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dashScroll: { flexGrow: 1, alignItems: 'center', padding: 16, paddingBottom: 220 },
  dash: { width: '100%', maxWidth: 1100, alignItems: 'stretch' },
  panel: { backgroundColor: '#FFFFFF', padding: 24, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', width: '100%', marginBottom: 16, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  panelTitle: { fontSize: 18, color: '#0F2D46', fontWeight: '700', marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 16, marginBottom: 12, gap: 12 },
  planHeaderTitle: { fontSize: 18, color: '#0F2D46', fontWeight: '700' },
  ajustToggle: { alignSelf: 'flex-start', minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#F4C430', backgroundColor: '#FFF8E1', flexDirection: 'row', alignItems: 'center', gap: 8 },
  ajustToggleOn: { backgroundColor: '#0F2D46', borderColor: '#0F2D46' },
  ajustToggleTexte: { color: '#0F2D46', fontSize: 14, fontWeight: '600' },
  ajustToggleTexteOn: { color: '#F8FAFC' },
  grilleAjust: { marginTop: 12, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  grilleTable: { minWidth: 640 },
  grilleEntete: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F2D46' },
  grilleLigne: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  grilleLigneAlt: { backgroundColor: '#F8FAFC' },
  grilleCellule: { paddingVertical: 8, paddingHorizontal: 12, justifyContent: 'center' },
  grillePeriode: { width: 220, color: '#1E293B', fontSize: 14 },
  grilleNombre: { width: 140, color: '#1E293B', fontSize: 14, textAlign: 'right' },
  grilleNombreFort: { fontWeight: '600', color: '#0F2D46' },
  grilleSaisie: { width: 140, alignItems: 'flex-end' },
  grilleEnteteTexte: { color: '#F8FAFC', fontSize: 13, fontWeight: '600' },
  grilleInput: { width: 96, minHeight: 40, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 12, color: '#1E293B', fontSize: 14, backgroundColor: '#FFFFFF', textAlign: 'center' },
  grilleNote: { color: '#687581', fontSize: 13, lineHeight: 18, paddingHorizontal: 12, paddingVertical: 10 },
  planActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' },
  syntheseBtn: { backgroundColor: '#0F2D46', minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  syntheseBtnText: { color: '#F4C430', fontWeight: '600', fontSize: 14 },
  exportBtn: { backgroundColor: '#F4C430', minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 8 },
  proHeaderBtn: { minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#F4C430', flexDirection: 'row', alignItems: 'center', gap: 8 },
  proHeaderTexte: { color: '#0F2D46', fontSize: 14, fontWeight: '600' },
  installBtn: { minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 8 },
  installBtnTexte: { color: '#0F2D46', fontSize: 14, fontWeight: '600' },
  installEtape: { color: '#1E293B', fontSize: 14, lineHeight: 20 },
  boutonLigne: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportBtnText: { color: '#0F2D46', fontWeight: '600', fontSize: 14 },
  paramGrid: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'flex-start', gap: 12, width: '100%', marginTop: 16 },
  paramGridLigne: { flexWrap: 'nowrap' },
  paramField: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, position: 'relative' },
  paramFieldOuvert: { zIndex: 5 },
  bulle: { position: 'absolute', top: 26, left: 0, width: 220, zIndex: 6, backgroundColor: '#0F2D46', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  bulleTexte: { color: '#FFFFFF', fontSize: 12, lineHeight: 16 },
  aideImport: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  lienDiscret: { color: '#64748B', fontSize: 13, fontWeight: '500', textDecorationLine: 'underline' },
  exempleBtn: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', borderRadius: 8, minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, justifyContent: 'center' },
  exempleBtnText: { color: '#0F2D46', fontSize: 14, fontWeight: '600' },
  tourCible: { borderWidth: 2, borderColor: '#F4C430', borderRadius: 8, padding: 8 },
  tourDock: { position: 'absolute', left: 16, right: 16, bottom: 108, alignItems: 'center', zIndex: 40 },
  tourCarte: { width: '100%', maxWidth: 440, backgroundColor: '#0F2D46', borderRadius: 8, padding: 16, gap: 8 },
  tourKicker: { color: '#F4C430', fontSize: 12, fontWeight: '600' },
  tourTitre: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  tourTexte: { color: '#E2E8F0', fontSize: 14, lineHeight: 20 },
  tourActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 4 },
  tourPasser: { color: '#94A3B8', fontSize: 13, fontWeight: '700' },
  tourSuivant: { backgroundColor: '#F4C430', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  tourSuivantTexte: { color: '#0F2D46', fontSize: 14, fontWeight: '600' },
  encartInfo: { marginTop: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 14, gap: 12 },
  encartInfoTexte: { color: '#1E293B', fontSize: 14, lineHeight: 21, flex: 1 },
  fluxMessageLigne: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 },
  fluxMessage: { color: '#1E293B', fontSize: 14, lineHeight: 20, flex: 1 },
  paramFieldDense: { flexBasis: 0, minWidth: 0, flexGrow: 1, flexShrink: 1, alignSelf: 'stretch' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 5, minHeight: 24 },
  labelInline: { color: '#1E293B', fontWeight: '500' },
  labelDense: { fontSize: 12, flexShrink: 1 },
  infoIcon: { width: 16, height: 16, flexShrink: 0 },
  paramInput: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', height: 40, paddingHorizontal: 16, borderRadius: 8, fontSize: 14, color: '#1E293B', width: '100%' },
  paramInputDense: { paddingHorizontal: 8, marginTop: 'auto' },
  modelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 12, width: '100%', marginTop: 16 },
  modelBtnDash: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 180 },
  hTable: { width: '100%', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, overflow: 'hidden' },
  hScroll: { width: '100%' },
  hRow: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#FFFFFF' },
  hRowAlt: { backgroundColor: '#F8FAFC' },
  hLabel: { width: 210, minWidth: 210, paddingVertical: 12, paddingHorizontal: 16, color: '#1E293B', fontWeight: '500', fontSize: 14, backgroundColor: '#FFFFFF', flexShrink: 0 },
  hLabelAlt: { backgroundColor: '#F8FAFC' },
  hLabelHead: { backgroundColor: '#0F172A', color: '#F8FAFC', fontWeight: '600', fontSize: 13 },
  hHeadCell: { width: 85, minWidth: 85, paddingVertical: 12, paddingHorizontal: 8, textAlign: 'center', color: '#F8FAFC', fontWeight: '600', fontSize: 13, backgroundColor: '#0F172A', flexShrink: 0 },
  hCell: { width: 85, minWidth: 85, paddingVertical: 12, paddingHorizontal: 8, textAlign: 'center', color: '#1E293B', fontSize: 14, flexShrink: 0 },
  hCellFort: { fontWeight: '700' },
  hint: { color: '#687581', fontSize: 12, lineHeight: 16, marginTop: 6 },
  stepper: { flexDirection: 'row', width: '100%', marginBottom: 16, gap: 8 },
  stepItem: { flex: 1, alignItems: 'center', gap: 6 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#C5CDD6', alignItems: 'center', justifyContent: 'center' },
  stepDotOn: { backgroundColor: '#0F2D46', borderColor: '#0F2D46' },
  stepDotDone: { backgroundColor: '#7FC8C0', borderColor: '#7FC8C0' },
  stepNum: { color: '#687581', fontWeight: '600' },
  stepNumOn: { color: '#F4C430' },
  stepNumDone: { color: '#0F2D46' },
  panelTitleInline: { marginBottom: 0 },
  stepCaption: { fontSize: 12, color: '#687581', fontWeight: '500', textAlign: 'center' },
  stepCaptionOn: { color: '#0F2D46' },
  dropZone: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1', borderRadius: 8, paddingVertical: 28, paddingHorizontal: 16, alignItems: 'center', backgroundColor: '#FFFFFF', gap: 8 },
  dropTitle: { color: '#0F2D46', fontWeight: '600', fontSize: 15, textAlign: 'center' },
  dropDetail: { color: '#687581', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  fluxRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  fluxCard: { flexGrow: 1, flexBasis: 280, minHeight: 112, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, justifyContent: 'center', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  fluxCardOn: { backgroundColor: '#0F2D46', borderColor: '#F4C430' },
  fluxTitle: { fontSize: 16, fontWeight: '600', color: '#0F2D46', marginBottom: 8 },
  fluxTitleOn: { color: '#FFFFFF' },
  fluxDetail: { color: '#687581', fontSize: 14, lineHeight: 20 },
  fluxDetailOn: { color: '#F4C430' },
  resultat: { marginTop: 20 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  statCard: { flexGrow: 1, flexBasis: 160, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  statLabel: { color: '#64748B', fontSize: 12, fontWeight: '500', marginBottom: 4 },
  statValue: { color: '#0F2D46', fontSize: 22, fontWeight: '600' },
  kpiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  kpiBadge: { overflow: 'hidden', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, fontWeight: '600' },
  kpiBadgeOk: { backgroundColor: '#DCFCE7', color: '#166534' },
  kpiBadgeBas: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  kpiBadgeHaut: { backgroundColor: '#FFEDD5', color: '#9A3412' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingHorizontal: 16, paddingVertical: 12 },
  footerInner: { width: '100%', maxWidth: 1100, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  footerBack: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  footerBackText: { color: '#1E293B', fontWeight: '600', fontSize: 14 },
  footerNext: { flex: 1, minWidth: 0, backgroundColor: '#0F2D46', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  footerNextText: { color: '#F4C430', fontWeight: '600', fontSize: 14 },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 128, alignSelf: 'center', maxWidth: 420, backgroundColor: '#0F2D46', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  toastText: { color: '#F8FAFC', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  ajustBloc: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E6E9EE' },
  ajustTitre: { color: '#0F2D46', fontSize: 16, fontWeight: '600' },
  ajustRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginTop: 8 },
  ajustChamp: { width: 300, maxWidth: '100%', flexDirection: 'row', flexGrow: 0 },
  ajustBtn: { width: 'auto', minWidth: 150, marginTop: 0, marginBottom: 0, alignSelf: 'flex-end' },
});
