import { useEffect, useState } from "react";\nimport type { ReactNode } from "react";
import { useLocation } from "wouter";

export default function AdminGate({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/me", { cache: "no-store" })
      .then(response => response.json())
      .then(data => {
        if (!active) return;
        if (data.authenticated) setAllowed(true);
        else navigate("/");
      })
      .catch(() => { if (active) navigate("/"); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [navigate]);

  if (checking || !allowed) return <main className="app-shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>Verificando acesso...</main>;
  return <>{children}</>;
}
