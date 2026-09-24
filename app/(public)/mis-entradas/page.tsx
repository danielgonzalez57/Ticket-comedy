import { createClient } from "@/lib/supabase/server";
import { getMyOrders } from "@/lib/queries";
import { CustomerLoginForm } from "@/components/customer-login-form";
import { MyTicketsList } from "@/components/my-tickets-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mis entradas — Pinto & Aparte" };

export default async function MisEntradasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="relative isolate mx-auto flex max-w-sm justify-center py-6 sm:py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 -z-10 size-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />
        <CustomerLoginForm />
      </div>
    );
  }

  const orders = await getMyOrders();
  return <MyTicketsList email={user.email ?? ""} orders={orders} />;
}
