/**
 * Exercises the `text-turn` callback in isolation: modular-rest, the Gemini SDK,
 * and the subscription service are all mocked so we can assert the turn's
 * function-call loop, persistence, and billing without a DB or network.
 */
const mockGenerateContent = jest.fn();
const mockCollection = {
  findOne: jest.fn(),
  updateOne: jest.fn(),
  create: jest.fn(),
};
const mockCheckCredit = jest.fn();
const mockRecordUsage = jest.fn();

jest.mock("@modular-rest/server", () => ({
  defineFunction: (opts: any) => opts,
  getCollection: () => mockCollection,
}));
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));
jest.mock("../../subscription/service", () => ({
  checkCreditAllocation: (...args: any[]) => mockCheckCredit(...args),
  recordUsage: (...args: any[]) => mockRecordUsage(...args),
}));

// functions.ts uses CommonJS `module.exports.functions`, so require it.
const { functions } = require("../functions") as { functions: any[] };

const textTurn: any = functions.find((f) => f.name === "text-turn");

function baseRecord(overrides: any = {}) {
  return {
    _id: "sess1",
    refId: "user1",
    instructions: "be a tutor",
    toolDeclarations: [{ name: "activate_phrase" }],
    session: { modalities: ["TEXT"], model: "gemini-2.5-flash-lite" },
    contents: [],
    dialogs: [],
    usage: {
      total_tokens: 0,
      prompt_tokens: 0,
      response_tokens: 0,
      cached_tokens: 0,
      thoughts_tokens: 0,
      tool_use_tokens: 0,
    },
    ...overrides,
  };
}

describe("text-turn", () => {
  beforeAll(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckCredit.mockResolvedValue({ allowedToProceed: true });
    mockRecordUsage.mockResolvedValue(undefined);
    mockCollection.updateOne.mockResolvedValue({});
  });

  it("returns pending function calls and persists the model's call turn", async () => {
    mockCollection.findOne.mockResolvedValue(baseRecord());
    mockGenerateContent.mockResolvedValue({
      text: "",
      functionCalls: [{ name: "activate_phrase", args: { index: 2 } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0, totalTokenCount: 10 },
    });

    const res = await textTurn.callback({
      userId: "user1",
      sessionId: "sess1",
      input: { kind: "user", text: "let's practice phrase 2" },
    });

    expect(res.done).toBe(false);
    expect(res.functionCalls[0].name).toBe("activate_phrase");
    expect(mockRecordUsage).toHaveBeenCalledTimes(1);

    // Persisted contents end with the model's functionCall turn; no AI dialog yet.
    const saved = mockCollection.updateOne.mock.calls[0][1].$set;
    const lastTurn = saved.contents[saved.contents.length - 1];
    expect(lastTurn.role).toBe("model");
    expect(lastTurn.parts[0].functionCall.name).toBe("activate_phrase");
    expect(saved.dialogs).toBeUndefined();
  });

  it("returns final text, bills usage, and appends user + ai dialogs", async () => {
    mockCollection.findOne.mockResolvedValue(baseRecord());
    mockGenerateContent.mockResolvedValue({
      text: "Great — use it in a sentence.",
      functionCalls: [],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 6, totalTokenCount: 18 },
    });

    const res = await textTurn.callback({
      userId: "user1",
      sessionId: "sess1",
      input: { kind: "user", text: "hello" },
    });

    expect(res.done).toBe(true);
    expect(res.text).toContain("sentence");
    expect(mockRecordUsage).toHaveBeenCalledTimes(1);
    const costArgs = mockRecordUsage.mock.calls[0][0];
    expect(costArgs.serviceType).toBe("live_session");
    expect(costArgs.modelUsed).toBe("gemini-2.5-flash-lite");

    const saved = mockCollection.updateOne.mock.calls[0][1].$set;
    expect(saved.dialogs.map((d: any) => d.speaker)).toEqual(["user", "ai"]);
    expect(saved.usage.response_tokens).toBe(6);
  });

  it("feeds tool results back as a functionResponse turn (no extra user dialog)", async () => {
    mockCollection.findOne.mockResolvedValue(
      baseRecord({
        contents: [
          { role: "user", parts: [{ text: "practice 2" }] },
          { role: "model", parts: [{ functionCall: { name: "activate_phrase", args: { index: 2 } } }] },
        ],
        dialogs: [{ id: "user-1", content: "practice 2", speaker: "user" }],
      })
    );
    mockGenerateContent.mockResolvedValue({
      text: "Nice, now use it.",
      functionCalls: [],
      usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 4, totalTokenCount: 19 },
    });

    const res = await textTurn.callback({
      userId: "user1",
      sessionId: "sess1",
      input: {
        kind: "toolResults",
        results: [{ name: "activate_phrase", output: { success: true, index: 2 } }],
      },
    });

    expect(res.done).toBe(true);
    // The function-response turn was appended before the model reply.
    const saved = mockCollection.updateOne.mock.calls[0][1].$set;
    const fnResponseTurn = saved.contents.find(
      (c: any) => c.parts?.[0]?.functionResponse
    );
    expect(fnResponseTurn.role).toBe("user");
    expect(fnResponseTurn.parts[0].functionResponse.name).toBe("activate_phrase");
    // Only one user dialog (the original) + the new ai dialog — tool results aren't shown.
    expect(saved.dialogs.filter((d: any) => d.speaker === "user")).toHaveLength(1);
    expect(saved.dialogs.filter((d: any) => d.speaker === "ai")).toHaveLength(1);
  });

  it("throws the exhaustion code when credits are depleted", async () => {
    mockCollection.findOne.mockResolvedValue(baseRecord());
    mockCheckCredit.mockResolvedValue({ allowedToProceed: false });

    await expect(
      textTurn.callback({
        userId: "user1",
        sessionId: "sess1",
        input: { kind: "user", text: "hi" },
      })
    ).rejects.toThrow(/AI_CREDIT_EXHAUSTED/);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

describe("create-text-session", () => {
  const createSession: any = functions.find(
    (f) => f.name === "create-text-session"
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckCredit.mockResolvedValue({ allowedToProceed: true });
    mockCollection.create.mockResolvedValue({ _id: "sess-new" });
  });

  it("persists an allowed model and returns the session id", async () => {
    const res = await createSession.callback({
      userId: "user1",
      instructions: "be a tutor",
      toolDeclarations: [],
      model: "gemini-2.5-flash",
    });
    expect(res).toEqual({ sessionId: "sess-new", model: "gemini-2.5-flash" });
    expect(mockCollection.create).toHaveBeenCalledTimes(1);
  });

  it("defaults the model when none is provided", async () => {
    const res = await createSession.callback({
      userId: "user1",
      instructions: "be a tutor",
    });
    expect(res.model).toBe("gemini-2.5-flash-lite");
  });

  it("rejects an unsupported model before any credit check or write", async () => {
    await expect(
      createSession.callback({
        userId: "user1",
        instructions: "be a tutor",
        model: "made-up-model",
      })
    ).rejects.toThrow(/Unsupported text model/);
    expect(mockCheckCredit).not.toHaveBeenCalled();
    expect(mockCollection.create).not.toHaveBeenCalled();
  });
});
