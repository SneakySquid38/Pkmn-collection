import { VueClasseur } from "@/components/VueClasseur";

export const metadata = { title: "Binder · Krikrou collection" };

export default async function Binder({ params, searchParams }: PageProps<"/binders/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <VueClasseur id={id} sp={sp} sorte="binder" />;
}
