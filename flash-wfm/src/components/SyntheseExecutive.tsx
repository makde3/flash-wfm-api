import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SelecteurSkill from './SelecteurSkill';
import { exporterSyntheseExcel, exporterSynthesePptx, type DossierSynthese, type IdSynthese, type ModeleSynthese } from '../lib/exportSynthese';
import { couverturesDuPlan, type EtpJour, type PlanLigne, type TypeFlux } from '../lib/wizard';

export type ResultatModele = {
  plan: PlanLigne[];
  wape: number | null;
};

type Indicateur = {
  id: IdSynthese;
  nom: string;
  wape: number | null;
  volume: number;
  etpMoyen: number;
  dispo: number | null;
  ecart: number | null;
  picEtp: number;
  picPeriode: string;
  vide: boolean;
};

type Props = {
  visible: boolean;
  chargement: boolean;
  erreur: string | null;
  onFermer: () => void;
  typeFlux: TypeFlux;
  aht: string;
  sla: string;
  tempsCible: string;
  delaiTraitementHeures: string;
  tauxOccupation: string;
  shrinkage: string;
  heuresOuverture: string;
  etpDispo: number | null;
  planning: EtpJour[] | null;
  perimetre: string;
  skills: string[];
  skillActif: string;
  onSkill: (skill: string) => void;
  holt: ResultatModele | null;
  light: ResultatModele | null;
};

