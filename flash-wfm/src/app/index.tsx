import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import * as XLSXStyle from 'xlsx-js-style';
import CombinedChart from '../components/CombinedChart';

const API_BASE = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'https://flash-wfm-api.onrender.com';

function dateCourte(date: string) {
  const jour = date.match(/^(\d{2}\/\d{2})\/\d{4}$/);
  if (jour) return jour[1];
  const mois = date.match(/^(\d{2})\/(\d{4})$/);
  if (mois) return `${mois[1]}/${mois[2].slice(2)}`;
  return date;
}

function masquerBarreDefilement() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('flash-plan-scroll-style')) return;
  const style = document.createElement('style');
  style.id = 'flash-plan-scroll-style';
  style.textContent = '#flash-plan-scroll, #flash-plan-scroll * { scrollbar-width: none; -ms-overflow-style: none; } #flash-plan-scroll::-webkit-scrollbar, #flash-plan-scroll *::-webkit-scrollbar { display: none; height: 0; width: 0; }';
  document.head.appendChild(style);
}

function HeaderLogo({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.headerContainer}>
      <View style={styles.logoBadge}>
        <Ionicons name="flash" size={28} color="#F4C430" />
      </View>
      <View style={styles.headerTextContainer}>
        <Text style={styles.brandTitle}>
          FLASH <Text style={styles.brandTitleSub}>WFM</Text>
        </Text>
        <Text style={styles.brandSubtitle}>{subtitle || 'DATA · MÉTIER · PERFORMANCE'}</Text>
      </View>
    </View>
  );
}

