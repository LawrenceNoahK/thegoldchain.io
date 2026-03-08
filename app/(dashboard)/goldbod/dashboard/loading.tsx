import { DashboardSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <DashboardSkeleton
      command="thegoldchain goldbod --dashboard --all-batches --realtime"
      metricCount={4}
      tableRows={8}
      tableColumns={8}
      tableTitle="ALL.BATCHES.LIVE"
    />
  );
}
