import io
import math
import os
import re
import sys
import uuid
from urllib.parse import parse_qsl, unquote, urlencode, urlparse, urlunparse

import httpx
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import jwt
import lightgbm as lgb
import stripe
from supabase import create_client

def charger_env_local() -> None:
    chemin = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.isfile(chemin):
        return
    with open(chemin, encoding="utf-8") as fichier:
        for ligne in fichier:
            ligne = ligne.strip()
            if not ligne or ligne.startswith("#") or "=" not in ligne:
                continue
            cle, _, valeur = ligne.partition("=")
            cle = cle.strip()
            valeur = valeur.strip().strip('"').strip("'")
            if cle and cle not in os.environ:
                os.environ[cle] = valeur

charger_env_local()

MAX_CORPS_OCTETS = 5 * 1024 * 1024
MAX_LIGNES_HISTORIQUE = 5000

class PayloadTropGrand(Exception):
    pass

class LimiteCorpsMiddleware:
    def __init__(self, app, max_octets: int = MAX_CORPS_OCTETS):
        self.app = app
        self.max_octets = max_octets

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        en_tetes = {cle.lower(): valeur for cle, valeur in scope.get("headers", [])}
        longueur = en_tetes.get(b"content-length")
        if longueur:
            try:
                if int(longueur) > self.max_octets:
                    reponse = JSONResponse(
                        status_code=413,
                        content={"detail": "Corps de requête trop volumineux (5 Mo max)."},
                    )
                    await reponse(scope, receive, send)
                    return
            except ValueError:
                pass

        recu = 0

        async def receive_limite():
            nonlocal recu
            message = await receive()
            if message["type"] == "http.request":
                recu += len(message.get("body", b""))
                if recu > self.max_octets:
                    raise PayloadTropGrand()
            return message

        await self.app(scope, receive_limite, send)

app = FastAPI()

@app.exception_handler(PayloadTropGrand)
async def corps_trop_grand(request: Request, exc: PayloadTropGrand):
    return JSONResponse(
        status_code=413,
        content={"detail": "Corps de requête trop volumineux (5 Mo max)."},
    )

app.add_middleware(LimiteCorpsMiddleware, max_octets=MAX_CORPS_OCTETS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://flash-wfm.vercel.app", "http://localhost:5173", "http://localhost:3000", "http://localhost:8081", "http://127.0.0.1:8081"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ESSAI_JOURS = 3
_clients_jwks: Dict[str, jwt.PyJWKClient] = {}
_client_service = None

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
    if req.aht <= 0 or req.heures_ouverture <= 0 or req.shrinkage >= 100:
        return 1

    sla_cible = 99.9 if req.sla_cible >= 100 else req.sla_cible
    volume_horaire_estime = volume / req.heures_ouverture
    traffic = (volume_horaire_estime * req.aht) / 3600.0

    for agents in range(1, 1001):
        pw = calcul_erlang_c(agents, traffic)
        sla_calcule = 1 - pw * math.exp(-(agents - traffic) * (req.temps_cible / req.aht))
        if sla_calcule >= (sla_cible / 100.0):
            return math.ceil(agents / (1 - (req.shrinkage / 100.0)))

    return 1000

def calculer_etp_ticketing(volume, req: ErlangRequest, inclure_backlog: bool = False):
    aht_heures = req.aht / 3600.0
    backlog = req.backlog if inclure_backlog else 0
    charge_heures = (volume + backlog) * aht_heures

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

def volume_retenu(valeur):
    if valeur <= 0:
        return 0
    return int(valeur)

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

def modele_avance(modele: str) -> bool:
    nom = modele.strip().lower()
    return "holt" in nom or "light" in nom or "lgb" in nom

def essai_expire(created_at) -> bool:
    if not created_at:
        return True
    try:
        debut = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    except ValueError:
        return True
    if debut.tzinfo is None:
        debut = debut.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) >= debut + timedelta(days=ESSAI_JOURS)

def url_projet_supabase() -> str:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    for suffixe in ("/auth/v1", "/rest/v1"):
        if url.endswith(suffixe):
            url = url[: -len(suffixe)]
    return url

