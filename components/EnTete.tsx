export function EnTete({ titre, children }: { titre: string; children?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-3">
      <div aria-hidden="true" className="flex size-9 items-center justify-center rounded-xl bg-accent font-titre text-xl font-extrabold text-[#1f1814] lg:hidden">K</div>
      <h1 className="flex-1 font-titre text-[26px] font-extrabold tracking-tight lg:text-3xl">{titre}</h1>
      {children}
    </header>
  );
}

export function BientotDisponible({ phase }: { phase: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ligne bg-surface p-6 text-center text-sm text-encre-douce">
      Cet écran arrive en {phase}.
    </div>
  );
}
