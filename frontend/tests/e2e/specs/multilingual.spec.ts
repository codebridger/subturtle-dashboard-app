import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Multilingual round 1 — the dashboard's main language flows (D-01 to D-25), hermetic.
 *
 * Like subscription-ui.spec.ts, every backend call is stubbed with page.route, so only the
 * frontend runs. The language module is played by a small in-memory fake that follows the
 * contract (docs repo: docs/tech/multilingual-api.md), so the flows run before the server
 * functions are on dev and keep guarding the client once they are.
 */

const USER_ID = '000000000000000000000001';
const FEATURES = { save: true, review: true, cloze: true, coachText: true, coachVoice: true, levelTest: true, starterPack: true, map: false };

const CAPS = {
    learning: [
        ['en', 'English', 'English'],
        ['es', 'Spanish', 'Español'],
        ['de', 'German', 'Deutsch'],
        ['fr', 'French', 'Français'],
        ['it', 'Italian', 'Italiano'],
        ['sv', 'Swedish', 'Svenska'],
        ['lt', 'Lithuanian', 'Lietuvių'],
    ]
        .map(([code, name, nativeName]) => ({ code, name, nativeName, rtl: false, ttsVoice: `${code}-voice`, enabled: true, features: { ...FEATURES, starterPack: code !== 'en' } }))
        .concat([{ code: 'pt', name: 'Portuguese', nativeName: 'Português', rtl: false, ttsVoice: 'pt', enabled: false, features: FEATURES }]),
    own: [
        { code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true, explanationReviewed: 'teacher' },
        { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', rtl: false, explanationReviewed: 'teacher' },
        { code: 'pl', name: 'Polish', nativeName: 'Polski', rtl: false, explanationReviewed: 'ai' },
    ],
};

type Summary = Record<string, any>;

const summary = (code: string, extra: Summary = {}): Summary => ({
    code,
    status: 'active',
    startLevel: 'A1',
    startLevelSource: 'default',
    dueCount: 0,
    phraseCount: 0,
    explanationLanguage: 'fa',
    starterPack: { state: 'none', heard: 0, total: 0 },
    ...extra,
});

interface FakeOptions {
    plan?: 'starter' | 'reader' | 'learner' | 'coach';
    maxLanguages?: number;
    languages?: Summary[];
    active?: string | null;
    own?: string | null;
    pending?: { language: string; count: number; expiresAt: string }[];
    onboarding?: 'done' | 'needs_language';
    /** Answer the language functions at all (false = today's server). */
    multilingual?: boolean;
}

/** A tiny language module that follows the contract. `calls` records every function call. */
function createFakeServer(opts: FakeOptions = {}) {
    const state: any = {
        translationLanguage: opts.own === undefined ? 'fa' : opts.own,
        learningLanguage: opts.active === undefined ? 'en' : opts.active,
        languages: opts.languages ?? [summary('en', { startLevel: 'B1', phraseCount: 142, dueCount: 12 })],
        onboardingState: opts.onboarding ?? 'done',
        plan: opts.plan ?? 'learner',
        maxLanguages: opts.maxLanguages ?? 10,
        pending: opts.pending ?? [],
    };
    const calls: { name: string; args: any }[] = [];
    let testTurn = 0;

    function handle(name: string, args: any): { status: number; data?: any; message?: string } {
        calls.push({ name, args });
        const active = state.languages.filter((l: Summary) => l.status === 'active');
        switch (name) {
            case 'get-language-capabilities':
                return { status: 200, data: CAPS };
            case 'get-language-state':
                return { status: 200, data: state };
            case 'set-active-language':
                state.learningLanguage = args.language;
                return { status: 200, data: { state } };
            case 'add-language': {
                const existing = state.languages.find((l: Summary) => l.code === args.language);
                if (active.length >= state.maxLanguages) {
                    return { status: 400, message: `upgrade_needed: ${JSON.stringify({ plan: state.plan, maxLanguages: state.maxLanguages })}` };
                }
                const kept = state.pending.find((p: any) => p.language === args.language);
                const row = summary(args.language, {
                    startLevel: args.startLevel ?? 'A1',
                    startLevelSource: args.startLevelSource ?? 'default',
                    phraseCount: kept?.count ?? 0,
                });
                if (existing) Object.assign(existing, { ...row, status: 'active', purgeAt: undefined });
                else state.languages.push(row);
                state.pending = state.pending.filter((p: any) => p.language !== args.language);
                state.learningLanguage = args.language;
                state.onboardingState = 'done';
                return { status: 200, data: { state } };
            }
            case 'remove-language': {
                const purgeAt = '2026-11-15T00:00:00.000Z';
                const row = state.languages.find((l: Summary) => l.code === args.language);
                Object.assign(row, { status: 'removed', purgeAt });
                if (state.learningLanguage === args.language) {
                    state.learningLanguage = state.languages.find((l: Summary) => l.status === 'active')?.code ?? null;
                }
                return { status: 200, data: { state, purgeAt } };
            }
            case 'set-translation-language':
                state.translationLanguage = args.language;
                return { status: 200, data: { state } };
            case 'set-language-interest':
                return { status: 200, data: { on: args.on } };
            case 'start-level-test':
                testTurn = 1;
                return { status: 200, data: { testId: 't1', turn: { ai: 'Hallo! Wie heißt du?', help: 'سلام! اسمت چیه؟' }, index: 1, total: 3 } };
            case 'answer-level-test':
                testTurn += 1;
                if (testTurn > 3) return { status: 200, data: { index: 3, total: 3, done: true, result: { startLevel: 'A2', reason: 'You answered in short sentences and used the past once.' } } };
                return { status: 200, data: { turn: { ai: `Frage ${testTurn}` }, index: testTurn, total: 3, done: false } };
            case 'finish-level-test':
                return { status: 200, data: { state } };
            case 'get-board':
                return { status: 200, data: { language: state.learningLanguage, newLanguage: !active.find((l: Summary) => l.code === state.learningLanguage)?.phraseCount, activities: [] } };
            case 'getSubscriptionDetails':
                return { status: 200, data: { is_freemium: state.plan === 'starter', tier: state.plan, label: state.plan, usage_percentage: 0 } };
            default:
                return { status: 200, data: {} };
        }
    }

    return { state, calls, handle };
}

function corsHeaders(route: Route): Record<string, string> {
    const origin = route.request().headers()['origin'] || '*';
    return {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
        'access-control-allow-headers': 'authorization,content-type,origin,accept,x-requested-with',
    };
}

function respond(route: Route, status: number, body: unknown) {
    return route.fulfill({ status, headers: { ...corsHeaders(route), 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

const LANGUAGE_FUNCTIONS = /^(get-language-|set-active-language|add-language|remove-language|set-translation-language|set-language-interest|start-level-test|answer-level-test|finish-level-test)/;

async function boot(page: Page, fake: ReturnType<typeof createFakeServer>, multilingual = true) {
    await page.addInitScript(() => localStorage.setItem('token', 'e2e-fake-jwt'));
    const simple = (path: string, body: unknown) =>
        page.route(path, (route) => (route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: corsHeaders(route) }) : respond(route, 200, body)));

    await simple('**/verify/token', { user: { id: USER_ID, email: 'e2e@example.com', type: 'user', permissionGroup: ['user'] } });
    await simple('**/data-provider/find-one', { status: 'success', data: { _id: 'profile1', refId: USER_ID, name: 'Sara', gPicture: '' } });
    await simple('**/data-provider/find', { status: 'success', data: [] });
    await simple('**/data-provider/count', { status: 'success', data: 0 });
    await simple('**/data-provider/update-one', { status: 'success', data: {} });

    await page.route('**/function/run', (route) => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders(route) });
        const { name, args } = route.request().postDataJSON() || {};
        // Today's server: the language module does not exist yet.
        if (!multilingual && LANGUAGE_FUNCTIONS.test(name)) {
            return respond(route, 400, { status: 'error', message: `Function with name ${name} not found` });
        }
        const res = fake.handle(name, args);
        return res.status === 200 ? respond(route, 200, { status: 'success', data: res.data }) : respond(route, res.status, { status: 'error', message: res.message });
    });
    await page.route(/js\.stripe\.com/, (route) => route.abort());
    await page.route(/mixpanel\.com/, (route) => route.abort());
}

