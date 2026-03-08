// ============================================================
// THE GOLDCHAIN — Chain Progress Indicator
// Shows 4-node chain of custody progress with filled/empty dots
// ============================================================

interface BatchNode {
  node_number: number;
  status: string;
}

interface ChainProgressProps {
  nodes: BatchNode[];
  showCount?: boolean;
}

function getNodeColor(nodes: BatchNode[], nodeNumber: number): string {
  const node = nodes.find((n) => n.node_number === nodeNumber);
  if (!node) return "text-gc-border";
  if (node.status === "CONFIRMED") return "text-gc-green";
  if (node.status === "FLAGGED") return "text-gc-red";
  return "text-gc-amber";
}

export function ChainProgress({ nodes, showCount = true }: ChainProgressProps) {
  const confirmedCount = nodes.filter((n) => n.status === "CONFIRMED").length;
  const indicators = [1, 2, 3, 4].map((num) => getNodeColor(nodes, num));

  return (
    <div className="flex gap-1 items-center">
      {indicators.map((color, i) => (
        <span key={i} className={`text-[8px] ${color}`}>
          {color === "text-gc-red" ? "\u2718" : color === "text-gc-border" || color === "text-gc-amber" ? "\u25CB" : "\u25CF"}
        </span>
      ))}
      {showCount && (
        <span className="text-gc-green-dim text-[8px] ml-1">
          {confirmedCount}/4
        </span>
      )}
    </div>
  );
}
