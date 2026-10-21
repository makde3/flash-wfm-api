# Audit technique — Flash WFM

Date : 21 octobre 2026. Périmètre : `backend/main.py`, `flash-wfm/src` (écran principal, auth, graphique), migrations Supabase, config Render / Vercel.

Le produit tient debout comme prototype de prévision + staffing. Il n’est pas prêt à encaisser un paiement. Le plan Pro est une case que le navigateur décide tout seul, et l’API qui coûte du CPU n’a aucun verrou.

## 1. Ce qui est bien pensé et solide

**Séparation des deux métiers WFM.** Le flux chaud passe par Erlang C (`calculer_etp_pour_volume`). Le flux froid passe par une charge en heures, une capacité nette (ouverture × shrinkage × occupation) et un délai SLA en jours (`calculer_etp_ticketing`). Ce sont les deux bonnes familles de formules. Le front n’envoie le délai et l’occupation qu’en plus, sans changer la clé du modèle chaud.

**Lecture d’historique défensive.** `parser_une_date` et `parser_un_volume` acceptent les dates françaises, ISO, et le numéro de série Excel. Une feuille vide ou illisible renvoie une erreur explicite au lieu d’un plan à zéro. Les prévisions non finies sont remplacées par la moyenne, et une prévision plate est journalisée comme telle.

**Repli Holt-Winters honnête dans l’intention.** En dessous de deux cycles de 365 jours, le modèle annuel ne tourne pas. `prevoir_double_saisonnalite` prend le relais (jour de semaine × mois + tendance). LightGBM mélange sa prédiction avec la moyenne saisonnière, ce qui limite les sorties absurdes sur un petit historique.

**Auth et données utilisateur, côté schéma.** L’inscription crée un profil (`handle_new_user`, `search_path` fixé). La RLS est activée et la policy `*_own_rows` limite les lignes à `auth.uid() = user_id`. La confirmation d’e-mail est gérée (hash Supabase, déconnexion forcée du lien, message à l’écran). `AuthGate` se désabonne de `onAuthStateChange`.

**Parcours écran.** Import Excel, puis paramètres, puis modèle et horizon, puis graphique volume / ETP et export. Les libellés chaud / froid, les info-bulles et la grille à hauteur fixe rendent le formulaire lisible. L’export Excel fige l’en-tête et pose un filtre. Le fetch a un timeout (60 s sur la prévision).

## 2. Ce qui est bancal

### Formules

**Le backlog froid est compté une fois par jour, et encore une fois par mois.** En court terme, `calculer_etp_ticketing` reçoit le volume du jour *et* `req.backlog` à chaque itération (`main.py`, boucle `est_court_terme`). Un backlog de 100 tickets est donc dimensionné 30 fois. En long terme, le même backlog est ajouté au volume journalier moyen de chaque bloc de 30 jours, donc 12 fois sur l’année. Un stock initial ne doit entrer qu’une fois, ou être amorti sur `delai_sla_jours`, pas réinjecté à chaque point du plan.

**Erlang C peut ne jamais s’arrêter.** `calculer_etp_pour_volume` est un `while True` sans plafond d’agents. Un SLA de 100 % n’est en pratique jamais atteint par Erlang C : la boucle ne sort pas. `aht = 0`, `heures_ouverture = 0` ou `shrinkage >= 100` lèvent une division par zéro. Le front n’empêche aucun de ces cas. Le flux froid, lui, renvoie 1 si la capacité est nulle : les deux chemins ne réagissent pas pareil.

**L’Erlang chaud n’est pas un plan d’intervalles.** Le volume du jour est divisé par les heures d’ouverture, puis traité comme un trafic plat. Il n’y a pas de courbe intra-journalière, pas de file d’attente par créneau, pas d’occupation cible côté chaud. Le chiffre affiché est un ETP moyen, pas un besoin heure par heure. L’écran « Simulation Erlang » promet plus que le calcul.

**Le long terme n’est pas mensuel.** L’horizon fait 365 jours, le plan n’en garde que 360, coupés en 12 paquets de 30. L’étiquette `MM/AAAA` avance d’un mois calendaire à partir d’aujourd’hui, pendant que le volume vient d’un bloc glissant. Février et les mois de 31 jours sont faux. Les 5 derniers jours prévus sont jetés.

