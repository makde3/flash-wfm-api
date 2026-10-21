import math
import sys
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import lightgbm as lgb

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ErlangRequest(BaseModel):
    volume_horaire: float
    aht: int
    sla_cible: int
    temps_cible: int = 20
    shrinkage: int
    heures_ouverture: float = 8.0
    type_flux: str = "chaud"
    backlog: int = 0
    delai_sla_jours: int = 1
    taux_occupation: int = 85

class PrevisionRequest(BaseModel):
    modele: str
    horizon: str
    donnees: List[Dict[str, Any]]
    parametres_erlang: ErlangRequest

def calcul_erlang_c(agents, traffic):
    if agents <= traffic:
        return 1.0
    erlang_b = 1.0
    for i in range(1, int(agents) + 1):
        erlang_b = (traffic * erlang_b) / (i + traffic * erlang_b)
    erlang_c = erlang_b / (1 - (traffic / agents) * (1 - erlang_b))
    return erlang_c

def calculer_etp_pour_volume(volume, req: ErlangRequest):
    volume_horaire_estime = volume / req.heures_ouverture 
    traffic = (volume_horaire_estime * req.aht) / 3600.0
    agents = math.ceil(traffic)
    if agents < 1:
        agents = 1
        
    while True:
        pw = calcul_erlang_c(agents, traffic)
        sla_calcule = 1 - pw * math.exp(-(agents - traffic) * (req.temps_cible / req.aht))
        if sla_calcule >= (req.sla_cible / 100.0):
            break
        agents += 1
        
    return math.ceil(agents / (1 - (req.shrinkage / 100.0)))

def calculer_etp_ticketing(volume, req: ErlangRequest):
    aht_heures = req.aht / 3600.0
    charge_heures = (volume + req.backlog) * aht_heures

    capacite_agent_jour = (
        req.heures_ouverture
        * (1.0 - (req.shrinkage / 100.0))
        * (req.taux_occupation / 100.0)
    )
    if capacite_agent_jour <= 0:
        return 1

    sla_jours = max(1, req.delai_sla_jours)
    etp = math.ceil(charge_heures / (capacite_agent_jour * sla_jours))
    return max(1, etp)

SAISON_ANNUELLE = 365
FEATURES_TEMPORELLES = [
    'mois', 'jour_du_mois', 'month_tier', 'dist_15', 'dist_19',
    'semaine_annee', 'semaine_de_l_annee', 'jour_semaine'
]

FORMATS_DATE = (
    '%d/%m/%Y',
    '%d/%m/%Y %H:%M:%S',
    '%Y-%m-%d',
    '%Y-%m-%d %H:%M:%S',
    '%Y-%m-%dT%H:%M:%S',
    '%d-%m-%Y',
    '%d.%m.%Y',
)

def parser_une_date(valeur):
    if valeur is None or valeur == '':
        return pd.NaT
    if isinstance(valeur, datetime):
        return valeur.replace(hour=0, minute=0, second=0, microsecond=0)
    if isinstance(valeur, (int, float)) and not isinstance(valeur, bool):
        if not math.isfinite(float(valeur)):
            return pd.NaT
        return pd.to_datetime(float(valeur), unit='D', origin='1899-12-30')
    texte = str(valeur).strip()
    if texte.lower() in {'nan', 'none', 'null', 'nat'}:
        return pd.NaT
    nombre = texte.replace(',', '.')
    if nombre.replace('.', '', 1).isdigit():
        return pd.to_datetime(float(nombre), unit='D', origin='1899-12-30')
    for fmt in FORMATS_DATE:
        try:
            return datetime.strptime(texte[:19], fmt)
        except ValueError:
            continue
    return pd.to_datetime(texte, errors='coerce', dayfirst=True)

def parser_un_volume(valeur):
    if valeur is None or valeur == '':
        return np.nan
    if isinstance(valeur, (int, float)) and not isinstance(valeur, bool):
        return float(valeur) if math.isfinite(float(valeur)) else np.nan
    texte = str(valeur).strip().replace('\u00a0', '').replace(' ', '').replace(',', '.')
    return pd.to_numeric(texte, errors='coerce')

