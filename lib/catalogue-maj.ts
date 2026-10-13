// Pilotage de la mise à jour du catalogue (workflow GitHub « mise-a-jour.yml ») depuis le site.
// Variables Vercel, côté serveur uniquement : GITHUB_TOKEN (jeton à accès limité : ce dépôt,
// « Actions » en lecture et écriture), GITHUB_REPO (« propriétaire/dépôt ») et KRIKROU_ADMIN_ID
// (identifiant du compte autorisé, celui de Hugo).

const WORKFLOW = "mise-a-jour.yml";

export type Execution = {
  id: number;
  mode: "simulation" | "application" | "?";
  etat: "en_attente" | "en_cours" | "reussie" | "echouee" | "annulee";
  debut: string;
  url: string;
};

export function majConfiguree() {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}

export function estAdmin(id: string | null | undefined) {
  return Boolean(id && process.env.KRIKROU_ADMIN_ID && id === process.env.KRIKROU_ADMIN_ID);
}

async function github(chemin: string, init?: RequestInit) {
  const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}${chemin}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`GitHub a répondu ${r.status}`);
  return r;
}

export async function dernieresExecutions(): Promise<Execution[]> {
  const r = await github(`/actions/workflows/${WORKFLOW}/runs?per_page=5`);
  const { workflow_runs } = (await r.json()) as {
    workflow_runs: { id: number; status: string; conclusion: string | null; created_at: string; html_url: string; display_title: string; name: string }[];
  };
  return workflow_runs.map((w) => ({
    id: w.id,
    mode: /application/.test(w.display_title + w.name) ? "application" : /simulation/.test(w.display_title + w.name) ? "simulation" : "?",
    etat:
      w.status !== "completed"
        ? w.status === "in_progress"
          ? "en_cours"
          : "en_attente"
        : w.conclusion === "success"
          ? "reussie"
          : w.conclusion === "cancelled"
            ? "annulee"
            : "echouee",
    debut: w.created_at,
    url: w.html_url,
  }));
}

export async function lancer(mode: "simulation" | "application") {
  await github(`/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { mode } }),
  });
}
