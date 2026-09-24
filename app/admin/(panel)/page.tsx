import Link from "next/link";
import { ChevronRight, Plus, ScanLine } from "lucide-react";
import { getDashboardData } from "@/lib/queries";
import { PendingOrdersTable } from "@/components/admin/pending-orders-table";
import { RevenueTrendChart } from "@/components/admin/revenue-trend-chart";
import { HorizontalBarChart } from "@/components/admin/horizontal-bar-chart";
import { OccupancyChart } from "@/components/admin/occupancy-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { pendingOrders, revenueByShow, occupancyByShow, revenueTrend } =
    await getDashboardData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <Link
          href="/admin/shows/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Nuevo show
        </Link>
      </div>

      {/* Phones are used at the door — put the scanner one tap away. */}
      <Link
        href="/admin/validate"
        className="flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/10 p-4 transition-colors active:bg-primary/20 md:hidden"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ScanLine className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Validar entradas</span>
          <span className="block text-sm text-muted-foreground">
            Escanea el QR en la puerta
          </span>
        </span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Ventas — últimos 14 días</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={revenueTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Ganancias por show</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart
              data={revenueByShow.map((r) => ({ label: r.show, value: r.revenue }))}
              emptyLabel="Todavía no hay ventas confirmadas."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Ocupación por show</CardTitle>
          </CardHeader>
          <CardContent>
            <OccupancyChart data={occupancyByShow} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Órdenes por atender (
            <span className="text-highlight">{pendingOrders.length}</span>)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PendingOrdersTable orders={pendingOrders} />
        </CardContent>
      </Card>
    </div>
  );
}
