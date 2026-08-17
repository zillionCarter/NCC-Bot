import { describe, it, expect } from 'vitest';
import {
  findRelevantPolicies,
  buildPolicyContext,
  POLICY_SECTIONS,
  MAX_POLICY_SECTIONS,
} from '../src/school/policies';

describe('findRelevantPolicies', () => {
  it('attaches nothing to an ordinary academic question', () => {
    // This is the whole cost argument: the common case must pay nothing.
    for (const message of [
      'What is photosynthesis?',
      'Solve 3x + 7 = 22',
      'Explain the causes of World War I',
      'Can you make me flashcards for cell biology',
      'summarise these notes',
    ]) {
      expect(findRelevantPolicies(message), message).toEqual([]);
      expect(buildPolicyContext(message), message).toBe('');
    }
  });

  it('finds the plagiarism policy when academic honesty is raised', () => {
    for (const message of [
      'what happens if I plagiarise',
      'is using AI cheating',
      'do I have to reference properly',
    ]) {
      expect(findRelevantPolicies(message).map((s) => s.id), message).toContain('plagiarism');
    }
  });

  it('finds the device policy for anything about phones and laptops', () => {
    for (const message of [
      'can I use my phone at school',
      'am I allowed my apple watch',
      'where do I put my airpods',
      'my laptop is broken who do I ask',
    ]) {
      expect(findRelevantPolicies(message).map((s) => s.id), message).toContain('devices');
    }
  });

  it('finds the uniform policy for dress questions', () => {
    for (const message of ['what shoes can I wear', 'is nail polish allowed', 'can I dye my hair']) {
      expect(findRelevantPolicies(message).map((s) => s.id), message).toContain('uniform');
    }
  });

  it('finds behaviour sections for conduct questions', () => {
    expect(findRelevantPolicies('someone is bullying me what do I do').map((s) => s.id)).toContain(
      'behaviour-others'
    );
    expect(findRelevantPolicies('what is the code of behaviour').length).toBeGreaterThan(0);
  });

  it('is case insensitive', () => {
    expect(findRelevantPolicies('PLAGIARISM rules').map((s) => s.id)).toContain('plagiarism');
  });

  it('caps how much is attached, so the prompt cannot balloon', () => {
    // A message touching everything at once must still not attach the whole corpus.
    const kitchenSink = 'uniform phone laptop plagiarism bullying detention hair shoes locker';
    expect(findRelevantPolicies(kitchenSink)).toHaveLength(MAX_POLICY_SECTIONS);
    expect(findRelevantPolicies(kitchenSink, 1)).toHaveLength(1);
  });

  it('ranks the better match first', () => {
    const [first] = findRelevantPolicies('what are the consequences of plagiarism');
    expect(first.id).toBe('plagiarism');
  });
});

describe('buildPolicyContext', () => {
  it('labels the source and tells the model not to stretch it', () => {
    const context = buildPolicyContext('can I bring my phone');
    expect(context).toMatch(/RELEVANT COLLEGE POLICY/);
    expect(context).toMatch(/Devices/);
    expect(context).toMatch(/does not actually cover what was asked, say so/i);
  });

  it('carries the real policy text through', () => {
    const context = buildPolicyContext('what happens if I plagiarise an essay');
    expect(context).toMatch(/form of THEFT/);
    expect(context).toMatch(/handwritten rewrite/i);
    expect(context).toMatch(/suspension/i);
  });

  it('states the uniform brochure limitation rather than inviting invention', () => {
    // The brochure is mostly photographs, so the specifics genuinely are not
    // available — the prompt has to say so or the model will fill the gap.
    const context = buildPolicyContext('what socks am I allowed to wear');
    expect(context).toMatch(/presents the actual garment specifics as photographs/i);
    expect(context).toMatch(/Do not describe or invent particular garments/i);
    expect(context).toMatch(/ncc\.uniformshop@cns\.catholic\.edu\.au/);
  });
});

describe('POLICY_SECTIONS', () => {
  it('has unique ids and no empty section', () => {
    const ids = POLICY_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of POLICY_SECTIONS) {
      expect(section.text.trim().length, section.id).toBeGreaterThan(50);
      expect(section.keywords.length, section.id).toBeGreaterThan(0);
    }
  });

  it('keeps every keyword lower case, since matching lower-cases the message', () => {
    for (const section of POLICY_SECTIONS) {
      for (const keyword of section.keywords) {
        expect(keyword, `${section.id}: ${keyword}`).toBe(keyword.toLowerCase());
      }
    }
  });
});
