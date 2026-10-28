import { ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { VUE_GLOBALE, libellePerimetre } from '../lib/skills';

type Props = {
  skills: string[];
  actif: string;
  onChoisir: (skill: string) => void;
};

export default function SelecteurSkill({ skills, actif, onChoisir }: Props) {
  if (skills.length < 2) return null;
  const choix = [VUE_GLOBALE, ...skills];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ligne}>
      {choix.map((id) => {
        const selectionne = id === actif;
        return (
          <TouchableOpacity key={id} style={[styles.pastille, selectionne && styles.pastilleOn]} onPress={() => onChoisir(id)}>
            <Text style={[styles.texte, selectionne && styles.texteOn]}>{libellePerimetre(id)}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  pastille: { minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', justifyContent: 'center' },
  pastilleOn: { backgroundColor: '#0F2D46', borderColor: '#0F2D46' },
  texte: { color: '#1E293B', fontSize: 13, fontWeight: '600' },
  texteOn: { color: '#F8FAFC' },
});
