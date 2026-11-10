import { useEffect, useState } from "react";
import type { FormEvent, CSSProperties } from "react";
import { Camera, LockKeyhole, Radio, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/admin/me", { cache: "no-store" })
      .then(response => response.json())
      .then(data => { if (data.authenticated) navigate("/broadcast"); })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const messages: Record<string, string> = {
          invalid_credentials: "Usuário ou senha incorretos.",
          too_many_attempts: "Muitas tentativas. Aguarde 15 minutos.",
          admin_auth_not_configured: "O acesso administrativo ainda não foi configurado no Render.",
        };
        throw new Error(messages[data.error] || "Não foi possível entrar. Tente novamente.");
      }
      setPassword("");
      navigate("/broadcast");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="site-shell home-shell">
      <header className="topbar">
        <span className="wordmark"><span className="wordmark-live">LIVE</span><span className="wordmark-slash">/</span><span>CAM</span></span>
        <span className="topbar-note"><span className="signal-dot" /> acesso restrito</span>
      </header>
      <section className="hero-grid" style={{ alignItems: "center", minHeight: "65vh" }}>
        <div className="hero-copy">
          <p className="eyebrow"><LockKeyhole size={15} /> área administrativa</p>
          <h1>Entre para<br /><em>transmitir.</em></h1>
          <p className="hero-lede">O painel do LiveCam é privado. Somente o administrador pode iniciar e controlar transmissões.</p>
          <form onSubmit={submit} style={{ display: "grid", gap: 14, maxWidth: 390, marginTop: 28 }}>
            <label style={{ display: "grid", gap: 7, fontSize: 13 }}>Usuário
              <input autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} style={fieldStyle} />
            </label>
            <label style={{ display: "grid", gap: 7, fontSize: 13 }}>Senha
              <input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} style={fieldStyle} />
            </label>
            {error && <p role="alert" style={{ color: "#b42318", fontSize: 13 }}>{error}</p>}
            <button type="submit" disabled={loading || checking} className="button button-primary" style={{ justifyContent: "center", border: 0, cursor: "pointer" }}>
              <LockKeyhole size={17} /> {loading ? "Verificando..." : "Entrar"}
            </button>
          </form>
          <p className="hero-caption" style={{ marginTop: 18 }}>Os espectadores continuam acessando somente pelo link da transmissão.</p>
        </div>
        <div className="hero-stage">
          <div className="stage-label"><span className="live-pill"><span className="pulse-dot" /> LIVE/CAM</span><span>ADMIN</span></div>
          <div className="stage-frame"><div className="stage-scanline" /><div className="stage-center-mark"><Camera size={28} strokeWidth={1.4} /><span>painel<br />protegido</span></div><div className="stage-corner stage-corner-tl" /><div className="stage-corner stage-corner-br" /></div>
          <div className="stage-meta"><span>acesso privado</span><span>sem gravação</span><span>mobile ready</span></div>
        </div>
      </section>
      <footer className="home-footer"><span>LIVE/CAM — transmissão sem ruído</span><span className="footer-secure"><ShieldCheck size={15} /> espectadores por link público</span><span><Radio size={15} /> até 5 espectadores</span></footer>
    </main>
  );
}

const fieldStyle: CSSProperties = {
  width: "100%", minHeight: 46, border: "1px solid #d0d5dd", borderRadius: 8,
  padding: "10px 12px", background: "#fff", color: "#101828", font: "inherit",
};