**Les volumes négatifs deviennent 1 contact.** Holt-Winters additif peut prédire en dessous de zéro. `max(1, int(vol))` transforme ça en un jour « presque vide » mais jamais nul, et masque le défaut du modèle. Le nom renvoyé reste « Holt-Winters » même quand c’est le repli maison.

**LightGBM est à moitié désaisonnalisé deux fois.** Les features dupliquent `semaine_annee` et `semaine_de_l_annee`. La prédiction est ensuite moyennée 50/50 avec la moyenne saisonnière. Le modèle avancé, réservé au plan Pro, est structurellement tiré vers la baseline.

**La colonne File est ignorée.** L’import exige 3 colonnes, puis le moteur ne prévoit que `volume`. Deux files dans le même fichier sont fondues en une seule série. Le staffing qui en sort n’est pas celui d’une file.

### Produit et UX

**L’étape 3 est morte, et son API n’existe pas.** `currentStep === 3` affiche « Paramétrage Erlang C » et appelle `POST /erlang`. Rien dans l’interface ne met `currentStep` à 3. `main.py` n’expose que `GET /` et `POST /prevision_plan`. `calculateFTE` échouerait s’il était atteint. `predictedVolume` reste figé à 150.

**Trois noms pour le même modèle.** Le bouton dit « Moyenne Historique (Baseline) ». L’état React vaut `Prophet`. Le corps envoyé à FastAPI vaut `Moyenne`. L’essai gratuit parle encore du « modèle Moyenne ». La clé technique est stable, le vocabulaire ne l’est pas.

**La modale Pro ne vend rien.** « Passez au plan Pro pour débloquer » n’a qu’un bouton Fermer. Pas de prix, pas de lien, pas d’état d’attente. Un utilisateur bloqué n’a aucune suite.

**L’export ne sait pas qu’il est en flux froid.** Le classeur écrit toujours SLA %, temps cible et une colonne « SLA cible (%) », y compris quand le plan a été calculé avec le délai en jours et l’occupation.

**Le graphique natif n’est pas le graphique web.** `CombinedChart.web.tsx` est un Recharts à deux axes. `CombinedChart.tsx` est un mini histogramme sans dates. Sur mobile, le plan ne se lit pas.

**`/explore` est encore le template Expo.** La route est derrière `AuthGate`. Un utilisateur connecté qui ouvre `/explore` tombe sur l’écran de démo du starter (liens, collapsibles, badge web), pas sur Flash WFM.

### Code

**Deux fichiers font tout.** `index.tsx` (~770 lignes) mélange import, droits, prévision, export, et l’étape Erlang morte. `main.py` (~380 lignes) mélange parsing, trois modèles, deux formules d’ETP et la route HTTP. Il n’y a pas de module métier, pas de schéma de réponse, pas de test.

**Pas de fuite d’écouteur identifiée.** `AuthGate` unsubscribe, l’effet profil annule avec `actif`. En revanche tout le classeur parsé reste dans `dataPreview` pour la durée de l’écran, et chaque génération ré-entraîne Holt ou LightGBM en mémoire. Sur le plan Render free (512 Mo, un process), deux appels concurrents suffisent à faire tomber le worker. Ce n’est pas une fuite : c’est un coût non borné.

**`scikit-learn` n’est pas épinglé** dans `requirements.txt`, alors que le reste l’est. Le prochain build Render peut changer la résolution sans diff.

## 3. Dette technique et risques avant la mise en prod

