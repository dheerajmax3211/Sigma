import Link from "next/link";

/**
 * A 404 with a way forward. The default error page told you the page was missing
 * and offered nothing else — a dead end wearing a neutral face.
 */
export default function NotFound() {
  const suggestions = [
    ["/", "Curriculum", "Every topic, in order"],
    ["/search", "Search", "Find it by name"],
    ["/tracks", "Tracks", "Nine tracks, fourteen to fifteen topics each"],
  ] as const;

  return (
    <div className="mx-auto max-w-3xl px-5 py-20">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-dimmer">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-fg">That page does not exist</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-dim">
        The link may be old, or the topic may have been renamed. Nothing is lost — everything is
        still reachable from here.
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        {suggestions.map(([href, label, hint]) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border border-line bg-surface-1 px-4 py-3 transition hover:border-line-2"
          >
            <span className="block text-[13.5px] font-semibold text-fg">{label}</span>
            <span className="mt-0.5 block text-[11.5px] text-ink-dimmer">{hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
