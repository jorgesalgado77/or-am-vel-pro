import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AdminLogin from "./AdminLogin";
import AdminDashboard from "./AdminDashboard";

export default function Admin() {
  const [admin, setAdmin] = useState<{ id: string; name: string } | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAdmin(null);
  };

  if (!admin) {
    return <AdminLogin onLogin={(id, name) => setAdmin({ id, name })} />;
  }

  return (
    <AdminDashboard
      adminName={admin.name}
      onLogout={handleLogout}
    />
  );
}