def _decoder_jwt(token: str, cle, algorithmes):
    arguments = {
        "algorithms": algorithmes,
        "options": {"require": ["exp", "sub"], "verify_aud": False},
        "leeway": 30,
    }
    url = url_projet_supabase()
    if url:
        arguments["issuer"] = f"{url}/auth/v1"
    return jwt.decode(token, cle, **arguments)

def _raison_echec_jwt(exc: BaseException) -> str:
    if isinstance(exc, jwt.InvalidSignatureError):
        return "signature invalide"
    return f"{exc.__class__.__name__}: {exc}"

def identite_depuis_authorization(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        print("-> JWT refuse : token manquant", flush=True)
        raise HTTPException(status_code=401, detail="Token absent ou invalide.")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        print("-> JWT refuse : token manquant", flush=True)
        raise HTTPException(status_code=401, detail="Token absent ou invalide.")

    secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    url = url_projet_supabase()
    try:
        algorithme = jwt.get_unverified_header(token).get("alg")
    except jwt.PyJWTError:
        print("-> JWT refuse : token illisible", flush=True)
        raise HTTPException(status_code=401, detail="Token absent ou invalide.")
    try:
        if algorithme == "HS256":
            if not secret:
                print("-> JWT refuse : secret introuvable", flush=True)
                raise HTTPException(status_code=401, detail="Token absent ou invalide.")
            payload = _decoder_jwt(token, secret, ["HS256"])
        elif algorithme in {"RS256", "ES256"}:
            if not url:
                print("-> JWT refuse : URL Supabase absente", flush=True)
                raise HTTPException(status_code=401, detail="Token absent ou invalide.")
            if url not in _clients_jwks:
                _clients_jwks[url] = jwt.PyJWKClient(f"{url}/auth/v1/.well-known/jwks.json")
            cle = _clients_jwks[url].get_signing_key_from_jwt(token)
            payload = _decoder_jwt(token, cle.key, ["RS256", "ES256"])
        else:
            print("-> JWT refuse : algorithme non autorise", flush=True)
            raise HTTPException(status_code=401, detail="Token absent ou invalide.")
    except HTTPException:
        raise
    except jwt.PyJWTError as exc:
        print(f"-> JWT refuse : {_raison_echec_jwt(exc)}", flush=True)
        raise HTTPException(status_code=401, detail="Token absent ou invalide.")
    except Exception as exc:
        print(f"-> JWT refuse : {_raison_echec_jwt(exc)}", flush=True)
        raise HTTPException(status_code=401, detail="Token absent ou invalide.")
    if payload.get("role") == "authenticated" and payload.get("sub"):
        return str(payload["sub"])
    print("-> JWT refuse : token invalide", flush=True)
    raise HTTPException(status_code=401, detail="Token absent ou invalide.")

def client_service():
    global _client_service
    url = url_projet_supabase()
    cle = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not cle:
        raise HTTPException(status_code=503, detail="Vérification des droits indisponible.")
    if _client_service is None:
        _client_service = create_client(url, cle)
    return _client_service

def lire_profil(user_id: str) -> dict:
    try:
        reponse = (
            client_service().table("profiles")
            .select("created_at")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except HTTPException:
        raise
    except Exception:
        print("-> Lecture du profil impossible", flush=True)
        raise HTTPException(status_code=403, detail="Droits utilisateur introuvables.")
    lignes = reponse.data or []
    if not lignes:
        raise HTTPException(status_code=403, detail="Droits utilisateur introuvables.")
    return lignes[0]

def periode_encore_valide(valeur) -> bool:
    if not valeur:
        return False
    try:
        fin = datetime.fromisoformat(str(valeur).replace("Z", "+00:00"))
    except ValueError:
        return False
    if fin.tzinfo is None:
        fin = fin.replace(tzinfo=timezone.utc)
    return fin > datetime.now(timezone.utc)

def abonnement_pro_actif(user_id: str) -> bool:
    try:
        reponse = (
            client_service().table("subscriptions")
            .select("status, current_period_end")
            .eq("user_id", user_id)
            .execute()
        )
    except HTTPException:
        raise
    except Exception:
        print("-> Lecture de l'abonnement impossible", flush=True)
        raise HTTPException(status_code=403, detail="Droits utilisateur introuvables.")
    for ligne in reponse.data or []:
        if str(ligne.get("status") or "") in {"active", "trialing"} and periode_encore_valide(ligne.get("current_period_end")):
            return True
    return False

def erreur_memoire(exc: BaseException) -> bool:
    if isinstance(exc, MemoryError):
        return True
    texte = str(exc).lower()
    return any(indice in texte for indice in ("out of memory", "memoryerror", "bad_alloc", "cannot allocate", "oom"))

def lever_si_memoire(exc: BaseException) -> None:
    if not erreur_memoire(exc):
        return
    print("-> Entrainement interrompu : memoire insuffisante", flush=True)
    raise HTTPException(status_code=500, detail="Mémoire insuffisante pour entraîner ce modèle.") from exc

def entrainer_holt(df, dates_futur):
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
    return complet.tolist(), "Holt-Winters"

def entrainer_lightgbm(df, dates_futur):
    df = df.copy()
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
    previsions = []
    for i, jour in enumerate(dates_futur):
        val_base = preds_brutes[i]
        coef_s = facteur_semaine.get(int(jour.dayofweek), 1.0)
        coef_m = facteur_mois.get(int(jour.month), 1.0)
        previsions.append(val_base * 0.5 + (moyenne_globale * coef_s * coef_m) * 0.5)
    return previsions, "LightGBM"

def verifier_droit_modele(modele: str, profil: dict, pro_actif: bool) -> None:
    # Contournement temporaire : modèles et essai ouverts pour toutes les sessions.
    return
    if pro_actif:
        return
    if modele_avance(modele):
        raise HTTPException(status_code=403, detail="Ce modèle nécessite un abonnement Pro.")
    if essai_expire(profil.get("created_at")):
        raise HTTPException(status_code=403, detail="L'essai gratuit est expiré.")

def verifier_signature_stripe(corps: bytes, signature: str | None) -> dict:
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    if not secret:
        print("-> Secret de webhook Stripe absent", flush=True)
        raise HTTPException(status_code=503, detail="Vérification du webhook indisponible.")
    if not signature:
        raise HTTPException(status_code=400, detail="Signature Stripe invalide.")
    try:
        evenement = stripe.Webhook.construct_event(corps, signature, secret)
    except (stripe.SignatureVerificationError, ValueError):
        raise HTTPException(status_code=400, detail="Signature Stripe invalide.")
    if hasattr(evenement, "to_dict"):
        return evenement.to_dict()
    return evenement

def fin_periode_stripe(abonnement: dict):
    periode = abonnement.get("current_period_end")
    if periode is None:
        items = ((abonnement.get("items") or {}).get("data") or [])
        if items:
            periode = items[0].get("current_period_end")
    if periode is None:
        return None
    return datetime.fromtimestamp(int(periode), tz=timezone.utc).isoformat()

def utilisateur_abonnement(abonnement: dict) -> str | None:
    meta = abonnement.get("metadata") or {}
    candidat = meta.get("user_id") or meta.get("supabase_user_id")
    if not candidat:
        return None
    try:
        return str(uuid.UUID(str(candidat)))
    except (ValueError, TypeError, AttributeError):
        return None

def enregistrer_abonnement(abonnement: dict, supprime: bool) -> None:
    identifiant = abonnement.get("id")
    if not identifiant:
        raise HTTPException(status_code=400, detail="Abonnement Stripe incomplet.")
    statut = "canceled" if supprime else (abonnement.get("status") or "canceled")
    champs = {
        "stripe_customer_id": abonnement.get("customer"),
        "stripe_subscription_id": identifiant,
        "status": statut,
        "current_period_end": fin_periode_stripe(abonnement),
    }
    user_id = utilisateur_abonnement(abonnement)
    client = client_service()
    try:
        if user_id:
            champs["user_id"] = user_id
            client.table("subscriptions").upsert(champs, on_conflict="stripe_subscription_id").execute()
            return
        existant = (
            client.table("subscriptions")
            .select("id")
            .eq("stripe_subscription_id", identifiant)
            .limit(1)
            .execute()
        )
        if not existant.data:
            raise HTTPException(status_code=400, detail="Abonnement Stripe sans utilisateur associé.")
        client.table("subscriptions").update({
            "stripe_customer_id": champs["stripe_customer_id"],
            "status": champs["status"],
            "current_period_end": champs["current_period_end"],
        }).eq("stripe_subscription_id", identifiant).execute()
    except HTTPException:
        raise
    except Exception:
        print("-> Ecriture de l'abonnement impossible", flush=True)
        raise HTTPException(status_code=500, detail="Enregistrement de l'abonnement impossible.")

def abonnement_depuis_session_checkout(session: dict) -> None:
    if session.get("mode") != "subscription":
        return
    abonnement_id = session.get("subscription")
    if isinstance(abonnement_id, dict):
        abonnement = dict(abonnement_id)
    elif abonnement_id:
        recupere = stripe.Subscription.retrieve(str(abonnement_id))
        abonnement = recupere.to_dict() if hasattr(recupere, "to_dict") else dict(recupere)
    else:
        raise HTTPException(status_code=400, detail="Session Checkout sans abonnement.")
    if not utilisateur_abonnement(abonnement):
        candidat = session.get("client_reference_id") or (session.get("metadata") or {}).get("user_id")
        try:
            user_id = str(uuid.UUID(str(candidat))) if candidat else None
        except (ValueError, TypeError, AttributeError):
            user_id = None
        if user_id:
            meta = dict(abonnement.get("metadata") or {})
            meta["user_id"] = user_id
            abonnement["metadata"] = meta
    if not abonnement.get("customer") and session.get("customer"):
        abonnement["customer"] = session.get("customer")
    enregistrer_abonnement(abonnement, supprime=False)

@app.get("/")
def home():
    return {"message": "Serveur Flash WFM operationnel."}

@app.post("/webhook/stripe")
async def webhook_stripe(request: Request):
    corps = await request.body()
    evenement = verifier_signature_stripe(corps, request.headers.get("stripe-signature"))
    type_evenement = evenement.get("type")
    if type_evenement == "checkout.session.completed":
        cle = os.getenv("STRIPE_SECRET_KEY", "").strip()
        if not cle:
            print("-> Configuration Stripe incomplete", flush=True)
            raise HTTPException(status_code=503, detail="Paiement indisponible.")
        stripe.api_key = cle
        try:
            abonnement_depuis_session_checkout(evenement["data"]["object"])
        except stripe.StripeError:
            print("-> Lecture de l'abonnement Stripe impossible", flush=True)
            raise HTTPException(status_code=500, detail="Enregistrement de l'abonnement impossible.")
        print(f"-> Abonnement Stripe enregistre : {type_evenement}", flush=True)
    elif type_evenement in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        enregistrer_abonnement(
            evenement["data"]["object"],
            supprime=type_evenement == "customer.subscription.deleted",
        )
        print(f"-> Abonnement Stripe enregistre : {type_evenement}", flush=True)
    return {"recu": True}

@app.post("/create-checkout-session")
def creer_session_checkout(authorization: str | None = Header(default=None)):
    user_id = identite_depuis_authorization(authorization)
    cle = os.getenv("STRIPE_SECRET_KEY", "").strip()
    prix = os.getenv("STRIPE_PRICE_ID", "").strip()
    front = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if not cle or not prix or not front.startswith(("http://", "https://")):
        print("-> Configuration Stripe incomplete", flush=True)
        raise HTTPException(status_code=503, detail="Paiement indisponible.")
    stripe.api_key = cle
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": prix, "quantity": 1}],
            success_url=f"{front}/?success=true",
            cancel_url=f"{front}/?canceled=true",
            client_reference_id=user_id,
            metadata={"user_id": user_id},
            subscription_data={"metadata": {"user_id": user_id}},
        )
    except stripe.StripeError:
        print("-> Creation de la session Stripe impossible", flush=True)
        raise HTTPException(status_code=500, detail="Session de paiement indisponible.")
    url = getattr(session, "url", None)
    if not url and hasattr(session, "to_dict"):
        url = session.to_dict().get("url")
    if not url:
        raise HTTPException(status_code=500, detail="Session de paiement indisponible.")
    return {"url": url}

def customer_id_enregistre(user_id: str) -> str | None:
    try:
        reponse = (
            client_service().table("subscriptions")
            .select("stripe_customer_id, status")
            .eq("user_id", user_id)
            .execute()
        )
    except HTTPException:
        raise
    except Exception:
        print("-> Lecture de l'abonnement impossible", flush=True)
        raise HTTPException(status_code=403, detail="Droits utilisateur introuvables.")
    lignes = reponse.data or []
    for ligne in lignes:
        if str(ligne.get("status") or "") == "active" and ligne.get("stripe_customer_id"):
            return str(ligne["stripe_customer_id"])
    for ligne in lignes:
        if ligne.get("stripe_customer_id"):
            return str(ligne["stripe_customer_id"])
    return None

def customer_id_par_email(user_id: str) -> str | None:
    try:
        reponse = (
            client_service().table("profiles")
            .select("email")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except HTTPException:
        raise
    except Exception:
        print("-> Lecture de l'email impossible", flush=True)
        return None
    lignes = reponse.data or []
    email = str((lignes[0].get("email") if lignes else "") or "").strip()
    if not email:
        return None
    trouves = stripe.Customer.list(email=email, limit=1)
    clients = getattr(trouves, "data", None)
    if clients is None and hasattr(trouves, "to_dict"):
        clients = trouves.to_dict().get("data") or []
    if not clients:
        return None
    premier = clients[0]
    identifiant = getattr(premier, "id", None)
    if not identifiant and isinstance(premier, dict):
        identifiant = premier.get("id")
    return str(identifiant) if identifiant else None

@app.post("/create-portal-session")
def creer_session_portail(authorization: str | None = Header(default=None)):
    user_id = identite_depuis_authorization(authorization)
    cle = os.getenv("STRIPE_SECRET_KEY", "").strip()
    front = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if not cle or not front.startswith(("http://", "https://")):
        print("-> Configuration Stripe incomplete", flush=True)
        raise HTTPException(status_code=503, detail="Paiement indisponible.")
    stripe.api_key = cle
    customer_id = customer_id_enregistre(user_id)
    if not customer_id:
        try:
            customer_id = customer_id_par_email(user_id)
        except stripe.StripeError:
            print("-> Recherche du client Stripe impossible", flush=True)
            customer_id = None
    if not customer_id:
        raise HTTPException(status_code=404, detail="Aucun abonnement à gérer.")
    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=front,
        )
    except stripe.StripeError:
        print("-> Creation du portail Stripe impossible", flush=True)
        raise HTTPException(status_code=500, detail="Portail de gestion indisponible.")
    url = getattr(session, "url", None)
    if not url and hasattr(session, "to_dict"):
        url = session.to_dict().get("url")
    if not url:
        raise HTTPException(status_code=500, detail="Portail de gestion indisponible.")
    return {"url": url}

MESSAGE_LIEN_PRIVE = "Le lien n'est pas accessible en lecture publique."
MESSAGE_DOCUMENT_PRIVE = "Le document n'est pas accessible en lecture publique."
MESSAGE_FORMAT = "Format invalide. Le fichier doit être un CSV ou un classeur Excel (.xlsx)."
_ID_CLASSIQUE = re.compile(r"/spreadsheets(?:/u/\d+)?/d/([^/]+)")
_ID_PUBLIE = re.compile(r"(/spreadsheets(?:/u/\d+)?/d/e/[^/]+)", re.IGNORECASE)

def hote_office(hote: str) -> bool:
    nom = (hote or "").lower().rstrip(".")
    if nom in {"onedrive.live.com", "1drv.ms", "sharepoint.com"}:
        return True
    return nom.endswith(".sharepoint.com") or nom.endswith(".onedrive.live.com") or nom.endswith(".office.com") or nom.endswith(".office365.com")

def hote_telechargement_autorise(hote: str) -> bool:
    nom = (hote or "").lower().rstrip(".")
    if nom == "docs.google.com" or nom == "googleusercontent.com" or nom.endswith(".googleusercontent.com"):
        return True
    return hote_office(nom)

def verifier_url_https(url: str) -> None:
    analyse = urlparse(url)
    if analyse.scheme != "https" or analyse.username or analyse.password or analyse.port not in (None, 443):
        raise HTTPException(status_code=400, detail=MESSAGE_LIEN_PRIVE)
    if not hote_telechargement_autorise(analyse.hostname or ""):
        raise HTTPException(status_code=400, detail=MESSAGE_LIEN_PRIVE)

def lien_google_publie(url: str) -> bool:
    chemin = urlparse(url).path
    return "/d/e/" in chemin or "/pub" in chemin

def sortie_deja_precisee(url: str) -> bool:
    return re.search(r"(?:^|&)output=", urlparse(url).query, re.IGNORECASE) is not None

def normaliser_google_publie(url: str) -> str:
    if sortie_deja_precisee(url):
        return url
    parties = urlparse(url)
    trouve = _ID_PUBLIE.search(parties.path)
    if trouve:
        base = parties.path[: trouve.end()].rstrip("/")
    else:
        base = re.split(r"/pub", parties.path, maxsplit=1, flags=re.IGNORECASE)[0].rstrip("/")
    return urlunparse((parties.scheme, parties.netloc, f"{base}/pub", "", "output=csv", ""))

def normaliser_google_classique(url: str) -> str:
    trouve = _ID_CLASSIQUE.search(urlparse(url).path)
    if not trouve:
        raise HTTPException(status_code=400, detail="Lien Google Sheets invalide.")
    sheet_id = unquote(trouve.group(1)).strip()
    if not sheet_id or "/" in sheet_id:
        raise HTTPException(status_code=400, detail="Lien Google Sheets invalide.")
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"

def forcer_telechargement_office(url: str) -> str:
    parties = urlparse(url)
    paires = [(cle, valeur) for cle, valeur in parse_qsl(parties.query, keep_blank_values=True) if cle.lower() != "download"]
    paires.append(("download", "1"))
    return urlunparse(parties._replace(query=urlencode(paires)))

def url_import_publique(url: str) -> str:
    texte = (url or "").strip()
    if not texte:
        raise HTTPException(status_code=400, detail="Fournissez un fichier ou une URL.")
    verifier_url_https(texte)
    hote = (urlparse(texte).hostname or "").lower()
    if hote == "docs.google.com" and "/spreadsheets" in urlparse(texte).path:
        if lien_google_publie(texte):
            return normaliser_google_publie(texte)
        return normaliser_google_classique(texte)
    if not hote_office(hote):
        raise HTTPException(status_code=400, detail=MESSAGE_LIEN_PRIVE)
    return forcer_telechargement_office(texte)

def contenu_html(contenu: bytes, type_contenu: str) -> bool:
    type_bas = (type_contenu or "").lower()
    if "text/html" in type_bas or "application/xhtml" in type_bas:
        return True
    apercu = contenu.lstrip(b"\xef\xbb\xbf \t\r\n")
    if apercu[:32].lower().startswith((b"<!doctype html", b"<html")):
        return True
    extrait = apercu[:8192].lower()
    return b"<!doctype html" in extrait or b"<html" in extrait or b"<head" in extrait or b"<body" in extrait

def telecharger_tableur(url: str) -> tuple[bytes, str]:
    verifier_url_https(url)
    try:
        with httpx.Client(timeout=httpx.Timeout(20.0), follow_redirects=True, max_redirects=10) as client:
            reponse = client.get(url, headers={"Accept": "text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*"})
    except HTTPException:
        raise
    except httpx.HTTPError:
        raise HTTPException(status_code=400, detail=MESSAGE_LIEN_PRIVE)
    if reponse.status_code >= 400:
        raise HTTPException(status_code=400, detail=MESSAGE_LIEN_PRIVE)
    contenu = reponse.content
    if not contenu or len(contenu) > MAX_CORPS_OCTETS:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (5 Mo max).")
    type_contenu = reponse.headers.get("content-type", "")
    if contenu_html(contenu, type_contenu):
        raise HTTPException(status_code=400, detail=MESSAGE_DOCUMENT_PRIVE)
    return contenu, type_contenu

def valeur_json(valeur: Any) -> Any:
    if valeur is None:
        return None
    if isinstance(valeur, (pd.Timestamp, datetime)):
        if pd.isna(valeur):
            return None
        return valeur.strftime("%Y-%m-%d")
    if isinstance(valeur, np.integer):
        return int(valeur)
    if isinstance(valeur, (float, np.floating)):
        nombre = float(valeur)
        if not math.isfinite(nombre):
            return None
        return nombre
    if isinstance(valeur, np.bool_):
        return bool(valeur)
    return valeur

def lire_tableau(contenu: bytes, nom: str, type_contenu: str) -> pd.DataFrame:
    nom_bas = (nom or "").lower()
    type_bas = (type_contenu or "").lower()
    est_csv = nom_bas.endswith(".csv") or "text/csv" in type_bas or type_bas.startswith("text/plain")
    est_classeur = not est_csv and (nom_bas.endswith((".xlsx", ".xlsm", ".xls")) or "spreadsheet" in type_bas or "excel" in type_bas or contenu[:2] == b"PK")
    if est_classeur:
        return pd.read_excel(io.BytesIO(contenu), engine="openpyxl")
    cadre = pd.read_csv(io.BytesIO(contenu), sep=None, engine="python", encoding="utf-8-sig")
    if cadre.shape[1] == 1:
        entete = contenu.decode("utf-8-sig", errors="replace").splitlines()[0] if contenu else ""
        if ";" in entete:
            cadre = pd.read_csv(io.BytesIO(contenu), sep=";", encoding="utf-8-sig")
        elif "\t" in entete:
            cadre = pd.read_csv(io.BytesIO(contenu), sep="\t", encoding="utf-8-sig")
    return cadre

def lignes_depuis_octets(contenu: bytes, nom: str, type_contenu: str) -> list[dict]:
    try:
        cadre = lire_tableau(contenu, nom, type_contenu)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail=MESSAGE_FORMAT)
    cadre = cadre.dropna(how="all")
    if cadre.empty or len(cadre.columns) == 0:
        raise HTTPException(status_code=400, detail=MESSAGE_FORMAT)
    if len(cadre) > MAX_LIGNES_HISTORIQUE:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (5 000 lignes max)")
    cadre.columns = [str(colonne).strip() for colonne in cadre.columns]
    lignes = []
    for brut in cadre.to_dict(orient="records"):
        lignes.append({cle: valeur_json(valeur) for cle, valeur in brut.items()})
    if not lignes:
        raise HTTPException(status_code=400, detail=MESSAGE_FORMAT)
    return lignes