function HorizontalPlan({ plan }: { plan: PlanLigne[] }) {
  useEffect(() => {
    masquerBarreDefilement();
  }, []);
  if (plan.length === 0) return null;

  return (
    <View style={styles.hTable}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        nativeID="flash-plan-scroll"
        style={styles.hScroll}
      >
        <View>
          <View style={styles.hRow}>
            <Text style={[styles.hLabel, styles.hLabelHead]}>Période</Text>
            {plan.map((row, index) => (
              <Text key={`${row.date}-d-${index}`} style={styles.hHeadCell}>{dateCourte(row.date)}</Text>
            ))}
          </View>
          <View style={styles.hRow}>
            <Text style={styles.hLabel}>Volume prévu</Text>
            {plan.map((row, index) => (
              <Text key={`${row.date}-v-${index}`} style={styles.hCell}>{row.volume_prevu.toLocaleString('fr-FR')}</Text>
            ))}
          </View>
          <View style={[styles.hRow, styles.hRowAlt]}>
            <Text style={styles.hLabel}>ETP requis</Text>
            {plan.map((row, index) => (
              <Text key={`${row.date}-e-${index}`} style={styles.hCell}>{row.etp_moyen_requis.toLocaleString('fr-FR')}</Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

type Horizon = 'court_terme' | 'long_terme';

type PlanLigne = {
  date: string;
  volume_prevu: number;
  etp_moyen_requis: number;
};

type ExportPlan = {
  plan: PlanLigne[];
  aht: number;
  sla: number;
  tempsCible: number;
  shrinkage: number;
  heuresOuverture: number;
  modele: string;
  horizonLabel: string;
};

function exporterPlanExcel({ plan, aht, sla, tempsCible, shrinkage, heuresOuverture, modele, horizonLabel }: ExportPlan) {
  const volumeTotal = plan.reduce((somme, ligne) => somme + ligne.volume_prevu, 0);
  const etpMoyen = plan.reduce((somme, ligne) => somme + ligne.etp_moyen_requis, 0) / plan.length;
  const lignes: (string | number)[][] = [
    ['Flash WFM — Plan de production'],
    ['Mak Consult'],
    [],
    ['Paramètre', 'Valeur'],
    ['AHT (secondes)', aht],
    ['SLA cible (%)', sla],
    ['Temps cible SLA (secondes)', tempsCible],
    ['Shrinkage (%)', shrinkage],
    ["Heures d'ouverture", heuresOuverture],
    ['Modèle', modele],
    ['Horizon', horizonLabel],
    ['Volume total', volumeTotal],
    ['ETP moyen', Number(etpMoyen.toFixed(2))],
    [],
    ['Période', 'Volume prévu', 'ETP requis', 'SLA cible (%)'],
    ...plan.map((ligne) => [ligne.date, ligne.volume_prevu, ligne.etp_moyen_requis, sla]),
  ];
  const enteteTableau = 14;
  const feuille = XLSXStyle.utils.aoa_to_sheet(lignes);
  feuille['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
  ];
  feuille['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 16 }, { wch: 18 }];
  feuille['!rows'] = [{ hpt: 28 }, { hpt: 18 }];
  feuille['!autofilter'] = {
    ref: XLSXStyle.utils.encode_range({ s: { r: enteteTableau, c: 0 }, e: { r: lignes.length - 1, c: 3 } }),
  };
  feuille['!views'] = [{ state: 'frozen', ySplit: enteteTableau + 1, xSplit: 0, topLeftCell: 'A16', activePane: 'bottomLeft' }];

  const fin = { style: 'thin', color: { rgb: 'E6E9EE' } };
  const bordure = { top: fin, bottom: fin, left: fin, right: fin };
  const styleTitre = { font: { bold: true, sz: 18, color: { rgb: '0F2D46' }, name: 'Calibri' }, alignment: { vertical: 'center' } };
  const styleSousTitre = { font: { sz: 12, color: { rgb: '687581' }, name: 'Calibri' }, alignment: { vertical: 'center' } };
  const styleEntete = {
    font: { bold: true, sz: 12, color: { rgb: 'F4C430' }, name: 'Calibri' },
    fill: { patternType: 'solid', fgColor: { rgb: '0F2D46' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: bordure,
  };
  const styleLibelle = {
    font: { bold: true, sz: 11, color: { rgb: '0F2D46' }, name: 'Calibri' },
    alignment: { vertical: 'center' },
    border: bordure,
  };
  const styleValeur = {
    font: { sz: 11, color: { rgb: '0F2D46' }, name: 'Calibri' },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: bordure,
  };

  const poser = (ref: string, style: object, format?: string) => {
    const cellule = feuille[ref];
    if (!cellule) return;
    cellule.s = style;
    if (format) cellule.z = format;
  };

  poser('A1', styleTitre);
  poser('A2', styleSousTitre);
  poser('A4', styleEntete);
  poser('B4', styleEntete);
  for (let ligne = 5; ligne <= 13; ligne += 1) {
    const fond = ligne % 2 === 0 ? { patternType: 'solid', fgColor: { rgb: 'F7F6F1' } } : undefined;
    poser(`A${ligne}`, { ...styleLibelle, fill: fond });
    const format = ligne === 12 ? '#,##0' : ligne === 13 ? '0.00' : ligne === 9 ? '0.0' : ligne <= 8 ? '0' : undefined;
    poser(`B${ligne}`, { ...styleValeur, fill: fond }, format);
  }
  for (let colonne = 0; colonne < 4; colonne += 1) {
    poser(XLSXStyle.utils.encode_cell({ r: enteteTableau, c: colonne }), styleEntete);
  }
  for (let ligne = enteteTableau + 1; ligne < lignes.length; ligne += 1) {
    const fond = (ligne - enteteTableau) % 2 === 0 ? { patternType: 'solid', fgColor: { rgb: 'F7F6F1' } } : undefined;
    const styleTexte = { font: { sz: 11, color: { rgb: '0F2D46' }, name: 'Calibri' }, alignment: { vertical: 'center' }, border: bordure, fill: fond };
    const styleNombre = { ...styleTexte, alignment: { horizontal: 'right', vertical: 'center' } };
    poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 0 }), styleTexte);
    poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 1 }), styleNombre, '#,##0');
    poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 2 }), styleNombre, '#,##0');
    poser(XLSXStyle.utils.encode_cell({ r: ligne, c: 3 }), styleNombre, '0');
  }

  const classeur = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(classeur, feuille, 'Plan de production');
  try {
    if (Platform.OS !== 'web') {
      alert("Veuillez ouvrir l'application depuis un navigateur web pour télécharger le fichier Excel.");
      return;
    }
    XLSXStyle.writeFile(classeur, 'Flash-WFM-plan-production.xlsx');
  } catch (error) {
    console.error(error);
    alert("Erreur lors de la génération du fichier Excel.");
  }
}

