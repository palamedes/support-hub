import path from 'node:path';
import zlib from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { buildWidget, ROOT, WIDGET_BUDGET } from '../scripts/build.mjs';
import { loadConfigFile, validateConfig } from '../scripts/lib/config.mjs';

const { raw } = loadConfigFile(path.join(ROOT, 'config.yml'));
const { config } = validateConfig(raw);
const code = await buildWidget(config);

describe('widget.js', () => {
  it(`stays under ${WIDGET_BUDGET / 1024} KB gzipped`, () => {
    expect(zlib.gzipSync(code, { level: 9 }).length).toBeLessThan(WIDGET_BUDGET);
  });

  it('sets no cookies and makes no network calls of its own', () => {
    expect(code).not.toMatch(/document\.cookie|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|indexedDB/);
  });

  it('has no dependencies to load: one self-contained file', () => {
    expect(code).not.toMatch(/\bimport\s*\(|\brequire\(/);
  });
});
