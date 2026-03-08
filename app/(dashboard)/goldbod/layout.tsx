import { DashboardShell } from "@/components/layout/DashboardShell";

export default function GoldbodLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
