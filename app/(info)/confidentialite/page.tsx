import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Confidentialité · Krikrou collection" };

export default function Confidentialite() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p>
        Krikrou collection est un site privé, sans publicité ni statistiques, qui sert à
        cataloguer nos cartes Pokémon. Il est réservé à quelques personnes invitées par {LEGAL.editeur}.
        Mise à jour : {LEGAL.miseAJour}.
      </p>

      <h2>Qui est responsable</h2>
      <p>
        {LEGAL.editeur}, qui a créé et administre le site. Contact pour toute question ou demande
        sur vos données : <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>.
      </p>

      <h2>Données utilisées et pourquoi</h2>
      <table>
        <thead>
          <tr><th>Données</th><th>À quoi elles servent</th><th>Base légale</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Adresse e-mail, mot de passe (stocké chiffré, illisible même pour l&apos;administrateur), prénom affiché</td>
            <td>Créer votre compte et vous connecter</td>
            <td>Exécution du service que vous avez demandé</td>
          </tr>
          <tr>
            <td>Vos cartes : collection, quantités, état, gradation, prix et date d&apos;achat, liste d&apos;envies, classeurs</td>
            <td>Afficher et organiser votre collection</td>
            <td>Exécution du service que vous avez demandé</td>
          </tr>
          <tr>
            <td>Adresse IP, date et heure des requêtes (journaux techniques des hébergeurs)</td>
            <td>Faire fonctionner et sécuriser le site</td>
            <td>Intérêt légitime : la sécurité du site</td>
          </tr>
        </tbody>
      </table>
      <p>Aucune donnée n&apos;est vendue, utilisée pour de la publicité ni analysée à des fins statistiques.</p>

      <h2>Qui peut voir vos données</h2>
      <ul>
        <li>Vous, pour toutes vos données.</li>
        <li>
          Les autres membres du site peuvent consulter votre prénom, votre collection, votre liste
          d&apos;envies et vos classeurs, sans pouvoir les modifier. Personne d&apos;autre que vous ne peut les modifier.
        </li>
        <li>{LEGAL.editeur}, en tant qu&apos;administrateur, pour la maintenance et pour répondre à vos demandes.</li>
        <li>
          Les prestataires techniques qui hébergent le site, uniquement pour le faire fonctionner :
          Supabase (base de données et connexion, serveurs à Paris) et Vercel (hébergement des pages,
          traitements configurés à Paris). Ces sociétés peuvent accéder ponctuellement à des données depuis
          l&apos;extérieur de l&apos;Union européenne, notamment pour le support et la sécurité, avec les
          garanties prévues par le RGPD (clauses contractuelles types de la Commission européenne, et
          certification Data Privacy Framework pour Vercel).
        </li>
      </ul>

      <h2>Images des cartes</h2>
      <p>
        Les images des cartes sont affichées directement depuis les sites qui les publient (TCGdex,
        pokemon-card.com, pokemonkorea.co.kr, asia.pokemon-card.com). Pour les afficher, votre navigateur
        contacte ces sites, qui reçoivent alors votre adresse IP, comme pour toute image sur le web.
        Le site ne leur transmet aucune autre information.
      </p>

      <h2>Cookies</h2>
      <p>Le site utilise uniquement des cookies nécessaires à son fonctionnement, sans consentement préalable à recueillir :</p>
      <ul>
        <li>les cookies de connexion Supabase (préfixe <code>sb-</code>), qui vous gardent connecté et disparaissent à la déconnexion ;</li>
        <li>le cookie <code>theme</code>, qui retient le thème clair ou sombre choisi, pendant un an au plus.</li>
      </ul>
      <p>Aucun cookie de mesure d&apos;audience, de publicité ou de réseau social.</p>

      <h2>Combien de temps</h2>
      <ul>
        <li>Compte et collection : tant que le compte existe. Un compte sans connexion depuis 3 ans est supprimé.</li>
        <li>
          À la suppression du compte, l&apos;e-mail, le prénom, la collection, les envies et les classeurs sont
          effacés immédiatement et définitivement. Les copies de sauvegarde et journaux techniques des hébergeurs
          disparaissent ensuite selon leurs propres cycles courts.
        </li>
        <li>Cookie de thème : un an au plus.</li>
      </ul>

      <h2>Vos droits</h2>
      <p>
        Vous pouvez accéder à vos données, les faire corriger ou effacer, vous opposer à leur utilisation,
        en limiter l&apos;usage et les récupérer dans un format lisible. Dans le site, la page « Plus » permet
        de télécharger toutes vos données. Pour une correction ou la suppression de votre compte, écrivez à{" "}
        <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a> : la demande est traitée sous un mois au plus.
      </p>
      <p>
        Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la CNIL
        (<a href="https://www.cnil.fr/fr/plaintes" rel="noreferrer">cnil.fr/fr/plaintes</a>).
      </p>

      <h2>Sécurité</h2>
      <p>
        Connexion chiffrée (HTTPS), mots de passe hachés, inscriptions fermées, et règles d&apos;accès dans la
        base de données qui empêchent un membre de modifier les données d&apos;un autre.
      </p>

      <p><Link href="/mentions-legales">Mentions légales</Link></p>
    </>
  );
}
