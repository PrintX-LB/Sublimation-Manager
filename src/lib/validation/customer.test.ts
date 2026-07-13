import { describe, expect, it } from "vitest";
import { customerSchema } from "./customer";

describe("customerSchema", () => {
  it("accepts a customer with only a name", () => {
    expect(customerSchema.safeParse({ fullName: "Ana Torres" }).success).toBe(
      true,
    );
  });

  it("normalises blank optional contact fields", () => {
    const result = customerSchema.parse({
      fullName: "Ana Torres",
      phone: "",
      email: "",
    });
    expect(result.phone).toBeUndefined();
    expect(result.email).toBeUndefined();
  });

  it("rejects invalid email addresses", () => {
    expect(
      customerSchema.safeParse({ fullName: "Ana Torres", email: "bad" })
        .success,
    ).toBe(false);
  });
});
