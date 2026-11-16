# Flash WFM — Audit de mise sur le marché français

Date : 14 novembre 2026  
Périmètre : code du dépôt `flash-wfm` et `backend` (commit `a38ff03` sur `main`, plus l’arbre de travail).  
Méthode : lecture du produit tel qu’il est écrit (interface, règles Free / Pro, calcul Erlang, Stripe, base, textes légaux).  
Hors périmètre : je n’ai pas ouvert le tableau de bord Stripe, le projet Supabase hébergé, ni les variables Vercel et Render. Ce qui dépend de ces réglages est signalé comme non constaté.

Ce document est une revue d’expert produit et de conformité apparente. Ce n’est pas une consultation d’avocat. Les formulations proposées sont des bases à faire valider avant publication.

## Verdict

Le moteur de dimensionnement est abouti pour une bêta fermée : import, Erlang C chaud et froid, quatre moteurs de prévision, essai de 48 heures, verrous Free, exports Excel et PowerPoint, synthèse, PWA, interface en français.

La commercialisation publique payante en France n’est pas prête. Six points bloquent l’ouverture : identité légale de l’éditeur, conditions de vente sans prix ni durée, information RGPD incomplète et hébergement mal décrit, paiement Stripe qui peut ne pas rattacher le compte, secret Discord encore dans le dépôt, absence de parcours de preuve après paiement.

## 1. Cadre légal

### 1.1 Ce qui est déjà en place

- Trois textes sont accessibles avant connexion et dans l’application : mentions légales, CGU / CGV, confidentialité (`PiedLegal.tsx`, aussi sur l’écran de connexion).
- Le produit se décrit correctement comme une aide à la décision, pas comme un engagement d’effectif.
- Le droit français est désigné.
- Les données de flux sont présentées comme la propriété du client, non revendues.
- La base de traitement annoncée (exécution du service) est cohérente avec un outil sur compte.
- Le plan et le rôle ne sont pas modifiables par le navigateur : la colonne `plan` ne passe à `pro` que par le rôle serveur, et `role` est protégé de la même façon dans la migration `20261112140000_profiles_role.sql`.
- Les demandes Pro et les feedbacks ne sont pas lisibles par le client. L’auteur est forcé depuis la session.
- Les abonnements Stripe ne sont pas écrivables par le client.
- Le webhook Stripe vérifie la signature.

### 1.2 Bloquant — Mentions légales (LCEN, art. 6-III)

Le texte actuel dit seulement « Éditeur : MakConsult », cite Render et Supabase, et renvoie le contact vers le formulaire de feedback une fois connecté.

Pour un site professionnel français, les mentions doivent permettre d’identifier l’éditeur sans créer de compte :

- dénomination, forme juridique, capital, siège, RCS, SIRET, numéro de TVA s’il existe ;
- nom du directeur de la publication ;
- adresse de courriel et téléphone ;
- pour chaque hébergeur : dénomination, forme, siège, téléphone.

Correction proposée. Remplacer le premier et le troisième paragraphes des mentions par une fiche d’identité réelle, par exemple :

> Éditeur : [Dénomination] [forme], au capital de [montant], siège [adresse], RCS [ville] [numéro], SIRET [numéro], TVA [numéro]. Directeur de la publication : [nom]. Contact : [email] — [téléphone].
>
> Hébergement du site : Vercel Inc., [adresse]. Hébergement de l’API de calcul : Render Services, Inc., [adresse]. Comptes, authentification et données de compte : Supabase, Inc., [adresse], région [eu-west ou celle réellement choisie]. Paiement : Stripe Payments Europe, Ltd.

Tant que ces champs ne sont pas remplis avec les pièces de la société, ne pas ouvrir la vente.

### 1.3 Bloquant — CGV impropres à une vente

Les CGU et les CGV sont le même texte. Il décrit l’essai de 48 heures et la liste des fonctions Pro. Il ne contient pas :

- le prix TTC, la périodicité, la reconduction ;
- les modalités de résiliation et de remboursement ;
- l’émission de la facture ;
- un plafond de responsabilité ;
- le médiateur de la consommation, obligatoire si un non-professionnel peut souscrire (C. consom., art. L612-1) ;
- la qualité du cocontractant (professionnel seulement, ou aussi particulier).

L’inscription accepte n’importe quel e-mail. Le formulaire Pro demande un e-mail professionnel et une entreprise, mais rien n’empêche un particulier d’arriver au paiement. Le prix n’apparaît nulle part dans l’application avant l’ouverture de Stripe.

Correction proposée.

