import type { DeckStats } from "../types/index.js";

interface Props {
  stats: DeckStats;
}

export default function Stats({ stats }: Props) {
  return (
    <div
      className="flex items-center gap-6 mb-6 text-sm"
    >
      <StatItem label="total" value={stats.totalCards} color="var(--text-primary)" />
      <StatItem label="due" value={stats.dueToday} color="var(--accent)" />
      <StatItem label="new" value={stats.newCards} color="var(--info)" />
      <StatItem label="learning" value={stats.learningCards} color="var(--warning)" />
      <StatItem label="mature" value={stats.matureCards} color="var(--success)" />
    </div>
  );
}

function StatItem({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <span>
      <span className="font-semibold" style={{ color }}>{value}</span>
      <span className="ml-1.5" style={{ color: "var(--text-muted)" }}>{label}</span>
    </span>
  );
}
