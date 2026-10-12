import Link from "next/link";

// Pages d'information lisibles sans être connecté.
export default function LayoutInfo({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-[max(env(safe-area-inset-top),18px)] pb-12">
      <Link href="/" className="flex h-11 items-center text-sm font-semibold text-encre-douce">
        ← Krikrou collection
      </Link>
      <article className="texte-legal flex flex-col gap-4">{children}</article>
    </main>
  );
}
