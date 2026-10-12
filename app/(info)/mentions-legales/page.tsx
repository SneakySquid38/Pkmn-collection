import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Mentions légales · Krikrou collection" };

export default function MentionsLegales() {
  return (
    <>
      <h1>Mentions légales</h1>

      <h2>Éditeur</h2>
      <p>
        Site personnel et non commercial, édité par {LEGAL.editeur}, à titre non professionnel.
        Contact : <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>. Conformément à
        l&apos;article 6-III-2 de la loi n° 2004-575 du 21 juin 2004 (LCEN), l&apos;identité complète de
        l&apos;éditeur est connue de l&apos;hébergeur.
      </p>

      <h2>Hébergement</h2>
      <p>
        Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis ·{" "}
        <a href="https://vercel.com" rel="noreferrer">vercel.com</a>
      </p>
      <p>
        Base de données : Supabase Pte. Ltd., Singapour ·{" "}
        <a href="https://supabase.com" rel="noreferrer">supabase.com</a> (serveurs dans la région de Paris).
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Pokémon et les noms, images et illustrations des cartes sont la propriété de Nintendo, Creatures Inc.,
        GAME FREAK inc. et The Pokémon Company. Ce site privé n&apos;est ni affilié, ni approuvé, ni sponsorisé par
        ces sociétés. Les images des cartes sont affichées depuis les sites qui les publient, à des fins de
        catalogage personnel, et ne sont pas copiées sur ce site. La mascotte Krikrou et le reste du site
        appartiennent à leur auteur.
      </p>

      <h2>Données personnelles</h2>
      <p>
        Voir la <Link href="/confidentialite">politique de confidentialité</Link>.
      </p>
    </>
  );
}
