export const EMAIL_EDITEUR = 'ymaknatt@mak-consult.fr';

export const EDITEUR = 'MakConsult, domicilié à Champhol (28300), France';

export const MENTION_IMMATRICULATION =
  'Informations complémentaires et numéro d’immatriculation communiqués sur simple demande à ymaknatt@mak-consult.fr.';

const HEBERGEURS =
  'Hébergement du site : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. Hébergement de l’API de calcul : Render Services Inc., 525 Brannan St, Suite 300, San Francisco, CA 94107, USA. Hébergement des comptes, de l’authentification et des données de compte : Supabase Inc., 970 Toa Payoh North #07-04, Singapore 318992.';

export type IdDocumentLegal = 'mentions' | 'cgu' | 'confidentialite';

export const DOCUMENTS_LEGAUX: { id: IdDocumentLegal; lien: string; titre: string; paragraphes: string[] }[] = [
  {
    id: 'mentions',
    lien: 'Mentions légales',
    titre: 'Mentions légales',
    paragraphes: [
      `Éditeur du service Flash WFM : ${EDITEUR}. Contact : ${EMAIL_EDITEUR}.`,
      MENTION_IMMATRICULATION,
      'Flash WFM est un logiciel en ligne (SaaS) de dimensionnement des effectifs, proposé à des professionnels. Il sert à prévoir des volumes, calculer un besoin en ETP et restituer un plan de production à partir des données que l’utilisateur importe.',
      HEBERGEURS,
      `Directeur de la publication : l’éditeur, joignable à ${EMAIL_EDITEUR}.`,
    ],
  },
  {
    id: 'cgu',
    lien: 'CGU / CGV',
    titre: 'CGU / CGV',
    paragraphes: [
      `Les présentes conditions régissent l’accès à Flash WFM, service SaaS édité par ${EDITEUR}, et proposé à des professionnels. Créer un compte ou utiliser le service vaut acceptation de ces conditions et de la politique de confidentialité. Contact : ${EMAIL_EDITEUR}.`,
      'Flash WFM aide à dimensionner une activité : prévision de volumes, calcul d’ETP selon Erlang C et restitution d’un plan. Les résultats sont une aide à la décision. Ils ne constituent pas un engagement d’effectif, de qualité de service ou de performance opérationnelle.',
      'L’inscription est gratuite. Elle ouvre un essai Pro complet de 48 heures, sans carte bancaire et sans engagement. À l’issue de ces 48 heures, le compte bascule automatiquement sur l’offre Free, gratuite et illimitée dans le temps. Cette offre produit le plan avec le moteur Saisonnalité & Tendances. L’import de l’historique et le calcul Erlang C restent disponibles.',
      'Le plan Pro est une option payante, activée depuis l’application. Il ajoute les moteurs Recommandé (Auto), IA & Machine Learning et Modèle Hybride, le planning des ETP réellement présents, la synthèse exécutive, les exports Excel et PowerPoint, et les ajustements événementiels. Le prix et la périodicité sont indiqués au moment de la commande. Tant que le plan Pro n’est pas activé, ces fonctions restent verrouillées.',
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
      `${EDITEUR}, est responsable du traitement des données liées au compte et à l’usage de Flash WFM. Contact : ${EMAIL_EDITEUR}.`,
      'Données concernées : l’adresse e-mail du compte, la demande d’accès Pro (e-mail professionnel et entreprise) et les fichiers Excel ou CSV de flux et d’effectifs ETP importés par l’utilisateur.',
      'Les fichiers Excel ou CSV de flux et d’effectifs ETP importés servent uniquement au calcul de dimensionnement (Erlang C et prévisions). Ils ne sont ni revendus, ni partagés, ni utilisés pour entraîner des modèles externes.',
      'Base du traitement : exécution du service demandé par un utilisateur professionnel. La demande d’accès Pro correspond aux échanges préalables à l’ouverture de cet accès.',
      HEBERGEURS,
      'Durée : les données de compte restent associées au compte tant qu’il est ouvert. La progression enregistrée sur l’appareil peut être effacée dans l’application.',
      `Droits d’accès, de rectification et de suppression intégrale du compte et des données : ils s’exercent depuis l’application, via « Une idée ? / Feedback », ou par e-mail à ${EMAIL_EDITEUR}. Les droits de limitation, d’opposition et de portabilité s’exercent par les mêmes canaux. Une réclamation peut être adressée à la CNIL.`,
    ],
  },
];
