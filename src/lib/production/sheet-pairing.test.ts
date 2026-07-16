import { describe, expect, it } from "vitest";
import { suggestPairs, templateCompatibilityKey, type PairingAttempt } from "./sheet-pairing";

const item = (id: string, compatibilityKey: string, priority = "Normal", dueDate: Date | null = null): PairingAttempt => ({ id, attemptNumber: 1, status: "Ready to Print", createdAt: new Date(id === "a" ? "2026-07-01" : "2026-07-02"), orderNumber: `PX${id}`, orderId: id, customerName: id, productName: "Mug", variantName: "White", dueDate, priority, artworkVersionId: id, artworkPath: `uploads/${id}.png`, templateName: "Standard", compatibilityKey, assigned: false });

describe("automatic sheet pairing", () => {
  it("creates deterministic compatible pairs and leaves odd items unpaired", () => {
    const result = suggestPairs([item("a", "A", "Normal"), item("b", "A", "Urgent"), item("c", "A"), item("d", "B")]);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]?.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(result.unpaired.map((entry) => entry.id)).toEqual(["c", "d"]);
  });

  it("uses stable template keys for compatible output requirements", () => {
    expect(templateCompatibilityKey({ name: "Standard 11 oz Mug", widthMm: 210, heightMm: 95, dpi: 300 })).toBe("STANDARD_11_OZ_MUG_2480X1122_300DPI_MIRRORED_NO_CONTOUR");
    expect(templateCompatibilityKey({ name: "Standard 11 oz Mug", widthMm: 210, heightMm: 95, dpi: 300, contour: true })).not.toBe(templateCompatibilityKey({ name: "Standard 11 oz Mug", widthMm: 210, heightMm: 95, dpi: 300 }));
  });
});
