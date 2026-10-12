import { BientotDisponible, EnTete } from "@/components/EnTete";

export const metadata = { title: "Classeurs · Krikrou collection" };

export default function Page() {
  return (
    <>
      <EnTete titre="Classeurs" />
      <BientotDisponible phase="phase 5" />
    </>
  );
}
