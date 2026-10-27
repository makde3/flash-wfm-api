import * as XLSXStyle from 'xlsx-js-style';

export type Hypothese = {
  label: string;
  valeur: string | number;
  format?: string;
};

export type ModeleSynthese = {
  wape: number | null;
  volume: number;
  etpMoyen: number;
  ecart: number | null;
  pic: string;
};

export type DossierSynthese = {
  hypotheses: Hypothese[];
  holt: ModeleSynthese | null;
  light: ModeleSynthese | null;
  recommande: 'holt' | 'light' | null;
  verdict: string;
};

const NOM_HOLT = 'Modèle Tendance (Holt-Winters)';
const NOM_LIGHT = 'Modèle IA (LightGBM)';
const FICHIER = 'Synthese_Staffing_FlashWFM';

const BORD_FIN = { style: 'thin', color: { rgb: 'E2E8F0' } };
const BORDURE = { top: BORD_FIN, bottom: BORD_FIN, left: BORD_FIN, right: BORD_FIN };
const BORD_FORT = { style: 'medium', color: { rgb: '0F2D46' } };
const ENCADRE = { top: BORD_FORT, bottom: BORD_FORT, left: BORD_FORT, right: BORD_FORT };

function dateDuJour() {
  return new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function nomModele(id: 'holt' | 'light', recommande: boolean) {
  const nom = id === 'holt' ? NOM_HOLT : NOM_LIGHT;
  return recommande ? `${nom}\nRecommandé` : nom;
}

function texteWape(wape: number | null) {
  if (wape == null) return 'WAPE indisponible';
  return `WAPE ${wape.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

function texteRecommande(dossier: DossierSynthese) {
  if (dossier.recommande === 'holt') return `${NOM_HOLT} — ${texteWape(dossier.holt?.wape ?? null)}`;
  if (dossier.recommande === 'light') return `${NOM_LIGHT} — ${texteWape(dossier.light?.wape ?? null)}`;
  return 'Non déterminé — WAPE indisponible';
}

function valeurModele(modele: ModeleSynthese | null, champ: 'volume' | 'etpMoyen' | 'ecart') {
  if (!modele || modele[champ] == null) return '—';
  return modele[champ] as number;
}

function styleBase(extra: object) {
  return {
    font: { name: 'Calibri', sz: 11, color: { rgb: '0F2D46' } },
    alignment: { vertical: 'center', wrapText: true },
    border: BORDURE,
    ...extra,
  };
}

function styleEntete() {
  return styleBase({
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '0F2D46' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  });
}

function styleEcart(valeur: number) {
  const sous = valeur < -0.05;
  const sur = valeur > 0.05;
  return styleBase({
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: sous ? '991B1B' : sur ? '166534' : '0F2D46' } },
    fill: { patternType: 'solid', fgColor: { rgb: sous ? 'FECACA' : sur ? 'BBF7D0' : 'FFFFFF' } },
    alignment: { horizontal: 'right', vertical: 'center' },
  });
}

function largeur(textes: string[], min: number, max: number) {
  const plusLong = textes.reduce((maxActuel, texte) => {
    const ligne = texte.split('\n').reduce((n, part) => Math.max(n, part.length), 0);
    return Math.max(maxActuel, ligne);
  }, min);
  return { wch: Math.min(max, plusLong + 3) };
}

export function classeurSynthese(dossier: DossierSynthese) {
  const hypotheses = dossier.hypotheses;
  const lignes: (string | number)[][] = [
    ['Fiche de Synthèse Exécutive - Flash WFM', '', ''],
    [dateDuJour(), '', ''],
    [],
    ['Hypothèses', '', ''],
    ['Paramètre', 'Valeur', ''],
    ...hypotheses.map((ligne) => [ligne.label, ligne.valeur, '']),
    [],
    ['Comparatif des modèles', '', ''],
    ['Indicateur', nomModele('holt', dossier.recommande === 'holt'), nomModele('light', dossier.recommande === 'light')],
    ['Volume total prévu', valeurModele(dossier.holt, 'volume'), valeurModele(dossier.light, 'volume')],
    ['ETP requis moyen', valeurModele(dossier.holt, 'etpMoyen'), valeurModele(dossier.light, 'etpMoyen')],
    ['Écart vs effectif dispo', valeurModele(dossier.holt, 'ecart'), valeurModele(dossier.light, 'ecart')],
    ['Pic de besoin maximal', dossier.holt?.pic ?? '—', dossier.light?.pic ?? '—'],
    [],
    ['Verdict', '', ''],
    ['Modèle recommandé', texteRecommande(dossier), ''],
    [dossier.verdict, '', ''],
  ];

  const debutHypotheses = 5;
  const finHypotheses = debutHypotheses + hypotheses.length - 1;
  const enteteComparatif = finHypotheses + 3;
  const ligneVolume = enteteComparatif + 1;
  const ligneEtp = enteteComparatif + 2;
  const ligneEcart = enteteComparatif + 3;
  const lignePic = enteteComparatif + 4;
  const ligneReco = lignePic + 3;
  const lignePhrase = ligneReco + 1;

  const feuille = XLSXStyle.utils.aoa_to_sheet(lignes);
  feuille['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } },
    { s: { r: enteteComparatif - 1, c: 0 }, e: { r: enteteComparatif - 1, c: 2 } },
    { s: { r: lignePic + 2, c: 0 }, e: { r: lignePic + 2, c: 2 } },
    { s: { r: ligneReco, c: 1 }, e: { r: ligneReco, c: 2 } },
    { s: { r: lignePhrase, c: 0 }, e: { r: lignePhrase, c: 2 } },
  ];
  feuille['!cols'] = [
    largeur(hypotheses.map((ligne) => ligne.label).concat(['Écart vs effectif dispo', 'Pic de besoin maximal', 'Modèle recommandé']), 24, 36),
    largeur([NOM_HOLT, 'Recommandé', texteRecommande(dossier)], 28, 42),
    largeur([NOM_LIGHT, 'Recommandé'], 28, 42),
  ];
  const hauteurs: { hpt: number }[] = [];
  hauteurs[0] = { hpt: 30 };
  hauteurs[1] = { hpt: 18 };
  hauteurs[3] = { hpt: 22 };
  hauteurs[enteteComparatif] = { hpt: 32 };
  hauteurs[lignePhrase] = { hpt: 48 };
  feuille['!rows'] = hauteurs;

  const poser = (ligne: number, colonne: number, style: object, format?: string) => {
    const ref = XLSXStyle.utils.encode_cell({ r: ligne, c: colonne });
    const cellule = feuille[ref];
    if (!cellule) return;
    cellule.s = style;
    if (format && typeof cellule.v === 'number') cellule.z = format;
  };

  const titre = styleBase({
    font: { name: 'Calibri', sz: 18, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '0F2D46' } },
    alignment: { vertical: 'center', horizontal: 'left' },
    border: undefined,
  });
  const date = styleBase({
    font: { name: 'Calibri', sz: 12, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '0F2D46' } },
    alignment: { vertical: 'center' },
    border: undefined,
  });
  const section = styleBase({
    font: { name: 'Calibri', sz: 14, bold: true, color: { rgb: '0F2D46' } },
    alignment: { vertical: 'center' },
    border: undefined,
  });
  const libelle = styleBase({ font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: '0F2D46' } } });
  const valeur = styleBase({ alignment: { horizontal: 'right', vertical: 'center', wrapText: true } });
  const encadre = styleBase({
    font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: '0F2D46' } },
    fill: { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } },
    border: ENCADRE,
    alignment: { vertical: 'center', wrapText: true },
  });

  poser(0, 0, titre);
  poser(1, 0, date);
  poser(3, 0, section);
  poser(4, 0, styleEntete());
  poser(4, 1, styleEntete());
  hypotheses.forEach((ligne, index) => {
    const ligneFeuille = debutHypotheses + index;
    const fond = index % 2 === 1 ? { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } } : undefined;
    poser(ligneFeuille, 0, { ...libelle, fill: fond });
    poser(ligneFeuille, 1, { ...valeur, fill: fond }, ligne.format);
  });

  poser(enteteComparatif - 1, 0, section);
  for (let colonne = 0; colonne < 3; colonne += 1) poser(enteteComparatif, colonne, styleEntete());

  const poserComparatif = (ligne: number, format?: string, ecart = false) => {
    poser(ligne, 0, libelle);
    (['holt', 'light'] as const).forEach((id, index) => {
      const modele = dossier[id];
      const recommande = dossier.recommande === id;
      const brut = feuille[XLSXStyle.utils.encode_cell({ r: ligne, c: index + 1 })]?.v;
      if (ecart && typeof brut === 'number') {
        poser(ligne, index + 1, styleEcart(brut), '#,##0.0');
        return;
      }
      const fond = recommande ? { patternType: 'solid', fgColor: { rgb: 'FFF8E1' } } : undefined;
      poser(ligne, index + 1, { ...valeur, fill: fond, alignment: { horizontal: typeof brut === 'number' ? 'right' : 'left', vertical: 'center', wrapText: true } }, format);
    });
  };
  poserComparatif(ligneVolume, '#,##0');
  poserComparatif(ligneEtp, '#,##0.0');
  poserComparatif(ligneEcart, '#,##0.0', true);
  poserComparatif(lignePic);

  poser(lignePic + 2, 0, section);
  poser(ligneReco, 0, encadre);
  poser(ligneReco, 1, { ...encadre, alignment: { horizontal: 'left', vertical: 'center', wrapText: true } });
  poser(lignePhrase, 0, { ...encadre, font: { name: 'Calibri', sz: 12, color: { rgb: '0F2D46' } }, alignment: { vertical: 'center', wrapText: true } });

  const classeur = XLSXStyle.utils.book_new();
  classeur.Props = {
    Title: 'Fiche de Synthèse Exécutive - Flash WFM',
    Subject: 'Synthèse staffing',
    Author: 'Flash WFM',
  };
  XLSXStyle.utils.book_append_sheet(classeur, feuille, 'Synthèse & Cadre');
  return classeur;
}

export function exporterSyntheseExcel(dossier: DossierSynthese) {
  XLSXStyle.writeFile(classeurSynthese(dossier), `${FICHIER}.xlsx`);
}

function cellulePpt(texte: string, options: { fill?: string; color?: string; bold?: boolean; align?: 'left' | 'center' | 'right' }) {
  return {
    text: texte,
    options: {
      fill: { color: options.fill ?? 'FFFFFF' },
      color: options.color ?? '0F2D46',
      bold: options.bold ?? false,
      align: options.align ?? 'left',
      valign: 'middle' as const,
    },
  };
}

function texteNombre(valeur: string | number, decimales: number) {
  if (typeof valeur !== 'number') return String(valeur);
  return valeur.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

export async function exporterSynthesePptx(dossier: DossierSynthese) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = 'Fiche de Synthèse Exécutive - Flash WFM';
  pptx.author = 'Flash WFM';
  pptx.subject = 'Synthèse staffing';
  pptx.company = 'Mak Consult';
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.92, fill: { color: '0F2D46' } });
  slide.addText('Fiche de Synthèse Exécutive - Flash WFM', {
    x: 0.4, y: 0.12, w: 10, h: 0.4, fontFace: 'Calibri', fontSize: 22, bold: true, color: 'FFFFFF', margin: 0,
  });
  slide.addText(dateDuJour(), {
    x: 0.4, y: 0.52, w: 8, h: 0.26, fontFace: 'Calibri', fontSize: 12, color: 'F4C430', margin: 0,
  });

  const entete = { fill: '0F2D46', color: 'FFFFFF', bold: true, align: 'center' as const };
  const hyp = [
    [cellulePpt('Paramètre', entete), cellulePpt('Valeur', entete)],
    ...dossier.hypotheses.map((ligne, index) => {
      const fond = index % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
      const valeur = typeof ligne.valeur === 'number'
        ? texteNombre(ligne.valeur, ligne.format === '#,##0.0' || ligne.format === '0.0' ? 1 : 0)
        : String(ligne.valeur);
      return [cellulePpt(ligne.label, { fill: fond, bold: true }), cellulePpt(valeur, { fill: fond, align: 'right' })];
    }),
  ];
  slide.addText('Hypothèses', { x: 0.35, y: 1.08, w: 5.6, h: 0.28, fontFace: 'Calibri', fontSize: 14, bold: true, color: '0F2D46', margin: 0 });
  slide.addTable(hyp, {
    x: 0.35, y: 1.4, w: 5.7, colW: [2.7, 3], fontFace: 'Calibri', fontSize: 11,
    border: { pt: 0.5, color: 'E2E8F0' }, valign: 'middle',
  });

  const colonne = (id: 'holt' | 'light', champ: 'volume' | 'etpMoyen' | 'ecart' | 'pic') => {
    const modele = dossier[id];
    const recommande = dossier.recommande === id;
    if (!modele) return cellulePpt('—', { fill: recommande ? 'FFF8E1' : 'FFFFFF' });
    if (champ === 'pic') return cellulePpt(modele.pic, { fill: recommande ? 'FFF8E1' : 'FFFFFF' });
    const brut = modele[champ];
    if (brut == null) return cellulePpt('—', { fill: recommande ? 'FFF8E1' : 'FFFFFF' });
    if (champ === 'ecart') {
      const sous = brut < -0.05;
      const sur = brut > 0.05;
      return cellulePpt(texteNombre(brut, 1), {
        fill: sous ? 'FECACA' : sur ? 'BBF7D0' : (recommande ? 'FFF8E1' : 'FFFFFF'),
        color: sous ? '991B1B' : sur ? '166534' : '0F2D46',
        bold: true,
        align: 'right',
      });
    }
    return cellulePpt(texteNombre(brut, champ === 'volume' ? 0 : 1), {
      fill: recommande ? 'FFF8E1' : 'FFFFFF',
      align: 'right',
      bold: true,
    });
  };
  const comp = [
    [
      cellulePpt('Indicateur', entete),
      cellulePpt(nomModele('holt', dossier.recommande === 'holt'), entete),
      cellulePpt(nomModele('light', dossier.recommande === 'light'), entete),
    ],
    [cellulePpt('Volume total prévu', { bold: true }), colonne('holt', 'volume'), colonne('light', 'volume')],
    [cellulePpt('ETP requis moyen', { bold: true }), colonne('holt', 'etpMoyen'), colonne('light', 'etpMoyen')],
    [cellulePpt('Écart vs effectif dispo', { bold: true }), colonne('holt', 'ecart'), colonne('light', 'ecart')],
    [cellulePpt('Pic de besoin maximal', { bold: true }), colonne('holt', 'pic'), colonne('light', 'pic')],
  ];
  slide.addText('Comparatif des modèles', { x: 6.25, y: 1.08, w: 6.7, h: 0.28, fontFace: 'Calibri', fontSize: 14, bold: true, color: '0F2D46', margin: 0 });
  slide.addTable(comp, {
    x: 6.25, y: 1.4, w: 6.7, colW: [2.3, 2.2, 2.2], fontFace: 'Calibri', fontSize: 11,
    border: { pt: 0.5, color: 'E2E8F0' }, valign: 'middle',
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.35, y: 5.85, w: 12.63, h: 1.35, fill: { color: 'F8FAFC' }, line: { color: '0F2D46', width: 1.25 },
  });
  slide.addText('Verdict', { x: 0.55, y: 5.95, w: 12, h: 0.26, fontFace: 'Calibri', fontSize: 13, bold: true, color: '0F2D46', margin: 0 });
  slide.addText(`${texteRecommande(dossier)}\n${dossier.verdict}`, {
    x: 0.55, y: 6.24, w: 12.2, h: 0.82, fontFace: 'Calibri', fontSize: 13, color: '0F2D46', margin: 0,
  });

  await pptx.writeFile({ fileName: `${FICHIER}.pptx` });
}
