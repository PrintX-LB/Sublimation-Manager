import { describe, expect, it } from "vitest";
import { signInSchema } from "./auth";

describe("signInSchema", () => {
  it("accepts a valid email and password", () => {
    expect(
      signInSchema.safeParse({
        email: "owner@example.com",
        password: "safe-passphrase",
      }).success,
    ).toBe(true);
  });

  it.each([
    { email: "not-an-email", password: "safe-passphrase" },
    { email: "owner@example.com", password: "short" },
  ])("rejects invalid credentials", (credentials) => {
    expect(signInSchema.safeParse(credentials).success).toBe(false);
  });
});
