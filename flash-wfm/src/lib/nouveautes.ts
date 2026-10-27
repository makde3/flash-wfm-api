import AsyncStorage from '@react-native-async-storage/async-storage';

const CLE_NOUVEAUTES = 'has_seen_beta_v1';

async function lireMarqueur(): Promise<string | null> {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(CLE_NOUVEAUTES);
  }
  return AsyncStorage.getItem(CLE_NOUVEAUTES);
}

export async function nouveautesDejaVues(): Promise<boolean> {
  try {
    return (await lireMarqueur()) === 'true';
  } catch {
    return false;
  }
}

export async function marquerNouveautesVues(): Promise<void> {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(CLE_NOUVEAUTES, 'true');
    return;
  }
  await AsyncStorage.setItem(CLE_NOUVEAUTES, 'true');
}
