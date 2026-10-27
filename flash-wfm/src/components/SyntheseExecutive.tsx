import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { exporterSyntheseExcel, exporterSynthesePptx, type DossierSynthese, type ModeleSynthese } from '../lib/exportSynthese';
import { couverturesDuPlan, type EtpJour, type PlanLigne, type TypeFlux } from '../lib/wizard';

export type ResultatModele = {
  plan: PlanLigne[];
  wape: number | null;
};

type IdModele = 'holt' | 'light';

type Indicateur = {
  id: IdModele;
  nom: string;
  algo: string;
  wape: number | null;
  volume: number;
  etpMoyen: number;
  dispo: number | null;
  ecart: number | null;
  picEtp: number;
  picPeriode: string;
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

function indiquer(id: IdModele, nom: string, algo: string, resultat: ResultatModele, planning: EtpJour[] | null, etpDispo: number | null): Indicateur {
  const volume = resultat.plan.reduce((somme, ligne) => somme + ligne.volume_prevu, 0);
  const etpMoyen = resultat.plan.reduce((somme, ligne) => somme + ligne.etp_moyen_requis, 0) / resultat.plan.length;
  const couvertures = couverturesDuPlan(resultat.plan, planning, planning ? null : etpDispo);
  const ecarts = (couvertures ?? []).map((ligne) => ligne.ecart).filter((valeur): valeur is number => valeur != null && Number.isFinite(valeur));
  const dispos = (couvertures ?? []).map((ligne) => ligne.etpDispo).filter((valeur): valeur is number => valeur != null && Number.isFinite(valeur));
  const pic = resultat.plan.reduce((meilleur, ligne) => (ligne.etp_moyen_requis > meilleur.etp_moyen_requis ? ligne : meilleur));
  return {
    id,
    nom,
    algo,
    wape: resultat.wape,
    volume,
    etpMoyen,
    dispo: moyenne(dispos),
    ecart: moyenne(ecarts),
    picEtp: pic.etp_moyen_requis,
    picPeriode: pic.date,
  };
}

function choisirRecommande(holt: Indicateur | null, light: Indicateur | null): IdModele | null {
  const notes = [holt, light].filter((modele): modele is Indicateur => !!modele && modele.wape != null);
  if (notes.length) {
    notes.sort((a, b) => (a.wape ?? 0) - (b.wape ?? 0));
    return notes[0].id;
  }
  if (holt && !light) return 'holt';
  if (light && !holt) return 'light';
  return null;
}

function phraseVerdict(modele: Indicateur) {
  const nom = modele.id === 'light' ? 'Le modèle IA' : 'Le modèle Tendance & Saisonnalité';
  const recommande = etpTexte(modele.etpMoyen);
  if (modele.dispo == null || modele.ecart == null) {
    return `${nom} recommande préférentiellement ${recommande} ETP sur la période. Renseignez votre effectif disponible pour estimer l'écart.`;
  }
  const dispo = etpTexte(modele.dispo);
  const ecart = etpTexte(Math.abs(modele.ecart));
  if (modele.ecart < -0.05) {
    return `${nom} recommande préférentiellement ${recommande} ETP sur la période. Avec votre effectif moyen actuel de ${dispo} ETP, vous prévoyez un sous-effectif de ${ecart} ETP pour tenir votre objectif de service.`;
  }
  if (modele.ecart > 0.05) {
    return `${nom} recommande préférentiellement ${recommande} ETP sur la période. Avec votre effectif moyen actuel de ${dispo} ETP, vous prévoyez un sur-effectif de ${ecart} ETP par rapport à votre objectif de service.`;
  }
  return `${nom} recommande préférentiellement ${recommande} ETP sur la période. Avec votre effectif moyen actuel de ${dispo} ETP, votre effectif est aligné sur l'objectif de service.`;
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
  holt,
  light,
}: Props) {
  const indicateurs = [
    holt?.plan.length ? indiquer('holt', 'Modèle Tendance & Saisonnalité', 'Holt-Winters', holt, planning, etpDispo) : null,
    light?.plan.length ? indiquer('light', 'Modèle IA / Avancé', 'LightGBM', light, planning, etpDispo) : null,
  ].filter((modele): modele is Indicateur => !!modele);
  const recommande = choisirRecommande(indicateurs.find((modele) => modele.id === 'holt') ?? null, indicateurs.find((modele) => modele.id === 'light') ?? null);
  const retenu = indicateurs.find((modele) => modele.id === recommande) ?? null;
  const delai = typeFlux === 'chaud' ? `${sla || '80'} % · ${tempsCible || '20'} s` : `${delaiTraitementHeures || '24'} h`;
  const cadre = [
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
      { label: 'Type de flux', valeur: typeFlux === 'chaud' ? 'Chaud' : 'Froid' },
      { label: 'DMT (s)', valeur: mesure(aht), format: '#,##0' },
      { label: 'SLA / Délai cible', valeur: delai },
      { label: "Taux d'occupation (%)", valeur: mesure(tauxOccupation), format: '0' },
      { label: 'Shrinkage (%)', valeur: mesure(shrinkage), format: '0' },
      { label: 'Amplitude (h)', valeur: mesure(heuresOuverture), format: '0.0' },
      { label: 'ETP moyen dispo', valeur: etpDispo ?? '—', format: '#,##0.0' },
    ],
    holt: versModele(indicateurs.find((modele) => modele.id === 'holt')),
    light: versModele(indicateurs.find((modele) => modele.id === 'light')),
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
              <TouchableOpacity style={styles.exporter} onPress={() => lancerExport(() => exporterSyntheseExcel(dossier()))} disabled={chargement || indicateurs.length === 0}>
                <Ionicons name="document-text-outline" size={16} color="#F4C430" />
                <Text style={styles.exporterTexte}>Exporter en Excel (.xlsx)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pptx} onPress={() => lancerExport(() => exporterSynthesePptx(dossier()))} disabled={chargement || indicateurs.length === 0}>
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
              <Text style={styles.attenteTexte}>Comparaison des deux modèles sur votre historique…</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContenu}>
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
                {indicateurs.length === 0 ? (
                  <Text style={styles.attenteTexte}>Aucun modèle n’a pu être calculé.</Text>
                ) : (
                  <View style={styles.table}>
                    <View style={styles.ligneEntete}>
                      <Text style={[styles.cellule, styles.celluleLabel, styles.enteteTexte]}>Indicateur</Text>
                      {indicateurs.map((modele) => (
                        <View key={modele.id} style={[styles.celluleModele, modele.id === recommande && styles.enteteRecommande]}>
                          <Text style={styles.modeleNom}>{modele.nom}</Text>
                          <Text style={styles.modeleAlgo}>{modele.algo}</Text>
                          <Text style={styles.modeleWape}>{modele.wape == null ? 'WAPE indisponible' : `WAPE ${nombreFR(modele.wape, 1)} %`}</Text>
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
                          const texte = ligne.valeur(modele);
                          const couleur = ligne.ecart && modele.ecart != null ? (modele.ecart < -0.05 ? '#A33B32' : modele.ecart > 0.05 ? '#1F7A4D' : '#0F2D46') : '#0F2D46';
                          return (
                            <Text key={modele.id} style={[styles.cellule, styles.celluleValeur, modele.id === recommande && styles.colonneRecommandee, { color: couleur }]}>
                              {texte}
                            </Text>
                          );
                        })}
                      </View>
                    ))}
                  </View>
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
  feuille: { width: '100%', maxWidth: 1080, alignSelf: 'center', maxHeight: '94%', backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', padding: 20, gap: 12, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
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
  table: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, overflow: 'hidden' },
  ligneEntete: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#0F2D46' },
  ligne: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#FFFFFF' },
  ligneAlt: { backgroundColor: '#F8FAFC' },
  cellule: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, color: '#0F2D46', fontSize: 13 },
  celluleLabel: { flex: 1.15, fontWeight: '700' },
  celluleValeur: { fontWeight: '700' },
  celluleModele: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, gap: 2 },
  colonneRecommandee: { backgroundColor: '#FFF8E1' },
  enteteRecommande: { borderBottomWidth: 3, borderBottomColor: '#F4C430' },
  enteteTexte: { color: '#F8FAFC', fontWeight: '700' },
  modeleNom: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  modeleAlgo: { color: '#F4C430', fontSize: 11, fontWeight: '500' },
  modeleWape: { color: '#E2E8F0', fontSize: 11 },
  badge: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: '#F4C430', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeTexte: { color: '#0F2D46', fontSize: 11, fontWeight: '600' },
  note: { color: '#687581', fontSize: 12, lineHeight: 16 },
  verdict: { backgroundColor: '#F8FAFC', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  verdictTexte: { color: '#1E293B', fontSize: 15, lineHeight: 22, fontWeight: '400' },
});
