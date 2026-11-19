import { describe, expect, it } from 'vitest';
import * as v24 from '../research/blind/target-v20/legacy-questions-v24';
import { BANK_VERSION, COMPATIBLE_SINCE, CURRENT_IDS, CURRENT_FIRM, FIRM, MANIFEST, QUESTIONS } from '../research/blind/target-v20/legacy-questions-v25';
import { answerFor, OPTION_VALUES } from '../src/answer';
import { encode, decode } from '../src/codec/codec';
import { compare } from '../src/scoring/compare';
import { resumeFor, unansweredIds } from '../src/ui/flow';
import type { Profile } from '../src/types';

const replaced = ['life-01', 'life-02', 'intimacy-02'];
const fresh = ['life-01-r25', 'life-02-r25', 'intimacy-02-r25'];
const complete = (ids: string[], version: number, offset = 0): Profile => ({
  name: 'Аня', bankVersion: version,
  responses: Object.fromEntries(ids.map((id, i) => [id, answerFor(OPTION_VALUES[(i + offset) % 5])])),
});

// Independent fingerprints protect historical tables even when legacy modules import live JSON.
const fingerprint = (value: string[]) => {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(JSON.stringify(value))) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
  }
  return hash.toString(16);
};
const historicalManifest = {"1":"4996678f1cf3f524","2":"13c7cd087a376a7d","3":"cb12a5b7e7e69c8e","4":"a7af67a657c0f442","5":"7b772a9d07a8dfd2","6":"213e34fd47246871","7":"6bff0e5b56b3580","8":"5bf441bd8158cf50","9":"a2de69103bbb7ea1","10":"1e3a8f8e6c18e31a","11":"fbb94c19129827ad","12":"ed5c3fa1c1da4572","13":"14164b4dc51c4514","14":"9b079f811b0b0c48","15":"a2985f7cf5c8b428","16":"2ce1997d15d9ca70","17":"5c6b5a92272df3a0","18":"be52e11c69a1aee1","19":"be52e11c69a1aee1","20":"5af4ea6aeb601c35","21":"682c2a002baa28cb","22":"72026163fdd1ecb3","23":"aff71827768da857","24":"d9958cfb8f1a4407"};
const historicalFirm = {"9":"3974f5cad495103f","10":"3974f5cad495103f","11":"3974f5cad495103f","12":"8583d3c8b5bcb346","13":"8583d3c8b5bcb346","14":"88d6cabe4b19d2f","15":"88d6cabe4b19d2f","16":"dfe25c045f8f4bc9","17":"af585185e40a89d7","18":"af585185e40a89d7","19":"9612b07b5ecb5a5","20":"9612b07b5ecb5a5","21":"9612b07b5ecb5a5","22":"9612b07b5ecb5a5","23":"9612b07b5ecb5a5","24":"9612b07b5ecb5a5"};

