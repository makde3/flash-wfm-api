import { Platform } from 'react-native';
import type { DriveStep, Driver } from 'driver.js';

import type { Etape } from './wizard';

const CSS_DRIVER = `
.driver-layer{width:auto;max-width:none;height:auto;max-height:none;color:inherit;pointer-events:none;background:0 0;border:0;margin:0;padding:0;position:fixed;inset:0;overflow:visible}
.driver-layer::backdrop{display:none}
.driver-layer .driver-popover{pointer-events:auto}
.driver-popover{all:unset;font-family:Inter,system-ui,sans-serif;box-sizing:border-box;color:#1E293B;z-index:1000000000;background-color:#fff;border:1px solid #E2E8F0;border-radius:8px;width:min(320px,calc(100vw - 24px));min-width:0;max-width:calc(100vw - 24px);margin:0;padding:15px;position:fixed;top:0;left:0;right:auto;box-shadow:0 1px 2px #0F172A0F}
#tour-source,#tour-etp,#tour-leviers,#tour-modeles,#tour-generer,#tour-plan,#tour-bilan,#tour-horizon{scroll-margin:120px}
.driver-popover-title{margin:0;font-size:16px;font-weight:600;line-height:1.4;display:block;position:relative;padding-right:28px}
.driver-popover-close-btn{all:unset;cursor:pointer;color:#94A3B8;z-index:1;text-align:center;width:32px;height:28px;font-size:18px;position:absolute;top:0;right:0}
.driver-popover-close-btn:hover{color:#0F2D46}
.driver-popover-title[style*=block]+.driver-popover-description{margin-top:6px}
.driver-popover-description{margin:0;font-size:14px;line-height:1.45;color:#334155}
.driver-popover-footer{justify-content:space-between;align-items:center;margin-top:14px;display:flex}
.driver-popover-progress-text{color:#64748B;font-size:12px;font-weight:500}
.driver-popover-footer-btn{all:unset;box-sizing:border-box;cursor:pointer;background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;color:#1E293B;min-height:40px}
.driver-popover-footer .driver-popover-btn-disabled{opacity:.5;pointer-events:none}
.driver-popover-navigation-btns{flex-grow:1;justify-content:flex-end;display:flex;gap:6px}
.flash-tour .driver-popover-next-btn,.flash-tour .driver-popover-done-btn{background:#F4C430;border-color:#F4C430}
.driver-popover-arrow{border:6px solid #fff;position:absolute}
.driver-popover-arrow-side-over,.driver-popover-arrow-none{display:none}
.driver-popover-arrow-side-left{border-top-color:transparent;border-bottom-color:transparent;border-right-color:transparent;left:100%}
.driver-popover-arrow-side-right{border-top-color:transparent;border-bottom-color:transparent;border-left-color:transparent;right:100%}
.driver-popover-arrow-side-top{border-bottom-color:transparent;border-left-color:transparent;border-right-color:transparent;top:100%}
.driver-popover-arrow-side-bottom{border-top-color:transparent;border-left-color:transparent;border-right-color:transparent;bottom:100%}
.driver-active .driver-overlay{pointer-events:none}
.driver-active.driver-no-scroll{overflow:hidden}
.driver-active *{pointer-events:none}
.driver-active .driver-active-element,.driver-active .driver-active-element *,.driver-popover,.driver-popover *{pointer-events:auto}
.driver-active-element-parent-no-scroll{overflow:hidden!important}
.driver-no-interaction,.driver-no-interaction *{pointer-events:none!important}
`;

export const ETAPES_GUIDE: { id: string; etape: Etape; titre: string; texte: string }[] = [
  {
    id: 'tour-source',
    etape: 1,
    titre: 'Import des flux',
    texte: 'Importez l’historique de volumes. Si le samedi ou le dimanche n’a aucun volume, ce jour n’est pas projeté. Le Plan Découverte gratuit couvre une seule file.',
  },
  {
    id: 'tour-etp',
    etape: 2,
    titre: 'ETP planifiés',
    texte: 'Le Plan Découverte gratuit couvre une seule file, saisie à la main. L’import du planning ETP, qui pilote les effectifs, est réservé au plan Pro.',
  },
  {
    id: 'tour-leviers',
    etape: 3,
    titre: 'Paramétrage',
    texte: 'Réglez la DMT, le niveau de service, l’occupation et l’indisponibilité. Ces leviers alimentent le calcul Erlang C avant la prévision.',
  },
  {
    id: 'tour-modeles',
    etape: 4,
    titre: 'Moteurs de prévision',
    texte: 'Le Plan Découverte gratuit utilise Saisonnalité & Tendances. Recommandé (Auto), IA & Machine Learning et le Modèle Hybride sont réservés au plan Pro.',
  },
  {
    id: 'tour-horizon',
    etape: 4,
    titre: 'Horizon',
    texte: 'Le Plan Découverte gratuit projette 7 jours. Le plan Pro ouvre 1, 3, 6 ou 12 mois, sans changer le modèle ni le calcul Erlang.',
  },
  {
    id: 'tour-restitution',
    etape: 4,
    titre: 'Vues et fériés',
    texte: 'Après le calcul, passez en Journalier, Hebdo ou Mensuel et basculez les fériés sur leur badge. L’export Excel est réservé au plan Pro.',
  },
];