def apercu(valeur):
    return f"{valeur!r} ({type(valeur).__name__})"

def journaliser_payload(donnees):
    print(f"-> Lignes recues : {len(donnees)}", flush=True)
    if not donnees:
        print("-> Payload vide", flush=True)
        return
    print(f"-> Cles : {list(donnees[0].keys())}", flush=True)
    for index, ligne in enumerate(donnees[:3]):
        print(
            f"-> Exemple {index + 1} : date={apercu(ligne.get('date'))} "
            f"file={apercu(ligne.get('file'))} volume={apercu(ligne.get('volume'))}",
            flush=True,
        )

def debut_prevision(est_court_terme, maintenant):
    if est_court_terme:
        return (maintenant.replace(day=1) + timedelta(days=32)).replace(day=1)
    return maintenant.replace(day=1)

def features_temporelles(dates):
    dates = pd.to_datetime(pd.Series(dates)).reset_index(drop=True)
    jour = dates.dt.day.astype(int)
    semaine = dates.dt.isocalendar().week.astype(int).clip(1, 52)
    tiers = np.where(jour <= 10, 1, np.where(jour <= 20, 2, 3)).astype(int)
    return pd.DataFrame({
        'mois': dates.dt.month.astype(int),
        'jour_du_mois': jour,
        'month_tier': tiers,
        'dist_15': (jour - 15).abs().astype(int),
        'dist_19': (jour - 19).abs().astype(int),
        'semaine_annee': semaine.to_numpy(),
        'semaine_de_l_annee': semaine.to_numpy(),
        'jour_semaine': dates.dt.dayofweek.astype(int),
    })

def prevoir_double_saisonnalite(dates, volumes, dates_futur):
    historique = pd.DataFrame({
        'date': pd.to_datetime(dates),
        'volume': np.asarray(volumes, dtype=float),
    }).sort_values('date')
    moyenne = float(historique['volume'].mean())
    if not math.isfinite(moyenne) or moyenne <= 0:
        moyenne = 1.0
    historique['jour_semaine'] = historique['date'].dt.dayofweek
    historique['mois'] = historique['date'].dt.month
    facteur_semaine = (historique.groupby('jour_semaine')['volume'].mean() / moyenne).to_dict()
    facteur_mois = (historique.groupby('mois')['volume'].mean() / moyenne).to_dict()
    facteur = [
        facteur_semaine.get(jour, 1.0) * facteur_mois.get(mois, 1.0)
        for jour, mois in zip(historique['jour_semaine'], historique['mois'])
    ]
    deseason = historique['volume'].to_numpy(dtype=float) / np.array(facteur, dtype=float)
    if len(historique) >= 2:
        pente, origine = np.polyfit(np.arange(len(historique), dtype=float), deseason, 1)
    else:
        pente, origine = 0.0, moyenne
    previsions = []
    for index, jour in enumerate(pd.to_datetime(dates_futur)):
        niveau = origine + pente * (len(historique) + index)
        valeur = niveau * facteur_semaine.get(int(jour.dayofweek), 1.0) * facteur_mois.get(int(jour.month), 1.0)
        previsions.append(float(valeur))
    return previsions

@app.get("/")
def home():
    return {"message": "Serveur Flash WFM operationnel."}

