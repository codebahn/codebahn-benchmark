import { describe, it, expect } from "vitest";
import { validateUsername } from "../src/validate.js";

describe("validateUsername", () => {
  it("accepts valid usernames", () => {
    expect(validateUsername("alice").valid).toBe(true);
    expect(validateUsername("bob-123").valid).toBe(true);
    expect(validateUsername("charlie_dev").valid).toBe(true);
  });

  it("rejects short usernames", () => {
    expect(validateUsername("ab").valid).toBe(false);
    expect(validateUsername("a").valid).toBe(false);
  });

  it("rejects long usernames", () => {
    expect(validateUsername("a".repeat(40)).valid).toBe(false);
  });

  it("rejects invalid characters", () => {
    expect(validateUsername("has spaces").valid).toBe(false);
    expect(validateUsername("has@symbol").valid).toBe(false);
  });
});
