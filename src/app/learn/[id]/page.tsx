import { notFound } from "next/navigation";
import { DeckPlayer } from "@/components/deck/DeckPlayer";
import { loadDeck } from "@/lib/decks/load";

export const dynamic = "force-dynamic";

export default async function LearnPage({ params }: { params: Promise<{ id: string }> }) {
  const deck = loadDeck((await params).id);
  if (!deck) notFound();
  return <DeckPlayer deck={deck} />;
}
