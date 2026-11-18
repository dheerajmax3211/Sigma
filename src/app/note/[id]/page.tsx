import { notFound } from "next/navigation";
import { getContent } from "@/lib/content/loader";
import { CaseStudyView } from "@/components/CaseStudyView";

/**
 * A case study / playbook page.
 *
 * This route is deliberately thin: it resolves the note and hands it to the
 * client shell, which owns the tab state, the disclosure state and the
 * capacity calculator. Keeping the fetch here means the note object is still
 * read on the server and validated by the loader, so a malformed YAML file
 * fails at build time rather than halfway through a client render.
 */

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return getContent().notes.map((n) => ({ id: n.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = getContent().notesById.get(id);
  return {
    title: note ? `${note.title} — Sigma` : "Note — Sigma",
    description: note?.summary,
  };
}

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = getContent();
  const note = content.notesById.get(id);
  if (!note) notFound();

  // Only the fields the footer needs cross the client boundary.
  const others = content.notes
    .filter((n) => n.id !== note.id)
    .slice(0, 4)
    .map((n) => ({ id: n.id, title: n.title, kind: n.kind }));

  return <CaseStudyView note={note} others={others} />;
}
