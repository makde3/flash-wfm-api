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

SAISON_ANNUELLE = 365
FEATURES_TEMPORELLES = [
    'mois', 'jour_du_mois', 'month_tier', 'dist_15', 'dist_19',
    'semaine_annee', 'semaine_de_l_annee', 'jour_semaine'
]

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
    
    df = pd.DataFrame(requete.donnees)
    
    if df.shape[1] < 3:
        return {"statut": "erreur", "message": "Fichier invalide."}
    
    colonnes_origine = df.columns.tolist()
    df = df.rename(columns={
        colonnes_origine[0]: 'date', 
        colonnes_origine[1]: 'file', 
        colonnes_origine[2]: 'volume'
    })
    
    df['date'] = pd.to_datetime(df['date'], format='%d/%m/%Y', errors='coerce')
    df['volume'] = pd.to_numeric(df['volume'], errors='coerce')
    df = df.dropna(subset=['date', 'volume'])
    df = df.sort_values('date').reset_index(drop=True)

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
    previsions_brutes = [
        float(vol) if vol is not None and math.isfinite(float(vol)) else moyenne_volume
        for vol in previsions_brutes
    ]

    plan_production = []
    if est_court_terme:
        date_courante = dates_futur[0].to_pydatetime()
        for vol in previsions_brutes:
            vol_propre = max(1, int(vol))
            etp_requis = calculer_etp_pour_volume(vol_propre, requete.parametres_erlang)
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
            etp_requis = calculer_etp_pour_volume(vol_journalier_moyen, requete.parametres_erlang)
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