import { DashboardShell } from "@/components/layout/DashboardShell";

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
