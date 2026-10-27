import { Platform } from 'react-native';
import type { DriveStep, Driver } from 'driver.js';

import type { Etape } from './wizard';

const CSS_DRIVER = `
.driver-layer{width:auto;max-width:none;height:auto;max-height:none;color:inherit;pointer-events:none;background:0 0;border:0;margin:0;padding:0;position:fixed;inset:0;overflow:visible}
.driver-layer::backdrop{display:none}
.driver-layer .driver-popover{pointer-events:auto}
.driver-popover{all:unset;font-family:Inter,system-ui,sans-serif;box-sizing:border-box;color:#1E293B;z-index:1000000000;background-color:#fff;border:1px solid #E2E8F0;border-radius:8px;min-width:250px;max-width:320px;margin:0;padding:15px;position:fixed;top:0;right:0;box-shadow:0 1px 2px #0F172A0F}
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
  { id: 'tour-source', etape: 1, titre: 'Source de données', texte: 'Local ou lien Web (Google Sheets, Office 365).' },
  { id: 'tour-etp', etape: 2, titre: 'Effectif terrain', texte: 'Importez le planning, ou passez : l’ETP moyen se règle sur le plan.' },
  { id: 'tour-leviers', etape: 3, titre: 'Cadence & Qualité', texte: 'Leviers de staffing Erlang C.' },
  { id: 'tour-bilan', etape: 4, titre: 'Bilan des écarts & Export', texte: 'Lisez les écarts, puis exportez le plan.' },
];

function injecterCss() {
  if (typeof document === 'undefined' || document.getElementById('flash-driver-css')) return;
  const style = document.createElement('style');
  style.id = 'flash-driver-css';
  style.textContent = CSS_DRIVER;
  document.head.appendChild(style);
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
    element: `#${etape.id}`,
    waitForElement: 900,
    popover: {
      title: etape.titre,
      description: etape.texte,
      side: 'bottom',
      align: 'start',
      popoverClass: 'flash-tour',
      onNextClick: (_element, _step, opts) => {
        if (index >= ETAPES_GUIDE.length - 1) {
          opts.driver.destroy();
          return;
        }
        aller(ETAPES_GUIDE[index + 1].etape);
        opts.driver.moveNext();
      },
      onPrevClick: (_element, _step, opts) => {
        if (index === 0) return;
        aller(ETAPES_GUIDE[index - 1].etape);
        opts.driver.movePrevious();
      },
    },
  }));
  const guide: Driver = driver({
    animate: true,
    overlayOpacity: 0.45,
    stagePadding: 8,
    stageRadius: 12,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'Suivant',
    prevBtnText: 'Retour',
    doneBtnText: 'Terminer',
    waitForElement: 900,
    onDestroyed: () => cloturer(),
    steps,
  });
  aller(1);
  window.setTimeout(() => guide.drive(), 180);
}
