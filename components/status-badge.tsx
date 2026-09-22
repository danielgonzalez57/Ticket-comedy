import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_LABELS,
  SHOW_STATUS_LABELS,
} from "@/lib/constants";
import type { OrderStatus, ShowStatus } from "@/lib/database.types";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        status === "verified" && "bg-success/15 text-success",
        status === "pending" && "bg-primary/15 text-primary",
        status === "reported" && "bg-amber-500/15 text-amber-500",
        (status === "rejected" || status === "cancelled" || status === "expired") &&
          "bg-destructive/15 text-destructive",
      )}
    >
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ShowStatusBadge({ status }: { status: ShowStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent",
        status === "published" && "bg-success/15 text-success",
        status === "draft" && "bg-secondary text-muted-foreground",
        status === "finished" && "bg-secondary text-muted-foreground",
      )}
    >
      {SHOW_STATUS_LABELS[status]}
    </Badge>
  );
}
