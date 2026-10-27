import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { supabase } from './supabase';

const MESSAGE = "L'application va être réinitialisée, tu vas être déconnecté.";

function confirmerReinitialisation(): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(MESSAGE));
  }
  return new Promise((resolve) => {
    Alert.alert('Réinitialiser', MESSAGE, [
      { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continuer', onPress: () => resolve(true) },
    ]);
  });
}

export async function handleHardReset() {
  const confirme = await confirmerReinitialisation();
  if (!confirme) return;
  try {
    await supabase.auth.signOut();
  } catch {
    /* la purge locale continue même si le serveur ne répond pas */
  }
  if (Platform.OS === 'web') {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.location.reload();
    return;
  }
  await AsyncStorage.clear();
}

export function LienReinitialisation() {
  return (
    <TouchableOpacity onPress={() => { void handleHardReset(); }} style={styles.lien} accessibilityRole="button">
      <Text style={styles.texte}>Problème de session ? Réinitialiser l'app</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  lien: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  texte: { color: '#94A3B8', fontSize: 12, textAlign: 'center' },
});