@app.post("/import")
async def importer_source(request: Request, authorization: str | None = Header(default=None)):
    identite_depuis_authorization(authorization)
    type_requete = request.headers.get("content-type", "")
    url = ""
    contenu = b""
    nom = ""
    type_fichier = ""
    if "application/json" in type_requete:
        try:
            corps = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Fournissez un fichier ou une URL.")
        if not isinstance(corps, dict):
            raise HTTPException(status_code=400, detail="Fournissez un fichier ou une URL.")
        url = str(corps.get("url") or "").strip()
    else:
        try:
            formulaire = await request.form()
        except Exception:
            raise HTTPException(status_code=400, detail="Fournissez un fichier ou une URL.")
        url = str(formulaire.get("url") or "").strip()
        televerse = formulaire.get("fichier")
        if televerse is None:
            televerse = formulaire.get("file")
        if televerse is not None and hasattr(televerse, "read"):
            nom = str(getattr(televerse, "filename", "") or "")
            type_fichier = str(getattr(televerse, "content_type", "") or "")
            contenu = await televerse.read()
    if url and contenu:
        raise HTTPException(status_code=400, detail="Fournissez un fichier ou une URL, pas les deux.")
    if not url and not contenu:
        raise HTTPException(status_code=400, detail="Fournissez un fichier ou une URL.")
    if url:
        cible = url_import_publique(url)
        contenu, type_fichier = telecharger_tableur(cible)
        nom = "import.csv" if ("format=csv" in cible or "output=csv" in cible) else "import.xlsx"
    elif len(contenu) > MAX_CORPS_OCTETS:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (5 Mo max).")
    lignes = lignes_depuis_octets(contenu, nom, type_fichier)
    return {"lignes": lignes, "nombre": len(lignes)}