describe('v25 meaning replacement release', () => {
  it('replaces exactly three meanings and retains all other 122 questions unchanged', () => {
    expect(BANK_VERSION).toBe(25);
    expect(COMPATIBLE_SINCE).toBe(v24.COMPATIBLE_SINCE);
    expect(QUESTIONS).toHaveLength(125);
    expect(new Set(CURRENT_IDS).size).toBe(125);
    expect(CURRENT_IDS).toEqual(QUESTIONS.map(q => q.id));
    expect(CURRENT_IDS.filter(id => !v24.CURRENT_IDS.includes(id))).toEqual(fresh);
    expect(v24.CURRENT_IDS.filter(id => !CURRENT_IDS.includes(id))).toEqual(replaced);
    const retained = QUESTIONS.filter(q => !fresh.includes(q.id));
    expect(retained).toHaveLength(122);
    expect(retained).toEqual(v24.QUESTIONS.filter(q => !replaced.includes(q.id)));
    for (const q of QUESTIONS) {
      expect(q.options, q.id).toHaveLength(5);
      expect(q.optional, q.id).toBe(false);
      if (q.cross) expect(CURRENT_IDS, q.id).toContain(q.cross.id);
    }
  });

  it('counts short workouts and separates absent desire from positive rare desire', () => {
    const sport = QUESTIONS.find(q => q.id === fresh[0])!;
    const tolerance = QUESTIONS.find(q => q.id === fresh[1])!;
    const sex = QUESTIONS.find(q => q.id === fresh[2])!;
    expect(sport).toBeDefined();
    expect(tolerance).toBeDefined();
    expect(sex).toBeDefined();
    expect(sport.text).not.toMatch(/40\s*мин/);
    expect(sport.text).toMatch(/коротк|зарядк|10[–—-]20/);
    expect(tolerance.text).toMatch(/коротк|зарядк|10[–—-]20/);
    expect(tolerance.cross).toEqual({ id: fresh[0], level: [0, 0, 0.25, 1, 1] });
    expect(sex.options![0]).toMatch(/не\s+хоч|нет\s+желан|желани[ея]\s+нет/);
    expect(sex.options![1]).toMatch(/хоч|раз|редко/);
    expect(sex.options![1]).not.toMatch(/не\s+хоч|нет\s+желан|желани[ея]\s+нет|никогда|совсем/);
    expect(new Set(sex.options).size).toBe(5);
  });

  it('keeps all historical manifests and round-trips every v24 answer position', () => {
    for (let version = 1; version <= 24; version++) {
      expect(fingerprint(MANIFEST[version])).toBe(historicalManifest[String(version) as keyof typeof historicalManifest]);
      expect(fingerprint(FIRM[version] ?? [])).toBe(historicalFirm[String(version) as keyof typeof historicalFirm] ?? fingerprint([]));
    }
    for (let offset = 0; offset < 5; offset++) {
      const old = complete(v24.CURRENT_IDS, 24, offset);
      expect(decode(encode(old, v24.CURRENT_IDS, v24.CURRENT_FIRM), MANIFEST, FIRM)).toEqual(old);
    }
  });

  it('resumes an old complete link at exactly three fresh answers and drops orphan IDs on re-encoding', () => {
    const old = complete(v24.CURRENT_IDS, 24);
    const restored = decode(encode(old, v24.CURRENT_IDS, v24.CURRENT_FIRM), MANIFEST, FIRM);
    expect(unansweredIds(CURRENT_IDS, restored.responses)).toEqual(fresh);
    const resumed = resumeFor({ name: old.name, responses: restored.responses, index: 125, inviterCode: null }, null, CURRENT_IDS)!;
    expect(resumed.index).toBe(CURRENT_IDS.indexOf(fresh[0]));
    expect(resumed.responses).toEqual(old.responses);
    for (const id of fresh) expect(restored.responses[id]).toBeUndefined();
    // These are newly supplied answers, never copies of the replaced meanings.
    const upgraded: Profile = { ...restored, bankVersion: 25, responses: {
      ...restored.responses, [fresh[0]]: answerFor(7), [fresh[1]]: answerFor(3), [fresh[2]]: answerFor(5),
    } };
    const decoded = decode(encode(upgraded, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM);
    expect(decoded.bankVersion).toBe(25);
    expect(Object.keys(decoded.responses)).toHaveLength(125);
    expect(unansweredIds(CURRENT_IDS, decoded.responses)).toEqual([]);
    for (const id of replaced) expect(decoded.responses[id]).toBeUndefined();
    for (const id of CURRENT_IDS) expect(decoded.responses[id]).toEqual(upgraded.responses[id]);
    expect(compare(QUESTIONS, upgraded, upgraded)).toEqual(compare(QUESTIONS, decoded, decoded));
  });

  it('does not use old sports answers as the source of new sports tolerance', () => {
    const tolerance = QUESTIONS.find(q => q.id === fresh[1])!;
    expect(tolerance).toBeDefined();
    const missingSource: Profile = { name: 'Аня', bankVersion: 25, responses: {
      'life-01': answerFor(10), [fresh[1]]: answerFor(10),
    } };
    expect(compare([tolerance], missingSource, missingSource).relationship.percent).toBeNull();
    const answered: Profile = { ...missingSource, responses: { ...missingSource.responses, [fresh[0]]: answerFor(0) } };
    expect(compare([tolerance], answered, answered).relationship.percent).toBe(100);
    const noOldSource = { ...answered, responses: { [fresh[0]]: answerFor(0), [fresh[1]]: answerFor(10) } };
    expect(compare([tolerance], answered, answered)).toEqual(compare([tolerance], noOldSource, noOldSource));
  });

  it('round-trips all 125 fresh answers at each of the five option positions', () => {
    for (let offset = 0; offset < 5; offset++) {
      const current = complete(CURRENT_IDS, 25, offset);
      expect(decode(encode(current, CURRENT_IDS, CURRENT_FIRM), MANIFEST, FIRM)).toEqual(current);
    }
  });
});