function nombreFR(valeur: number, decimales: number) {
  return valeur.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function etpTexte(valeur: number) {
  return nombreFR(valeur, 1);
}

function moyenne(valeurs: number[]) {
  if (!valeurs.length) return null;
  return valeurs.reduce((somme, valeur) => somme + valeur, 0) / valeurs.length;
}

function poidsConsensus(wapeHolt: number | null, wapeLight: number | null) {
  if (wapeHolt == null || wapeLight == null) return [0.5, 0.5];
  const holt = 1 / Math.max(wapeHolt, 0.1);
  const light = 1 / Math.max(wapeLight, 0.1);
  const somme = holt + light;
  return [holt / somme, light / somme];
}

function retenirAuto(holt: ResultatModele | null, light: ResultatModele | null): ResultatModele | null {
  if (!holt?.plan.length) return light?.plan.length ? light : null;
  if (!light?.plan.length) return holt;
  if (holt.wape == null && light.wape == null) return holt;
  if (holt.wape == null) return light;
  if (light.wape == null) return holt;
  return light.wape < holt.wape ? light : holt;
}

function fusionnerPlans(holt: PlanLigne[], light: PlanLigne[], poidsHolt: number, poidsLight: number): PlanLigne[] {
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

function wapeHybride(wapeHolt: number | null, wapeLight: number | null) {
  if (wapeHolt == null && wapeLight == null) return null;
  if (wapeHolt == null) return wapeLight;
  if (wapeLight == null) return wapeHolt;
  const [poidsHolt, poidsLight] = poidsConsensus(wapeHolt, wapeLight);
  return Math.round((wapeHolt * poidsHolt + wapeLight * poidsLight) * 10) / 10;
}

function resultatHybride(holt: ResultatModele | null, light: ResultatModele | null): ResultatModele | null {
  if (!holt?.plan.length) return light?.plan.length ? light : null;
  if (!light?.plan.length) return holt;
  const [poidsHolt, poidsLight] = poidsConsensus(holt.wape, light.wape);
  return {
    plan: fusionnerPlans(holt.plan, light.plan, poidsHolt, poidsLight),
    wape: wapeHybride(holt.wape, light.wape),
  };
}

function indiquer(id: IdSynthese, nom: string, resultat: ResultatModele, planning: EtpJour[] | null, etpDispo: number | null): Indicateur {
  const volume = resultat.plan.reduce((somme, ligne) => somme + ligne.volume_prevu, 0);
  const etpMoyen = resultat.plan.reduce((somme, ligne) => somme + ligne.etp_moyen_requis, 0) / resultat.plan.length;
  const couvertures = couverturesDuPlan(resultat.plan, planning, planning ? null : etpDispo);
  const ecarts = (couvertures ?? []).map((ligne) => ligne.ecart).filter((valeur): valeur is number => valeur != null && Number.isFinite(valeur));
  const dispos = (couvertures ?? []).map((ligne) => ligne.etpDispo).filter((valeur): valeur is number => valeur != null && Number.isFinite(valeur));
  const pic = resultat.plan.reduce((meilleur, ligne) => (ligne.etp_moyen_requis > meilleur.etp_moyen_requis ? ligne : meilleur));
  return {
    id,
    nom,
    wape: resultat.wape,
    volume,
    etpMoyen,
    dispo: moyenne(dispos),
    ecart: moyenne(ecarts),
    picEtp: pic.etp_moyen_requis,
    picPeriode: pic.date,
    vide: false,
  };
}

const PRIORITE: Record<IdSynthese, number> = { auto: 0, ia: 1, saison: 2, hybride: 3 };

function choisirRecommande(indicateurs: Indicateur[]): IdSynthese | null {
  const notes = indicateurs.filter((modele) => !modele.vide && modele.wape != null);
  if (notes.length) {
    notes.sort((a, b) => (a.wape ?? 0) - (b.wape ?? 0) || PRIORITE[a.id] - PRIORITE[b.id]);
    return notes[0].id;
  }
  return indicateurs.find((modele) => !modele.vide)?.id ?? null;
}

function phraseVerdict(modele: Indicateur) {
  const nom = modele.nom;
  const recommande = etpTexte(modele.etpMoyen);
  if (modele.dispo == null || modele.ecart == null) {
    return `${nom} préconise un besoin moyen de ${recommande} ETP sur la période. Renseignez votre effectif disponible pour estimer l'écart.`;
  }
  const dispo = etpTexte(modele.dispo);
  const ecartArrondi = Math.round(modele.ecart * 10) / 10;
  const ecart = etpTexte(Math.abs(ecartArrondi));
  if (ecartArrondi < 0) {
    return `${nom} préconise un besoin moyen de ${recommande} ETP sur la période. Avec votre effectif actuel (${dispo} ETP), il vous manque ${ecart} ETP pour pouvoir respecter votre objectif de service.`;
  }
  if (ecartArrondi > 0) {
    return `${nom} préconise un besoin moyen de ${recommande} ETP sur la période. Votre effectif actuel (${dispo} ETP) présente un surplus de ${ecart} ETP par rapport à votre objectif de service.`;
  }
  return `${nom} préconise un besoin moyen de ${recommande} ETP sur la période. Votre effectif actuel (${dispo} ETP) est parfaitement dimensionné pour respecter votre objectif de service.`;
}

function texteEcart(valeur: number) {
  const signe = valeur > 0 ? '+' : '';
  const nature = valeur < -0.05 ? 'sous-effectif' : valeur > 0.05 ? 'sur-effectif' : 'aligné';
  return `${signe}${etpTexte(valeur)} (${nature})`;
}

function mesure(texte: string): number | string {
  const valeur = Number(String(texte).replace(',', '.'));
  return Number.isFinite(valeur) ? valeur : '—';
}

function lancerExport(action: () => void | Promise<void>) {
  if (Platform.OS !== 'web') {
    alert("Veuillez ouvrir l'application depuis un navigateur web pour télécharger le fichier.");
    return;
  }
  try {
    const resultat = action();
    if (resultat && typeof (resultat as Promise<void>).then === 'function') {
      void (resultat as Promise<void>).catch((error: unknown) => {
        console.error(error);
        alert('Erreur lors de la génération du fichier.');
      });
    }
  } catch (error) {
    console.error(error);
    alert('Erreur lors de la génération du fichier.');
  }
}

export default function SyntheseExecutive({
  visible,
  chargement,
  erreur,
  onFermer,
  typeFlux,
  aht,
  sla,
  tempsCible,
  delaiTraitementHeures,
  tauxOccupation,
  shrinkage,
  heuresOuverture,
  etpDispo,
  planning,
  perimetre,
  skills,
  skillActif,
  onSkill,
  holt,
  light,
}: Props) {
  const saison = holt?.plan.length ? holt : null;
  const ia = light?.plan.length ? light : null;
  const colonnes: { id: IdSynthese; nom: string; resultat: ResultatModele | null }[] = [
    { id: 'auto', nom: 'Auto (Recommandé)', resultat: retenirAuto(saison, ia) },
    { id: 'ia', nom: 'IA & Machine Learning', resultat: ia },
    { id: 'saison', nom: 'Saisonnalité & Tendances', resultat: saison },
    { id: 'hybride', nom: 'Modèle Hybride (Consensus)', resultat: resultatHybride(saison, ia) },
  ];
  const indicateurs = colonnes.map((colonne) => (
    colonne.resultat?.plan.length
      ? indiquer(colonne.id, colonne.nom, colonne.resultat, planning, etpDispo)
      : { id: colonne.id, nom: colonne.nom, wape: null, volume: 0, etpMoyen: 0, dispo: null, ecart: null, picEtp: 0, picPeriode: '—', vide: true }
  ));
  const recommande = choisirRecommande(indicateurs);
  const retenu = indicateurs.find((modele) => modele.id === recommande) ?? null;
  const delai = typeFlux === 'chaud' ? `${sla || '80'} % · ${tempsCible || '20'} s` : `${delaiTraitementHeures || '24'} h`;
  const cadre = [
    { label: 'Périmètre', valeur: perimetre },
    { label: 'Type de flux', valeur: typeFlux === 'chaud' ? 'Chaud' : 'Froid' },
    { label: 'DMT', valeur: `${aht || '—'} s` },
    { label: 'SLA / Délai cible', valeur: delai },
    { label: 'Taux d\'occupation', valeur: `${tauxOccupation || '—'} %` },
    { label: 'Shrinkage', valeur: `${shrinkage || '—'} %` },
    { label: 'Amplitude', valeur: `${heuresOuverture || '—'} h` },
    { label: 'ETP moyen dispo', valeur: etpDispo == null ? '—' : etpTexte(etpDispo) },
  ];
  const versModele = (modele: Indicateur | undefined): ModeleSynthese | null => (modele ? {
    wape: modele.wape,
    volume: modele.volume,
    etpMoyen: modele.etpMoyen,
    ecart: modele.ecart,
    pic: `${etpTexte(modele.picEtp)} ETP · ${modele.picPeriode}`,
  } : null);
  const dossier = (): DossierSynthese => ({
    hypotheses: [
      { label: 'Périmètre', valeur: perimetre },
      { label: 'Type de flux', valeur: typeFlux === 'chaud' ? 'Chaud' : 'Froid' },
      { label: 'DMT (s)', valeur: mesure(aht), format: '#,##0' },
      { label: 'SLA / Délai cible', valeur: delai },
      { label: "Taux d'occupation (%)", valeur: mesure(tauxOccupation), format: '0' },
      { label: 'Shrinkage (%)', valeur: mesure(shrinkage), format: '0' },
      { label: 'Amplitude (h)', valeur: mesure(heuresOuverture), format: '0.0' },
      { label: 'ETP moyen dispo', valeur: etpDispo ?? '—', format: '#,##0.0' },
    ],
    modeles: indicateurs.map((modele) => ({
      id: modele.id,
      nom: modele.nom,
      donnees: modele.vide ? null : versModele(modele),
    })),
    recommande,
    verdict: retenu ? phraseVerdict(retenu) : 'La précision sur l’historique n’a pas pu être mesurée. Comparez les ETP requis ci-dessus avant de figer le plan.',
  });
  const lignes = [
    { label: 'Volume total prévu', valeur: (modele: Indicateur) => modele.volume.toLocaleString('fr-FR') },
    { label: 'ETP requis moyen', valeur: (modele: Indicateur) => etpTexte(modele.etpMoyen) },
    { label: 'Écart vs effectif dispo', valeur: (modele: Indicateur) => (modele.ecart == null ? '—' : texteEcart(modele.ecart)), ecart: true },
    { label: 'Pic de besoin maximal', valeur: (modele: Indicateur) => `${etpTexte(modele.picEtp)} ETP · ${modele.picPeriode}` },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <View style={styles.voile}>
        <View style={styles.feuille}>
          <View style={styles.entete}>
            <View style={styles.enteteTitres}>
              <Text style={styles.kicker}>Flash WFM · 1 page</Text>
              <Text style={styles.titre}>Synthèse exécutive</Text>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.exporter} onPress={() => lancerExport(() => exporterSyntheseExcel(dossier()))} disabled={chargement || indicateurs.every((modele) => modele.vide)}>
                <Ionicons name="document-text-outline" size={16} color="#F4C430" />
                <Text style={styles.exporterTexte}>Exporter en Excel (.xlsx)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pptx} onPress={() => lancerExport(() => exporterSynthesePptx(dossier()))} disabled={chargement || indicateurs.every((modele) => modele.vide)}>
                <Ionicons name="easel-outline" size={16} color="#1E293B" />
                <Text style={styles.pptxTexte}>PowerPoint (.pptx)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.fermer} onPress={onFermer}>
                <Text style={styles.fermerTexte}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>

          {chargement ? (
            <View style={styles.attente}>
              <ActivityIndicator color="#0F2D46" />
              <Text style={styles.attenteTexte}>Comparaison des quatre modèles sur votre historique…</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContenu}>
              <SelecteurSkill skills={skills} actif={skillActif} onChoisir={onSkill} />
              {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
              <View style={styles.bloc}>
                <Text style={styles.blocTitre}>Rappel du cadre</Text>
                <View style={styles.cadre}>
                  {cadre.map((item) => (
                    <View key={item.label} style={styles.puce}>
                      <Text style={styles.puceLabel}>{item.label}</Text>
                      <Text style={styles.puceValeur}>{item.valeur}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.bloc}>
                <Text style={styles.blocTitre}>Comparatif des modèles</Text>
                {indicateurs.every((modele) => modele.vide) ? (
                  <Text style={styles.attenteTexte}>Aucun modèle n’a pu être calculé.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View style={styles.table}>
                      <View style={styles.ligneEntete}>
                        <Text style={[styles.cellule, styles.celluleLabel, styles.enteteTexte]}>Indicateur</Text>
                        {indicateurs.map((modele) => (
                          <View key={modele.id} style={[styles.celluleModele, modele.id === recommande && styles.enteteRecommande]}>
                            <Text style={styles.modeleNom}>{modele.nom}</Text>
                            <Text style={styles.modeleWape}>{modele.vide || modele.wape == null ? 'WAPE indisponible' : `WAPE ${nombreFR(modele.wape, 1)} %`}</Text>
                            {modele.id === recommande ? (
                              <View style={styles.badge}>
                                <Ionicons name="star" size={11} color="#0F2D46" />
                                <Text style={styles.badgeTexte}>Recommandé</Text>
                              </View>
                            ) : null}
                          </View>
                        ))}
                      </View>
                      {lignes.map((ligne, index) => (
                        <View key={ligne.label} style={[styles.ligne, index % 2 === 1 && styles.ligneAlt]}>
                          <Text style={[styles.cellule, styles.celluleLabel]}>{ligne.label}</Text>
                          {indicateurs.map((modele) => {
                            const texte = modele.vide ? '—' : ligne.valeur(modele);
                            const couleur = !modele.vide && ligne.ecart && modele.ecart != null ? (modele.ecart < -0.05 ? '#A33B32' : modele.ecart > 0.05 ? '#1F7A4D' : '#0F2D46') : '#0F2D46';
                            return (
                              <Text key={modele.id} style={[styles.cellule, styles.celluleValeur, modele.id === recommande && styles.colonneRecommandee, { color: couleur }]}>
                                {texte}
                              </Text>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}
                <Text style={styles.note}>Le badge retient le plus faible WAPE mesuré sur la fin de l’historique.</Text>
              </View>

              <View style={[styles.bloc, styles.verdict]}>
                <Text style={styles.blocTitre}>Verdict manager</Text>
                <Text style={styles.verdictTexte}>
                  {retenu ? phraseVerdict(retenu) : 'La précision sur l’historique n’a pas pu être mesurée. Comparez les ETP requis ci-dessus avant de figer le plan.'}
                </Text>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  voile: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.48)', justifyContent: 'center', padding: 16 },
  feuille: { width: '100%', maxWidth: 1240, alignSelf: 'center', maxHeight: '94%', backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', padding: 20, gap: 12, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  entete: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  enteteTitres: { flexShrink: 1, gap: 2 },
  kicker: { color: '#687581', fontSize: 12, fontWeight: '500', letterSpacing: 0.4 },
  titre: { color: '#0F2D46', fontSize: 22, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  exporter: { backgroundColor: '#0F2D46', borderRadius: 8, minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  exporterTexte: { color: '#F4C430', fontWeight: '600', fontSize: 14 },
  pptx: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pptxTexte: { color: '#0F2D46', fontWeight: '600', fontSize: 14 },
  fermer: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, justifyContent: 'center' },
  fermerTexte: { color: '#1E293B', fontWeight: '600', fontSize: 14 },
  attente: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 12 },
  attenteTexte: { color: '#687581', fontSize: 14 },
  scroll: { flexGrow: 0 },
  scrollContenu: { gap: 14, paddingBottom: 4 },
  erreur: { color: '#A33B32', fontSize: 13, lineHeight: 18 },
  bloc: { gap: 8 },
  blocTitre: { color: '#0F2D46', fontSize: 15, fontWeight: '600' },
  cadre: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, minWidth: 120 },
  puceLabel: { color: '#687581', fontSize: 11, fontWeight: '500' },
  puceValeur: { color: '#0F2D46', fontSize: 14, fontWeight: '600', marginTop: 2 },
  table: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, overflow: 'hidden', minWidth: 980 },
  ligneEntete: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#0F2D46' },
  ligne: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#FFFFFF' },
  ligneAlt: { backgroundColor: '#F8FAFC' },
  cellule: { width: 168, paddingVertical: 10, paddingHorizontal: 10, color: '#0F2D46', fontSize: 13 },
  celluleLabel: { width: 188, fontWeight: '700' },
  celluleValeur: { fontWeight: '700' },
  celluleModele: { width: 168, paddingVertical: 10, paddingHorizontal: 10, gap: 2 },
  colonneRecommandee: { backgroundColor: '#FFF8E1' },
  enteteRecommande: { borderBottomWidth: 3, borderBottomColor: '#F4C430' },
  enteteTexte: { color: '#F8FAFC', fontWeight: '700' },
  modeleNom: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', lineHeight: 16 },
  modeleWape: { color: '#E2E8F0', fontSize: 11 },
  badge: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: '#F4C430', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeTexte: { color: '#0F2D46', fontSize: 11, fontWeight: '600' },
  note: { color: '#687581', fontSize: 12, lineHeight: 16 },
  verdict: { backgroundColor: '#F8FAFC', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  verdictTexte: { color: '#1E293B', fontSize: 15, lineHeight: 22, fontWeight: '400' },
});
