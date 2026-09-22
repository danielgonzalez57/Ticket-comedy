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
      <div className="mx-auto max-w-md space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Mis entradas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ingresa el correo con el que compraste. Te enviamos un código para
            entrar, sin contraseña.
          </p>
        </div>
        <CustomerLoginForm />
      </div>
    );
  }

  const orders = await getMyOrders();
  return <MyTicketsList email={user.email ?? ""} orders={orders} />;
}
