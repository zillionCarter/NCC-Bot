import { describe, it, expect, vi } from 'vitest';
import { findSources, chunksToItems, displayDomain } from '../src/sources/finder';

function groundedResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function candidate(chunks: unknown[], text = 'Read the first one closely.') {
  return {
    candidates: [
      {
        content: { parts: [{ text }] },
        groundingMetadata: {
          groundingChunks: chunks,
          webSearchQueries: ['q'],
          searchEntryPoint: { renderedContent: '<div>chips</div>' },
        },
      },
    ],
  };
}

describe('displayDomain', () => {
  it('prefers the chunk title when it is the publisher domain', () => {
    // Grounding URIs are Google redirect links, so the URI host is never the real
    // publisher — the title is what tells a student who wrote the thing.
    expect(
      displayDomain({ web: { uri: 'https://vertexaisearch.test/grounding-api-redirect/abc', title: 'abc.net.au' } })
    ).toBe('abc.net.au');
  });

  it('strips a www prefix', () => {
    expect(displayDomain({ web: { uri: 'https://x.test', title: 'www.britannica.com' } })).toBe('britannica.com');
  });

  it('falls back to the URI host when the title is prose', () => {
    expect(displayDomain({ web: { uri: 'https://www.nasa.gov/page', title: 'Mars Rover Mission Overview' } })).toBe(
      'nasa.gov'
    );
  });

  it('falls back to the title when the URI is unparseable', () => {
    expect(displayDomain({ web: { uri: 'not a url', title: 'Some Article' } })).toBe('Some Article');
  });

  it('degrades to a placeholder rather than throwing on an empty chunk', () => {
    expect(displayDomain({})).toBe('unknown source');
  });
});

describe('chunksToItems', () => {
  it('names the item after its title when the title is prose', () => {
    const items = chunksToItems([{ web: { uri: 'https://nasa.gov/a', title: 'Mars Rover Overview' } }]);
    expect(items).toEqual([{ title: 'Mars Rover Overview', url: 'https://nasa.gov/a', domain: 'nasa.gov' }]);
  });

  it('avoids printing the domain twice when the title IS the domain', () => {
    const items = chunksToItems([{ web: { uri: 'https://r.test/1', title: 'abc.net.au' } }]);
    expect(items).toEqual([{ title: 'abc.net.au', url: 'https://r.test/1', domain: 'abc.net.au' }]);
  });

  it('drops chunks with no URL and de-duplicates repeats', () => {
    const items = chunksToItems([
      { web: { title: 'no url here' } },
      {},
      { web: { uri: 'https://r.test/1', title: 'a.test' } },
      { web: { uri: 'https://r.test/1', title: 'a.test' } },
    ]);
    expect(items).toHaveLength(1);
  });

  it('caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ web: { uri: `https://r.test/${i}`, title: 'a.test' } }));
    expect(chunksToItems(many)).toHaveLength(8);
    expect(chunksToItems(many, 3)).toHaveLength(3);
  });
});

describe('findSources', () => {
  it('builds sources content from grounding chunks and keeps the prose as a note', async () => {
    const fetchImpl = vi
      .fn()
      .mockReturnValue(groundedResponse(candidate([{ web: { uri: 'https://r.test/1', title: 'abc.net.au' } }])));

    const content = await findSources('key', 'Macbeth ambition', 'Year 11 English essay', fetchImpl);
    if (content.type !== 'sources') throw new Error('expected sources');
    expect(content.topic).toBe('Macbeth ambition');
    expect(content.items).toEqual([{ title: 'abc.net.au', url: 'https://r.test/1', domain: 'abc.net.au' }]);
    expect(content.note).toBe('Read the first one closely.');
    expect(content.search_entry_point).toBe('<div>chips</div>');
  });

  it('passes the assignment context into the search prompt', async () => {
    const fetchImpl = vi.fn().mockReturnValue(groundedResponse(candidate([])));
    await findSources('key', 'photosynthesis', 'Year 9 biology, needs primary research', fetchImpl);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    const prompt = body.contents[0].parts[0].text as string;
    expect(prompt).toContain('photosynthesis');
    expect(prompt).toContain('Year 9 biology, needs primary research');
    // The model must not be invited to write URLs — the citations come from
    // grounding metadata, which is the only trustworthy source of them.
    expect(prompt).toMatch(/do not write any URLs/i);
  });

  it('never mines URLs out of the model prose', async () => {
    // The prose here claims a URL that was never grounded. It must not become a
    // source card, because a fabricated citation is worse than no citation.
    const fetchImpl = vi
      .fn()
      .mockReturnValue(groundedResponse(candidate([], 'See https://totally-made-up.test/article for more.')));

    const content = await findSources('key', 'topic', undefined, fetchImpl);
    expect(content.type).toBe('text');
    expect(JSON.stringify(content)).not.toContain('totally-made-up.test');
  });

  it('returns actionable guidance rather than an empty card when nothing is grounded', async () => {
    const fetchImpl = vi.fn().mockReturnValue(groundedResponse(candidate([])));
    const content = await findSources('key', 'a very obscure topic', undefined, fetchImpl);
    if (content.type !== 'text') throw new Error('expected text');
    expect(content.text).toMatch(/a very obscure topic/);
    expect(content.text).toMatch(/narrow/i);
  });

  it('propagates a grounding failure to the caller', async () => {
    const fetchImpl = vi.fn().mockReturnValue(Promise.resolve(new Response('quota', { status: 429 })));
    await expect(findSources('key', 'topic', undefined, fetchImpl)).rejects.toThrow(/429/);
  });
});