@app.post("/prevision_plan")
def generer_plan_production(requete: PrevisionRequest):
    print("\n" + "="*40, flush=True)
    print("NOUVELLE DEMANDE DE PREVISION", flush=True)
    print(f"-> Modele demande : '{requete.modele}'", flush=True)
    print(f"-> Horizon demande : '{requete.horizon}'", flush=True)
    journaliser_payload(requete.donnees)

    df = pd.DataFrame(requete.donnees)
    if df.empty or 'date' not in df.columns or 'volume' not in df.columns:
        print(f"-> Colonnes recues : {df.columns.tolist()}", flush=True)
        return {"statut": "erreur", "message": "Fichier invalide : colonnes date et volume absentes."}

    recues = len(df)
    df['date'] = df['date'].map(parser_une_date)
    df['volume'] = df['volume'].map(parser_un_volume)
    invalides = df['date'].isna() | df['volume'].isna()
    if invalides.any():
        print(f"-> Lignes ignorees : {int(invalides.sum())} (date ou volume illisible)", flush=True)
    df = df.loc[~invalides].sort_values('date').reset_index(drop=True)
    if df.empty:
        print("-> Aucune ligne exploitable apres parsing. Repli evite.", flush=True)
        return {
            "statut": "erreur",
            "message": "Aucune date ou volume exploitable. Formats acceptes : jj/mm/aaaa, aaaa-mm-jj, ou numero de serie Excel.",
        }

    print(f"-> Lignes gardees : {len(df)} / {recues}", flush=True)
    print(f"-> Dates : {df['date'].min().date()} -> {df['date'].max().date()}", flush=True)
    print(
        f"-> Volume min/moy/max/ecart : {df['volume'].min():.1f} / {df['volume'].mean():.1f} / "
        f"{df['volume'].max():.1f} / {df['volume'].std(ddof=0):.1f}",
        flush=True,
    )

    est_court_terme = (requete.horizon == 'court_terme')
    nb_steps_jour = 30 if est_court_terme else 365
    date_depart = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    dates_futur = pd.date_range(debut_prevision(est_court_terme, date_depart), periods=nb_steps_jour, freq='D')
    
    modele_propre = str(requete.modele).strip().lower()
    previsions_brutes = []
    nom_modele_final = ""

    try:
        if "holt" in modele_propre:
            print("-> Lancement de l'algorithme : Holt-Winters", flush=True)
            historique = df.set_index('date')['volume'].astype(float).sort_index()
            historique = historique[~historique.index.duplicated(keep='last')].asfreq('D')
            historique = historique.interpolate(limit_direction='both')
            if len(historique) < 2 * SAISON_ANNUELLE:
                raise ValueError("deux cycles de 365 jours necessaires")
            fit = ExponentialSmoothing(
                historique.to_numpy(dtype=float),
                trend='add',
                seasonal='add',
                seasonal_periods=SAISON_ANNUELLE,
                initialization_method="heuristic"
            ).fit()
            dernier = historique.index.max()
            horizon = pd.DatetimeIndex(dates_futur)
            pas = max(0, (horizon.max().normalize() - dernier.normalize()).days)
            ajustees = pd.Series(fit.fittedvalues, index=historique.index)
            if pas:
                suite_index = pd.date_range(dernier + pd.Timedelta(days=1), periods=pas, freq='D')
                suite = pd.Series(fit.forecast(pas), index=suite_index)
                complet = pd.concat([ajustees, suite])
            else:
                complet = ajustees
            complet = complet[~complet.index.duplicated(keep='last')].reindex(horizon)
            complet = complet.interpolate(limit_direction='both')
            previsions_brutes = complet.tolist()
            nom_modele_final = "Holt-Winters"
            
        elif "light" in modele_propre or "lgb" in modele_propre:
            print("-> Lancement de l'algorithme : LightGBM Boosté", flush=True)
            
            df['jour_semaine'] = df['date'].dt.dayofweek
            df['mois'] = df['date'].dt.month
            moyenne_globale = df['volume'].mean()
            
            facteur_semaine = (df.groupby('jour_semaine')['volume'].mean() / moyenne_globale).to_dict()
            facteur_mois = (df.groupby('mois')['volume'].mean() / moyenne_globale).to_dict()
            
            X = features_temporelles(df['date'])
            y = df['volume']
            print(f"-> Features NaN : {int(X[FEATURES_TEMPORELLES].isna().sum().sum())}", flush=True)
            
            model = lgb.LGBMRegressor(n_estimators=100, learning_rate=0.05, verbose=-1)
            model.fit(X[FEATURES_TEMPORELLES], y, categorical_feature=['month_tier'])
            
            X_futur = features_temporelles(dates_futur)
            preds_brutes = model.predict(X_futur[FEATURES_TEMPORELLES])
            
            previsions_brutes = []
            for i, jour in enumerate(dates_futur):
                val_base = preds_brutes[i]
                coef_s = facteur_semaine.get(int(jour.dayofweek), 1.0)
                coef_m = facteur_mois.get(int(jour.month), 1.0)
                previsions_brutes.append(val_base * 0.5 + (moyenne_globale * coef_s * coef_m) * 0.5)
                
            nom_modele_final = "LightGBM"
            
        else: 
            print("-> Modele Moyenne Saisonnière intra-semaine", flush=True)
            df['jour_semaine'] = df['date'].dt.dayofweek
            moyennes_jours = df.groupby('jour_semaine')['volume'].mean().to_dict()
            moyenne_globale = df['volume'].mean()
            
            previsions_brutes = []
            for jour in dates_futur:
                val = moyennes_jours.get(jour.dayofweek, moyenne_globale)
                previsions_brutes.append(val)
                
            nom_modele_final = "Moyenne Saisonnière"

    except Exception as e:
        if "holt" in modele_propre:
            print(f"-> Holt-Winters repli double saisonnalite ({e})", flush=True)
            previsions_brutes = prevoir_double_saisonnalite(df['date'], df['volume'], dates_futur)
            nom_modele_final = "Holt-Winters"
        else:
            print(f"\n[ERREUR CRITIQUE] {e}\n", flush=True)
            moyenne = df['volume'].mean()
            previsions_brutes = [moyenne] * nb_steps_jour
            nom_modele_final = "Moyenne (suite à un plantage)"

    moyenne_volume = float(df['volume'].mean()) if len(df) else 1.0
    non_finis = 0
    previsions_propres = []
    for vol in previsions_brutes:
        try:
            valeur = float(vol)
        except (TypeError, ValueError):
            valeur = moyenne_volume
        if not math.isfinite(valeur):
            non_finis += 1
            valeur = moyenne_volume
        previsions_propres.append(valeur)
    previsions_brutes = previsions_propres
    ecart = float(np.std(previsions_brutes)) if previsions_brutes else 0.0
    print(f"-> Previsions non finies remplacees par la moyenne : {non_finis}", flush=True)
    print(f"-> Ecart-type des previsions : {ecart:.2f}", flush=True)
    if ecart < 1e-6:
        print("-> Prevision plate : l'historique ne distingue pas les periodes, pas un repli NaN.", flush=True)

    plan_production = []
    calculer_etp = (
        calculer_etp_ticketing
        if requete.parametres_erlang.type_flux == "froid"
        else calculer_etp_pour_volume
    )
    if est_court_terme:
        date_courante = dates_futur[0].to_pydatetime()
        for vol in previsions_brutes:
            vol_propre = max(1, int(vol))
            etp_requis = calculer_etp(vol_propre, requete.parametres_erlang)
            plan_production.append({
                "date": date_courante.strftime("%d/%m/%Y"),
                "volume_prevu": vol_propre,
                "etp_moyen_requis": etp_requis,
            })
            date_courante += timedelta(days=1)
    else:
        date_courante = dates_futur[0].to_pydatetime()
        for i in range(12):
            debut = i * 30
            fin = (i + 1) * 30
            vol_mensuel = sum(previsions_brutes[debut:fin])
            vol_mensuel_propre = max(1, int(vol_mensuel))
            vol_journalier_moyen = vol_mensuel_propre / 30.0
            etp_requis = calculer_etp(vol_journalier_moyen, requete.parametres_erlang)
            mois = date_courante.month
            annee = date_courante.year
            plan_production.append({
                "date": f"{mois:02d}/{annee}",
                "volume_prevu": vol_mensuel_propre,
                "etp_moyen_requis": etp_requis,
            })
            mois_suivant = mois % 12 + 1
            annee_suivante = annee + (mois // 12)
            date_courante = date_courante.replace(year=annee_suivante, month=mois_suivant)

    print("-> CALCUL TERMINE AVEC SUCCES", flush=True)
    print("=" * 40 + "\n", flush=True)
    return {
        "statut": "succès",
        "message": f"Plan genere avec {nom_modele_final}",
        "plan": plan_production,
    }