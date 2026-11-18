import { useState } from 'react';
import { Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import PiedLegal from './PiedLegal';
import DemoModal from './DemoModal';
import { noterPaiementApresConnexion } from '../lib/proRequest';

type LandingPageProps = {
  onConnexion: () => void;
  onEssai: () => void;
};

const MARGE_HAUT = 32 + (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0);

const PUCES_ESSAI = [
  'Plan Découverte gratuit, sans limite de durée',
  'Prévision Saisonnalité & Tendances et Erlang C',
  'Une file et un horizon de 7 jours',
];

const PUCES_PRO = [
  'Imports illimités (Zendesk, ACD, CSV/Excel) et fichiers ETP',
  'Projections jusqu\'à 12 mois (vues Journalier, Hebdo, Mensuel)',
  'Gestion automatique des week-ends et jours fériés',
  'Support prioritaire par email (MakConsult)',
];

const BENEFICES = [
  {
    id: 'prevision',
    icone: 'pulse-outline' as const,
    titre: 'Prévision multi-modèles',
    texte: 'Détection automatique de la saisonnalité (Holt-Winters, LightGBM et mode Hybride).',
  },
  {
    id: 'erlang',
    icone: 'people-outline' as const,
    titre: 'Erlang C & Multi-Skills',
    texte: 'Calcul précis des ETP requis par file selon vos objectifs de QS (Niveau de service, DMT, taux d’occupation).',
  },
  {
    id: 'ecarts',
    icone: 'git-compare-outline' as const,
    titre: 'Pilotage des écarts ETP',
    texte: 'Import de vos plannings futurs ou saisie rapide pour visualiser immédiatement vos sous-effectifs et sur-effectifs.',
  },
];

export default function LandingPage({ onConnexion, onEssai }: LandingPageProps) {
  const { width } = useWindowDimensions();
  const etroit = width < 760;
  const [demoOuverte, setDemoOuverte] = useState(false);

  return (
    <SafeAreaView style={styles.ecran}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.contenu}>
          <View style={[styles.header, etroit && styles.headerEtroit, { paddingTop: MARGE_HAUT }]}>
            <View style={styles.marque}>
              <View style={styles.logo}>
                <Ionicons name="flash" size={22} color="#F4C430" />
              </View>
              <View>
                <Text style={styles.nom}>FLASH <Text style={styles.nomAccent}>WFM</Text></Text>
                <Text style={styles.badge}>by MakConsult</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.connexion} onPress={onConnexion} accessibilityRole="button">
              <Text style={styles.connexionTexte}>Se connecter</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.hero}>
            <Text style={[styles.titre, etroit && styles.titreEtroit]}>
              Anticipez vos volumes de contacts et identifiez immédiatement vos écarts d'effectifs par compétence.
            </Text>
            <Text style={styles.sousTitre}>
              Croisez vos projections de charge (Holt-Winters, LightGBM, Hybride) et le modèle Erlang C avec vos ETP planifiés pour arbitrer vos renforts et vos capacités sur des bases chiffrées.
            </Text>
            <View style={[styles.actions, etroit && styles.actionsEtroit]}>
              <TouchableOpacity style={[styles.principal, etroit && styles.boutonEtroit]} onPress={onEssai} accessibilityRole="button">
                <Text style={styles.principalTexte}>Démarrer le Plan Découverte gratuit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaire, etroit && styles.boutonEtroit]} onPress={() => setDemoOuverte(true)} accessibilityRole="button">
                <Text style={styles.secondaireTexte}>Voir une démo</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.cartes, etroit && styles.cartesEtroit]}>
            {BENEFICES.map((benefice) => (
              <View key={benefice.id} style={[styles.carte, etroit && styles.carteEtroit]}>
                <View style={styles.icone}>
                  <Ionicons name={benefice.icone} size={22} color="#0F2D46" />
                </View>
                <Text style={styles.carteTitre}>{benefice.titre}</Text>
                <Text style={styles.carteTexte}>{benefice.texte}</Text>
              </View>
            ))}
          </View>

          <View style={styles.reassurance}>
            <View style={styles.reassuranceIcone}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#0F2D46" />
            </View>
            <View style={styles.reassuranceTexte}>
              <Text style={styles.reassuranceTitre}>Zéro projet IT · Zéro contrainte RGPD · 0 € de mise en place</Text>
              <Text style={styles.reassuranceCorps}>Vos exports de flux et plannings ETP sont traités exclusivement en mémoire dans votre navigateur et ne sont jamais envoyés ni stockés sur nos serveurs. Aucune intégration technique ni aucun contrat de sous-traitance RGPD (DPA) à faire valider par votre DPO : vous êtes opérationnel en 2 minutes.</Text>
            </View>
          </View>

          <View style={styles.tarif}>
            <Text style={styles.sectionTitre}>Une offre simple</Text>
            <View style={[styles.offres, etroit && styles.offresEtroit]}>
              <View style={[styles.offre, etroit && styles.offreEtroit]}>
                <Text style={styles.offreKicker}>Plan Découverte gratuit</Text>
                <View>
                  <Text style={styles.prix}>0 €</Text>
                  <Text style={styles.mention}>Sans carte bancaire</Text>
                </View>
                <ListePuces lignes={PUCES_ESSAI} />
                <TouchableOpacity style={[styles.secondaire, styles.offreBouton]} onPress={onEssai} accessibilityRole="button">
                  <Text style={styles.secondaireTexte}>Démarrer le Plan Découverte gratuit</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.offre, styles.offreVedette, etroit && styles.offreEtroit]}>
                <View style={styles.lancement}>
                  <Text style={styles.lancementTexte}>Offre Lancement · 100 premiers clients</Text>
                </View>
                <Text style={styles.offreKicker}>Licence Pro</Text>
                <View>
                  <View style={styles.prixLigne}>
                    <Text style={styles.prixBarre}>79 € HT</Text>
                    <Text style={styles.prix}>39 € HT / mois</Text>
                  </View>
                  <Text style={styles.mention}>Tarif bloqué à vie · Sans engagement</Text>
                </View>
                <ListePuces lignes={PUCES_PRO} />
                <TouchableOpacity style={[styles.principal, styles.offreBouton]} onPress={() => { noterPaiementApresConnexion(); onEssai(); }} accessibilityRole="button">
                  <Text style={styles.principalTexte}>Profiter de l'offre lancement</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.pied}>
            <PiedLegal />
          </View>
        </View>
      </ScrollView>
      <DemoModal visible={demoOuverte} onFermer={() => setDemoOuverte(false)} onEssai={onEssai} />
    </SafeAreaView>
  );
}

