import { QrScanner } from "@/components/admin/qr-scanner";

export const metadata = { title: "Validar entradas · Admin" };

export default function ValidatePage() {
  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Validar entradas</h1>
        <p className="text-sm text-muted-foreground">
          Apunta la cámara al QR del cliente en la puerta.
        </p>
      </div>
      <QrScanner />
    </div>
  );
}
