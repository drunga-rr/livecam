import { ArrowUpRight, Camera, Link2, Radio, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

const steps = [
  { number: "01", title: "Ative sua câmera", body: "Autorize câmera e microfone direto do celular." },
  { number: "02", title: "Coloque no ar", body: "Inicie a live com um toque e veja o preview." },
  { number: "03", title: "Compartilhe", body: "Envie o link para quem precisa assistir." },
];

export default function Home() {
  return (
    <main className="site-shell home-shell">
      <header className="topbar">
        <Link href="/" className="wordmark" aria-label="LiveCam, início">
          <span className="wordmark-live">LIVE</span><span className="wordmark-slash">/</span><span>CAM</span>
        </Link>
        <span className="topbar-note"><span className="signal-dot" /> ao vivo, sem arquivo</span>
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow"><Radio size={15} /> transmissão pública por link</p>
          <h1>Coloque sua câmera<br /><em>no ar.</em></h1>
          <p className="hero-lede">Uma live simples, direta e sem login. Abra no celular, compartilhe o link e deixe o público chegar.</p>
          <div className="hero-actions">
            <Link href="/broadcast" className="button button-primary"><Camera size={18} /> Começar transmissão <ArrowUpRight size={17} /></Link>
            <span className="hero-caption">1 transmissor · até 5 espectadores</span>
          </div>
        </div>
        <div className="hero-stage" aria-label="Prévia visual do fluxo de transmissão">
          <div className="stage-label"><span className="live-pill"><span className="pulse-dot" /> AO VIVO</span><span>CAM 01</span></div>
          <div className="stage-frame">
            <div className="stage-scanline" />
            <div className="stage-center-mark"><Camera size={28} strokeWidth={1.4} /><span>seu vídeo<br />entra aqui</span></div>
            <div className="stage-corner stage-corner-tl" /><div className="stage-corner stage-corner-br" />
          </div>
          <div className="stage-meta"><span>sem gravação</span><span>conexão direta</span><span>mobile ready</span></div>
        </div>
      </section>

      <section className="steps-section">
        <div className="section-heading"><p className="eyebrow">fluxo limpo</p><h2>Do celular para o público<br /><span>em poucos segundos.</span></h2></div>
        <div className="steps-list">
          {steps.map(step => <div className="step-row" key={step.number}><span className="step-number">{step.number}</span><div><h3>{step.title}</h3><p>{step.body}</p></div><ArrowUpRight className="step-arrow" size={18} /></div>)}
        </div>
      </section>

      <footer className="home-footer"><span>LIVE/CAM — transmissão sem ruído</span><span className="footer-secure"><ShieldCheck size={15} /> seu vídeo não é armazenado</span><Link href="/broadcast"><Link2 size={15} /> criar link público</Link></footer>
    </main>
  );
}
