import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

type ChoixInstallation = { outcome: 'accepted' | 'dismissed' };
type InviteInstallation = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<ChoixInstallation>;
};

function estNavigateur() {
  return Platform.OS === 'web' && typeof window !== 'undefined';
}

function dejaInstallee() {
  if (!estNavigateur()) return false;
  const autonome = window.matchMedia('(display-mode: standalone)').matches;
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return autonome || ios;
}

function estIos() {
  if (!estNavigateur()) return false;
  const agent = navigator.userAgent;
  const iPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(agent) || iPad;
}

export function useInstallationPwa() {
  const [invite, setInvite] = useState<InviteInstallation | null>(null);
  const [installee, setInstallee] = useState(dejaInstallee);
  const [aideIos, setAideIos] = useState(false);
  const ios = estIos();

  useEffect(() => {
    if (!estNavigateur() || dejaInstallee()) return;
    const retenir = (event: Event) => {
      event.preventDefault();
      setInvite(event as InviteInstallation);
    };
    const marquer = () => {
      setInvite(null);
      setInstallee(true);
      setAideIos(false);
    };
    window.addEventListener('beforeinstallprompt', retenir);
    window.addEventListener('appinstalled', marquer);
    const media = window.matchMedia('(display-mode: standalone)');
    const suivre = () => {
      if (media.matches) marquer();
    };
    media.addEventListener('change', suivre);
    return () => {
      window.removeEventListener('beforeinstallprompt', retenir);
      window.removeEventListener('appinstalled', marquer);
      media.removeEventListener('change', suivre);
    };
  }, []);

  const installer = () => {
    if (invite) {
      void invite.prompt().then(() => invite.userChoice).then((choix) => {
        setInvite(null);
        if (choix.outcome === 'accepted') setInstallee(true);
      }).catch(() => setInvite(null));
      return;
    }
    if (ios) setAideIos(true);
  };

  return {
    visible: !installee && (invite !== null || ios),
    aideIos,
    installer,
    fermerAide: () => setAideIos(false),
  };
}
