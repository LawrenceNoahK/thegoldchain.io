import { DashboardSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <DashboardSkeleton
      command="thegoldchain refinery --intake --pending"
      metricCount={0}
      tableRows={6}
      tableColumns={6}
      tableTitle="REFINERY.INTAKE.QUEUE"
    />
  );
}
