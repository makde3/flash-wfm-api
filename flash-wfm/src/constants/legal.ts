export const EMAIL_EDITEUR = 'ymaknatt@mak-consult.fr';

export const EDITEUR =
  'Mak — Entrepreneur Individuel (nom commercial : MakConsult), SIRET 10901660000016, Rue de Chartres, 28300 Champhol, France';

export const MENTION_IMMATRICULATION =
  'Mak — Entrepreneur Individuel (nom commercial : MakConsult), SIRET 10901660000016, Rue de Chartres, 28300 Champhol, France.';

const HEBERGEURS =
  'Hébergement du frontend : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. Hébergement du backend API : Render Services Inc., 525 Brannan St, Suite 300, San Francisco, CA 94107, USA. Authentification et base de données : Supabase Inc., 970 Toa Payoh North #07-04, Singapore 318992.';

export type IdDocumentLegal = 'mentions' | 'cgu' | 'confidentialite';

export const DOCUMENTS_LEGAUX: { id: IdDocumentLegal; lien: string; titre: string; paragraphes: string[] }[] = [
  {
    id: 'mentions',
    lien: 'Mentions légales',
    titre: 'Mentions légales',
    paragraphes: [
      `Éditeur du service Flash WFM : ${EDITEUR}. Contact : ${EMAIL_EDITEUR}.`,
      MENTION_IMMATRICULATION,
      'Flash WFM est un logiciel en ligne (SaaS) de dimensionnement des effectifs, exclusivement réservé aux professionnels. Il sert à prévoir des volumes, calculer un besoin en ETP et restituer un plan de production à partir des données que l’utilisateur importe.',
      HEBERGEURS,
      `Directeur de la publication : l’éditeur, joignable à ${EMAIL_EDITEUR}.`,
    ],
  },
  {
    id: 'cgu',
    lien: 'CGU / CGV',
    titre: 'CGU / CGV',
    paragraphes: [
      `Les présentes conditions régissent l’accès à Flash WFM, service SaaS édité par ${EDITEUR}, exclusivement réservé aux professionnels (B2B) agissant dans le cadre de leur activité professionnelle. L’inscription emporte certification de cette qualité et acceptation de ces conditions ainsi que de la politique de confidentialité. Le droit de rétractation prévu pour les consommateurs particuliers est exclu. Contact : ${EMAIL_EDITEUR}.`,
      'Flash WFM aide à dimensionner une activité : prévision de volumes, calcul d’ETP selon Erlang C et restitution d’un plan. Les résultats sont une aide à la décision. Ils ne constituent pas un engagement d’effectif, de qualité de service ou de performance opérationnelle.',
      'Le Plan Découverte est gratuit, sans carte bancaire et sans limite de durée. Il produit le plan avec le moteur Saisonnalité & Tendances, sur une seule file et sur 7 jours. L’import de l’historique et le calcul Erlang C restent disponibles. Les exports, le multi-files, les moteurs avancés et les horizons au-delà de 7 jours sont réservés au Plan Pro.',
      'Le Plan Pro est proposé à 39 € HT par mois, sans engagement. TVA non applicable, article 293 B du CGI. Il ajoute les moteurs Recommandé (Auto), IA & Machine Learning et Modèle Hybride, le planning des ETP réellement présents, la synthèse exécutive, les exports Excel et PowerPoint, et les ajustements événementiels. Tant que le Plan Pro n’est pas activé, ces fonctions restent verrouillées.',
      'Le Plan Pro se résilie à tout moment, en un clic, depuis le bouton « Gérer mon abonnement » de l’application, qui ouvre le portail client Stripe. La résiliation prend effet à la fin de la période mensuelle en cours. Jusqu’à cette date, l’accès Pro reste ouvert.',
      'L’utilisateur garantit disposer des droits nécessaires sur les fichiers et liens qu’il importe. Il reste responsable de la confidentialité de ses identifiants.',
      'Les données de flux et d’effectifs importées restent la propriété de l’utilisateur. Leur traitement est décrit dans la politique de confidentialité.',
      'MakConsult peut faire évoluer les fonctions, interrompre le service pour maintenance, ou suspendre un accès en cas d’usage abusif. Le contrat est conclu entre professionnels. Le droit français s’applique.',
    ],
  },
  {
    id: 'confidentialite',
    lien: 'Confidentialité & RGPD',
    titre: 'Politique de confidentialité & RGPD',
    paragraphes: [
      `${EDITEUR} est responsable du traitement des données liées au compte et à l’usage de Flash WFM. Contact : ${EMAIL_EDITEUR}.`,
      'Données concernées : l’adresse e-mail du compte, la demande d’accès Pro (e-mail professionnel et entreprise) et les fichiers Excel ou CSV de flux et d’effectifs ETP importés par l’utilisateur.',
      'Les fichiers Excel ou CSV de flux et d’effectifs ETP sont transmis de manière chiffrée (HTTPS) au moteur de calcul. Ils sont traités uniquement en mémoire vive, le temps du calcul, puis écartés. Ils ne sont ni stockés, ni conservés, ni revendus, ni partagés, ni utilisés pour entraîner des modèles externes.',
      'Base du traitement : exécution du service demandé par un utilisateur professionnel. La demande d’accès Pro correspond aux échanges préalables à l’ouverture de cet accès.',
      HEBERGEURS,
      'Les données de compte et, le temps du calcul, les fichiers importés peuvent être traités hors de l’Union européenne par Vercel Inc., Render Services Inc. et Supabase Inc. Ces transferts sont encadrés par les Clauses Contractuelles Types (CCT) de la Commission européenne et, pour les destinataires établis aux États-Unis et certifiés, par le cadre EU-US Data Privacy Framework.',
      'Durée : les données de compte restent associées au compte tant qu’il est ouvert. Les fichiers importés ne sont conservés que le temps du traitement en mémoire vive. La progression enregistrée sur l’appareil peut être effacée dans l’application.',
      `Droits d’accès, de rectification et de suppression intégrale du compte et des données : ils s’exercent depuis l’application, via « Une idée ? », ou par e-mail à ${EMAIL_EDITEUR}. Les droits de limitation, d’opposition et de portabilité s’exercent par les mêmes canaux. Une réclamation peut être adressée à la CNIL.`,
    ],
  },
];
