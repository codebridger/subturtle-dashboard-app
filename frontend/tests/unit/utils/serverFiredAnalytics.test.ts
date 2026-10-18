import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * B-28: these events are sent by the server, from the function where the action happens, so the
 * phone and the extension are counted too. The web must not send them a second time, or every
 * web action would count twice. `level_test_started` and `first_run_done` stay on the web: they
 * are screen-only.
 */
const SERVER_FIRED = [
    'LANGUAGE_ADDED',
    'LANGUAGE_REMOVED',
    'LANGUAGE_SWITCHED',
    'LANGUAGE_INTEREST',
    'LEVEL_TEST_DONE',
    'STARTER_PACK_DONE',
    'STARTER_PACK_SKIPPED',
    'PHRASE_KEPT_PENDING',
    'CLOZE_RESULT',
    'COACH_EXPLANATION_FLAGGED',
];
const WEB_ONLY = ['LEVEL_TEST_STARTED', 'FIRST_RUN_DONE'];

const root = resolve(__dirname, '../../..');
const SKIP = new Set(['node_modules', '.nuxt', '.output', 'tests', 'dist', 'coverage', 'constants']);

function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) sources(path, out);
        else if (/\.(vue|ts)$/.test(name)) out.push(path);
    }
    return out;
}

const files = sources(root).map((path) => ({ path, text: readFileSync(path, 'utf8') }));
const sends = (key: string, rawName: string) => files.filter(({ text }) => text.includes(`ANALYTICS_EVENTS.${key}`) || text.includes(`'${rawName}'`));

describe('language analytics are sent by the server (B-28)', () => {
    it.each(SERVER_FIRED)('the web does not send %s', (key) => {
        const raw = key.toLowerCase();
        expect(sends(key, raw).map((f) => f.path.replace(root, ''))).toEqual([]);
    });

    it.each(WEB_ONLY)('the web still sends the screen-only %s', (key) => {
        expect(sends(key, key.toLowerCase()).length).toBeGreaterThan(0);
    });
});
