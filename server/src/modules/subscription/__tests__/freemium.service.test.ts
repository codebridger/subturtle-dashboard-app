import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("@modular-rest/server", () => ({
  getCollection: jest.fn(),
  userManager: { getUserById: jest.fn() },
}));
jest.mock("../tiers", () => ({
  getTierRegistry: jest.fn(),
}));

import { canStartFreemiumLiveSession, getStarterTier } from "../service";
import { getTierRegistry } from "../tiers";
import { getCollection } from "@modular-rest/server";

// A valid 24-hex ObjectId — getOrCreateFreemiumAllocation casts userId via mongoose.
const UID = "507f1f77bcf86cd799439011";

const starterWithLiveCap = (cap: number | null) => ({
  id: "starter",
  caps: {
    live_conversations: cap,
    save_words: 200,
    ai_credits: 5_000_000,
    smart_review: null,
    weekly_insights: 0,
    session_history: 0,
  },
  creditBudget: 5_000_000,
  durationDays: 30,
});

function mockRegistry(getTier: any) {
  (getTierRegistry as any).mockReturnValue({ getTier });
}

/** Existing freemium allocation with a given used-session counter. */
function stubExistingAllocation(used: number) {
  (getCollection as any).mockReturnValue({
    findOne: jest.fn<any>().mockResolvedValue({
      toObject: () => ({
        allowed_lived_sessions_used: used,
        allowed_lived_sessions: 3,
        total_credits: 5_000_000,
        credits_used: 0,
      }),
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getStarterTier", () => {
  it("returns the Starter tier from the registry", async () => {
    mockRegistry(jest.fn<any>().mockResolvedValue(starterWithLiveCap(3)));
    expect((await getStarterTier())!.id).toBe("starter");
  });

  it("returns null (fallback) when the registry throws", async () => {
    mockRegistry(jest.fn<any>().mockRejectedValue(new Error("Stripe down")));
    expect(await getStarterTier()).toBeNull();
  });
});

describe("canStartFreemiumLiveSession", () => {
  it("allows when used < the Starter cap", async () => {
    mockRegistry(jest.fn<any>().mockResolvedValue(starterWithLiveCap(3)));
    stubExistingAllocation(2);
    expect(await canStartFreemiumLiveSession(UID)).toBe(true);
  });

  it("blocks when used >= the Starter cap", async () => {
    mockRegistry(jest.fn<any>().mockResolvedValue(starterWithLiveCap(3)));
    stubExistingAllocation(3);
    expect(await canStartFreemiumLiveSession(UID)).toBe(false);
  });

  it("treats a null cap as unlimited and never reads the allocation", async () => {
    mockRegistry(jest.fn<any>().mockResolvedValue(starterWithLiveCap(null)));
    expect(await canStartFreemiumLiveSession(UID)).toBe(true);
    expect(getCollection as any).not.toHaveBeenCalled();
  });

  it("falls back to the config default cap when Starter is unavailable", async () => {
    mockRegistry(jest.fn<any>().mockRejectedValue(new Error("Stripe down")));
    stubExistingAllocation(3); // FREEMIUM_DEFAULT_LIVED_SESSIONS = 3
    expect(await canStartFreemiumLiveSession(UID)).toBe(false);
  });
});
