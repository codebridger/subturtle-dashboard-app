/**
 * Test support for the server events (B-28): a stand-in for the `mixpanel` package that records
 * what would be sent and can be told to fail, so a test runs the REAL `server/src/utils/analytics.ts`
 * (identity rules included) and no real event ever leaves the machine.
 *
 *   jest.mock("mixpanel", () => require("<path>/utils/test-support/mixpanel-capture").mixpanelMock);
 *
 * Importing this file sets a fake MIXPANEL_TOKEN, so it must be loaded before `analytics.ts`
 * (the `jest.mock` factory above does that). Also add `anonymousAuthStub` as the `auth`
 * collection so the helper can tell a signed-in learner from the shared anonymous account.
 */
process.env.MIXPANEL_TOKEN = "test-token";

export interface SentEvent {
  event: string;
  props: Record<string, any>;
}

export const sent: SentEvent[] = [];
let failing = false;

export const mixpanelMock = {
  init: () => ({
    track: (event: string, props: Record<string, any>) => {
      if (failing) throw new Error("mixpanel is down");
      sent.push({ event, props });
    },
  }),
};

/** Make every later `track` throw (true) or work again (false). */
export function failMixpanel(on: boolean): void {
  failing = on;
}

/** Forget what was sent and stop failing. */
export function resetMixpanel(): void {
  sent.length = 0;
  failing = false;
}

/** Events are sent without waiting, so let them finish before looking. */
export async function flushEvents(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

/** The sent events with this name. */
export const sentNamed = (event: string): SentEvent[] => sent.filter((e) => e.event === event);

/** Stands in for the `auth` collection: the shared anonymous account is not any test learner. */
export const anonymousAuthStub = {
  findOne: () => ({ select: () => ({ lean: () => ({ exec: async () => ({ _id: "64b0000000000000000000aa" }) }) }) }),
};