| Risque | Effet en production |
| --- | --- |
| `POST /prevision_plan` sans authentification, CORS `*` | N’importe qui peut entraîner des modèles sur l’instance Render. Pas de quota, pas de lien avec le compte. |
| Plan Pro lu dans le navigateur (`profiles.plan`) | Changer l’état React, ou mettre à jour la ligne soi-même, débloque Holt et LightGBM. Le serveur ne vérifie rien. |
| Policy RLS `for all` sur `profiles` | Un utilisateur `authenticated` peut `update` sa propre ligne, y compris `plan`. La colonne qui doit piloter Stripe est writable par le client. |
| Essai de 3 jours calculé sur `user.created_at` dans le client | `finEssai === null` laisse la baseline ouverte. Avant la réponse Supabase, et si `getUser` ne renvoie personne, le verrou ne se ferme pas. |
| Render `plan: free`, uvicorn sans workers ni limite de body | Cold start, timeout, OOM dès que l’historique est long ou que plusieurs clients cliquent ensemble. Le timeout front est de 60 s ; Render free coupe souvent avant. |
| Journaux | L’API imprime le modèle, l’horizon, des extraits de dates et de volumes. Ce sont des données client dans les logs Render. |
| Tables `forecasts` et `schedules` | Créées, sous RLS, jamais écrites. Aucune historisation de plan. Un litige client ou un webhook Stripe n’a rien à rapprocher. |
| Pas de tests, pas de CI | Une régression Erlang ou un changement de `type_flux` part en prod avec le prochain push sur `main`. |
| Secrets | L’URL et la clé anon sont des `EXPO_PUBLIC_*`, donc publiques par design. Ce n’est acceptable que si la RLS tient et si `plan` n’est pas modifiable. Aujourd’hui la seconde condition est fausse. |
| Android | `API_BASE` pointe vers `10.0.2.2` sur Android et vers Render partout ailleurs. Il n’y a pas d’environnement. |

La RLS large est aussi un piège : la migration active la RLS sur **toutes** les tables `public`, puis ne crée une policy que si la colonne `user_id` existe. Une table publique sans `user_id` devient illisible et non inscriptible pour tout le monde, y compris le service.

## 4. Actions prioritaires avant Stripe

À faire dans cet ordre. Brancher Checkout avant, c’est vendre un cadenas posé sur la porte et pas sur la serrure.

1. **Interdire l’écriture de `plan` par le client.** Retirer le `UPDATE` client sur `profiles.plan` (policy séparée, ou colonne absente du grant). Aucune route `from('profiles').update({ plan: 'pro' })` ne doit pouvoir réussir avec la clé anon. Vérifier avec un appel réel, pas seulement en relisant le SQL.

2. **Créer une table d’abonnement que seul le serveur écrit.** `customer_id`, `subscription_id`, `price_id`, `status`, `current_period_end`. Le webhook Stripe, vérifié par signature, est le seul écrivain. Clé service role, hors du front. Idempotence sur `event.id`.

3. **Faire respecter le droit sur `POST /prevision_plan`.** Exiger le JWT Supabase. Lire le statut d’abonnement côté serveur. Refuser Holt-Winters et LightGBM si le statut n’est pas `active` ou `trialing`. Refuser la baseline si l’essai serveur est expiré. Le front peut continuer à masquer les boutons : ce n’est plus la barrière.

4. **Borner le coût avant de facturer.** Taille max du JSON, timeout uvicorn, plafond de lignes, un seul calcul lourds à la fois par utilisateur. Sinon un abonné Pro, ou un script sur l’URL publique, peut épuiser le free tier et le futur plan payant.

5. **Corriger le backlog et le plafond Erlang avant d’afficher un prix.** Un client qui paie pour un ETP de ticketing verra un effectif multiplié par le nombre de jours. Plafonner la boucle Erlang (et rejeter SLA 100, AHT 0, shrinkage ≥ 100) évite les 500 et les workers bloqués.

6. **Décider ce que le Pro achète.** Aujourd’hui la modale ne décrit pas l’offre, l’étape 3 est injoignable, `/erlang` n’existe pas, et l’export Pro n’est qu’un fichier généré dans le navigateur. Le prix doit correspondre à un droit serveur (modèles, historique de plans, export), pas à un `if (estPro)` dans `index.tsx`.

7. **Ensuite seulement : Checkout + portail client.** Créer la session Stripe avec le `user_id` en metadata, renvoyer vers l’app, laisser le webhook mettre à jour la table d’abonnement. Ne pas faire confiance au `success_url` pour passer quelqu’un Pro.

Tant que les points 1 à 3 ne sont pas faits, intégrer Stripe augmente le risque : un utilisateur peut se marquer Pro sans payer, et un non-authentifié peut consommer les modèles Pro sans compte.
