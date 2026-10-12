import { BientotDisponible, EnTete } from "@/components/EnTete";
import { profilConnecte } from "@/lib/profil";

export const metadata = { title: "Ma collection · Krikrou collection" };

export default async function MaCollection() {
  const profil = await profilConnecte();
  const { count } = profil
    ? await profil.supabase.from("collection_items").select("id", { count: "exact", head: true }).eq("user_id", profil.id)
    : { count: 0 };

  return (
    <>
      <EnTete titre="Ma collection" />
      <p className="mb-4 text-encre-douce">
        Salut {profil?.prenom} ! Tu as <strong className="text-encre">{count ?? 0}</strong> carte(s) enregistrée(s).
      </p>
      <BientotDisponible phase="phase 3" />
    </>
  );
}
