"use client";

import { useActionState } from "react";
import { seConnecter, type EtatConnexion } from "./actions";

export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState<EtatConnexion, FormData>(seConnecter, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        E-mail
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-12 rounded-2xl border border-ligne bg-surface px-4 text-base font-medium outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Mot de passe
        <input
          name="mot_de_passe"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-2xl border border-ligne bg-surface px-4 text-base font-medium outline-none focus:border-accent"
        />
      </label>
      {etat.erreur && (
        <p role="alert" className="text-sm font-semibold text-terracotta">
          {etat.erreur}
        </p>
      )}
      <button
        type="submit"
        disabled={enCours}
        className="mt-2 h-13 rounded-2xl bg-accent text-base font-bold text-[#1f1814] disabled:opacity-60"
      >
        {enCours ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
