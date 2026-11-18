import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { ContentFileSchema, TopicSchema, CaseStudySchema, InterviewBankSchema, type Topic, type Track, type CaseStudy, type InterviewBankItem } from "./schema";

/**
 * Content loader.
 *
 * Content is authored as YAML under `content/tracks/<track-dir>/topics/*.yaml`
 * and validated at load time against the shared Zod schemas. The loader is
 * deterministic and ordered, so a topic's position in the UI is stable across
 * runs and machines.
 *
 * Track membership comes from the directory name, not from the file body, so
 * moving a file between tracks cannot silently orphan it.
 */

export const CONTENT_ROOT =
  process.env.SIGMA_CONTENT_DIR ?? path.join(process.cwd(), "content");

export interface LoadedContent {
  tracks: Track[];
  topics: Topic[];
  topicsById: Map<string, Topic>;
  topicsByTrack: Map<string, Topic[]>;
  /** Short-form cards: real-world case studies and practical playbooks. */
  notes: CaseStudy[];
  notesById: Map<string, CaseStudy>;
  /** Staged mock-interview questions authored under content/interviews/. */
  interviews: InterviewBankItem[];
  interviewsById: Map<string, InterviewBankItem>;
  errors: string[];
}

function walkYaml(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkYaml(p));
    else if (e.name.endsWith(".yaml") || e.name.endsWith(".yml")) out.push(p);
  }
  return out;
}