function recadrerPopover() {
  const bulle = document.querySelector('.driver-popover');
  if (!(bulle instanceof HTMLElement)) return;
  const rect = bulle.getBoundingClientRect();
  const marge = 12;
  let gauche = rect.left;
  let haut = rect.top;
  if (rect.right > window.innerWidth - marge) gauche -= rect.right - (window.innerWidth - marge);
  if (gauche < marge) gauche = marge;
  if (rect.bottom > window.innerHeight - marge) haut -= rect.bottom - (window.innerHeight - marge);
  if (haut < marge) haut = marge;
  bulle.style.left = `${gauche}px`;
  bulle.style.top = `${haut}px`;
}

function cibleEtape(id: string) {
  if (id === 'tour-restitution') return document.getElementById('tour-generer');
  return document.getElementById(id);
}

function montrerEtape(id: string) {
  cibleEtape(id)?.scrollIntoView({ block: 'center', inline: 'nearest' });
}

function injecterCss() {
  if (typeof document === 'undefined') return;
  let style = document.getElementById('flash-driver-css');
  if (!style) {
    style = document.createElement('style');
    style.id = 'flash-driver-css';
    document.head.appendChild(style);
  }
  style.textContent = CSS_DRIVER;
}

export async function lancerTourDriver(aller: (etape: Etape) => void, terminer: () => void) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  injecterCss();
  const { driver } = await import('driver.js');
  let fini = false;
  const cloturer = () => {
    if (fini) return;
    fini = true;
    terminer();
  };
  const steps: DriveStep[] = ETAPES_GUIDE.map((etape, index) => ({
    element: () => cibleEtape(etape.id) ?? document.getElementById('tour-generer') ?? document.body,
    waitForElement: 900,
    popover: {
      title: etape.titre,
      description: etape.texte,
      side: 'bottom',
      align: 'center',
      popoverClass: 'flash-tour',
      onNextClick: (_element, _step, opts) => {
        if (index >= ETAPES_GUIDE.length - 1) {
          opts.driver.destroy();
          return;
        }
        const suivante = ETAPES_GUIDE[index + 1];
        aller(suivante.etape);
        window.setTimeout(() => {
          montrerEtape(suivante.id);
          opts.driver.moveNext();
          window.setTimeout(() => {
            opts.driver.refresh();
            recadrerPopover();
          }, 80);
        }, 240);
      },
      onPrevClick: (_element, _step, opts) => {
        if (index === 0) return;
        const precedente = ETAPES_GUIDE[index - 1];
        aller(precedente.etape);
        window.setTimeout(() => {
          montrerEtape(precedente.id);
          opts.driver.movePrevious();
          window.setTimeout(() => {
            opts.driver.refresh();
            recadrerPopover();
          }, 80);
        }, 240);
      },
    },
    onHighlighted: () => {
      window.requestAnimationFrame(() => recadrerPopover());
    },
  }));
  const guide: Driver = driver({
    animate: false,
    overlayOpacity: 0.45,
    stagePadding: 8,
    stageRadius: 8,
    popoverOffset: 12,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'Suivant',
    prevBtnText: 'Retour',
    doneBtnText: 'Terminer',
    waitForElement: 900,
    onDestroyed: () => cloturer(),
    onHighlighted: () => {
      window.requestAnimationFrame(() => recadrerPopover());
    },
    steps,
  });
  aller(ETAPES_GUIDE[0].etape);
  window.setTimeout(() => {
    montrerEtape(ETAPES_GUIDE[0].id);
    guide.drive();
    window.setTimeout(() => recadrerPopover(), 120);
  }, 180);
}