@app.post("/prevision_plan")
def generer_plan_production(requete: PrevisionRequest, authorization: str | None = Header(default=None)):
    if len(requete.donnees) > MAX_LIGNES_HISTORIQUE:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (5 000 lignes max)")
    user_id = identite_depuis_authorization(authorization)
    profil = lire_profil(user_id)
    verifier_droit_modele(requete.modele, profil, abonnement_pro_actif(user_id))

    df = pd.DataFrame(requete.donnees)
    if df.empty or 'date' not in df.columns or 'volume' not in df.columns:
        return {"statut": "erreur", "message": "Fichier invalide : colonnes date et volume absentes."}

    df['date'] = df['date'].map(parser_une_date)
    df['volume'] = df['volume'].map(parser_un_volume)
    invalides = df['date'].isna() | df['volume'].isna()
    df = df.loc[~invalides].sort_values('date').reset_index(drop=True)
    if df.empty:
        return {
            "statut": "erreur",
            "message": "Aucune date ou volume exploitable. Formats acceptes : jj/mm/aaaa, aaaa-mm-jj, ou numero de serie Excel.",
        }

    est_court_terme = (requete.horizon == 'court_terme')
    nb_steps_jour = 30 if est_court_terme else 365
    date_depart = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    dates_futur = pd.date_range(debut_prevision(est_court_terme, date_depart), periods=nb_steps_jour, freq='D')
    
    modele_propre = str(requete.modele).strip().lower()
    previsions_brutes = []
    nom_modele_final = ""

    try:
        if "holt" in modele_propre:
            try:
                previsions_brutes, nom_modele_final = entrainer_holt(df, dates_futur)
            except MemoryError as exc:
                lever_si_memoire(exc)
            except Exception as exc:
                lever_si_memoire(exc)
                raise
        elif "light" in modele_propre or "lgb" in modele_propre:
            try:
                previsions_brutes, nom_modele_final = entrainer_lightgbm(df, dates_futur)
            except MemoryError as exc:
                lever_si_memoire(exc)
            except Exception as exc:
                lever_si_memoire(exc)
                raise
        else:
            df['jour_semaine'] = df['date'].dt.dayofweek
            moyennes_jours = df.groupby('jour_semaine')['volume'].mean().to_dict()
            moyenne_globale = df['volume'].mean()

            previsions_brutes = []
            for jour in dates_futur:
                val = moyennes_jours.get(jour.dayofweek, moyenne_globale)
                previsions_brutes.append(val)

            nom_modele_final = "Moyenne Saisonnière"

    except HTTPException:
        raise
    except MemoryError as exc:
        lever_si_memoire(exc)
    except Exception as e:
        lever_si_memoire(e)
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
    previsions_propres = []
    for vol in previsions_brutes:
        try:
            valeur = float(vol)
        except (TypeError, ValueError):
            valeur = moyenne_volume
        if not math.isfinite(valeur):
            valeur = moyenne_volume
        previsions_propres.append(valeur)
    previsions_brutes = previsions_propres

    plan_production = []
    flux_froid = requete.parametres_erlang.type_flux == "froid"

    def etp_requis_pour(volume, inclure_backlog):
        if flux_froid:
            return calculer_etp_ticketing(volume, requete.parametres_erlang, inclure_backlog=inclure_backlog)
        return calculer_etp_pour_volume(volume, requete.parametres_erlang)

    if est_court_terme:
        date_courante = dates_futur[0].to_pydatetime()
        for index, vol in enumerate(previsions_brutes):
            vol_propre = volume_retenu(vol)
            etp_requis = etp_requis_pour(vol_propre, inclure_backlog=index == 0)
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
            vol_mensuel_propre = volume_retenu(vol_mensuel)
            vol_journalier_moyen = vol_mensuel_propre / 30.0
            etp_requis = etp_requis_pour(vol_journalier_moyen, inclure_backlog=i == 0)
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

    return {
        "statut": "succès",
        "message": f"Plan genere avec {nom_modele_final}",
        "plan": plan_production,
    }