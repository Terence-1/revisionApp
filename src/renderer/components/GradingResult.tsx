import type { GradeResult } from "../types/index.js";

interface Props {
  result: GradeResult;
}

const scoreLabels = [
  "Blackout",
  "Wrong",
  "Partial",
  "Good",
  "Perfect",
];

const scoreDescriptions = [
  "Completely incorrect or no answer",
  "Mostly wrong, tiny element correct",
  "Partially correct, missing key parts",
  "Correct with minor issues",
  "Perfect or near-perfect answer",
];

export default function GradingResult({ result }: Props) {
  const score = Math.max(0, Math.min(4, Math.round(result.score)));

  return (
    <div
      className="p-4 rounded-lg mb-6"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs uppercase tracking-wider font-medium" style={{ color: "var(--text-muted)" }}>
          AI Grade
        </span>
        <div className="flex items-center gap-2">
          {/* Score dots */}
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: "10px",
                  height: "10px",
                  backgroundColor: i <= score ? scoreColor(score) : "var(--border)",
                }}
              />
            ))}
          </div>
          <span
            className="text-sm font-bold"
            style={{ color: scoreColor(score) }}
          >
            {score}/4 - {scoreLabels[score]}
          </span>
        </div>
      </div>
      <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
        {scoreDescriptions[score]}
      </p>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {result.feedback}
      </p>
    </div>
  );
}

function scoreColor(score: number): string {
  const colors = [
    "var(--danger)",    // 0
    "#fb923c",         // 1
    "var(--warning)",   // 2
    "#a3e635",         // 3
    "var(--success)",   // 4
  ];
  return colors[score] || "var(--text-muted)";
}