1. Séparer des CGV de vente. Y faire figurer le montant TTC, la période (mois ou année), le renouvellement, le préavis, le droit de résiliation, et la facture.
2. Afficher ce prix dans la modale « Activer mon accès Pro », avant le clic.
3. Choisir un régime et l’écrire :
   - vente réservée aux professionnels : le dire à l’inscription et à la commande, et écarter le droit de rétractation de 14 jours au titre du contrat entre professionnels ;
   - ou vente ouverte aux particuliers : information précontractuelle, rétractation de 14 jours, médiateur, prix TTC.
4. Remplacer « le service est fourni en l’état » par un plafond, par exemple le montant payé sur les douze derniers mois, en laissant intacte la phrase qui refuse tout engagement d’effectif. Un avocat doit calibrer ce plafond.
5. Ajouter une case non précochée à l’inscription : « J’accepte les conditions et la politique de confidentialité », avec les liens déjà présents dans le pied de page.

### 1.4 Bloquant — Information RGPD incomplète, et hébergement inexact

La politique cite l’e-mail, la demande Pro et les flux importés. Elle omet le mot de passe (porté par Supabase), les jetons de session, les identifiants Stripe, le statut d’abonnement, les URL de sources enregistrées sur le profil, les journaux techniques, et le contenu des feedbacks.

Elle ne donne pas :

- un contact joignable sans être connecté ;
- le droit de réclamation auprès de la CNIL ;
- les destinataires exacts et, s’il y a transfert hors UE, les garanties (clauses types) ;
- des durées distinctes (compte, factures légales, feedbacks, journaux) ;
- le fait qu’une partie des volumes reste dans le navigateur.

Le texte dit que l’application est opérée sur Render. C’est inexact. Le site public est construit par Vercel (`flash-wfm/vercel.json`, `expo export -p web`). Render héberge l’API. Supabase porte les comptes. Stripe porte le paiement. `global.css` charge la police Inter depuis `fonts.googleapis.com` : l’adresse IP du visiteur part chez Google avant tout compte, sans mention et sans nécessité.

Les volumes importés et le plan sont enregistrés dans `localStorage` (`flash_wfm_state`), pas dans les tables `forecasts` et `schedules`, qui existent et ne sont pas alimentées. Les mentions parlent pourtant d’« historiques de travail » hébergés chez Supabase.

Correction proposée.

1. Réécrire le paragraphe d’hébergement avec Vercel, Render, Supabase (région réelle), Stripe et, tant que la police distante existe, Google.
2. Héberger Inter en local et retirer l’appel à Google Fonts. C’est le correctif le plus simple côté traceurs : il ne reste alors que des stockages nécessaires au service demandé (session, progression), pour lesquels un bandeau de consentement n’est en principe pas exigé. Le dire en une phrase dans la politique.
3. Décrire le stockage local : les fichiers de volumes et le plan restent sur le poste, sont envoyés à l’API le temps du calcul, et ne sont pas écrits dans une table d’historique.
4. Ajouter : droits, délai d’un mois, réclamation CNIL (www.cnil.fr), contact e-mail public.
5. Si les plannings importés peuvent contenir des noms de salariés, MakConsult est sous-traitant du client. Prévoir un accord art. 28 (objet, durée, nature des données, sous-traitants ultérieurs, suppression en fin de contrat) avant d’accepter ces fichiers en production.

La suppression de compte n’existe que par une demande dans « Une idée ? / Feedback ». C’est recevable si une personne répond, mais le délai et l’e-mail public manquent. Le schéma prévoit bien `on delete cascade` depuis `auth.users` : la suppression du compte d’authentification emporte le profil, les feedbacks et les demandes Pro. Il manque l’action côté produit.

### 1.5 Bloquant — Secret Discord encore dans le dépôt

`flash-wfm/src/services/discordNotifier.ts` n’est importé par aucun écran. Il contient toutefois un webhook Discord en dur, en secours de la variable d’environnement. Ce secret a aussi circulé dans l’historique Git.

Correction proposée. Révoquer le webhook dans Discord immédiatement. Supprimer le fichier. Ne pas le remplacer par un autre secret dans le client. Le feedback passe déjà par la table `feedbacks`, ce qui est le bon canal. Réécrire l’historique Git n’est utile qu’après révocation, et seulement si vous acceptez une opération irréversible sur `main`.

### 1.6 Paiement

Deux chemins coexistent.

- Si `EXPO_PUBLIC_STRIPE_LINK` est une URL `https`, la modale ouvre ce lien dans un nouvel onglet. Ce lien n’envoie pas `user_id`. Le webhook ne peut alors pas rattacher l’abonnement au compte, et le plan reste `free` après paiement.
- Sinon, `POST /create-checkout-session` crée une session avec `client_reference_id` et `subscription_data.metadata.user_id`. Ce chemin est le seul qui peut ouvrir le Pro de façon fiable. S’il répond 503, l’écran bascule sur un formulaire e-mail + entreprise, sans paiement.

