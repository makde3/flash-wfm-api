import AsyncStorage from '@react-native-async-storage/async-storage';

const CLE_NOUVEAUTES = 'has_seen_beta_v2';
const CLE_TOUR = 'has_seen_tour';

async function lireMarqueur(cle: string): Promise<string | null> {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(cle);
  }
  return AsyncStorage.getItem(cle);
}

async function ecrireMarqueur(cle: string): Promise<void> {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(cle, 'true');
    return;
  }
  await AsyncStorage.setItem(cle, 'true');
}

export async function nouveautesDejaVues(): Promise<boolean> {
  try {
    return (await lireMarqueur(CLE_NOUVEAUTES)) === 'true';
  } catch {
    return false;
  }
}

export async function marquerNouveautesVues(): Promise<void> {
  await ecrireMarqueur(CLE_NOUVEAUTES);
}

export async function tourDejaVu(): Promise<boolean> {
  try {
    return (await lireMarqueur(CLE_TOUR)) === 'true';
  } catch {
    return false;
  }
}

export async function marquerTourVu(): Promise<void> {
  await ecrireMarqueur(CLE_TOUR);
}
