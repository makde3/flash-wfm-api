import { useState } from 'react';
import { ActivityIndicator, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import PiedLegal from './PiedLegal';
import { LienReinitialisation } from '../lib/session';
import { supabase } from '../lib/supabase';

type AuthScreenProps = {
  emailConfirme?: boolean;
  erreurConfirmation?: string | null;
  sessionExpiree?: string | null;
  onConnexion?: () => void;
  onInscription?: () => void;
  onEchecInscription?: () => void;
};

const REGLES = [
  { id: 'longueur', label: '8 caractères', test: (valeur: string) => valeur.length >= 8 },
  { id: 'majuscule', label: '1 majuscule', test: (valeur: string) => /[A-Z]/.test(valeur) },
  { id: 'minuscule', label: '1 minuscule', test: (valeur: string) => /[a-z]/.test(valeur) },
  { id: 'chiffre', label: '1 chiffre', test: (valeur: string) => /\d/.test(valeur) },
  { id: 'special', label: '1 caractère spécial', test: (valeur: string) => /[^A-Za-z0-9]/.test(valeur) },
] as const;

function redirectionConfirmation() {
  return typeof window !== 'undefined' ? window.location.origin : 'https://flash-wfm.vercel.app';
}

function ChampMotDePasse({
  valeur,
  onChange,
  visible,
  onVisible,
  placeholder,
  autoComplete,
}: {
  valeur: string;
  onChange: (texte: string) => void;
  visible: boolean;
  onVisible: () => void;
  placeholder: string;
  autoComplete: 'password' | 'new-password' | 'current-password';
}) {
  return (
    <View style={styles.champMdp}>
      <TextInput
        style={styles.inputMdp}
        value={valeur}
        onChangeText={onChange}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoComplete={autoComplete}
        placeholder={placeholder}
        placeholderTextColor="#9AA3AD"
        textContentType="password"
      />
      <TouchableOpacity
        style={styles.oeil}
        onPress={onVisible}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={18} color="#64748B" />
      </TouchableOpacity>
    </View>
  );
}

export default function AuthScreen({ emailConfirme = false, erreurConfirmation = null, sessionExpiree = null, onConnexion, onInscription, onEchecInscription }: AuthScreenProps) {
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [voirMotDePasse, setVoirMotDePasse] = useState(false);
  const [voirConfirmation, setVoirConfirmation] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [compteCree, setCompteCree] = useState<string | null>(null);
  const [renvoi, setRenvoi] = useState<'repos' | 'envoi' | 'envoye' | 'erreur'>('repos');

  const inscription = mode === 'inscription';
  const reglesOk = REGLES.every((regle) => regle.test(password));
  const correspond = password.length > 0 && password === confirmation;
  const inscriptionValide = reglesOk && correspond;
  const confirmationSaisie = confirmation.length > 0;

  const basculerMode = () => {
    setMode(inscription ? 'connexion' : 'inscription');
    setMessage('');
    setConfirmation('');
    setVoirMotDePasse(false);
    setVoirConfirmation(false);
  };

  const retourConnexion = () => {
    setCompteCree(null);
    setRenvoi('repos');
    setMode('connexion');
    setPassword('');
    setConfirmation('');
    setMessage('');
  };

  const envoyer = async () => {
    const adresse = email.trim();
    if (!adresse || !password) {
      setMessage('Indiquez un e-mail et un mot de passe.');
      return;
    }
    if (inscription && !inscriptionValide) return;
    setLoading(true);
    setMessage('');
    if (inscription) onInscription?.();
    else onConnexion?.();
    const { data, error } = inscription
      ? await supabase.auth.signUp({
          email: adresse,
          password,
          options: { emailRedirectTo: redirectionConfirmation() },
        })
      : await supabase.auth.signInWithPassword({ email: adresse, password });
    if (inscription && data.session) await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      if (inscription) onEchecInscription?.();
      setMessage(error.message);
      return;
    }
    if (inscription) {
      setCompteCree(adresse);
      setRenvoi('repos');
    }
  };

  const renvoyer = async () => {
    if (!compteCree || renvoi === 'envoi') return;
    setRenvoi('envoi');
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: compteCree,
      options: { emailRedirectTo: redirectionConfirmation() },
    });
    setRenvoi(error ? 'erreur' : 'envoye');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.corps} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>FLASH <Text style={styles.titleAccent}>WFM</Text></Text>
          <Text style={styles.byline}>by MakConsult</Text>
          {emailConfirme ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>Adresse e-mail confirmée, bienvenue sur Flash WFM !</Text>
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
          <Text style={styles.heading}>{inscription ? 'Inscription' : 'Connexion'}</Text>
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
          <ChampMotDePasse
            valeur={password}
            onChange={setPassword}
            visible={voirMotDePasse}
            onVisible={() => setVoirMotDePasse((actuel) => !actuel)}
            placeholder="Mot de passe"
            autoComplete={inscription ? 'new-password' : 'current-password'}
          />
          {inscription ? (
            <>
              <View style={styles.regles}>
                {REGLES.map((regle) => {
                  const ok = regle.test(password);
                  return (
                    <View key={regle.id} style={styles.regle}>
                      <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={ok ? '#1F7A4D' : '#94A3B8'} />
                      <Text style={[styles.regleTexte, ok && styles.regleOk]}>{regle.label}</Text>
                    </View>
                  );
                })}
              </View>
              <ChampMotDePasse
                valeur={confirmation}
                onChange={setConfirmation}
                visible={voirConfirmation}
                onVisible={() => setVoirConfirmation((actuel) => !actuel)}
                placeholder="Confirmer le mot de passe"
                autoComplete="new-password"
              />
              {confirmationSaisie && !correspond ? (
                <Text style={styles.erreur}>Les mots de passe ne correspondent pas.</Text>
              ) : null}
            </>
          ) : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <TouchableOpacity
            style={[styles.primary, (loading || (inscription && !inscriptionValide)) && styles.primaryOff]}
            onPress={() => { void envoyer(); }}
            disabled={loading || (inscription && !inscriptionValide)}
          >
            {loading ? <ActivityIndicator color="#0F2D46" /> : (
              <Text style={styles.primaryText}>{inscription ? 'Créer mon compte' : 'Se connecter'}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={basculerMode}>
            <Text style={styles.switchText}>
              {inscription ? 'Déjà un compte ? Connexion' : 'Pas encore de compte ? Inscription'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <LienReinitialisation />
      <PiedLegal />
      <Modal visible={compteCree != null} transparent animationType="fade" onRequestClose={retourConnexion}>
        <View style={styles.voile}>
          <View style={styles.modale}>
            <Ionicons name="checkmark-circle" size={32} color="#F4C430" />
            <Text style={styles.modaleTitre}>Bravo, votre compte a bien été créé !</Text>
            <Text style={styles.modaleTexte}>
              Un e-mail de confirmation vient d'être envoyé à {compteCree}. Cliquez sur le lien reçu pour activer votre accès (pensez à vérifier vos spams).
            </Text>
            <TouchableOpacity style={styles.primary} onPress={retourConnexion}>
              <Text style={styles.primaryText}>Retour à la connexion</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaire} onPress={() => { void renvoyer(); }} disabled={renvoi === 'envoi'}>
              {renvoi === 'envoi' ? <ActivityIndicator color="#0F2D46" /> : (
                <Text style={styles.secondaireTexte}>{renvoi === 'envoye' ? 'E-mail renvoyé' : "Renvoyer l'e-mail"}</Text>
              )}
            </TouchableOpacity>
            {renvoi === 'envoye' ? <Text style={styles.renvoiOk}>Un nouvel e-mail vient d'être envoyé.</Text> : null}
            {renvoi === 'erreur' ? <Text style={styles.erreur}>L'envoi a échoué. Réessayez dans un instant.</Text> : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#E6E9EE', padding: 16 },
  corps: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  card: { backgroundColor: '#FFFFFF', width: '100%', maxWidth: 420, borderRadius: 8, padding: 24, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  title: { fontSize: 28, fontWeight: '700', color: '#0F2D46', letterSpacing: 0, textAlign: 'center' },
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
  bannerText: { color: '#1E293B', fontSize: 14, lineHeight: 20, textAlign: 'center', fontWeight: '400' },
  heading: { fontSize: 18, fontWeight: '700', color: '#0F2D46', marginBottom: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    height: 40,
    paddingHorizontal: 16,
    marginBottom: 12,
    color: '#1E293B',
    fontSize: 14,
  },
  champMdp: { position: 'relative', marginBottom: 12 },
  inputMdp: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    height: 40,
    paddingLeft: 16,
    paddingRight: 44,
    color: '#1E293B',
    fontSize: 14,
  },
  oeil: { position: 'absolute', right: 4, top: 0, bottom: 0, width: 36, alignItems: 'center', justifyContent: 'center' },
  regles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  regle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  regleTexte: { color: '#94A3B8', fontSize: 12, fontWeight: '500' },
  regleOk: { color: '#1F7A4D' },
  erreur: { color: '#A33B32', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  message: { color: '#0F2D46', marginBottom: 12, lineHeight: 20 },
  primary: { backgroundColor: '#F4C430', borderRadius: 8, minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  primaryOff: { opacity: 0.45 },
  primaryText: { color: '#0F2D46', fontWeight: '600', fontSize: 14 },
  switchText: { color: '#687581', textAlign: 'center', fontSize: 14 },
  voile: { flex: 1, backgroundColor: 'rgba(15, 45, 70, 0.48)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modale: { width: '100%', maxWidth: 440, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', borderTopWidth: 4, borderTopColor: '#F4C430', padding: 24, gap: 12 },
  modaleTitre: { color: '#0F2D46', fontSize: 20, fontWeight: '600' },
  modaleTexte: { color: '#1E293B', fontSize: 14, lineHeight: 21 },
  secondaire: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  secondaireTexte: { color: '#0F2D46', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  renvoiOk: { color: '#1F7A4D', fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
