# Contre-audit — Flash WFM après `32f6e69`

Date : 21 octobre 2026. Périmètre : le dépôt au commit `32f6e69` (`backend/main.py`, `flash-wfm/src`, les deux migrations Supabase, `render.yaml`, `requirements.txt`). Ceci relit le code. Ce n’est pas une inspection du service Render en cours d’exécution, ni un test joué sur la base Supabase hébergée.

## 1. Points corrigés, et jusqu’où ils sont validés

### JWT sur `POST /prevision_plan` — validé en local, pas sur l’hôte

`generer_plan_production` refuse la suite tant que `Authorization: Bearer` n’a pas produit un JWT d’audience `authenticated`, de rôle `authenticated`, avec `exp` et `sub`. La vérification accepte HS256 via `SUPABASE_JWT_SECRET`, puis RS256/ES256 via le JWKS du projet. Un jeton absent, expiré, mal signé, ou de rôle `anon` / `service_role`, répond 401 avant Holt-Winters et LightGBM.

Le droit est lu ensuite avec la clé `service_role` : `profiles.plan` et `profiles.created_at`. Holt-Winters et LightGBM exigent `plan == "pro"`. Sinon, un essai de 3 jours manquant ou expiré répond 403, y compris pour la moyenne. Sans URL ou sans clé service, la route répond 503 et n’entraîne rien.

Ces cas ont été exécutés en local contre ce code : 401 (absent, illisible, expiré, mauvais secret, mauvais rôle), 403 (Holt, LightGBM, essai expiré), 200 (essai actif ou Pro sur la moyenne). Le chemin JWKS réel du projet hébergé n’a pas été rejoué. `render.yaml` ne déclare aucune des trois variables. Tant qu’elles ne sont pas posées sur l’hôte, un utilisateur connecté reçoit 503, et un déploiement qui n’aurait pas encore pris `32f6e69` laisserait l’ancienne route ouverte.

### RLS de `profiles.plan` — écrite, pas appliquée, donc pas validée

`flash-wfm/supabase/migrations/20261021213000_lock_profiles_plan.sql` fait ce qu’il faut sur le papier. `FORCE ROW LEVEL SECURITY`. L’`UPDATE` authentifié ne passe que si `plan` est inchangé par rapport à `private.profiles_current_plan`. Un `BEFORE UPDATE` rejette aussi un changement de `plan`, `user_id`, `email` ou `created_at` avec `42501` et le message RLS attendu. L’`INSERT` client impose `plan = 'free'`. `service_role` (via `auth.role()`) peut encore écrire `plan`, ce qui est le seul chemin légitime pour un futur webhook.

Cette migration n’a pas été exécutée sur la base hébergée, et aucun Postgres local n’a pu la jouer ici. Tant qu’elle ne l’est pas, la policy `profiles_own_rows` du premier script (`FOR ALL`, `auth.uid() = user_id`) reste la règle réelle : le client peut toujours faire `update({ plan: 'pro' })`. L’API lit ensuite cette valeur avec la clé service et ouvre les modèles. Le cadenas du commit ne ferme la serrure qu’après application du SQL.

### ETP, backlog, volumes — le bug visé est clos

`calculer_etp_pour_volume` ne boucle plus sans fin : AHT nul, ouverture nulle ou shrinkage ≥ 100 renvoient 1 ; un SLA ≥ 100 est plafonné à 99,9 % ; la recherche s’arrête à 1 000 agents. `volume_retenu` laisse un volume ≤ 0 à 0, au lieu de le remplacer par 1. Le backlog froid n’est ajouté qu’au premier jour (`index == 0`) ou au premier bloc de 30 jours (`i == 0`).

Cela supprime le worker bloqué et l’effectif multiplié par 30 ou par 12. Ce n’est pas une certification de la formule : le plancher d’1 ETP du ticketing, le long terme en paquets de 30 jours et le nom du modèle en cas de repli restent ouverts, plus bas.

### `index.tsx` — le parcours mort est retiré

Il n’y a plus de `currentStep === 3`, plus de `calculateFTE`, plus d’appel à `POST /erlang`. L’étape 2 affiche le graphique et le plan dès que la réponse est là. L’export froid écrit « Délai SLA (jours) », « Occupation (%) » et « Shrinkage (%) » à la place de « SLA cible (%) » et « Temps cible SLA (secondes) ». Le fetch envoie `session.access_token`. Un 401 ou un 403 affiche le message de l’API et le bouton de génération se réactive : ces deux réponses ont été provoquées dans le navigateur, puis les contournements d’écran utilisés pour le test ont été retirés.

## 2. Ce qui reste ouvert

### Sécurité, dans l’ordre où ça bloque un paiement

1. **La base hébergée accepte encore qu’un client se passe Pro.** Jusqu’à l’exécution de `20261021213000_lock_profiles_plan.sql`, `profiles.plan` est writable par l’utilisateur authentifié. Le serveur croit ensuite cette colonne. C’est le même trou que l’audit précédent, simplement déplacé : le code API ne le compense pas.

2. **Même une fois la migration appliquée, `plan = 'pro'` n’est pas un abonnement.** Il n’existe aucune table `customer_id` / `subscription_id` / `status` / `current_period_end`, aucun webhook, aucune vérification de signature Stripe, aucune idempotence sur `event.id`. Un impayé, une résiliation ou un `past_due` ne retirent pas le droit. Faire confiance au `success_url` pour écrire `plan` reproduirait l’ancien contournement, avec un reçu en plus.