function ListePuces({ lignes }: { lignes: string[] }) {
  return (
    <View style={styles.puces}>
      {lignes.map((ligne) => (
        <View key={ligne} style={styles.puce}>
          <Text style={styles.puceMarque}>•</Text>
          <Text style={styles.puceTexte}>{ligne}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: '#F8FAFC' },
  scroll: { flexGrow: 1 },
  contenu: { width: '100%', maxWidth: 1080, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingBottom: 16,
  },
  headerEtroit: { alignItems: 'flex-start' },
  marque: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#0F2D46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nom: { color: '#0F2D46', fontSize: 20, fontWeight: '700', letterSpacing: 0.2 },
  nomAccent: { color: '#F4C430', fontWeight: '300' },
  badge: { color: '#687581', fontSize: 12, fontWeight: '500', marginTop: 1 },
  connexion: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#0F2D46',
    borderRadius: 8,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connexionTexte: { color: '#0F2D46', fontSize: 14, fontWeight: '600' },
  hero: { paddingTop: 28, paddingBottom: 12, maxWidth: 760 },
  titre: { color: '#0F2D46', fontSize: 36, lineHeight: 44, fontWeight: '700' },
  titreEtroit: { fontSize: 28, lineHeight: 36 },
  sousTitre: { color: '#1E293B', fontSize: 16, lineHeight: 25, fontWeight: '400', marginTop: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 24 },
  actionsEtroit: { flexDirection: 'column' },
  principal: {
    backgroundColor: '#F4C430',
    borderRadius: 8,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  principalTexte: { color: '#0F2D46', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  secondaire: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  secondaireTexte: { color: '#0F2D46', fontSize: 14, fontWeight: '600' },
  boutonEtroit: { alignSelf: 'stretch' },
  cartes: { flexDirection: 'row', gap: 12, marginTop: 36 },
  cartesEtroit: { flexDirection: 'column' },
  carte: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 16,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  carteEtroit: { flex: undefined },
  icone: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carteTitre: { color: '#0F2D46', fontSize: 16, fontWeight: '600' },
  carteTexte: { color: '#1E293B', fontSize: 14, lineHeight: 21, fontWeight: '400' },
  reassurance: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  reassuranceIcone: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reassuranceTexte: { flex: 1, gap: 6 },
  reassuranceTitre: { color: '#0F2D46', fontSize: 15, lineHeight: 22, fontWeight: '600' },
  reassuranceCorps: { color: '#1E293B', fontSize: 14, lineHeight: 21, fontWeight: '400' },
  tarif: { marginTop: 40 },
  sectionTitre: { color: '#0F2D46', fontSize: 24, fontWeight: '700', marginBottom: 16 },
  offres: { flexDirection: 'row', gap: 12 },
  offresEtroit: { flexDirection: 'column' },
  offre: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 20,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  offreVedette: { borderWidth: 2, borderColor: '#F4C430' },
  offreEtroit: { flex: undefined },
  lancement: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: '#F4C430',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  lancementTexte: { color: '#0F2D46', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  offreKicker: { color: '#0F2D46', fontSize: 16, fontWeight: '600' },
  prixLigne: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 },
  prix: { color: '#0F2D46', fontSize: 28, fontWeight: '700' },
  prixBarre: { color: '#94A3B8', fontSize: 16, fontWeight: '500', textDecorationLine: 'line-through' },
  mention: { color: '#1E293B', fontSize: 13, lineHeight: 18, fontWeight: '400', marginTop: 4 },
  puces: { gap: 8 },
  puce: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  puceMarque: { color: '#0F2D46', fontSize: 14, lineHeight: 21, fontWeight: '700' },
  puceTexte: { flex: 1, color: '#1E293B', fontSize: 14, lineHeight: 21, fontWeight: '400' },
  offreBouton: { alignSelf: 'stretch', marginTop: 'auto' },
  pied: { marginTop: 36, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8 },
});
