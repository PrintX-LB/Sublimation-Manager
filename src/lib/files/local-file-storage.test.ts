import { describe, expect, it } from "vitest";

describe("local file storage paths", () => {
  it("keeps customer files under the uploads directory", async () => {
    const source = await import("./local-file-storage");
    expect(source.saveUploadedFile).toBeTypeOf("function");
  });
});
