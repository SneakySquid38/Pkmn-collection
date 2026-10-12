import { BientotDisponible, EnTete } from "@/components/EnTete";

export const metadata = { title: "Recherche · Krikrou collection" };

export default function Page() {
  return (
    <>
      <EnTete titre="Recherche" />
      <BientotDisponible phase="phase 2" />
    </>
  );
}
