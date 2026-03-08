// ============================================================
// THE GOLDCHAIN — Batch Table
// Reusable table with terminal-styled headers and rows
// ============================================================

import { ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

interface BatchTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  minWidth?: string;
}

export function BatchTable<T>({
  columns,
  data,
  rowKey,
  emptyMessage = "No records found.",
  minWidth,
}: BatchTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="text-gc-green-dim text-[11px] py-8 text-center">
        {emptyMessage}
      </div>
    );
  }

  return (
    <table className="w-full text-[10px]" style={minWidth ? { minWidth } : undefined}>
      <thead>
        <tr className="text-gc-green-dim border-b border-gc-border">
          {columns.map((col) => (
            <th
              key={col.key}
              className={`${col.align === "right" ? "text-right" : "text-left"} py-2 px-2 font-normal tracking-[1px]`}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr
            key={rowKey(row)}
            className="border-b border-gc-border/30 hover:bg-gc-green/5 transition-all"
          >
            {columns.map((col) => (
              <td
                key={col.key}
                className={`py-2 px-2 ${col.align === "right" ? "text-right" : ""}`}
              >
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