3. **L’essai gratuit n’est pas le même des deux côtés.** Le serveur compte 3 jours depuis `profiles.created_at` et ferme si la date manque. Le client compte depuis `user.created_at`, et `finEssai === null` laisse la moyenne cliquable tant que `getUser` n’a pas répondu (`index.tsx`). Le serveur rattrape par un 403. L’écran, lui, promet un essai que l’API peut déjà refuser.

4. **L’export et les boutons restent des `if` React.** `handleExport` regarde `estPro` dans le navigateur. Le fichier Excel n’est pas un droit serveur. Quelqu’un qui a déjà reçu un plan peut l’exporter en forçant l’état. Les modèles, eux, sont bien arrêtés par l’API.

5. **Le coût n’est toujours pas borné.** Pas de taille max du JSON, pas de plafond de lignes, pas de quota, pas de file par utilisateur. La route est synchrone et entraîne LightGBM ou Holt dans le process. `render.yaml` est encore `plan: free`, un seul `uvicorn`, sans limite de workers. Deux historiques longs, ou un jeton volé qui répète `POST /prevision_plan`, peuvent tuer l’instance. CORS reste `*`. Les logs impriment encore trois lignes de dates et de volumes client.

6. **`forecasts` et `schedules` sont toujours en `FOR ALL` sur `user_id`, et jamais écrites.** Y poser plus tard un statut d’abonnement redonnerait au client le droit d’écrire sa ligne. Un paiement contesté n’a aujourd’hui aucun plan archivé à comparer.

7. **Les variables d’auth ne font pas partie du déploiement.** Sans `SUPABASE_URL`, `SUPABASE_JWT_SECRET` et `SUPABASE_SERVICE_ROLE_KEY` sur Render, la route authentifiée répond 503. Le client Supabase est créé une fois : une mauvaise clé au premier appel reste en mémoire jusqu’au redémarrage.

### Formules et intégrité de ce qui serait vendu

8. **Un repli Holt-Winters s’appelle encore « Holt-Winters ».** Sous 730 jours, ou si le fit échoue, `prevoir_double_saisonnalite` tourne et `nom_modele_final` reste « Holt-Winters » (`main.py`). LightGBM, lui, peut tomber sur « Moyenne (suite à un plantage) » tout en renvoyant `statut: succès`. Un client Pro peut payer un nom et recevoir la baseline.

9. **Le long terme n’est pas un mois, et le backlog y est ajouté à une moyenne journalière.** 365 jours sont coupés en 12 × 30, les 5 derniers jours sautent, l’étiquette avance d’un mois calendaire. En flux froid, le backlog du premier bloc est sommé au volume journalier moyen (`vol_mensuel / 30`), puis passé à une formule pensée pour une journée. L’effectif du premier « mois » n’est pas le besoin du mois.

10. **Le ticketing ne descend pas sous 1 ETP.** `calculer_etp_ticketing` finit par `max(1, etp)`. Un jour à volume 0, sans backlog, sort quand même 1. Le volume affiché est bien 0. L’effectif ne l’est pas. Les paramètres hors bornes (backlog négatif, occupation au-dessus de 100, shrinkage négatif) ne sont pas rejetés : Erlang renvoie 1 au lieu d’un 400, le froid gonfle ou réduit la charge en silence.

11. **LightGBM est toujours tiré vers la moyenne, et la colonne File est toujours ignorée.** Les features dupliquent `semaine_annee` et `semaine_de_l_annee`. La prédiction est ensuite mélangée 50/50 avec la moyenne saisonnière. L’import exige trois colonnes, le moteur ne prévoit que `volume`. Deux files dans un fichier ne donnent qu’une série.

### Produit, UX, dette

12. **La modale Pro ne vend rien.** « Passez au plan Pro pour débloquer » ne fait que fermer. Pas de prix, pas de Checkout, pas d’état d’attente.

13. **Trois noms pour la baseline.** Le bouton dit « Moyenne Historique (Baseline) », l’état React vaut `Prophet`, le JSON vaut `Moyenne`, l’export Excel écrit `selectedModel`, donc « Prophet ».

14. **Le graphique mobile n’est pas celui du web.** `CombinedChart.web.tsx` est un Recharts daté à deux axes. `CombinedChart.tsx` est une barre sans dates. `/explore` est encore l’écran de démo Expo, derrière `AuthGate`.

15. **`index.tsx` fait toujours tout l’écran** (import, droits, prévision, export). `scikit-learn` n’est pas épinglé. Il n’y a aucun test et aucun workflow CI. `API_BASE` vise `10.0.2.2` sur Android et Render partout ailleurs. L’erreur TypeScript `scrollbarWidth` sur `hScroll` est toujours là.

## 3. Verdict

Non. Le projet n’est pas prêt à 100 % pour un tunnel Stripe, ni sans risque de sécurité, ni sans risque de tomber.

Le JWT empêche un anonyme d’entraîner un modèle, et les garde-fous Erlang empêchent la boucle infinie. Ça ne suffit pas à encaisser. La colonne qui décide du Pro est encore modifiable par le client sur la base réelle, il n’y a aucun abonnement signé par Stripe pour la remplacer, et l’instance free peut être mise à genoux par le corps d’une requête authentifiée. Brancher Checkout maintenant vendrait un droit que le navigateur, ou un webhook naïf sur `success_url`, peut s’accorder tout seul.

Ordre restant, inchangé dans son principe : appliquer et prouver la migration sur la base hébergée, créer la table d’abonnement écrite seulement par un webhook signé, faire lire ce statut par `POST /prevision_plan` à la place d’un simple `plan == "pro"`, borner la taille et la concurrence du calcul, puis seulement ouvrir Checkout.
