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
    /** The chat test's first help line (default: Persian). */
    testHelp?: string;
    maxLanguages?: number;
    languages?: Summary[];
    active?: string | null;
    own?: string | null;
    pending?: { language: string; count: number; expiresAt: string }[];
    onboarding?: 'done' | 'needs_language';
    /** Answer the language functions at all (false = today's server). */
    multilingual?: boolean;
    /** get-review-session items. */
    review?: unknown[];
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
    const packHeard: string[] = [];
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
                return { status: 200, data: { testId: 't1', turn: { ai: 'Hallo! Wie heißt du?', help: opts.testHelp ?? 'سلام! اسمت چیه؟' }, index: 1, total: 3 } };
            case 'answer-level-test':
                testTurn += 1;
                if (testTurn > 3) return { status: 200, data: { index: 3, total: 3, done: true, result: { startLevel: 'A2', reason: 'You answered in short sentences and used the past once.' } } };
                return { status: 200, data: { turn: { ai: `Frage ${testTurn}` }, index: testTurn, total: 3, done: false } };
            case 'finish-level-test':
                // The language is not added yet, so the server applies nothing (`applied: false`).
                return { status: 200, data: { state, result: { startLevel: 'A2', reason: 'Short sentences.' }, applied: false, language: 'de' } };
            case 'get-board':
                return { status: 200, data: { language: state.learningLanguage, newLanguage: !active.find((l: Summary) => l.code === state.learningLanguage)?.phraseCount, activities: [] } };
            case 'get-starter-pack':
                return {
                    status: 200,
                    data: {
                        items: [
                            { id: 'de-greetings-01', text: 'Hallo!', translation: 'سلام!', band: 1, group: 'greetings' },
                            { id: 'de-greetings-02', text: 'Guten Morgen!', translation: 'صبح بخیر!', band: 1, group: 'greetings' },
                            ...((opts as any).extraPackItems ?? []),
                        ],
                        heard: (opts as any).heard ?? [],
                        groups: [{ id: 'greetings', name: 'Greetings' }, { id: 'small-talk', name: 'Small talk' }],
                        total: 2,
                        version: 1,
                    },
                };
            case 'complete-starter-pack-items': {
                // Over today's intake: the server defers anything from the "small-talk" group.
                const deferred = args.itemIds.filter((id: string) => id.includes('small-talk'));
                const added = args.itemIds.filter((id: string) => !deferred.includes(id));
                packHeard.push(...added);
                const packRow = state.languages.find((l: Summary) => l.code === state.learningLanguage);
                if (packRow) packRow.starterPack = { state: 'in_progress', heard: packHeard.length, total: 2 };
                return { status: 200, data: { heard: packHeard.length, total: 2, done: packHeard.length >= 2, added, deferred } };
            }
            case 'textToSpeechBase64':
                return { status: 200, data: 'data:audio/mp3;base64,' };
            case 'skip-starter-pack':
                return { status: 200, data: { state } };
            case 'check-cloze-answer':
                // A stand-in for server/src/languages/answer-check.ts: a typo is "close".
                return { status: 200, data: args.answer === 'gegangne' ? { result: 'close', expected: 'gegangen', reason: 'typo' } : { result: 'close', expected: 'gegangen', reason: 'form' } };
            case 'get-review-session':
                return { status: 200, data: (opts as any).review ?? [] };
            case 'get-stats':
                return { status: 200, data: { totalItems: 0, settings: { dailyLimit: 20, reviewHour: 9, reviewInterval: 1, boxIntervals: [1, 2, 4, 8, 16] } } };
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

    test('a new language has a first-phrase board with the starter pack offer', async ({ page }) => {
        const fake = createFakeServer({ languages: [summary('en', { phraseCount: 142 }), summary('de', { phraseCount: 0 })], active: 'de' });
        await boot(page, fake);
        await page.goto('/#/board');

        await expect(page.getByText('Today · German')).toBeVisible();
        await expect(page.getByTestId('board-new-language')).toContainText('Save your first German phrase');
        await expect(page.getByTestId('starter-pack-card')).toContainText('German starter pack');
        await expect(page.getByText("You're all caught up")).toHaveCount(0);
    });

    test('the starter pack marks chunks heard and ends on its finish state', async ({ page }) => {
        const fake = createFakeServer({ languages: [summary('en'), summary('de')], active: 'de' });
        await boot(page, fake);
        await page.goto('/#/practice/starter-pack');

        await expect(page.getByTestId('pack-progress')).toHaveText('0 of 2 heard');
        // The own-language translation is a right-to-left run.
        await expect(page.getByText('صبح بخیر!')).toHaveAttribute('dir', 'rtl');
        await page.getByTestId('pack-item-de-greetings-01').getByRole('button', { name: 'Mark as heard' }).click();
        await expect(page.getByTestId('pack-progress')).toHaveText('1 of 2 heard');
        await page.getByTestId('pack-item-de-greetings-02').getByRole('button', { name: 'Mark as heard' }).click();

        await expect(page.getByTestId('pack-done')).toContainText('Starter pack done');
        expect(fake.calls.filter((c) => c.name === 'complete-starter-pack-items').map((c) => c.args)).toEqual([
            expect.objectContaining({ language: 'de', itemIds: ['de-greetings-01'] }),
            expect.objectContaining({ language: 'de', itemIds: ['de-greetings-02'] }),
        ]);
    });

    test('fill the gap shows the cue, says "Almost", and sends close to submit-review', async ({ page }) => {
        const phrase = {
            _id: 'p1',
            type: 'linguistic',
            phrase: 'gegangen',
            translation: 'رفته',
            context: 'Wir sind gestern gegangen.',
            language: 'de',
            chunks: [{ text: 'gegangen', type: 'other', confidence: 0.9, lemma: 'gehen', form: 'past participle' }],
        };
        const fake = createFakeServer({ languages: [summary('en'), summary('de', { phraseCount: 1 })], active: 'de', review: [{ phrase, boxLevel: 3 }] });
        await boot(page, fake);
        await page.goto('/#/practice/review');

        await expect(page.getByText('Review · German')).toBeVisible();
        await expect(page.getByTestId('cloze-cue')).toHaveText('gehen · past participle');
        await page.locator('input[type="text"]').fill('gegangene');
        await page.getByRole('button', { name: 'Check' }).click();
        await expect(page.getByTestId('cloze-status')).toContainText('Almost');

        await page.getByRole('button', { name: /Learned/ }).click();
        await expect.poll(() => fake.calls.find((c) => c.name === 'submit-review')?.args).toMatchObject({ phraseId: 'p1', result: 'close', language: 'de' });
    });

    test('review settings say which ones are per language', async ({ page }) => {
        const fake = createFakeServer({ languages: [summary('en'), summary('de')], active: 'de' });
        await boot(page, fake);
        await page.goto('/#/settings/preferences');

        await expect(page.getByTestId('scope-language').first()).toHaveText('German only');
        await expect(page.getByTestId('scope-all').first()).toHaveText('All languages');
    });

    test('fill the gap takes the cue from the review item and the reason from the server', async ({ page }) => {
        const phrase = {
            _id: 'p2',
            type: 'linguistic',
            phrase: 'gegangen',
            translation: 'رفته',
            context: 'Wir sind gestern gegangen.',
            language: 'de',
            chunks: [{ text: 'gegangen', type: 'other', confidence: 0.9 }],
        };
        const review = [{ phrase, boxLevel: 3, cue: { lemma: 'gehen', form: 'past participle' }, acceptedAnswers: ['gegangen'] }];
        const fake = createFakeServer({ languages: [summary('en'), summary('de', { phraseCount: 1 })], active: 'de', review });
        await boot(page, fake);
        await page.goto('/#/practice/review');

        await expect(page.getByTestId('cloze-cue')).toHaveText('gehen · past participle');
        await page.locator('input[type="text"]').fill('gegangne');
        await page.getByRole('button', { name: 'Check' }).click();
        await expect(page.getByTestId('cloze-status')).toContainText('check the spelling');
        expect(fake.calls.find((c) => c.name === 'check-cloze-answer')?.args).toMatchObject({ phraseId: 'p2', answer: 'gegangne', language: 'de' });
    });

    test('the extension’s Practice now link runs the session in the phrase’s language', async ({ page }) => {
        const fake = createFakeServer({ languages: [summary('en'), summary('de', { explanationLanguage: 'tr', phraseCount: 1 })], active: 'en' });
        await boot(page, fake);
        // A phrase for the text page's findByIds.
        await page.route('**/data-provider/findByIds', (route) =>
            route.request().method() === 'OPTIONS'
                ? route.fulfill({ status: 204, headers: corsHeaders(route) })
                : respond(route, 200, { status: 'success', data: [{ _id: 'p1', phrase: 'Hallo', translation: 'Merhaba', language: 'de' }] })
        );
        // Exactly what subturtle-extension-apps' buildPracticeNowPath makes (E-08).
        const request = { aiCharacter: 'Kore', mode: 'text', source: { kind: 'phrases', phraseIds: ['p1'] }, returnTo: '/board', language: 'de' };
        const session = Buffer.from(JSON.stringify(request)).toString('base64');
        await page.goto(`/#/practice/live-session-text?session=${encodeURIComponent(session)}&language=de`);

        await expect.poll(() => fake.calls.find((c) => c.name === 'set-active-language')?.args.language).toBe('de');
        await expect
            .poll(() => fake.calls.find((c) => c.name === 'get-coach-instructions')?.args)
            .toMatchObject({ language: 'de', explanationLanguage: 'tr', phraseIds: ['p1'], mode: 'text' });
    });

    test('the starter pack speaks by language, names its groups and keeps deferred items for tomorrow', async ({ page }) => {
        const fake = createFakeServer({ languages: [summary('en'), summary('de')], active: 'de' });
        await boot(page, fake);
        await page.route('**/function/run', async (route) => {
            if (route.request().method() === 'OPTIONS') return route.fallback();
            const { name } = route.request().postDataJSON() || {};
            if (name !== 'get-starter-pack') return route.fallback();
            const res = fake.handle(name, {});
            res.data.items.push({ id: 'de-small-talk-01', text: 'Wie geht’s?', translation: 'چطوری؟', band: 2, group: 'small-talk' });
            return respond(route, 200, { status: 'success', data: res.data });
        });
        await page.goto('/#/practice/starter-pack');

        await expect(page.getByRole('heading', { name: 'Small talk' })).toBeVisible();
        await page.getByTestId('pack-item-de-greetings-01').getByRole('button', { name: 'Play' }).click();
        await expect.poll(() => fake.calls.find((c) => c.name === 'textToSpeechBase64')?.args).toEqual({ userId: USER_ID, text: 'Hallo!', language: 'de' });

        await page.getByTestId('pack-item-de-small-talk-01').getByRole('button', { name: 'Mark as heard' }).click();
        await expect(page.getByTestId('pack-item-de-small-talk-01')).toContainText('Tomorrow');
        await expect(page.getByText('That is enough new phrases for today.')).toBeVisible();
    });
    test('Your progress counts the active language only', async ({ page }) => {
        const fake = createFakeServer({ languages: [summary('en', { phraseCount: 142 }), summary('de', { phraseCount: 3 })], active: 'de' });
        await boot(page, fake);
        const reads: { op: string; collection: string; query: any }[] = [];
        page.on('request', (req) => {
            const m = req.url().match(/data-provider\/(find|count)$/);
            if (m && req.method() === 'POST') {
                const body = req.postDataJSON() || {};
                reads.push({ op: m[1], collection: body.collection, query: body.query });
            }
        });
        await page.goto('/#/statistic');

        await expect.poll(() => reads.filter((r) => r.collection === 'phrase_bundle').length).toBeGreaterThanOrEqual(2);
        for (const r of reads.filter((r) => r.collection === 'phrase_bundle' || r.collection === 'phrase')) {
            expect(r.query.language, `${r.op} ${r.collection}`).toBe('de');
        }
    });

    test('"Back to the steps" in the chat test returns to step 2 with the language picked', async ({ page }) => {
        const fake = createFakeServer();
        await boot(page, fake);
        await page.goto('/#/settings/languages/add');
        await page.getByTestId('pick-de').click();
        await page.getByTestId('add-next').click();
        await page.getByTestId('how-test').click();
        await page.getByTestId('start-test').click();
        await expect(page.getByTestId('test-progress')).toBeVisible();

        await page.getByRole('link', { name: 'Back to the steps' }).click();
        await expect(page.getByRole('heading', { name: 'Where should we start in German?' })).toBeVisible();
        await expect(page.getByTestId('how-test')).toBeVisible();
    });

    test('English help in the chat test is not forced into a right-to-left run', async ({ page }) => {
        const fake = createFakeServer({ testHelp: 'What is your name?' });
        await boot(page, fake);
        await page.goto('/#/settings/languages/test?language=de');

        const help = page.getByText('What is your name?');
        await expect(help).toBeVisible();
        await expect(help).not.toHaveAttribute('dir', 'rtl');
        expect(await help.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    });

    test('Persian help in the chat test stays a right-to-left run', async ({ page }) => {
        const fake = createFakeServer();
        await boot(page, fake);
        await page.goto('/#/settings/languages/test?language=de');
        await expect(page.getByText('سلام! اسمت چیه؟')).toHaveAttribute('dir', 'rtl');
    });

    test('Today shows starter pack progress after marking chunks', async ({ page }) => {
        const fake = createFakeServer({ languages: [summary('en'), summary('de', { starterPack: { state: 'offered', heard: 0, total: 2 } })], active: 'de' });
        await boot(page, fake);
        await page.goto('/#/practice/starter-pack');
        await page.getByTestId('pack-item-de-greetings-01').getByRole('button', { name: 'Mark as heard' }).click();
        await expect(page.getByTestId('pack-item-de-greetings-01')).toContainText('Heard');

        // An in-app move to Today (no reload), as the sidebar link does; the phone layout hides the sidebar.
        await page.evaluate(() => (window.location.hash = '#/board'));
        await expect(page.getByTestId('starter-pack-card')).toContainText('1 of 2 heard');
    });

    test('a phrase and its Persian translation each get their own direction in a bundle', async ({ page }) => {
        const fake = createFakeServer({ languages: [summary('en'), summary('de', { phraseCount: 1 })], active: 'de' });
        await boot(page, fake);
        const bundle = { _id: 'b1', title: 'Dark S1', refId: USER_ID, language: 'de', phrases: ['p1'], createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
        const phrase = { _id: 'p1', phrase: 'Ich habe angefangen', translation: 'من شروع کردم', translation_language: 'fa', refId: USER_ID, type: 'normal', language: 'de' };
        await page.route('**/data-provider/findByIds', (route) => {
            if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders(route) });
            const body = route.request().postDataJSON() || {};
            return respond(route, 200, { status: 'success', data: body.collection === 'phrase' ? [phrase] : [bundle] });
        });
        await page.goto('/#/bundles/b1');

        const translation = page.getByTestId('phrase-translation');
        await expect(translation).toHaveValue('من شروع کردم');
        await expect(translation).toHaveAttribute('dir', 'auto');
        expect(await translation.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
        expect(await page.getByTestId('phrase-text').evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    });
});