Le retour `/?success=true` n’est lu par aucun écran. L’utilisateur revient sur l’application sans confirmation. L’ouverture du plan dépend entièrement du webhook, que je n’ai pas pu constater en production.

`profiles.plan` passe à `pro` quand le statut Stripe est `active` ou `trialing`, et revient à `free` sur les autres statuts, à condition que l’événement porte le `user_id`. L’interface, elle, considère Pro si `plan === 'pro'` ou `role === 'admin'`, ou si les 48 heures courent encore. Elle ne lit pas le statut d’abonnement pour ouvrir les fonctions. Le bouton « Gérer mon abonnement » ne s’affiche que si `status === 'active'`, donc pas pendant un statut `trialing`.

Correction proposée.

1. Retirer le lien Stripe générique du parcours. N’utiliser que la session de checkout rattachée au compte.
2. Afficher le prix TTC dans la modale, lu depuis une variable publique ou renvoyé par l’API, identique au prix Stripe.
3. Sur `?success=true`, afficher une confirmation et recharger le profil. Sur `?canceled=true`, laisser un message neutre.
4. Vérifier en production que `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` et `FRONTEND_URL` sont posés, et qu’un paiement test fait bien passer `profiles.plan` à `pro`.
5. Aligner le bouton de gestion sur les statuts `active` et `trialing`.

## 2. Aboutissement des fonctions

Lecture métier : Flash WFM dimensionne un besoin en ETP à partir d’un historique de volumes. Ce n’est pas une suite WFM complète (pas de planification nominative, pas de pointeuse, pas d’adhérence, pas de gestion des congés). Le garder comme promesse commerciale évite une pratique commerciale trompeuse. Le pied de page le dit déjà. Le nom « WFM » doit être accompagné de cette limite sur le site de vente.

### 2.1 Fonctions tenues dans le code

| Fonction | État dans le code |
| --- | --- |
| Inscription, règles de mot de passe, confirmation d’e-mail, bannière de retour | Présentes |
| Essai 48 h à partir de la date de création du compte | Présent côté interface et API |
| Après l’essai : seul Holt-Winters, affiché « Saisonnalité & Tendances » | Présent. Les trois autres moteurs portent le badge PRO et ouvrent la modale |
| Erlang C flux chaud, shrinkage appliqué après le nombre d’agents | Présent |
| Flux froid : si `heures_travaillees` est fourni, le shrinkage n’est pas appliqué une seconde fois | Présent |
| Import d’historique, exemple, multi-files, ajustements événementiels | Présents. Ajustements, synthèse et exports verrouillés hors Pro |
| Import du planning ETP réel | Verrouillé hors Pro. « Passer cette étape » reste ouvert, conformément au texte affiché |
| Exports Excel du plan et Excel / PowerPoint de la synthèse | Présents, verrouillés hors Pro |
| PWA (manifeste, service worker sans cache des réponses) | Présente |
| Badge de statut toujours visible, marqueur `v2.1` | Présent dans `HeaderLogo` |
| Langue de l’interface | Française |

### 2.2 Écarts fonctionnels à traiter

1. L’API contient encore le calcul « Moyenne mobile ». L’interface ne le propose plus, et `verifier_droit_modele` le refuse après l’essai. À retirer du serveur au prochain passage, pour qu’un appel direct ne puisse plus le demander pendant les 48 heures.
2. L’essai de l’interface part de `auth.users.created_at`. L’API tente la même date via l’admin Supabase, puis se replie sur `profiles.created_at`. Si l’appel admin échoue, les deux horloges peuvent diverger. Faire de `auth.users.created_at` la seule source, et refuser le calcul si elle est absente.
3. Un abonnement Stripe `active` ouvre l’API même si `plan` est resté `free`. L’interface, elle, reste verrouillée tant que `plan` n’est pas `pro`. Inversement, si le webhook d’annulation échoue, `plan` reste `pro` et l’interface reste ouverte. Le webhook doit être surveillé, et un rapprochement quotidien plan / abonnement est souhaitable.
4. Les migrations `profiles.role` et `pro_requests` sont dans le dépôt. Je n’ai pas constaté qu’elles sont appliquées sur le Supabase hébergé. Sans elles, le rôle admin et le formulaire de demande Pro échouent en production.
5. Le correctif « Holt libre après 48 h » est dans `backend/main.py` sur `main`. Il ne produit d’effet en ligne qu’après redéploiement de l’API Render. Non constaté ici.
6. `?success=true` après Stripe n’affiche rien.
7. `devForcePro` existe encore dans le contexte d’auth. Il n’entre pas dans `isPro`. Le badge DEV n’apparaît que si `__DEV__`. Aucun contournement de production identifié. On peut supprimer le levier mort pour éviter qu’un futur branchement ne le réactive.

