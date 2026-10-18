import type { ReactNode } from 'react';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import './legal.css';

/*
  The privacy policy (/privacy) and the terms (/terms): what the site keeps, who else handles it,
  how to have it erased, and what is asked of those who write here. They say what worker/index.ts
  and the pages really do; when one changes, so must the other. Plain words, not legal advice.
*/

const CONTACT = 'incipit.library.co@gmail.com';
const UPDATED: L = { en: '17 October 2026', fr: '17 octobre 2026' };

interface Part {
  title: L;
  body?: L[];
  items?: L[];
  after?: L[];
}

interface Doc {
  title: L;
  lead: L;
  parts: Part[];
}

const TEXT = {
  eyebrow: { en: 'The small print', fr: 'Les petits caractères' },
  updated: { en: 'Last updated', fr: 'Dernière mise à jour' },
  privacy: { en: 'Privacy policy', fr: 'Politique de confidentialité' },
  terms: { en: 'Terms of use', fr: 'Conditions d’utilisation' },
  contact: { en: 'Write to', fr: 'Écrire à' },
} satisfies Record<string, L>;

const PRIVACY: Doc = {
  title: TEXT.privacy,
  lead: {
    en: 'Incipit is a small personal website for finding books by mood and reading the ones that are out of copyright. It shows no advertising, runs no analytics and sets no tracking cookies. This page says what it keeps about you, who else handles it, and how to have it erased.',
    fr: 'Incipit est un petit site personnel pour trouver des livres selon l’humeur et lire ceux qui sont dans le domaine public. Il n’affiche aucune publicité, n’utilise aucun outil d’analyse et ne dépose aucun cookie de suivi. Cette page dit ce qu’il garde sur vous, qui d’autre y a accès, et comment tout faire effacer.',
  },
  parts: [
    {
      title: { en: 'What stays on your device', fr: 'Ce qui reste sur votre appareil' },
      body: [
        {
          en: 'Your notebook (the passages you mark, your notes, the places and bookmarks), the theme and language you chose, and your library card are kept in your browser’s own storage. The site sets no cookies.',
          fr: 'Votre carnet (les passages marqués, vos notes, les lieux et les signets), le thème et la langue choisis, et votre carte de lecteur sont gardés dans le stockage de votre navigateur. Le site ne dépose aucun cookie.',
        },
      ],
    },
    {
      title: { en: 'What is kept on the server, only if you ask for it', fr: 'Ce qui est gardé sur le serveur, seulement si vous le demandez' },
      body: [
        {
          en: 'If you take a library card or make an account, this is kept:',
          fr: 'Si vous prenez une carte de lecteur ou créez un compte, ceci est gardé :',
        },
      ],
      items: [
        {
          en: 'Your notebook, copied so that it follows you to your other devices. It is shown to no one else. As with any host, the person who runs the site has access to the database that holds it.',
          fr: 'Votre carnet, copié pour qu’il vous suive sur vos autres appareils. Il n’est montré à personne d’autre. Comme pour tout hébergement, la personne qui tient le site a accès à la base de données qui le contient.',
        },
        {
          en: 'Your library card: a random code. A fingerprint of it is kept, and the code itself only in encrypted form.',
          fr: 'Votre carte de lecteur : un code aléatoire. Une empreinte en est gardée, et le code lui-même seulement chiffré.',
        },
        {
          en: 'Your account: a name, which everyone can see beside what you write; an email address, which no one else sees; and a password, kept only in scrambled form. If you sign in with Google, also the identifier Google gives us for your Google account.',
          fr: 'Votre compte : un nom, que tout le monde voit près de ce que vous écrivez ; une adresse e-mail, que personne d’autre ne voit ; et un mot de passe, gardé seulement sous forme brouillée. Si vous vous connectez avec Google, aussi l’identifiant que Google nous donne pour votre compte Google.',
        },
        {
          en: 'What you choose to publish: reviews, essays (once the keeper of the site has approved them), replies, a short bio, and the passages from public-domain books that you choose to show on your page. These are public.',
          fr: 'Ce que vous choisissez de publier : avis, essais (une fois approuvés par la personne qui tient le site), réponses, une courte présentation, et les passages de livres du domaine public que vous choisissez d’afficher sur votre page. Cela est public.',
        },
      ],
      after: [
        {
          en: 'To stop automated abuse, the site counts requests each day for each internet address, using a fingerprint of the address that changes daily. The address itself is not stored by the site. The host, Cloudflare, may keep ordinary technical logs (address, time, page asked for) as its own policies describe.',
          fr: 'Pour empêcher les abus automatisés, le site compte chaque jour les requêtes de chaque adresse internet, à l’aide d’une empreinte de l’adresse qui change tous les jours. Le site ne garde pas l’adresse elle-même. L’hébergeur, Cloudflare, peut garder des journaux techniques ordinaires (adresse, heure, page demandée), comme le décrivent ses propres règles.',
        },
      ],
    },
    {
      title: { en: 'Signing in with Google', fr: 'Se connecter avec Google' },
      body: [
        {
          en: 'If you choose “Continue with Google”, Google tells Incipit your email address and an identifier for your Google account, and that you signed in. Incipit asks for nothing else: no contacts, no calendar, no files, no access to your Google account after you have signed in.',
          fr: 'Si vous choisissez « Continuer avec Google », Google indique à Incipit votre adresse e-mail et un identifiant de votre compte Google, et que vous vous êtes connecté. Incipit ne demande rien d’autre : ni contacts, ni agenda, ni fichiers, aucun accès à votre compte Google une fois connecté.',
        },
        {
          en: 'They are used only to sign you in, and to send you a letter if you ask for a new password. They are not sold, not shared, and not used for advertising. Incipit’s use of information received from Google follows the Google API Services User Data Policy, including its Limited Use requirements.',
          fr: 'Elles servent seulement à vous connecter, et à vous envoyer une lettre si vous demandez un nouveau mot de passe. Elles ne sont ni vendues, ni partagées, ni utilisées pour de la publicité. L’usage par Incipit des informations reçues de Google respecte la politique de Google sur les données utilisateur des services d’API, y compris ses exigences d’utilisation limitée.',
        },
      ],
    },
    {
      title: { en: 'Who else handles your data', fr: 'Qui d’autre traite vos données' },
      items: [
        {
          en: 'Cloudflare hosts the site and its database.',
          fr: 'Cloudflare héberge le site et sa base de données.',
        },
        {
          en: 'Google supplies the sign-in button, if you use it, and the typefaces. Your browser contacts Google’s servers to load them, which shows Google your internet address.',
          fr: 'Google fournit le bouton de connexion, si vous l’utilisez, et les caractères typographiques. Votre navigateur contacte les serveurs de Google pour les charger, ce qui montre votre adresse internet à Google.',
        },
        {
          en: 'Brevo sends the letter that sets a new password, so it receives your email address and that letter.',
          fr: 'Brevo envoie la lettre qui permet de choisir un nouveau mot de passe ; il reçoit donc votre adresse e-mail et cette lettre.',
        },
      ],
      after: [{ en: 'Nothing is sold, and nothing is given to anyone to advertise with.', fr: 'Rien n’est vendu, et rien n’est donné à quiconque pour faire de la publicité.' }],
    },
    {
      title: { en: 'Keeping and erasing', fr: 'Conserver et effacer' },
      body: [
        {
          en: 'What is kept stays until you erase it. On the Sign in page, under “The library card behind your account”, “Erase the card and its copy” deletes your account, the copy of your notebook, your reviews, your essays and your replies from the server. The notebook in your browser stays with you.',
          fr: 'Ce qui est gardé le reste jusqu’à ce que vous l’effaciez. Sur la page de connexion, sous « La carte de lecteur derrière votre compte », « Effacer la carte et sa copie » supprime du serveur votre compte, la copie de votre carnet, vos avis, vos essais et vos réponses. Le carnet de votre navigateur reste avec vous.',
        },
        {
          en: 'You can also ask for a copy of what is kept about you, for a correction, or for erasure, by writing to the address below. A link that sets a new password works once, for thirty minutes.',
          fr: 'Vous pouvez aussi demander une copie de ce qui est gardé sur vous, une correction ou l’effacement, en écrivant à l’adresse ci-dessous. Un lien qui permet de choisir un nouveau mot de passe ne fonctionne qu’une fois, pendant trente minutes.',
        },
      ],
    },
    {
      title: { en: 'Changes', fr: 'Modifications' },
      body: [{ en: 'If this page changes, the date at the top changes with it.', fr: 'Si cette page change, la date en haut change avec elle.' }],
    },
  ],
};

