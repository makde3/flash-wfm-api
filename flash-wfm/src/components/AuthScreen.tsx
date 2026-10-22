import { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { supabase } from '../lib/supabase';

type AuthScreenProps = {
  emailConfirme?: boolean;
  erreurConfirmation?: string | null;
  sessionExpiree?: string | null;
  onConnexion?: () => void;
};

export default function AuthScreen({ emailConfirme = false, erreurConfirmation = null, sessionExpiree = null, onConnexion }: AuthScreenProps) {
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const envoyer = async () => {
    const adresse = email.trim();
    if (!adresse || !password) {
      setMessage('Indiquez un e-mail et un mot de passe.');
      return;
    }
    setLoading(true);
    setMessage('');
    if (mode === 'connexion') onConnexion?.();
    const { data, error } = mode === 'connexion'
      ? await supabase.auth.signInWithPassword({ email: adresse, password })
      : await supabase.auth.signUp({ email: adresse, password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (mode === 'inscription' && !data.session) {
      setMessage('Compte créé. Confirmez votre e-mail, puis connectez-vous.');
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>FLASH <Text style={styles.titleAccent}>WFM</Text></Text>
        <Text style={styles.byline}>by MakConsult</Text>
        {emailConfirme ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>Votre e-mail a été confirmé avec succès ! Vous pouvez maintenant vous connecter.</Text>
          </View>
        ) : null}
        {erreurConfirmation ? (
          <View style={[styles.banner, styles.bannerErreur]}>
            <Text style={styles.bannerText}>Le lien de confirmation n'a pas abouti. {erreurConfirmation}</Text>
          </View>
        ) : null}
        {sessionExpiree ? (
          <View style={[styles.banner, styles.bannerErreur]}>
            <Text style={styles.bannerText}>{sessionExpiree}</Text>
          </View>
        ) : null}
        <Text style={styles.heading}>{mode === 'connexion' ? 'Connexion' : 'Inscription'}</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="E-mail"
          placeholderTextColor="#9AA3AD"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Mot de passe"
          placeholderTextColor="#9AA3AD"
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <TouchableOpacity style={styles.primary} onPress={envoyer} disabled={loading}>
          {loading ? <ActivityIndicator color="#0F2D46" /> : (
            <Text style={styles.primaryText}>{mode === 'connexion' ? 'Se connecter' : 'Créer un compte'}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setMode(mode === 'connexion' ? 'inscription' : 'connexion');
            setMessage('');
          }}
        >
          <Text style={styles.switchText}>
            {mode === 'connexion' ? 'Pas encore de compte ? Inscription' : 'Déjà un compte ? Connexion'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#E6E9EE', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#FFFFFF', width: '100%', maxWidth: 420, borderRadius: 12, padding: 24 },
  title: { fontSize: 28, fontWeight: '900', color: '#0F2D46', letterSpacing: 1, textAlign: 'center' },
  titleAccent: { color: '#F4C430', fontWeight: '300' },
  byline: { textAlign: 'center', color: '#687581', fontSize: 12, marginBottom: 18 },
  banner: {
    backgroundColor: '#E7F6F4',
    borderWidth: 1,
    borderColor: '#2E8F86',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  bannerErreur: { backgroundColor: '#FDECEC', borderColor: '#C45C5C' },
  bannerText: { color: '#0F2D46', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  heading: { fontSize: 18, fontWeight: '700', color: '#0F2D46', marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#E6E9EE',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    color: '#0F2D46',
    fontSize: 16,
  },
  message: { color: '#0F2D46', marginBottom: 12, lineHeight: 20 },
  primary: { backgroundColor: '#F4C430', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginBottom: 14 },
  primaryText: { color: '#0F2D46', fontWeight: '700', fontSize: 16 },
  switchText: { color: '#687581', textAlign: 'center', fontSize: 14 },
});
