import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SymbolDrawer } from "@/components/SymbolDrawer";
import { MascotAssistant } from "@/components/MascotAssistant";
import { AiStatusPill } from "@/components/AiStatusPill";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = {
  title: {
    default: "Sigma — AI, ML & Deep Learning Mastery",
    template: "%s · Sigma",
  },
  description:
    "A local-first mastery platform for AI, machine learning and deep learning: rigorous derivations, from-scratch implementations, deterministic analysis, and a Socratic coach that works offline.",
  applicationName: "Sigma",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    title: "Sigma — AI, ML & Deep Learning Mastery",
    description:
      "Rigorous derivations, from-scratch implementations and a Socratic coach that runs on your machine. No account, no cloud.",
    siteName: "Sigma",
  },
  twitter: {
    card: "summary",
    title: "Sigma — AI, ML & Deep Learning Mastery",
    description:
      "Rigorous derivations, from-scratch implementations and a local Socratic coach.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="min-h-screen antialiased">
        {/* Keyboard users land here first; without it the only way past an
            eight-link header is to tab through all eight on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-bg"
        >
          Skip to content
        </a>
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md">
            <div className="relative mx-auto flex h-14 max-w-[1800px] items-center gap-3 px-4 sm:px-5">
              <a href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="Sigma home">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/15 font-mono text-[13px] font-bold text-brand ring-1 ring-brand/30">
                  ∑
                </span>
                <span className="font-mono text-[13px] font-bold tracking-tight text-fg">
                  Sigma
                </span>
              </a>
              <SiteNav />
              <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2">
                <AiStatusPill />
                <span
                  className="hidden items-center gap-1.5 rounded-full border border-line bg-surface-1 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-dim xl:flex"
                  title="All state is stored locally in SQLite. No account, no cloud."
                >
                  <span className="h-1.5 w-1.5 rounded-sm bg-brand shadow-[0_0_8px_rgba(28,214,172,0.7)]" />
                  local-first
                </span>
              </div>
            </div>
          </header>
          <main id="main" className="flex-1">
            {children}
          </main>
          {/* Global layers: the symbol dictionary (bottom-left) and the local
              AI mascot (bottom-right). Mounted here so they exist on every page. */}
          <SymbolDrawer />
          <MascotAssistant />
        </div>
      </body>
    </html>
  );
}