const TERMS: Doc = {
  title: TEXT.terms,
  lead: {
    en: 'Incipit is a personal project, free to use. By using it, or by making an account, you accept these few terms.',
    fr: 'Incipit est un projet personnel, gratuit. En l’utilisant, ou en créant un compte, vous acceptez ces quelques conditions.',
  },
  parts: [
    {
      title: { en: 'Using Incipit', fr: 'Utiliser Incipit' },
      body: [
        {
          en: 'The site helps you find books and read the ones that are out of copyright. For the others it says what the book is like and points to a library or a bookshop; it does not offer them. Its descriptions and moods are its keeper’s own judgement, not a guarantee that you will like a book.',
          fr: 'Le site vous aide à trouver des livres et à lire ceux qui sont dans le domaine public. Pour les autres, il dit à quoi ressemble le livre et indique une bibliothèque ou une librairie ; il ne les propose pas. Ses descriptions et ses humeurs sont le jugement de la personne qui le tient, non la garantie que vous aimerez un livre.',
        },
      ],
    },
    {
      title: { en: 'Your account', fr: 'Votre compte' },
      body: [
        {
          en: 'An account is for one person. Keep your password and your library card code to yourself: you are responsible for what is done with them. Your name is shown beside what you write, so do not take someone else’s. You can erase your account at any time (see the privacy policy).',
          fr: 'Un compte est pour une seule personne. Gardez pour vous votre mot de passe et le code de votre carte de lecteur : vous êtes responsable de ce qui en est fait. Votre nom est montré près de ce que vous écrivez ; ne prenez pas celui de quelqu’un d’autre. Vous pouvez effacer votre compte à tout moment (voir la politique de confidentialité).',
        },
      ],
    },
    {
      title: { en: 'What you write', fr: 'Ce que vous écrivez' },
      body: [
        {
          en: 'Your reviews, essays and replies remain yours. By publishing them here you let Incipit show them on the site, for as long as you leave them there; you can delete them at any time. An approved essay may also appear in search engines.',
          fr: 'Vos avis, essais et réponses restent les vôtres. En les publiant ici, vous autorisez Incipit à les montrer sur le site, tant que vous les y laissez ; vous pouvez les supprimer à tout moment. Un essai approuvé peut aussi apparaître dans les moteurs de recherche.',
        },
        { en: 'Please do not post:', fr: 'Merci de ne pas publier :' },
      ],
      items: [
        { en: 'anything hateful, threatening, harassing, or unlawful, or spam;', fr: 'rien de haineux, de menaçant, de harcelant ou d’illégal, ni de pourriel ;' },
        { en: 'words you have no right to share. The passages you show on your page can only come from books out of copyright.', fr: 'des mots que vous n’avez pas le droit de partager. Les passages que vous montrez sur votre page ne peuvent venir que de livres du domaine public.' },
      ],
      after: [
        {
          en: 'The keeper of the site reads each essay before it appears, and may remove anything, or close an account, that breaks these terms.',
          fr: 'La personne qui tient le site lit chaque essai avant qu’il paraisse, et peut retirer tout contenu, ou fermer un compte, qui ne respecte pas ces conditions.',
        },
      ],
    },
    {
      title: { en: 'Books and copyright', fr: 'Livres et droit d’auteur' },
      body: [
        {
          en: 'The texts offered to read come from Project Gutenberg and Standard Ebooks and are out of copyright. If you believe something here infringes your rights, write to the address below and it will be looked at promptly.',
          fr: 'Les textes proposés à la lecture viennent de Project Gutenberg et de Standard Ebooks et sont dans le domaine public. Si vous pensez que quelque chose ici porte atteinte à vos droits, écrivez à l’adresse ci-dessous : cela sera examiné sans tarder.',
        },
      ],
    },
    {
      title: { en: 'No guarantees', fr: 'Sans garantie' },
      body: [
        {
          en: 'The site is offered as it is. It may change, be unavailable, or close. Your notebook is copied to the server when you have an account, but keep your own copy of anything you cannot lose. As far as the law allows, the keeper is not liable for losses from using the site.',
          fr: 'Le site est proposé tel quel. Il peut changer, être indisponible ou fermer. Votre carnet est copié sur le serveur si vous avez un compte, mais gardez votre propre copie de ce que vous ne pouvez pas perdre. Dans la mesure permise par la loi, la personne qui tient le site n’est pas responsable des pertes liées à son usage.',
        },
      ],
    },
    {
      title: { en: 'Changes', fr: 'Modifications' },
      body: [{ en: 'If these terms change, the date at the top changes with them.', fr: 'Si ces conditions changent, la date en haut change avec elles.' }],
    },
  ],
};

