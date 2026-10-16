// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileScore } from '@m3n/jpfun';
import { parseM3NDocument } from '@m3n/notation';
import { projectNumberedScore } from './projection.js';
import { NumberedNotationScore } from './score.js';

const source = readFileSync(resolve(import.meta.dirname, '../../../src/scores/huan_le_song_01.m3n'), 'utf8');

describe('Ode to Joy voice connectors', () => {
  for (const width of [320, 800]) for (const paged of [false, true]) {
    it(`connects every melody/bass system at ${width}px, paged=${paged}`, () => {
      const document = parseM3NDocument(source);
      const settings = { width, paged };
      const projection = projectNumberedScore(document, settings);
      const result = compileScore(projection.source, { autoWrap: true });
      const notes = result.layout.objects.filter(node => !node.T.isZero());
      const lines = new Set(notes.map(node => node.layoutLine));
      expect(lines.size).toBeGreaterThan(1);
      const connectors = result.layout.attachments.filter(item => item.layer === 'background' && item.box.h > 0);
      expect(connectors).toHaveLength(lines.size);
      for (const line of lines) {
        const members = notes.filter(node => node.layoutLine === line);
        const top = Math.min(...members.map(node => node.box.y + node.box.visualAxis));
        const bottom = Math.max(...members.map(node => node.box.y + node.box.visualAxis));
        const matching = connectors.filter(item => item.box.y < top && item.box.y + item.box.h > bottom);
        expect(matching).toHaveLength(1);
        expect(matching[0]!.box.x + matching[0]!.box.w).toBeLessThan(Math.min(...members.map(node => node.box.x)));
      }
      const pages = NumberedNotationScore.create(document).render(settings);
      const root = new DOMParser().parseFromString(pages.join(''), 'text/html');
      // Bracket hooks are the native filled paths outside the event groups.
      const hooks = [...root.querySelectorAll('svg > path[fill="#000"]')]
        .filter(path => path.getAttribute('d')?.match(/[A-Za-z]/g)?.join('') === 'MLCLCZ');
      expect(hooks).toHaveLength(lines.size * 2);
      for (const svg of root.querySelectorAll('svg')) {
        expect(hooks.filter(path => path.ownerSVGElement === svg)).toHaveLength(svg.querySelectorAll('g.system').length * 2);
      }
      const melodyOnly = NumberedNotationScore.create(document).render({ ...settings, includeBass: false });
      const solo = new DOMParser().parseFromString(melodyOnly.join(''), 'text/html');
      expect([...solo.querySelectorAll('svg > path[fill="#000"]')]
        .filter(path => path.getAttribute('d')?.match(/[A-Za-z]/g)?.join('') === 'MLCLCZ')).toHaveLength(0);
    });
  }
});
