import { createShow } from "@/app/admin/(panel)/shows/actions";
import { ShowForm } from "@/components/admin/show-form";

export const metadata = { title: "Nuevo show · Admin" };

export default function NewShowPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Crear show</h1>
      <ShowForm action={createShow} submitLabel="Crear show" />
    </div>
  );
}