async function postApi(path: string, body: unknown, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = typeof data?.detail === 'string' ? data.detail : data?.message;
      throw new Error(detail || `HTTP ${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export default function FlashWFM() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [dataPreview, setDataPreview] = useState<any[] | null>(null);
  
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>('court_terme');
  const [plan, setPlan] = useState<PlanLigne[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const [heuresOuverture, setHeuresOuverture] = useState('8');
  const [aht, setAht] = useState('360');
  const [sla, setSla] = useState('80');
  const [tempsCible, setTempsCible] = useState('20');
  const [shrinkage, setShrinkage] = useState('25');
  
  const [showResult, setShowResult] = useState(false);
  const [etpResult, setEtpResult] = useState<number | null>(null);
  const [predictedVolume, setPredictedVolume] = useState<number>(150);

  const pickDocument = async () => {
    let result = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      setFileName(asset.name);
      try {
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        setDataPreview(jsonData);
      } catch (error) {
        console.error("Erreur Excel :", error);
        alert("Erreur lors de la lecture du fichier Excel.");
      }
    }
  };

  const handleGenerate = async () => {
    if (loading) return;
    if (!selectedModel) {
      alert("Veuillez sélectionner un algorithme de prévision.");
      return;
    }
    if (!dataPreview) {
      alert("Aucune donnée importée. Veuillez revenir à l'étape 1 pour importer votre fichier Excel.");
      return;
    }
    
    setLoading(true);
    setPlan(null);
    try {
      const donnees = dataPreview.map((row) => {
        const values = Object.values(row ?? {});
        return {
          date: values[0] ?? null,
          file: values[1] ?? null,
          volume: values[2] ?? null,
        };
      });
      const modele =
        selectedModel === 'Prophet' ? 'Moyenne'
        : selectedModel === 'Holt-Winters' ? 'Holt-Winters'
        : 'LightGBM';
      const data = await postApi('/prevision_plan', {
        modele,
        horizon,
        donnees,
        parametres_erlang: {
          volume_horaire: 0,
          aht: parseInt(aht, 10) || 360,
          sla_cible: parseInt(sla, 10) || 80,
          temps_cible: parseInt(tempsCible, 10) || 20,
          shrinkage: parseInt(shrinkage, 10) || 25,
          heures_ouverture: parseFloat(heuresOuverture) || 8,
        },
      }, 60000);

      if (data.statut === 'succès' && Array.isArray(data.plan)) {
        setPlan(data.plan);
      } else {
        alert("Erreur du moteur : " + (data.message || "Données invalides"));
      }
    } catch (error) {
      console.error(error);
      alert("Connexion au serveur backend impossible. Veuillez vérifier que l'API est active.");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!plan) return;
    exporterPlanExcel({
      plan,
      aht: parseInt(aht, 10) || 360,
      sla: parseInt(sla, 10) || 80,
      tempsCible: parseInt(tempsCible, 10) || 20,
      shrinkage: parseInt(shrinkage, 10) || 25,
      heuresOuverture: parseFloat(heuresOuverture) || 8,
      modele: selectedModel ?? '',
      horizonLabel: horizon === 'court_terme' ? 'Court terme' : 'Long terme',
    });
  };

  const calculateFTE = async () => {
    try {
      const heures = parseFloat(heuresOuverture) || 8;
      const volumeHoraireMoyen = predictedVolume / heures;

      const data = await postApi('/erlang', {
        volume_horaire: volumeHoraireMoyen,
        aht: parseInt(aht, 10) || 360,
        sla_cible: parseInt(sla, 10) || 80,
        temps_cible: parseInt(tempsCible, 10) || 20,
        shrinkage: parseInt(shrinkage, 10) || 25,
      });
      setEtpResult(data.etp_final_avec_shrinkage);
      setShowResult(true);
    } catch (error) {
      alert("L'API Erlang ne répond pas.");
      console.error(error);
    }
  };

  if (currentStep === 3) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollCenter}>
          <HeaderLogo subtitle="DATA · MÉTIER · PERFORMANCE" />
          <View style={styles.card}>
            <TouchableOpacity style={styles.backBtn} onPress={() => {setCurrentStep(2); setShowResult(false);}}>
              <Text style={styles.backBtnText}>← Retour</Text>
            </TouchableOpacity>
            
            <Text style={styles.stepText}>Étape 3 : Paramétrage Erlang C</Text>
            <Text style={styles.infoTextDark}>Volume prévisionnel : {predictedVolume} contacts / jour.</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nombre d'heures réelles d'ouverture / jour (hors pauses)</Text>
              <TextInput style={styles.input} value={heuresOuverture} onChangeText={setHeuresOuverture} keyboardType="numeric" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>AHT / DMT (secondes)</Text>
              <TextInput style={styles.input} value={aht} onChangeText={setAht} keyboardType="numeric" />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Objectif SLA (%)</Text>
              <TextInput style={styles.input} value={sla} onChangeText={setSla} keyboardType="numeric" />
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Shrinkage / Absentéisme (%)</Text>
              <TextInput style={styles.input} value={shrinkage} onChangeText={setShrinkage} keyboardType="numeric" />
            </View>
            
            <TouchableOpacity style={styles.generateBtn} onPress={calculateFTE}>
              <Text style={styles.generateBtnText}>Calculer le besoin en ETP</Text>
            </TouchableOpacity>
            
            {showResult && etpResult && (
              <View style={styles.finalResultBox}>
                <Text style={styles.finalResultTitle}>Staffing Requis Estimé</Text>
                <Text style={styles.finalResultNumber}>{etpResult} ETP</Text>
                <Text style={styles.finalResultSub}>En moyenne pour respecter un objectif de {sla}% de SLA.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (currentStep === 2) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.dashScroll}>
          <HeaderLogo subtitle="DATA · MÉTIER · PERFORMANCE" />
          <View style={styles.dash}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setCurrentStep(1)}>
              <Text style={styles.backBtnText}>← Retour</Text>
            </TouchableOpacity>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Simulation Erlang</Text>
              <View style={styles.paramGrid}>
                <View style={styles.paramField}>
                  <Text style={styles.label}>AHT (secondes)</Text>
                  <TextInput style={styles.input} value={aht} onChangeText={setAht} keyboardType="numeric" />
                  <Text style={styles.hint}>Durée moyenne de traitement (conversation + post-appel).</Text>
                </View>
                <View style={styles.paramField}>
                  <Text style={styles.label}>SLA cible (%)</Text>
                  <TextInput style={styles.input} value={sla} onChangeText={setSla} keyboardType="numeric" />
                  <Text style={styles.hint}>Part des demandes traitées dans le délai cible.</Text>
                </View>
                <View style={styles.paramField}>
                  <Text style={styles.label}>Temps cible SLA (secondes)</Text>
                  <TextInput style={styles.input} value={tempsCible} onChangeText={setTempsCible} keyboardType="numeric" />
                  <Text style={styles.hint}>Délai maximal de prise en charge (ex : 20s).</Text>
                </View>
                <View style={styles.paramField}>
                  <Text style={styles.label}>Shrinkage (%)</Text>
                  <TextInput style={styles.input} value={shrinkage} onChangeText={setShrinkage} keyboardType="numeric" />
                  <Text style={styles.hint}>Inactivité planifiée et imprévue (pauses, formations, congés).</Text>
                </View>
                <View style={styles.paramField}>
                  <Text style={styles.label}>Heures d'ouverture / jour</Text>
                  <TextInput style={styles.input} value={heuresOuverture} onChangeText={setHeuresOuverture} keyboardType="numeric" />
                  <Text style={styles.hint}>Amplitude horaire d'ouverture du service.</Text>
                </View>
              </View>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Étape 2 : Modèle de prévision</Text>
              <View style={styles.modelRow}>
                <TouchableOpacity style={[styles.modelBtn, styles.modelBtnDash, selectedModel === 'Prophet' && styles.modelBtnActive]} onPress={() => setSelectedModel('Prophet')}>
                  <Text style={[styles.modelBtnText, selectedModel === 'Prophet' && styles.modelBtnTextActive]}>📈 Prophet (Moyenne & Saisonnier)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modelBtn, styles.modelBtnDash, selectedModel === 'Holt-Winters' && styles.modelBtnActive]} onPress={() => setSelectedModel('Holt-Winters')}>
                  <Text style={[styles.modelBtnText, selectedModel === 'Holt-Winters' && styles.modelBtnTextActive]}>📊 Holt-Winters (Tendance Lissée)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modelBtn, styles.modelBtnDash, selectedModel === 'LightGBM' && styles.modelBtnActive]} onPress={() => setSelectedModel('LightGBM')}>
                  <Text style={[styles.modelBtnText, selectedModel === 'LightGBM' && styles.modelBtnTextActive]}>⭐ LightGBM (Gradient Boosting)</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.horizonLabel}>Horizon de prévision</Text>
              <View style={styles.horizonRow}>
                <TouchableOpacity
                  style={[styles.horizonBtn, horizon === 'court_terme' && styles.modelBtnActive]}
                  onPress={() => { setHorizon('court_terme'); setPlan(null); }}
                >
                  <Text style={[styles.modelBtnText, horizon === 'court_terme' && styles.modelBtnTextActive]}>Court terme</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.horizonBtn, horizon === 'long_terme' && styles.modelBtnActive]}
                  onPress={() => { setHorizon('long_terme'); setPlan(null); }}
                >
                  <Text style={[styles.modelBtnText, horizon === 'long_terme' && styles.modelBtnTextActive]}>Long terme</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.generateBtn, loading && styles.generateBtnDisabled]} onPress={handleGenerate} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#0F2D46" />
                ) : (
                  <Text style={styles.generateBtnText}>Générer le plan de production</Text>
                )}
              </TouchableOpacity>
            </View>

            {plan && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Tendances et prévisions</Text>
                <CombinedChart points={plan.map((row) => ({ label: dateCourte(row.date), volume: row.volume_prevu, etp: row.etp_moyen_requis }))} />
                <View style={styles.planHeader}>
                  <Text style={styles.planHeaderTitle}>Plan de production</Text>
                  <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
                    <Text style={styles.exportBtnText}>Exporter en Excel</Text>
                  </TouchableOpacity>
                </View>
                <HorizontalPlan plan={plan} />
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollCenter}>
        <HeaderLogo subtitle="DATA · MÉTIER · PERFORMANCE" />
        <View style={styles.card}>
          <Text style={styles.stepText}>Étape 1 : Importer l'historique de charge (Date | File | Volume)</Text>
          <TouchableOpacity style={styles.uploadBtn} onPress={pickDocument}>
            <Text style={styles.uploadBtnText}>+ Importer un fichier Excel</Text>
          </TouchableOpacity>
          {fileName && (
            <View style={styles.successBox}>
              <Text style={styles.successText}>Fichier sélectionné : {fileName}</Text>
            </View>
          )}
          {dataPreview && (
            <TouchableOpacity style={styles.nextBtn} onPress={() => setCurrentStep(2)}>
              <Text style={styles.nextBtnText}>Étape suivante : Configuration →</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E6E9EE' },
  scrollCenter: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    gap: 12,
  },
  logoBadge: {
    backgroundColor: '#0F2D46',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#F4C430',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2D46',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTextContainer: {
    alignItems: 'flex-start',
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F2D46',
    letterSpacing: 1,
  },
  brandTitleSub: {
    color: '#F4C430',
    fontWeight: '300',
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#687581',
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginTop: 2,
  },

  card: { 
    backgroundColor: '#FFFFFF', 
    padding: 24, 
    borderRadius: 12, 
    width: '100%', 
    maxWidth: 600, 
    shadowColor: '#0F2D46', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 6, 
    elevation: 4, 
    alignItems: 'center' 
  },
  stepText: { fontSize: 18, color: '#0F2D46', marginBottom: 20, textAlign: 'center', fontWeight: 'bold' },
  uploadBtn: { backgroundColor: '#F4C430', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 8, width: '100%', alignItems: 'center' },
  uploadBtnText: { color: '#0F2D46', fontSize: 16, fontWeight: 'bold' },
  successBox: { marginTop: 20, alignItems: 'center', backgroundColor: '#F7F6F1', padding: 15, borderRadius: 8, width: '100%' },
  successText: { color: '#0F2D46', fontWeight: 'bold', textAlign: 'center' },
  nextBtn: { marginTop: 20, backgroundColor: '#0F2D46', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 8, width: '100%', alignItems: 'center' },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  backBtn: { alignSelf: 'flex-start', paddingBottom: 15 },
  backBtnText: { color: '#687581', fontWeight: 'bold', fontSize: 16 },
  infoTextDark: { color: '#687581', marginBottom: 20, fontStyle: 'italic', textAlign: 'center', fontWeight: 'bold' },
  modelBtn: { backgroundColor: '#F7F6F1', borderWidth: 1, borderColor: '#E6E9EE', padding: 15, borderRadius: 8, width: '100%', marginBottom: 12, alignItems: 'center' },
  modelBtnActive: { backgroundColor: '#0F2D46', borderColor: '#0F2D46' },
  modelBtnText: { color: '#0F2D46', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  modelBtnTextActive: { color: '#F4C430', fontWeight: 'bold' },
  generateBtn: { marginTop: 10, backgroundColor: '#7FC8C0', paddingVertical: 15, paddingHorizontal: 20, borderRadius: 8, width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  generateBtnDisabled: { opacity: 0.7 },
  generateBtnText: { color: '#0F2D46', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  horizonLabel: { alignSelf: 'flex-start', color: '#0F2D46', fontWeight: 'bold', marginBottom: 8, marginTop: 12 },
  horizonRow: { flexDirection: 'row', width: '100%', gap: 12, marginBottom: 12 },
  horizonBtn: { flex: 1, backgroundColor: '#F7F6F1', borderWidth: 1, borderColor: '#E6E9EE', paddingVertical: 14, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center' },
  dashScroll: { flexGrow: 1, alignItems: 'center', padding: 16, paddingBottom: 40 },
  dash: { width: '100%', maxWidth: 1100, alignItems: 'stretch' },
  panel: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 12, width: '100%', marginBottom: 16, shadowColor: '#0F2D46', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4 },
  panelTitle: { fontSize: 18, color: '#0F2D46', fontWeight: 'bold', marginBottom: 16 },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16, gap: 12 },
  planHeaderTitle: { fontSize: 18, color: '#0F2D46', fontWeight: 'bold' },
  exportBtn: { backgroundColor: '#F4C430', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  exportBtnText: { color: '#0F2D46', fontWeight: 'bold', fontSize: 14 },
  paramGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%' },
  paramField: { flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 140 },
  modelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%' },
  modelBtnDash: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 200, marginBottom: 0 },
  hTable: { width: '100%', borderWidth: 1, borderColor: '#E6E9EE', borderRadius: 8, overflow: 'hidden' },
  hScroll: { width: '100%', scrollbarWidth: 'none' },
  hRow: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#FFFFFF' },
  hRowAlt: { backgroundColor: '#F7F6F1' },
  hLabel: { width: 118, paddingVertical: 12, paddingHorizontal: 10, color: '#0F2D46', fontWeight: 'bold', fontSize: 13 },
  hLabelHead: { backgroundColor: '#0F2D46', color: '#F4C430' },
  hHeadCell: { width: 76, paddingVertical: 12, paddingHorizontal: 6, textAlign: 'center', color: '#F4C430', fontWeight: 'bold', fontSize: 13, backgroundColor: '#0F2D46' },
  hCell: { width: 76, paddingVertical: 12, paddingHorizontal: 6, textAlign: 'center', color: '#0F2D46', fontSize: 14 },
  inputGroup: { width: '100%', marginBottom: 15 },
  label: { color: '#0F2D46', fontWeight: 'bold', marginBottom: 5 },
  hint: { color: '#9AA3AD', fontSize: 12, lineHeight: 16, marginTop: 6 },
  input: { backgroundColor: '#F7F6F1', borderWidth: 1, borderColor: '#E6E9EE', padding: 12, borderRadius: 8, fontSize: 16, color: '#0F2D46' },
  finalResultBox: { marginTop: 25, backgroundColor: '#0F2D46', padding: 20, borderRadius: 8, width: '100%', alignItems: 'center' },
  finalResultTitle: { color: '#F4C430', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  finalResultNumber: { color: '#FFF', fontSize: 48, fontWeight: 'bold' },
  finalResultSub: { color: '#7FC8C0', fontSize: 12, marginTop: 10, textAlign: 'center' }
});