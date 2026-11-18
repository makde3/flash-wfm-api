import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { presenterPlan, type LignePresentee, type VuePlan } from '../lib/vuePlan';
import type { PlanLigne } from '../lib/wizard';

type DemoModalProps = {
  visible: boolean;
  onFermer: () => void;
  onEssai: () => void;
};

type FileDemo = 'toutes' | 'support' | 'technique';

type JourDemo = {
  date: string;
  support: { volume: number; etp: number; planifie: number };
  technique: { volume: number; etp: number; planifie: number };
};

const FILES: { id: FileDemo; libelle: string }[] = [
  { id: 'toutes', libelle: 'Toutes files' },
  { id: 'support', libelle: 'Support N1 (Voix)' },
  { id: 'technique', libelle: 'Technique N2 (Tickets)' },
];

const VUES: { id: VuePlan; libelle: string }[] = [
  { id: 'journalier', libelle: 'Journalier' },
  { id: 'hebdo', libelle: 'Hebdo' },
  { id: 'mensuel', libelle: 'Mensuel' },
];

const LIGNES = ['Volume prévu', 'ETP requis', 'ETP planifiés', 'Écart (Planifiés - Requis)'] as const;

function formaterJour(date: Date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function dateCourte(date: string) {
  const jour = date.match(/^(\d{2}\/\d{2})\/\d{4}$/);
  if (jour) return jour[1];
  const mois = date.match(/^(\d{2})\/(\d{4})$/);
  if (mois) return `${mois[1]}/${mois[2].slice(2)}`;
  return date;
}

function arrondir(valeur: number, decimales: number) {
  const puissance = 10 ** decimales;
  return Math.round(valeur * puissance) / puissance;
}

function joursDemo(): JourDemo[] {
  const debut = new Date();
  debut.setHours(12, 0, 0, 0);
  debut.setDate(debut.getDate() + 1);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(debut);
    date.setDate(debut.getDate() + index);
    const jour = date.getDay();
    const mois = date.getMonth();
    const quantieme = date.getDate();
    const ferie = (mois === 11 && (quantieme === 25 || quantieme === 26)) || (mois === 0 && quantieme === 1);
    const veilleFetes = mois === 11 && quantieme >= 21 && quantieme <= 24;
    const conges = mois === 11 && quantieme >= 21 && quantieme <= 31;
    const supportOuvert = jour !== 0 && jour !== 6 && !ferie;
    let volumeSupport = 0;
    let etpSupport = 0;
    let planSupport = 0;
    if (supportOuvert) {
      const base = 980 + (jour === 1 ? 180 : 0) + (jour === 2 ? 60 : 0) + (jour === 5 ? -80 : 0);
      volumeSupport = veilleFetes ? Math.round(base * 1.2) : base;
      etpSupport = arrondir(volumeSupport / 76, 1);
      planSupport = conges ? 11 : jour === 2 ? 17 : 15;
    } else if (ferie) {
      volumeSupport = 180;
      etpSupport = 2.4;
      planSupport = 6;
    }
    let volumeTechnique = 0;
    let etpTechnique = 0;
    let planTechnique = 0;
    if (jour !== 0) {
      volumeTechnique = jour === 6 ? 55 : 160 + (jour === 4 ? 40 : 0);
      if (ferie) volumeTechnique = 30;
      else if (veilleFetes) volumeTechnique = Math.round(volumeTechnique * 1.25);
      etpTechnique = arrondir(volumeTechnique / 28, 1);
      planTechnique = ferie ? 2 : jour === 6 ? 2 : conges ? 4 : 6.5;
    }
    return {
      date: formaterJour(date),
      support: { volume: volumeSupport, etp: etpSupport, planifie: planSupport },
      technique: { volume: volumeTechnique, etp: etpTechnique, planifie: planTechnique },
    };
  });
}

function valeursFile(jour: JourDemo, file: FileDemo) {
  if (file === 'support') return jour.support;
  if (file === 'technique') return jour.technique;
  return {
    volume: jour.support.volume + jour.technique.volume,
    etp: arrondir(jour.support.etp + jour.technique.etp, 1),
    planifie: arrondir(jour.support.planifie + jour.technique.planifie, 1),
  };
}

function texteNombre(valeur: number, decimales: number) {
  return valeur.toLocaleString('fr-FR', { maximumFractionDigits: decimales, minimumFractionDigits: decimales === 0 ? 0 : undefined });
}

function texteEcart(valeur: number | null) {
  if (valeur == null || !Number.isFinite(valeur)) return '—';
  const signe = valeur > 0 ? '+' : '';
  return signe + valeur.toLocaleString('fr-FR', { maximumFractionDigits: 2, minimumFractionDigits: Math.abs(valeur) % 1 === 0 ? 0 : 1 });
}

