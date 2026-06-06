import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const TRIAL_END = new Date("2026-06-13T11:00:00-05:00").getTime();

function TrialGate() {
  if (Date.now() > TRIAL_END) {
    return (
      <div className="min-h-screen bg-[#f4f1eb] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="bg-orb absolute -left-24 top-20 h-72 w-72 rounded-full bg-cyan-300/35 blur-3xl" />
          <div className="bg-orb-delayed absolute right-0 top-1/3 h-80 w-80 rounded-full bg-emerald-300/30 blur-3xl" />
        </div>
        <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-lg items-center">
          <section className="reveal-up w-full space-y-6 text-center">
            <div className="relative mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-slate-950 text-2xl font-black tracking-tight text-white shadow-xl shadow-slate-950/20">
              <span>SOP</span>
            </div>
            <h2 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Periodo de prueba finalizado</h2>
            <p className="text-base leading-7 text-slate-600">
              Los 7 dias de prueba gratuita han expirado. Contacta al administrador para obtener una licencia completa.
            </p>
            <a
              className="inline-flex rounded-full bg-emerald-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/20"
              href="https://wa.me/5076000000?text=Hola%2C%20deseo%20adquirir%20la%20licencia%20completa%20de%20SOP%20Optica."
              target="_blank"
              rel="noreferrer"
            >
              Contactar por WhatsApp
            </a>
            <p className="text-xs text-slate-400">
              Prueba gratuita del 6 de junio de 2026, 11:00 am al 13 de junio de 2026, 11:00 am.
            </p>
          </section>
        </main>
      </div>
    );
  }
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TrialGate />
  </StrictMode>
);
