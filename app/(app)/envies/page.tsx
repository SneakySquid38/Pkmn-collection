import { BientotDisponible, EnTete } from "@/components/EnTete";

export const metadata = { title: "Envies · Krikrou collection" };

export default function Page() {
  return (
    <>
      <EnTete titre="Envies" />
      <BientotDisponible phase="phase 3" />
    </>
  );
}
