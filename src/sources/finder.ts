import type { ModelContent, SourceItem } from '../types';
import { searchGrounded, type GroundingChunk } from '../gemini/client';
import { sourcesContent } from '../gemini/tools';

/**
 * Turns a `find_sources` tool call into citable source cards.
 *
 * The integrity guarantee lives here: every returned item is built from a
 * grounding chunk — a URL the Search API actually returned — so the model has no
 * path by which to invent a link. Its prose is kept only as advisory `note` text,
 * never mined for URLs.
 */

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

const DOMAIN_LIKE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/**
 * Grounding chunk URIs are Google redirect links, so their host is never the real
 * publisher. `web.title` carries the source's own domain, which is what a student
 * needs to see to judge whether a source is worth citing.
 */
export function displayDomain(chunk: GroundingChunk): string {
  const title = chunk.web?.title?.trim();
  if (title && DOMAIN_LIKE.test(title)) return title.replace(/^www\./, '');
  const host = chunk.web?.uri ? hostOf(chunk.web.uri) : null;
  return host ?? title ?? 'unknown source';
}

export function chunksToItems(chunks: GroundingChunk[], limit = 8): SourceItem[] {
  const seen = new Set<string>();
  const items: SourceItem[] = [];
  for (const chunk of chunks) {
    const url = chunk.web?.uri?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const domain = displayDomain(chunk);
    const rawTitle = chunk.web?.title?.trim();
    items.push({
      // When the title is just the domain (the common case), the domain line
      // would otherwise repeat it, so name the item after the domain and let the
      // note carry the description.
      title: rawTitle && !DOMAIN_LIKE.test(rawTitle) ? rawTitle : domain,
      url,
      domain,
    });
    if (items.length >= limit) break;
  }
  return items;
}

function buildPrompt(topic: string, context: string | undefined): string {
  return [
    `Find current, credible, citable web sources a secondary-school student could use for this topic: ${topic}.`,
    context ? `What the assignment needs: ${context}` : '',
    'Prefer sources with identifiable authorship: university and government sites, established news organisations, museums, peer-reviewed material and reference works. Avoid content farms, AI-generated pages and other students’ essays.',
    'Reply with two or three sentences of plain prose telling the student which of these sources is most useful and what to look for in it. Do not write a numbered list, and do not write any URLs — the citations are attached automatically.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function findSources(
  apiKey: string,
  topic: string,
  context: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<ModelContent> {
  const result = await searchGrounded(apiKey, buildPrompt(topic, context), fetchImpl);
  const items = chunksToItems(result.chunks);

  if (items.length === 0) {
    return {
      type: 'text',
      text: `I couldn't find sources I'd trust for **${topic}** just now. Try narrowing it — a specific event, person, or question usually turns up better material than a broad subject. Your school library's databases are also worth a look, since a lot of good material sits behind logins that search can't reach.`,
    };
  }

  return sourcesContent(topic, items, {
    note: result.text?.trim() || undefined,
    searchQueries: result.queries,
    searchEntryPoint: result.searchEntryPoint ?? undefined,
  });
}
