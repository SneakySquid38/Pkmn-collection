import { Suspense } from "react";
import { BandeauHorsLigne, CopieHorsLigne } from "@/components/HorsLigne";
import { Navigation } from "@/components/Navigation";

export default function LayoutApplication({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1">
      <Navigation />
      <main className="min-w-0 flex-1 px-4 pt-[max(env(safe-area-inset-top),18px)] pb-28 lg:px-8 lg:pt-7 lg:pb-8">
        <BandeauHorsLigne />
        <Suspense>
          <CopieHorsLigne />
        </Suspense>
        {children}
      </main>
    </div>
  );
}