function teinteEcart(valeur: number | null): 'negatif' | 'positif' | 'neutre' {
  if (valeur == null || valeur === 0) return 'neutre';
  return valeur < 0 ? 'negatif' : 'positif';
}

export default function DemoModal({ visible, onFermer, onEssai }: DemoModalProps) {
  const { width } = useWindowDimensions();
  const etroit = width < 760;
  const [file, setFile] = useState<FileDemo>('toutes');
  const [vue, setVue] = useState<VuePlan>('journalier');
  const jours = useMemo(() => joursDemo(), []);

  useEffect(() => {
    if (!visible || typeof window === 'undefined') return;
    const fermer = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onFermer();
    };
    window.addEventListener('keydown', fermer);
    return () => window.removeEventListener('keydown', fermer);
  }, [visible, onFermer]);

  const presentation = useMemo(() => {
    const brut: PlanLigne[] = jours.map((jour) => {
      const valeurs = valeursFile(jour, file);
      return { date: jour.date, volume_prevu: valeurs.volume, etp_moyen_requis: valeurs.etp };
    });
    return presenterPlan({
      brut,
      ajuste: brut,
      etpPlanifies: jours.map((jour) => valeursFile(jour, file).planifie),
      avecCouverture: true,
      vue,
      moisFiltre: null,
    });
  }, [jours, file, vue]);

  const volume = presentation.lignes.reduce((somme, ligne) => somme + ligne.volumeAjuste, 0);
  const etpMoyen = presentation.lignes.length
    ? presentation.lignes.reduce((somme, ligne) => somme + ligne.etpRequis, 0) / presentation.lignes.length
    : 0;
  const ecarts = presentation.lignes.map((ligne) => ligne.ecart).filter((valeur): valeur is number => valeur != null);
  const ecartMoyen = ecarts.length ? ecarts.reduce((somme, valeur) => somme + valeur, 0) / ecarts.length : 0;
  const teinte = teinteEcart(ecartMoyen);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer}>
      <View style={styles.voile}>
        <Pressable style={styles.fond} onPress={onFermer} accessibilityRole="button" accessibilityLabel="Fermer la démo" />
        <View style={styles.modale}>
          <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.entete}>
              <View style={styles.titres}>
                <Text style={styles.titre}>Aperçu interactif — Dimensionnement Multi-Skills</Text>
                <Text style={styles.sousTitre}>Simulez le pilotage d'un service client (flux Zendesk Talk & Messaging, objectif QS 80% en 20s).</Text>
              </View>
              <TouchableOpacity style={styles.croix} onPress={onFermer} accessibilityRole="button" accessibilityLabel="Fermer">
                <Ionicons name="close" size={20} color="#0F2D46" />
              </TouchableOpacity>
            </View>

            <View style={styles.controles}>
              <Text style={styles.controleLabel}>File</Text>
              <View style={styles.puces}>
                {FILES.map((option) => {
                  const actif = file === option.id;
                  return (
                    <TouchableOpacity key={option.id} style={[styles.puce, actif && styles.puceActive]} onPress={() => setFile(option.id)} accessibilityRole="button">
                      <Text style={[styles.puceTexte, actif && styles.puceTexteActive]}>{option.libelle}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.controleLabel}>Vue</Text>
              <View style={styles.puces}>
                {VUES.map((option) => {
                  const actif = vue === option.id;
                  return (
                    <TouchableOpacity key={option.id} style={[styles.puce, actif && styles.puceActive]} onPress={() => setVue(option.id)} accessibilityRole="button">
                      <Text style={[styles.puceTexte, actif && styles.puceTexteActive]}>{option.libelle}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.kpis, etroit && styles.kpisEtroit]}>
              <View style={[styles.kpi, etroit && styles.kpiEtroit]}>
                <Text style={styles.kpiLabel}>Volume prévu</Text>
                <Text style={styles.kpiValeur}>{Math.round(volume).toLocaleString('fr-FR')}</Text>
              </View>
              <View style={[styles.kpi, etroit && styles.kpiEtroit]}>
                <Text style={styles.kpiLabel}>ETP requis (Erlang C)</Text>
                <Text style={styles.kpiValeur}>{arrondir(etpMoyen, 1).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</Text>
              </View>
              <View style={[styles.kpi, etroit && styles.kpiEtroit, teinte === 'negatif' && styles.kpiNegatif, teinte === 'positif' && styles.kpiPositif]}>
                <Text style={styles.kpiLabel}>Écart net moyen</Text>
                <Text style={[styles.kpiValeur, teinte === 'negatif' && styles.valeurNegative, teinte === 'positif' && styles.valeurPositive]}>{texteEcart(arrondir(ecartMoyen, 2))}</Text>
              </View>
            </View>

            <TableauDemo lignes={presentation.lignes} />

            <View style={styles.pied}>
              <Text style={styles.mention}>Données de simulation. Une fois connecté, importez vos propres exports (Zendesk, ACD, CSV/Excel) ou chargez le jeu d'essai complet en 1 clic.</Text>
              <TouchableOpacity
                style={[styles.principal, etroit && styles.principalEtroit]}
                onPress={onEssai}
                accessibilityRole="button"
              >
                <Text style={styles.principalTexte}>Tester avec mes données (Essai Pro 48h)</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function TableauDemo({ lignes }: { lignes: LignePresentee[] }) {
  return (
    <View style={styles.tableau}>
      <View>
        {['Période', ...LIGNES].map((libelle, index) => (
          <Text key={libelle} style={[styles.libelle, index === 0 && styles.libelleEntete, index % 2 === 0 && index !== 0 && styles.libelleAlt]} numberOfLines={1}>
            {libelle}
          </Text>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
        <View style={styles.colonnes}>
          {lignes.map((ligne) => {
            const teinte = teinteEcart(ligne.ecart);
            const textes = [
              dateCourte(ligne.periode),
              texteNombre(ligne.volumeAjuste, 0),
              texteNombre(ligne.etpRequis, 1),
              ligne.etpPlanifie == null ? '—' : texteNombre(ligne.etpPlanifie, 1),
              texteEcart(ligne.ecart),
            ];
            return (
              <View key={`${ligne.periode}-${ligne.periodeExcel}`}>
                {textes.map((texte, index) => (
                  <Text
                    key={`${ligne.periode}-${index}`}
                    style={[
                      styles.cellule,
                      index === 0 && styles.celluleEntete,
                      index % 2 === 0 && index !== 0 && styles.celluleAlt,
                      teinte === 'negatif' && index !== 0 && styles.celluleNegative,
                      teinte === 'positif' && index !== 0 && styles.cellulePositive,
                      index === 4 && teinte === 'negatif' && styles.valeurNegative,
                      index === 4 && teinte === 'positif' && styles.valeurPositive,
                      index === 4 && styles.celluleFort,
                    ]}
                    numberOfLines={1}
                  >
                    {texte}
                  </Text>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  voile: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fond: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  modale: {
    width: '94%',
    maxWidth: 980,
    maxHeight: '92%',
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 4,
    zIndex: 1,
  },
  contenu: { padding: 20, gap: 16 },
  entete: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titres: { flex: 1, gap: 6, paddingRight: 8 },
  titre: { color: '#0F2D46', fontSize: 20, lineHeight: 28, fontWeight: '700' },
  sousTitre: { color: '#1E293B', fontSize: 14, lineHeight: 21, fontWeight: '400' },
  croix: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  controles: { gap: 8 },
  controleLabel: { color: '#687581', fontSize: 12, fontWeight: '600' },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puceActive: { backgroundColor: '#0F2D46', borderColor: '#0F2D46' },
  puceTexte: { color: '#0F2D46', fontSize: 14, fontWeight: '600' },
  puceTexteActive: { color: '#F4C430' },
  kpis: { flexDirection: 'row', gap: 12 },
  kpisEtroit: { flexDirection: 'column' },
  kpi: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiEtroit: { flex: undefined },
  kpiNegatif: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  kpiPositif: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  kpiLabel: { color: '#687581', fontSize: 12, fontWeight: '600' },
  kpiValeur: { color: '#0F2D46', fontSize: 22, fontWeight: '700' },
  valeurNegative: { color: '#A33B32' },
  valeurPositive: { color: '#1F7A4D' },
  tableau: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  libelle: {
    width: 210,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '500',
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  libelleEntete: { color: '#F8FAFC', fontWeight: '600', backgroundColor: '#0F172A' },
  libelleAlt: { backgroundColor: '#F8FAFC' },
  colonnes: { flexDirection: 'row' },
  cellule: {
    width: 92,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 8,
    textAlign: 'center',
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '400',
    backgroundColor: '#FFFFFF',
  },
  celluleEntete: { color: '#F8FAFC', fontWeight: '600', backgroundColor: '#0F172A' },
  celluleAlt: { backgroundColor: '#F8FAFC' },
  celluleNegative: { backgroundColor: '#FEF2F2' },
  cellulePositive: { backgroundColor: '#F0FDF4' },
  celluleFort: { fontWeight: '600' },
  pied: { gap: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 14 },
  mention: { color: '#1E293B', fontSize: 13, lineHeight: 20, fontWeight: '400' },
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
  principalEtroit: { alignSelf: 'stretch' },
  principalTexte: { color: '#0F2D46', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
