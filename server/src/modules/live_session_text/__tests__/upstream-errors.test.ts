import { classifyUpstreamStatus, upstreamStatusOf } from "../utils";

describe("upstream error classification", () => {
  it("reads the status from the SDK error, or from its JSON message", () => {
    expect(upstreamStatusOf({ status: 429 })).toBe(429);
    expect(
      upstreamStatusOf(
        new Error('got status 402: {"error":{"code":402,"message":"depleted"}}')
      )
    ).toBe(402);
    expect(upstreamStatusOf(new Error("socket hang up"))).toBeUndefined();
  });

  it("maps statuses to stable reasons", () => {
    expect(classifyUpstreamStatus(402)).toBe("upstream_quota");
    expect(classifyUpstreamStatus(429)).toBe("upstream_rate_limited");
    expect(classifyUpstreamStatus(500)).toBe("upstream_unavailable");
    expect(classifyUpstreamStatus(503)).toBe("upstream_unavailable");
    expect(classifyUpstreamStatus(400)).toBe("upstream_error");
    expect(classifyUpstreamStatus(undefined)).toBe("upstream_error");
  });
});