### 2.3 Robustesse du calcul, pour un lancement

Le chaud plafonne à 1 000 agents et renvoie 1 ETP si les paramètres sont hors domaine. C’est un garde-fou, pas une erreur visible pour l’utilisateur : un centre très grand peut donc lire « 1 000 » sans comprendre que le calcul a saturé. Avant la vente, afficher un message quand le plafond est atteint.

Holt-Winters exige deux années d’historique pour le modèle annuel, sinon il tombe sur un repli. Le libellé renvoyé au client doit dire que la saisonnalité annuelle n’a pas pu être estimée, plutôt que de laisser croire à un Holt complet.

Ces deux points ne bloquent pas une bêta. Ils bloquent une promesse commerciale du type « le modèle saisonnier est toujours celui qui est affiché ».

## 3. Liste des incohérences et correction proposée

| # | Incohérence | Correction |
| --- | --- | --- |
| 1 | Les mentions disent que l’application est hébergée sur Render. Le site est servi par Vercel, l’API par Render. | Réécrire les mentions et la politique avec les quatre prestataires réels. |
| 2 | La politique parle d’historiques enregistrés chez Supabase. Le plan et les volumes sont dans le navigateur. Les tables `forecasts` et `schedules` ne sont pas utilisées. | Dire le stockage local. Supprimer ces tables ou les alimenter, pas les deux à la fois dans le discours. |
| 3 | Google Fonts est chargé, absent des textes. | Police locale, puis retirer Google de la politique. |
| 4 | « MakConsult » sans forme ni SIRET, contact seulement après connexion. | Fiche LCEN et e-mail public. |
| 5 | CGV sans prix, alors que la modale parle déjà de paiement. | Prix TTC dans la modale et dans les CGV. |
| 6 | Lien Stripe public prioritaire sur la session rattachée au compte. | Supprimer ce lien du parcours. |
| 7 | Retour `success=true` ignoré. | Écran de confirmation et rechargement du profil. |
| 8 | L’essai et le plan Pro ne reposent pas sur la même horloge partout. | Une seule date de création, et le plan piloté uniquement par le webhook vérifié. |
| 9 | Le nom WFM peut laisser attendre une planification d’agents. | Phrase de périmètre sur la page de vente : dimensionnement et plan de production, pas GTA. |
| 10 | Webhook Discord en dur dans un fichier mort. | Révoquer, supprimer le fichier. |
| 11 | « Moyenne mobile » encore calculable par l’API pendant l’essai. | Retirer la branche serveur. |
| 12 | Acceptation des CGU par simple usage, sans case. | Case explicite à l’inscription. |

## 4. Ordre de travail recommandé

Avant toute annonce publique ou premier prélèvement :

1. Révoquer le webhook Discord et supprimer `discordNotifier.ts`.
2. Compléter les mentions avec les informations réelles de la société et des hébergeurs.
3. Écrire des CGV avec prix TTC, durée, résiliation, facture. Les faire relire.
4. Afficher ce prix dans la modale et ne garder que le checkout rattaché au `user_id`.
5. Vérifier un paiement test de bout en bout, y compris le retour sur le site et le passage du plan à `pro`.
6. Réécrire la politique (destinataires, durées, CNIL, stockage local, région Supabase) et servir la police en local.
7. Appliquer les migrations hébergées et redéployer l’API Render.
8. Ajouter la case d’acceptation et un e-mail de contact public, y compris pour la suppression de compte.

Ensuite, sans bloquer une bêta déjà encadrée par contrat : message de plafond Erlang, transparence du repli Holt, retrait de la moyenne mobile côté API, accord de sous-traitance si des fichiers nominatifs sont importés.

## 5. Ce que je n’ai pas pu constater

- Région réelle du projet Supabase et présence des migrations sur cette base.
- Valeurs de production de `EXPO_PUBLIC_STRIPE_LINK`, `STRIPE_PRICE_ID`, `FRONTEND_URL`, `STRIPE_WEBHOOK_SECRET`.
- Le fait que le service Render en ligne exécute bien le `main.py` de `a38ff03`.
- Le contenu du projet Stripe (TVA, factures, coordonnées de facturation).
- Une relecture par un avocat des textes proposés ci-dessus.
