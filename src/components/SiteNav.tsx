"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The site navigation.
 *
 * Two bugs live here, so it is one component rather than markup in the layout:
 *
 * 1. At 390px every link was `display:none` and there was no menu at all — the
 *    product was unnavigable on a phone. The links now collapse into a drawer
 *    below `lg`, where they previously overflowed the header at 800px.
 * 2. No link ever carried `aria-current`, so assistive tech could not tell you
 *    where you were. The pathname decides it.
 */

const ITEMS: [string, string, string][] = [
  ["/learn", "Learn", "The 8-week path: short interactive lessons, day by day"],
  ["/curriculum", "Deep dives", "The full reference curriculum, topic by topic"],
  ["/roadmap", "My Path", "Milestones, plus what unlocks what"],
  ["/notes", "Case Studies", "How real systems were built, with the arithmetic"],
  ["/lab", "Code Playground", "Write it. Run it."],
  ["/interview", "Mock Interview", "Four rounds, just like the real thing"],
  ["/news", "AI Timeline", "What shipped and when — ready to discuss in any interview"],
  ["/search", "Search", "Find any topic or idea"],
  ["/profile", "Progress", "Streaks, mastery, and interview readiness"],
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on navigation: the drawer is a mode, not a place.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <nav aria-label="Primary" className="hidden items-center gap-1 text-[13px] lg:flex">
        {ITEMS.map(([href, label, hint]) => {
          const active = isActive(pathname, href);
          return (
            <a
              key={href}
              href={href}
              title={hint}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-2.5 py-1.5 transition hover:bg-surface-2 hover:text-fg ${
                active ? "bg-surface-2 text-fg" : "text-ink-dim"
              }`}
            >
              {label}
            </a>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-1 text-fg lg:hidden"
      >
        <span aria-hidden="true" className="font-mono text-[15px] leading-none">
          {open ? "×" : "☰"}
        </span>
      </button>

      {open && (
        <div
          id="mobile-nav"
          className="absolute left-0 right-0 top-full border-b border-line bg-bg/98 backdrop-blur-md lg:hidden"
        >
          <nav aria-label="Primary" className="mx-auto flex max-w-[1800px] flex-col px-3 py-2">
            {ITEMS.map(([href, label, hint]) => {
              const active = isActive(pathname, href);
              return (
                <a
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-3 text-[14px] ${
                    active ? "bg-surface-2 font-semibold text-fg" : "text-ink-dim"
                  }`}
                >
                  <span className="block">{label}</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-dimmer">{hint}</span>
                </a>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
