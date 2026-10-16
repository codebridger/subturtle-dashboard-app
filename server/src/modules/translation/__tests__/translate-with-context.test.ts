/**
 * translateWithContext on main: provider errors, and the translation_requested event
 * (B-01: the caller and its install id; B-03: the client trigger). The multilingual
 * tests for this function live on dev.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

let mockProfile: any = null;
const mockUpdateOne = jest.fn<(...args: any[]) => Promise<any>>(async () => ({}));
jest.mock("@modular-rest/server", () => ({
  defineFunction: (opts: any) => opts,
  getCollection: () => ({
    findOne: () => ({ lean: async () => mockProfile }),
    updateOne: mockUpdateOne,
  }),
}));

const mockSimple = jest.fn<(...args: any[]) => Promise<any>>();
const mockDetailed = jest.fn<(...args: any[]) => Promise<any>>();
jest.mock("../service", () => ({
  getSimpleTranslation: (...args: any[]) => mockSimple(...args),
  getDetailedTranslation: (...args: any[]) => mockDetailed(...args),
  getTranslationAdvice: jest.fn(),
}));
jest.mock("../../../utils/analytics", () => ({
  trackServerEvent: jest.fn(),
  SERVER_ANALYTICS_EVENTS: { TRANSLATION_REQUESTED: "translation_requested" },
}));

const { functions } = require("../functions") as { functions: any[] };
const { trackServerEvent } = require("../../../utils/analytics") as { trackServerEvent: jest.Mock };
const translate = functions.find((f) => f.name === "translateWithContext").callback;

const USER = "64b000000000000000000001";

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = { refId: USER, learningLanguage: "de", learningLanguages: ["de", "es"], translationLanguage: "fa" };
});

describe("translateWithContext", () => {
  it("wraps provider errors once", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockDetailed.mockRejectedValue(new Error("Failed to translate text: boom"));
    await expect(translate({ phrase: "p", context: "c", translationType: "detailed" })).rejects.toThrow(/^Failed to translate text: boom$/);
  });

  it("B-01: tracks translation_requested on the caller and its install id", async () => {
    mockSimple.mockResolvedValue("x");
    await translate({ phrase: "p", context: "c", translationLanguage: "fa", userId: USER, deviceId: "dev-1" });
    expect(trackServerEvent).toHaveBeenCalledWith(
      "translation_requested",
      { userId: USER, deviceId: "dev-1" },
      expect.objectContaining({ translation_type: "simple" })
    );
  });

  it("B-01: an old client with no user id is no longer tracked as the string \"anonymous\" user", async () => {
    mockSimple.mockResolvedValue("x");
    await translate({ phrase: "p", context: "c", translationLanguage: "fa" });
    expect(trackServerEvent).toHaveBeenCalledWith("translation_requested", { userId: undefined, deviceId: undefined }, expect.anything());
  });

  it.each(["caption", "word", "selection", "definition", "detail"])("B-03: tracks the trigger %p as sent", async (trigger) => {
    mockSimple.mockResolvedValue("x");
    await translate({ phrase: "p", context: "c", translationLanguage: "fa", trigger });
    expect(trackServerEvent).toHaveBeenCalledWith("translation_requested", expect.anything(), expect.objectContaining({ trigger }));
  });

  it.each([[undefined], [""], ["Caption"], ["popup"], [42], [{ x: 1 }]])("B-03: tracks trigger %p as \"unknown\"", async (trigger) => {
    mockSimple.mockResolvedValue("x");
    await translate({ phrase: "p", context: "c", translationLanguage: "fa", trigger });
    expect(trackServerEvent).toHaveBeenCalledWith(
      "translation_requested",
      expect.anything(),
      expect.objectContaining({ trigger: "unknown" })
    );
  });
});
