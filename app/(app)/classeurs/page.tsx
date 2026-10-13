import { redirect } from "next/navigation";
import { ListeClasseurs } from "@/components/ListeClasseurs";

export const metadata = { title: "Classeurs · Krikrou collection" };

export default async function Classeurs({ searchParams }: PageProps<"/classeurs">) {
  const params = await searchParams;
  const membre = typeof params.membre === "string" ? params.membre : null;
  // Ancienne adresse des binders (avant qu'ils aient leur propre menu).
  if (params.vue === "binders") redirect(membre ? `/binders?membre=${encodeURIComponent(membre)}` : "/binders");
  return <ListeClasseurs sorte="classeur" membreDemande={membre} />;
}
