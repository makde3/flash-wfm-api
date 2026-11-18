import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { DOCUMENTS_LEGAUX, type IdDocumentLegal } from '../constants/legal';

export default function PiedLegal({
  documentDemande,
  onDocumentDemande,
}: {
  documentDemande?: IdDocumentLegal | null;
  onDocumentDemande?: (id: IdDocumentLegal | null) => void;
} = {}) {
  const [interne, setInterne] = useState<IdDocumentLegal | null>(null);
  const controle = documentDemande !== undefined;
  const documentActif = controle ? (documentDemande ?? null) : interne;
  const setDocumentActif = (id: IdDocumentLegal | null) => {
    if (!controle) setInterne(id);
    onDocumentDemande?.(id);
  };
  const document = DOCUMENTS_LEGAUX.find((entree) => entree.id === documentActif) ?? null;

  return (
    <View style={styles.pied}>
      {DOCUMENTS_LEGAUX.map((entree) => (
        <TouchableOpacity key={entree.id} onPress={() => setDocumentActif(entree.id)} accessibilityRole="button">
          <Text style={styles.lien}>{entree.lien}</Text>
        </TouchableOpacity>
      ))}
      <Modal visible={document != null} transparent animationType="fade" onRequestClose={() => setDocumentActif(null)}>
        <View style={styles.voile}>
          <View style={styles.modale}>
            <View style={styles.onglets}>
              {DOCUMENTS_LEGAUX.map((entree) => {
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
