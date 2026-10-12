import { LockKeyhole, ShieldCheck } from "lucide-react";
import { AdminPasswordChangeForm } from "@/components/admin-password-change-form";

export default function AdminAccountPage() {
  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div><span className="eyebrow">CUENTA Y SEGURIDAD</span><h1>Mi cuenta</h1><p>Administra tus datos de acceso al panel.</p></div>
      </div>
      <section className="admin-section-card admin-account-card">
        <header className="admin-account-intro">
          <span className="admin-account-icon"><ShieldCheck size={19} /></span>
          <div>
            <span className="eyebrow">PROTEGE TU ACCESO</span>
            <h2>Cambiar contraseña</h2>
            <p>Confirma tu contraseña actual y elige una nueva, segura y fácil de recordar.</p>
          </div>
        </header>
        <AdminPasswordChangeForm />
        <div className="admin-account-note"><LockKeyhole size={14} /><span>Tu contraseña se guarda cifrada y nunca se muestra en pantalla.</span></div>
      </section>
    </main>
  );
}
