"use client";

import { AlertTriangle } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h2 className="mt-4 font-display text-xl font-bold text-foreground">
        Unable to load dashboard data
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {error.message ||
          "A database or server error occurred while loading this page."}
      </p>
      <div className="mt-6 flex justify-center">
        <Button onClick={reset}>Try again</Button>
      </div>
    </Card>
  );
}
