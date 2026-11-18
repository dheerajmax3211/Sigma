"use client";

import type { Diagram } from "@/lib/content/schema";
import { ArchitectureDiagram } from "./ArchitectureDiagram";
import {
  CompareDiagram,
  CycleDiagram,
  GraphDiagram,
  PipelineDiagram,
  SequenceDiagram,
  StackDiagram,
} from "./BasicDiagrams";
import { CircuitDiagram, MermaidDiagram, PlotDiagram } from "./RenderDiagrams";

/**
 * Diagram dispatcher.
 *
 * Every structured diagram in the corpus renders through here, so a new
 * diagram type is one switch arm and one renderer — no changes to the
 * lesson page, the hint ladder, or the authoring format.
 */
export function DiagramView({ diagram }: { diagram: Diagram }) {
  switch (diagram.type) {
    case "architecture":
      return (
        <ArchitectureDiagram
          title={diagram.title}
          nodes={diagram.nodes}
          edges={diagram.edges}
          caption={diagram.caption}
        />
      );
    case "compare":
      return <CompareDiagram d={diagram} />;
    case "pipeline":
      return <PipelineDiagram d={diagram} />;
    case "stack":
      return <StackDiagram d={diagram} />;
    case "graph":
      return <GraphDiagram d={diagram} />;
    case "cycle":
      return <CycleDiagram d={diagram} />;
    case "sequence":
      return <SequenceDiagram d={diagram} />;
    case "mermaid":
      return <MermaidDiagram d={diagram} />;
    case "circuit":
      return <CircuitDiagram d={diagram} />;
    case "plot":
      return <PlotDiagram d={diagram} />;
    default:
      return null;
  }
}

/** A list of diagrams, rendered in order. */
export function DiagramList({ diagrams }: { diagrams: Diagram[] }) {
  if (diagrams.length === 0) return null;
  return (
    <div className="[&>figure]:my-6">
      {diagrams.map((d, i) => (
        <DiagramView key={i} diagram={d} />
      ))}
    </div>
  );
}
