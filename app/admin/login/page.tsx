import { LoginForm } from "@/components/admin/login-form";
import { Brand } from "@/components/brand";

export const metadata = { title: "Admin · Pinto & Aparte" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <Brand href="/admin" className="justify-center text-lg" />
          <p className="text-sm text-muted-foreground">Panel de administración</p>
        </div>
        <LoginForm redirectTo={redirect ?? "/admin"} />
      </div>
    </div>
  );
}
