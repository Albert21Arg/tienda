import { KeyRound } from "lucide-react";
import { AdminPasswordChangeForm } from "@/components/admin-password-change-form";

export default function AdminAccountPage() {
  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div><span className="eyebrow">CUENTA Y SEGURIDAD</span><h1>Mi cuenta</h1><p>Actualiza de forma segura la contraseña de acceso al panel.</p></div>
        <KeyRound size={22} aria-hidden="true" />
      </div>
      <AdminPasswordChangeForm />
    </main>
  );
}