export function loadContent(root: string = CONTENT_ROOT): LoadedContent {
  const errors: string[] = [];
  const tracks: Track[] = [];
  const topics: Topic[] = [];
  const topicsById = new Map<string, Topic>();
  const topicsByTrack = new Map<string, Topic[]>();
  const notes: CaseStudy[] = [];
  const notesById = new Map<string, CaseStudy>();
  const interviews: InterviewBankItem[] = [];
  const interviewsById = new Map<string, InterviewBankItem>();

  const tracksRoot = path.join(root, "tracks");
  if (!fs.existsSync(tracksRoot)) {
    return {
      tracks, topics, topicsById, topicsByTrack, notes, notesById,
      interviews, interviewsById,
      errors: [`no content directory at ${root}`],
    };
  }

  const trackDirs = fs
    .readdirSync(tracksRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  for (const dirName of trackDirs) {
    // The canonical track id comes from the directory's own `track.yaml`, not
    // from the folder name. Deriving it from the folder made `07-system-design`
    // register as `system-design` while the track declared `staff`, so its
    // topics were filed under a key nothing ever looked up — the track page
    // rendered empty and the topics vanished from every cross-reference.
    let trackId = dirName.replace(/^\d+-/, "");
    const headerPath = path.join(tracksRoot, dirName, "track.yaml");
    if (fs.existsSync(headerPath)) {
      try {
        const header = YAML.parse(fs.readFileSync(headerPath, "utf8")) as {
          track?: { id?: string };
        };
        if (header?.track?.id) trackId = header.track.id;
      } catch {
        // A malformed header is reported when the file is parsed below; keep
        // the directory-derived id so the track's topics still load.
      }
    }
    const trackDir = path.join(tracksRoot, dirName);
    const list: Topic[] = [];

    for (const file of walkYaml(trackDir).sort()) {
      const rel = path.relative(root, file);

      let raw: unknown;
      try {
        raw = YAML.parse(fs.readFileSync(file, "utf8"));
      } catch (err) {
        errors.push(`${rel}: YAML parse failed — ${(err as Error).message}`);
        continue;
      }

      // A content file is either a single topic (the common case) or a
      // collection with an explicit `topics:` list and optional `track:`
      // header.
      //
      // A file carrying only `track:` is a track header, not a topic — the
      // `topics:` key is optional, because a header written before any topic
      // exists is perfectly valid and should not be parsed as a lesson.
      const record = raw as Record<string, unknown> | null;
      const isCollection =
        record !== null &&
        typeof record === "object" &&
        !Array.isArray(record) &&
        ("topics" in record || "track" in record);

      const parsed = isCollection
        ? ContentFileSchema.safeParse(raw)
        : TopicSchema.safeParse(raw);

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push(`${rel}: ${issue.path.join(".") || "(root)"} — ${issue.message}`);
        }
        continue;
      }

      const collection = isCollection ? (parsed.data as z.infer<typeof ContentFileSchema>) : null;
      const single = !isCollection ? (parsed.data as Topic) : null;

      if (collection?.track && !tracks.some((t) => t.id === collection.track!.id)) {
        tracks.push(collection.track);
      }

      const fileTopics = collection ? collection.topics : [single!];

      for (const t of fileTopics) {
        const topic = { ...t, trackId } as Topic;
        if (topicsById.has(topic.id)) {
          errors.push(`${rel}: duplicate topic id "${topic.id}"`);
          continue;
        }
        topicsById.set(topic.id, topic);
        topics.push(topic);
        list.push(topic);
      }
    }

    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    topicsByTrack.set(trackId, list);
  }

  tracks.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  // Cross-reference prerequisite ids across the whole corpus.
  for (const t of topics) {
    for (const p of t.prerequisites) {
      if (!topicsById.has(p)) {
        errors.push(`topic "${t.id}": unknown prerequisite "${p}"`);
      }
    }
  }

  // Short-form cards live in content/notes/*.yaml — deliberately outside
  // tracks/, because they are not sequenced and carry no prerequisites.
  const notesRoot = path.join(root, "notes");
  for (const file of walkYaml(notesRoot).sort()) {
    let raw: unknown;
    try {
      raw = YAML.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      errors.push(`${path.relative(root, file)}: ${(err as Error).message}`);
      continue;
    }
    const parsed = CaseStudySchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`${path.relative(root, file)}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    if (notesById.has(parsed.data.id)) {
      errors.push(`duplicate note id "${parsed.data.id}"`);
      continue;
    }
    notes.push(parsed.data);
    notesById.set(parsed.data.id, parsed.data);
  }
  notes.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // The staged mock-interview bank lives in content/interviews/*.yaml. It is
  // content, not code: 150+ questions cannot live in a TypeScript literal, and
  // a rubric that an author can diff is a rubric that stays honest.
  for (const file of walkYaml(path.join(root, "interviews")).sort()) {
    let raw: unknown;
    try {
      raw = YAML.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      errors.push(`${path.relative(root, file)}: ${(err as Error).message}`);
      continue;
    }
    // A file may hold a single question or a list of them.
    const items = Array.isArray(raw) ? raw : [raw];
    for (const item of items) {
      const parsed = InterviewBankSchema.safeParse(item);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        errors.push(
          `${path.relative(root, file)}: ${issue?.path.join(".") || "(root)"} — ${issue?.message ?? "invalid"}`,
        );
        continue;
      }
      if (interviewsById.has(parsed.data.id)) {
        errors.push(`duplicate interview id "${parsed.data.id}"`);
        continue;
      }
      interviews.push(parsed.data);
      interviewsById.set(parsed.data.id, parsed.data);
    }
  }
  interviews.sort((a, b) => a.level.localeCompare(b.level) || a.id.localeCompare(b.id));

  return {
    tracks, topics, topicsById, topicsByTrack,
    notes, notesById,
    interviews, interviewsById,
    errors,
  };
}

let cached: LoadedContent | null = null;
let cachedFingerprint: string | null = null;

/**
 * A cheap signature of the content tree: file count plus the newest mtime.
 *
 * Authoring a topic used to require a full restart, because this module caches
 * the parsed corpus for the process lifetime. That produced a long trail of
 * confusing 404s: the file validated, the page 404'd, and the cause looked like
 * a stale server. A fingerprint costs one readdir + stat per call — negligible
 * against parsing 30+ YAML files — and makes new topics appear immediately.
 */
function contentFingerprint(root: string): string {
  let count = 0;
  let newest = 0;

  // The layout is content/tracks/<track>/topics/*.yaml, but walk recursively so
  // a reorganisation of the tree cannot silently defeat this check. It previously
  // assumed content/<track>/topics and found nothing, so the signature was a
  // constant and the cache never invalidated.
  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // a missing directory is not an error here
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.name.endsWith(".yaml")) {
        count += 1;
        try {
          const m = fs.statSync(full).mtimeMs;
          if (m > newest) newest = m;
        } catch {
          // raced with a write; the next request will see it
        }
      }
    }
  };

  walk(root, 0);
  return `${count}:${newest}`;
}

export function getContent(): LoadedContent {
  const fingerprint = contentFingerprint(CONTENT_ROOT);
  if (!cached || fingerprint !== cachedFingerprint) {
    cached = loadContent();
    cachedFingerprint = fingerprint;
  }
  return cached;
}

export function getTopic(id: string): Topic | null {
  return getContent().topicsById.get(id) ?? null;
}

export function getTrack(idOrSlug: string): Track | null {
  const c = getContent();
  return (
    c.tracks.find((t) => t.id === idOrSlug || t.slug === idOrSlug) ??
    c.tracks.find((t) => t.slug.replace(/^\d+-/, "") === idOrSlug) ??
    null
  );
}

export function clearContentCache(): void {
  cached = null;
}
