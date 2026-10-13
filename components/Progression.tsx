// Barre « possédées / total » d'un classeur.
export function Progression({ possedees, total, grande = false }: { possedees: number; total: number; grande?: boolean }) {
  const pourcent = total ? Math.round((possedees / total) * 100) : 0;
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={possedees}
      aria-label={`${possedees} cartes possédées sur ${total}`}
      className={`block overflow-hidden rounded-full bg-puce ${grande ? "h-2" : "h-1.5"}`}
    >
      <span className="block h-full rounded-full bg-vert" style={{ width: `${pourcent}%` }} />
    </span>
  );
}
