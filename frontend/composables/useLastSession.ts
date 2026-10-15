import type { LivePracticeSessionSetupType } from '~/types/live-session.type';
import { scopedLanguage } from '~/utils/languageScope';

/**
 * The setup of the most recent session this browser started, so "Repeat your last session"
 * can replay it in one click.
 *
 * Kept in localStorage rather than read back from history: `list-live-sessions` is a
 * Learner+ entitlement that throws for the free tier, so sourcing the button from it would
 * make it fail for exactly the users most likely to press it. The trade-off is that it is
 * per-browser and does not follow the account.
 */
const KEY = 'subturtle:last-live-session';

/**
 * One last session per learning language (D-17): a German bundle must never be offered while
 * the learner studies Spanish. English, and everything while multilingual is off, keeps the
 * original key, so the button a learner already had survives the update.
 */
function keyFor(): string {
    const language = scopedLanguage();
    return language && language !== 'en' ? `${KEY}:${language}` : KEY;
}

export interface LastSession {
    bundleId: string;
    mode: 'voice' | 'text';
    setup: LivePracticeSessionSetupType;
    title?: string;
    at: number;
}

export function rememberLastSession(entry: Omit<LastSession, 'at'>) {
    try {
        localStorage.setItem(keyFor(), JSON.stringify({ ...entry, at: Date.now() }));
    } catch {
        // Private mode / blocked storage: the button just stays hidden.
    }
}

export function readLastSession(): LastSession | null {
    try {
        const raw = localStorage.getItem(keyFor());
        if (!raw) return null;
        const parsed = JSON.parse(raw) as LastSession;
        return parsed?.bundleId && parsed?.setup ? parsed : null;
    } catch {
        return null;
    }
}
