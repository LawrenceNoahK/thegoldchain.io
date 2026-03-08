import { DashboardSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <DashboardSkeleton
      command="thegoldchain operator --dashboard --batches"
      metricCount={4}
      tableRows={5}
      tableColumns={6}
      tableTitle="MY.BATCHES"
    />
  );
}
