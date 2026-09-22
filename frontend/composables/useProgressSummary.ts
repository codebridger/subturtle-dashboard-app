import { functionProvider } from '@modular-rest/client';
import { COLLECTIONS, DATABASE } from '~/types/database.type';
import { FN, type UserStatisticType } from '~/types/function.type';

/** One bar in the 7-day chart. */
export interface ProgressDay {
    /** YYYY-MM-DD, as the server reported it. */
    date: string;
    /** Short weekday label, e.g. "Mon". */
    label: string;
    value: number;
}

/** 14 days: the week on screen, plus the week before it for the comparison. */
const WINDOW = 14;

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * generateChartDataForInsertionRatio deliberately drops zero-days that sit between two
 * non-zero days (a smoothing hack for the old area chart). A bar chart and a streak both
 * need every calendar day, so re-expand the sparse series against real dates — a date the
 * server omitted had a count of zero, so nothing is lost.
 *
 * The window is anchored on the LAST date the server returned rather than on the browser
 * clock, so the two never disagree about which day "today" is across timezones.
 */
function densify(points: Array<[string, number]>, size: number): Array<[string, number]> {
    const byDate = new Map(points);
    const anchor = points.length ? points[points.length - 1][0] : toISO(new Date());
    const end = new Date(`${anchor}T00:00:00`);

    const out: Array<[string, number]> = [];
    for (let back = size - 1; back >= 0; back--) {
        const day = new Date(end);
        day.setDate(end.getDate() - back);
        const key = toISO(day);
        out.push([key, byDate.get(key) ?? 0]);
    }
    return out;
}

/**
 * Consecutive days with at least one phrase saved, counting back from the most recent day.
 * A zero on the final day does not break the run — that day is still in progress.
 *
 * NOTE: this is "days you saved something", not "days you reviewed". It is the closest
 * signal available client-side; a real streak belongs on the server. See the plan's
 * follow-ups.
 */
function streakFrom(series: Array<[string, number]>): number {
    let i = series.length - 1;
    if (i >= 0 && series[i][1] === 0) i--;

    let run = 0;
    for (; i >= 0 && series[i][1] > 0; i--) run++;
    return run;
}

export function useProgressSummary() {
    const loading = ref(true);
    /**
     * Both RPCs are gated on the `weekly_insights` entitlement, so a rejection means the
     * user's tier doesn't include insights — that drives the locked panel, not an error.
     */
    const locked = ref(false);
    const totals = ref<UserStatisticType>({ totalPhrases: 0, totalBundles: 0 });
    const week = ref<ProgressDay[]>([]);
    const streak = ref(0);
    /** Percentage change vs. the previous 7 days, or null when there is no baseline. */
    const weekDelta = ref<number | null>(null);

    async function load() {
        loading.value = true;
        try {
            const [stats, raw] = await Promise.all([
                functionProvider.run<UserStatisticType>({
                    name: FN.getUserStatistic,
                    args: { userId: authUser.value?.id },
                }),
                functionProvider.run<Array<[string, number]>>({
                    name: 'generateChartDataForInsertionRatio',
                    args: {
                        database: DATABASE.USER_CONTENT,
                        collection: COLLECTIONS.PHRASE,
                        userId: authUser.value?.id,
                        // The RPC returns days + 1 points (inclusive of both ends).
                        days: WINDOW - 1,
                    },
                }),
            ]);

            totals.value = stats;

            const series = densify(raw ?? [], WINDOW);
            const last7 = series.slice(-7);
            const prev7 = series.slice(0, 7);

            week.value = last7.map(([date, value]) => ({
                date,
                value,
                label: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
            }));

            const current = last7.reduce((sum, [, n]) => sum + n, 0);
            const previous = prev7.reduce((sum, [, n]) => sum + n, 0);
            weekDelta.value = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

            streak.value = streakFrom(series);
        } catch {
            locked.value = true;
        } finally {
            loading.value = false;
        }
    }

    return { loading, locked, totals, week, streak, weekDelta, load };
}
