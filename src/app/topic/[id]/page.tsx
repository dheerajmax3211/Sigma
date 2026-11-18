import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { notFound, permanentRedirect } from "next/navigation";
import { getTopic, getContent, CONTENT_ROOT } from "@/lib/content/loader";
import { renderMarkdown } from "@/lib/render/markdown";
import { TopicWorkspace } from "@/components/TopicWorkspace";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return getContent().topics.map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = getTopic(id);
  return {
    title: topic ? `${topic.title} — Sigma` : "Sigma",
    description: topic?.summary,
  };
}

export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step: stepParam } = await searchParams;
  // ?step=0..3 makes a step deep-linkable: it survives a reload, can be shared,
  // and lets the render audit assert every step actually renders.
  const initialStep = Math.min(3, Math.max(0, Number.parseInt(stepParam ?? "0", 10) || 0));
  const moved = (YAML.parse(fs.readFileSync(path.join(CONTENT_ROOT, "redirects.yaml"), "utf8")) as Record<string, string>)[id];
  if (moved) permanentRedirect(`/learn/${moved}`);
  const topic = getTopic(id);
  if (!topic) notFound();

  // The next topic in the same track, by position. Without it the lesson ends
  // with "back to top" and the learner has to navigate back to the curriculum
  // to find out what comes next — the most common place to stop.
  const trackId = topic.trackId;
  const trackTopics = trackId ? getContent().topicsByTrack.get(trackId) ?? [] : [];
  const position = trackTopics.findIndex((t) => t.id === topic.id);
  const sibling = position >= 0 ? trackTopics[position + 1] : undefined;
  const track = trackId ? getContent().tracks.find((t) => t.id === trackId) : undefined;
  const nextTopic = sibling ? { id: sibling.id, title: sibling.title } : undefined;
  const trackHref = track ? `/track/${track.slug ?? track.id}` : undefined;

  // The lesson body is rendered on the server so KaTeX arrives as HTML and
  // there is no client-side math flash on first paint.
  const bodyHtml = renderMarkdown(topic.body.markdown);

  return (
    <TopicWorkspace
      topicId={topic.id}
      title={topic.title}
      summary={topic.summary ?? ""}
      difficulty={topic.difficulty}
      estMinutes={topic.estMinutes}
      bodyHtml={bodyHtml}
      bigIdea={topic.body.big_idea}
      problem={topic.body.problem}
      analogy={topic.body.analogy}
      conceptPoints={topic.body.concept_points}
      definitions={topic.body.definitions}
      diagrams={topic.body.diagrams}
      tryIt={topic.body.try_it}
      interviewQuestions={topic.body.interview_questions}
      commonMistakes={topic.body.common_mistakes}
      furtherReading={topic.body.further_reading}
      initialStep={initialStep}
      nextTopic={nextTopic}
      trackHref={trackHref}
      design={
        topic.body.problem_statement ||
        topic.body.capacity_estimation ||
        topic.body.clarifying_questions.length > 0 ||
        topic.body.deep_dives.length > 0
          ? topic.body
          : undefined
      }
      derivations={topic.body.derivations}
      implementations={topic.body.implementations}
      checkpoints={topic.body.checkpoints}
      problems={topic.body.problems}
      visualizers={topic.body.visualizers}
    />
  );
}
