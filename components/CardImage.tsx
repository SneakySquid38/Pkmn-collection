/* eslint-disable @next/next/no-img-element */

// Image d'une carte, chargée directement depuis le site source (TCGdex, pokemon-card.com…).
// Sans image : un cadre au format carte avec la silhouette de Krikrou et la langue.
type Props = {
  src: string | null;
  alt: string; // nom français de la carte
  lang: string; // FR, JP, KR, TC, SC
  prioritaire?: boolean;
};

export function CardImage({ src, alt, lang, prioritaire = false }: Props) {
  if (!src) {
    return (
      <div
        role="img"
        aria-label={`${alt}, image indisponible`}
        className="relative flex aspect-[63/88] w-full flex-col items-center justify-center gap-2 rounded-lg border border-ligne bg-puce p-3"
      >
        <span aria-hidden="true" className="silhouette block aspect-[1734/1833] w-1/2 opacity-40" />
        <span className="text-center text-[11px] font-semibold text-encre-douce">Image indisponible</span>
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-[#1f1814] px-1.5 py-0.5 text-[10px] font-bold text-[#fbf6f0]">{lang}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={245}
      height={342}
      loading={prioritaire ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      className="aspect-[63/88] h-auto w-full rounded-lg bg-puce object-cover"
    />
  );
}