function Legal({ doc, other }: { doc: Doc; other: { id: 'privacy' | 'terms'; label: L } }) {
  const { tl } = useI18n();
  useQuickLoader();
  const para = (text: L, key: number): ReactNode => <p key={key}>{tl(text)}</p>;
  return (
    <div className="legal">
      <PageHeader />
      <main className="legal-body">
        <article>
          <p className="page-eyebrow">{tl(TEXT.eyebrow)}</p>
          <h1>{tl(doc.title)}</h1>
          <p className="legal-updated">
            {tl(TEXT.updated)}: {tl(UPDATED)}
          </p>
          <p className="legal-lead">{tl(doc.lead)}</p>
          {doc.parts.map((part) => (
            <section key={part.title.en}>
              <h2>{tl(part.title)}</h2>
              {part.body?.map(para)}
              {part.items && (
                <ul>
                  {part.items.map((item, at) => (
                    <li key={at}>{tl(item)}</li>
                  ))}
                </ul>
              )}
              {part.after?.map(para)}
            </section>
          ))}
          <p className="legal-contact">
            {tl(TEXT.contact)} <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
          <p className="legal-other">
            <a href={pageUrl(other.id)}>{tl(other.label)} →</a>
          </p>
        </article>
      </main>
    </div>
  );
}

export function Privacy() {
  return <Legal doc={PRIVACY} other={{ id: 'terms', label: TEXT.terms }} />;
}

export function Terms() {
  return <Legal doc={TERMS} other={{ id: 'privacy', label: TEXT.privacy }} />;
}
