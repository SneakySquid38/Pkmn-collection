import { redirect } from "next/navigation";

// L'application s'ouvre sur « Ma collection ».
export default function Accueil() {
  redirect("/collection");
}
