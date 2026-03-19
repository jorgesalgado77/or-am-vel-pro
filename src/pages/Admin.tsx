import { useState } from "react";
import AdminLogin from "./AdminLogin";
import AdminDashboard from "./AdminDashboard";

export default function Admin() {
  const [admin, setAdmin] = useState<{ id: string; name: string } | null>(null);

  if (!admin) {
    return <AdminLogin onLogin={(id, name) => setAdmin({ id, name })} />;
  }

  return (
    <AdminDashboard
      adminName={admin.name}
      onLogout={() => setAdmin(null)}
    />
  );
}