const menuTrigger = (page: Page) => page.getByTestId('language-menu-trigger');

test.describe('Multilingual dashboard', () => {
    test('today’s server: no language menu, no language param, English-only works', async ({ page }) => {
        const fake = createFakeServer();
        await boot(page, fake, false);
        await page.goto('/#/board');

        await expect(page.getByRole('heading', { name: "Today's board" })).toBeVisible();
        await expect(menuTrigger(page)).toHaveCount(0);
        // No language is sent while the flag is off.
        const board = fake.calls.find((c) => c.name === 'get-board');
        expect(board?.args?.language).toBeUndefined();

        // The language screens do not exist: they send the learner to Today.
        await page.goto('/#/settings/languages');
        await expect(page).toHaveURL(/#\/board/);
    });

    test('switch language from the header menu lands on Today', async ({ page }) => {
        const fake = createFakeServer({
            languages: [summary('en', { startLevel: 'B1', phraseCount: 142, dueCount: 12 }), summary('de', { phraseCount: 38, dueCount: 7 })],
        });
        await boot(page, fake);
        await page.goto('/#/statistic');

        await expect(menuTrigger(page)).toContainText('English');
        await menuTrigger(page).click();
        const menu = page.getByRole('menu', { name: 'Your languages' });
        await expect(menu.getByRole('menuitemradio', { name: /English/ })).toHaveAttribute('aria-checked', 'true');
        await expect(menu.getByText('German · Deutsch')).toBeVisible();
        await expect(menu.getByText('You speak Persian')).toBeVisible();
        await menu.getByRole('menuitemradio', { name: /German/ }).click();

        await expect(page).toHaveURL(/#\/board/);
        await expect(menuTrigger(page)).toContainText('German');
        expect(fake.calls.find((c) => c.name === 'set-active-language')?.args.language).toBe('de');
        // The board reloads for the new language, and carries it.
        await expect.poll(() => fake.calls.filter((c) => c.name === 'get-board' && c.args.language === 'de').length).toBeGreaterThan(0);
    });

    test('add a language at A1 ends on the starter pack offer', async ({ page }) => {
        const fake = createFakeServer();
        await boot(page, fake);
        await page.goto('/#/settings/languages/add');

        await expect(page.getByRole('heading', { name: 'What do you want to learn?' })).toBeVisible();
        await page.getByTestId('pick-it').click();
        await page.getByTestId('add-next').click();
        await expect(page.getByRole('heading', { name: 'Where should we start in Italian?' })).toBeVisible();
        await page.getByTestId('how-a1').click();
        await page.getByTestId('start-a1').click();

        await expect(page.getByTestId('add-done')).toContainText('Italian is in your languages');
        await expect(page.getByTestId('open-pack')).toBeVisible();
        expect(fake.calls.find((c) => c.name === 'add-language')?.args).toMatchObject({ language: 'it', startLevel: 'A1', startLevelSource: 'default' });
        await expect(menuTrigger(page)).toContainText('Italian');
    });

    test('add a language with the chat test', async ({ page }) => {
        const fake = createFakeServer();
        await boot(page, fake);
        await page.goto('/#/settings/languages/add?language=de');

        await page.getByTestId('add-next').click();
        await page.getByTestId('how-test').click();
        await page.getByTestId('start-test').click();

        await expect(page.getByText('Hallo! Wie heißt du?')).toBeVisible();
        // The own-language help is a right-to-left run.
        await expect(page.getByText('سلام! اسمت چیه؟')).toHaveAttribute('dir', 'rtl');
        for (const answer of ['Ich heiße Sara.', 'Ich komme aus Iran.', 'Ich habe gearbeitet.']) {
            await page.getByTestId('test-answer').fill(answer);
            await page.getByTestId('test-send').click();
        }
        await expect(page.getByTestId('test-result')).toContainText('Starting at A2');
        await page.getByTestId('test-accept').click();

        await expect(page).toHaveURL(/#\/board/);
        expect(fake.calls.find((c) => c.name === 'finish-level-test')?.args).toMatchObject({ testId: 't1', accept: true });
        expect(fake.state.languages.find((l: Summary) => l.code === 'de')).toMatchObject({ startLevel: 'A2', startLevelSource: 'test' });
    });

    test('kept phrases are shown and join the language when it is added', async ({ page }) => {
        const fake = createFakeServer({ pending: [{ language: 'es', count: 3, expiresAt: '2026-11-14T00:00:00.000Z' }] });
        await boot(page, fake);
        await page.goto('/#/settings/languages');

        await expect(page.getByTestId('kept-es')).toContainText('3 phrases kept for Spanish');
        await page.getByTestId('kept-es').click();

        await expect(page.getByTestId('kept-notice')).toContainText('3 phrases you kept are waiting for Spanish');
        await expect(page.getByTestId('pick-es')).toHaveAttribute('aria-checked', 'true');
        await page.getByTestId('add-next').click();
        await page.getByTestId('how-a1').click();
        await page.getByTestId('start-a1').click();
        await expect(page.getByTestId('add-done')).toContainText('3 kept phrases joined Spanish');
        expect(fake.state.pending).toHaveLength(0);
    });

    test('remove a language asks first, then it can be added back', async ({ page }) => {
        const fake = createFakeServer({ languages: [summary('en', { startLevel: 'B1' }), summary('de', { startLevel: 'A2', startLevelSource: 'test' })] });
        await boot(page, fake);
        await page.goto('/#/settings/languages');

        await page.getByTestId('language-card-de').getByRole('button', { name: 'Remove language' }).click();
        await expect(page.getByText('Your German phrases, review boxes and Coach history are kept for 30 days.', { exact: false })).toBeVisible();
        await page.getByRole('button', { name: 'Remove German' }).click();

        await expect(page.getByRole('status')).toContainText('German was removed');
        await expect(page.getByTestId('language-card-de')).toHaveCount(0);
        await expect(page.getByTestId('removed-de')).toContainText('Kept until 15 November');

        await page.getByTestId('removed-de').getByRole('button', { name: 'Add it back' }).click();
        await expect(page.getByTestId('language-card-de')).toBeVisible();
        // A restore keeps the level the learner had.
        expect(fake.calls.filter((c) => c.name === 'add-language').pop()?.args).toMatchObject({ language: 'de', startLevel: 'A2', startLevelSource: 'test' });
    });

    test('Starter at its one language gets the upgrade card, never a swap', async ({ page }) => {
        const fake = createFakeServer({ plan: 'starter', maxLanguages: 1 });
        await boot(page, fake);

        await page.goto('/#/settings/languages');
        await expect(page.getByTestId('plan-limit')).toContainText('Starter includes 1 language, with no swap');

        await page.goto('/#/settings/languages/add');
        await expect(page.getByRole('heading', { name: 'Starter includes 1 language' })).toBeVisible();
        await expect(page.getByTestId('pick-de')).toHaveCount(0);
        await page.getByRole('button', { name: 'See plans' }).click();
        await expect(page).toHaveURL(/#\/settings\/subscription/);
    });

    test('a new account picks a language first (first run)', async ({ page }) => {
        const fake = createFakeServer({ languages: [], active: null, own: null, onboarding: 'needs_language' });
        await boot(page, fake);
        await page.goto('/#/board');

        await expect(page).toHaveURL(/#\/settings\/languages\/add\?first=1/);
        await expect(page.getByText('Welcome to Subturtle')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Cancel' })).toHaveCount(0);

        await page.getByTestId('own-language-picker').selectOption('fa');
        await page.getByTestId('pick-fr').click();
        await page.getByTestId('add-next').click();
        await page.getByTestId('how-a1').click();
        await page.getByTestId('start-a1').click();
        await expect(page.getByTestId('add-done')).toBeVisible();
        expect(fake.calls.find((c) => c.name === 'set-translation-language')?.args.language).toBe('fa');

        // Gate lifted: Today opens.
        await page.goto('/#/board');
        await expect(page).toHaveURL(/#\/board/);
    });
});
