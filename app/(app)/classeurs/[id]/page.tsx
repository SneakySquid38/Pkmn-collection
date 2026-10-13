import { VueClasseur } from "@/components/VueClasseur";

export const metadata = { title: "Classeur · Krikrou collection" };

export default async function Classeur({ params, searchParams }: PageProps<"/classeurs/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <VueClasseur id={id} sp={sp} sorte="classeur" />;
}
