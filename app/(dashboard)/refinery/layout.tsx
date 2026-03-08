import { DashboardShell } from "@/components/layout/DashboardShell";

export default function RefineryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
