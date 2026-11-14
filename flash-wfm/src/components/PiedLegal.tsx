import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type DocumentLegal = 'mentions' | 'cgu' | 'confidentialite';

const DOCUMENTS: { id: DocumentLegal; lien: string; titre: string; paragraphes: string[] }[] = [
  {
    id: 'mentions',
    lien: 'Mentions légales',
    titre: 'Mentions légales',
    paragraphes: [
      'Éditeur du service Flash WFM : MakConsult.',
      'Flash WFM est un outil de dimensionnement des effectifs. Il sert à prévoir des volumes, calculer un besoin en ETP et restituer un plan de production à partir des données que l’utilisateur importe.',
      'Hébergement de l’application : Render. Hébergement des comptes, de l’authentification et des données enregistrées (profils, historiques de travail, demandes d’accès Pro) : Supabase.',
      'L’accès au service se fait après création d’un compte. Pour toute question sur l’éditeur ou le service, écrivez depuis l’application une fois connecté, via « Une idée ? / Feedback ».',
    ],
  },
  {
    id: 'cgu',
    lien: 'CGU / CGV',
    titre: 'CGU / CGV',
    paragraphes: [
      'Les présentes conditions régissent l’accès à Flash WFM, édité par MakConsult. Créer un compte ou utiliser le service vaut acceptation de ces conditions et de la politique de confidentialité.',
      'Flash WFM aide à dimensionner une activité : prévision de volumes, calcul d’ETP et restitution d’un plan. Les résultats sont une aide à la décision. Ils ne constituent pas un engagement d’effectif, de qualité de service ou de performance opérationnelle.',
      'L’accès de base permet d’importer l’historique, de calculer l’Erlang C et de produire le plan avec Saisonnalité & Tendances. Pendant 48 heures après la création du compte, l’ensemble des fonctions Pro est ouvert. Ensuite, Flash WFM Pro ajoute les modèles de prévision avancés, le planning des ETP réellement présents, la synthèse exécutive, les exports Excel et PowerPoint, et les ajustements événementiels.',
      'L’accès Pro s’active soit par le paiement proposé lorsqu’un lien Stripe est configuré (ouvert dans un nouvel onglet), soit par une demande transmise depuis l’application (e-mail professionnel et entreprise). La demande est confirmée à l’écran, puis traitée par MakConsult. Tant que l’accès n’est pas ouvert, les fonctions Pro restent verrouillées.',
      'L’utilisateur garantit disposer des droits nécessaires sur les fichiers et liens qu’il importe. Il reste responsable de la confidentialité de ses identifiants.',
      'Les données de flux importées restent la propriété de l’utilisateur. Leur traitement est décrit dans la politique de confidentialité.',
      'Le service est fourni en l’état. MakConsult peut faire évoluer les fonctions, interrompre le service pour maintenance, ou suspendre un accès en cas d’usage abusif.',
      'Le droit français s’applique.',
    ],
  },
  {
    id: 'confidentialite',
    lien: 'Confidentialité & RGPD',
    titre: 'Politique de confidentialité & RGPD',
    paragraphes: [
      'MakConsult, éditeur de Flash WFM, est responsable du traitement des données liées au compte et à l’usage de l’application.',
      'Données concernées : l’adresse e-mail du compte, la demande d’accès Pro (e-mail professionnel et entreprise) et les données de flux importées (volumes, durées de traitement, plannings d’ETP, fichiers ou liens fournis).',
      'Confidentialité stricte des données de flux importées. Elles servent uniquement à calculer et à afficher le plan de l’utilisateur, dans son compte. Elles ne sont pas vendues, pas partagées avec d’autres clients, et pas réutilisées pour un autre compte.',
      'Base du traitement : exécution du service demandé. La demande d’accès Pro correspond aux échanges préalables à l’ouverture de cet accès.',
      'Hébergement : l’application est opérée sur Render. La base de données et l’authentification sont opérées par Supabase. Ces prestataires interviennent uniquement pour fournir le service.',
      'Durée : les données restent associées au compte tant qu’il est ouvert. La progression peut être effacée dans l’application. La suppression du compte et des données associées se demande à MakConsult.',
      'Droits : accès, rectification, effacement, limitation, opposition et portabilité, dans les conditions du RGPD. Ces droits s’exercent depuis le compte, via « Une idée ? / Feedback », en précisant la demande.',
    ],
  },
];

export default function PiedLegal() {
  const [documentActif, setDocumentActif] = useState<DocumentLegal | null>(null);
  const document = DOCUMENTS.find((entree) => entree.id === documentActif) ?? null;

  return (
    <View style={styles.pied}>
      {DOCUMENTS.map((entree) => (
        <TouchableOpacity key={entree.id} onPress={() => setDocumentActif(entree.id)} accessibilityRole="button">
          <Text style={styles.lien}>{entree.lien}</Text>
        </TouchableOpacity>
      ))}
      <Modal visible={document != null} transparent animationType="fade" onRequestClose={() => setDocumentActif(null)}>
        <View style={styles.voile}>
          <View style={styles.modale}>
            <View style={styles.onglets}>
              {DOCUMENTS.map((entree) => {
                const actif = entree.id === documentActif;
                return (
                  <TouchableOpacity key={entree.id} onPress={() => setDocumentActif(entree.id)} style={[styles.onglet, actif && styles.ongletActif]}>
                    <Text style={[styles.ongletTexte, actif && styles.ongletTexteActif]}>{entree.lien}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContenu}>
              <Text style={styles.titre}>{document?.titre}</Text>
              {document?.paragraphes.map((paragraphe) => (
                <Text key={paragraphe} style={styles.paragraphe}>{paragraphe}</Text>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.fermer} onPress={() => setDocumentActif(null)}>
              <Text style={styles.fermerTexte}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  pied: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 14, paddingTop: 4, paddingBottom: 16 },
  lien: { color: '#94A3B8', fontSize: 12, fontWeight: '500', textDecorationLine: 'underline' },
  voile: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.48)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modale: { width: '100%', maxWidth: 640, maxHeight: '86%', backgroundColor: '#FFFFFF', borderRadius: 8, padding: 20, gap: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  onglets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  onglet: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#FFFFFF' },
  ongletActif: { backgroundColor: '#0F2D46', borderColor: '#0F2D46' },
  ongletTexte: { color: '#0F2D46', fontSize: 12, fontWeight: '600' },
  ongletTexteActif: { color: '#FFFFFF' },
  scroll: { flexGrow: 0 },
  scrollContenu: { gap: 12, paddingBottom: 4 },
  titre: { fontSize: 20, fontWeight: '600', color: '#0F2D46' },
  paragraphe: { color: '#1E293B', fontSize: 14, lineHeight: 21 },
  fermer: { alignItems: 'center', paddingVertical: 4 },
  fermerTexte: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
});
