import { ListeClasseurs } from "@/components/ListeClasseurs";

export const metadata = { title: "Binders · Krikrou collection" };

export default async function Binders({ searchParams }: PageProps<"/binders">) {
  const params = await searchParams;
  return <ListeClasseurs sorte="binder" membreDemande={typeof params.membre === "string" ? params.membre : null} />;
}
