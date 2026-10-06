import { describe, it, expect, afterEach } from "@jest/globals";
import { generateVerificationCode } from "../verification-code";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});

describe("generateVerificationCode", () => {
  it("returns the well-known code outside production, for the local test loop", () => {
    process.env.NODE_ENV = "development";

    expect(generateVerificationCode()).toBe("123456");
  });

  it("returns an unguessable code in production", () => {
    process.env.NODE_ENV = "production";

    // A guessable code turns /user/submit_password - a password reset for any account
    // matching the id - into an account takeover by email address alone.
    const codes = Array.from({ length: 5 }, generateVerificationCode);

    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{32}$/);
      expect(code).not.toBe("123456");
    }
  });
});
