import type { LivePracticeSessionSetupType } from '~/types/live-session.type';

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

export interface LastSession {
    bundleId: string;
    mode: 'voice' | 'text';
    setup: LivePracticeSessionSetupType;
    title?: string;
    at: number;
}

export function rememberLastSession(entry: Omit<LastSession, 'at'>) {
    try {
        localStorage.setItem(KEY, JSON.stringify({ ...entry, at: Date.now() }));
    } catch {
        // Private mode / blocked storage: the button just stays hidden.
    }
}

export function readLastSession(): LastSession | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as LastSession;
        return parsed?.bundleId && parsed?.setup ? parsed : null;
    } catch {
        return null;
    }
}
