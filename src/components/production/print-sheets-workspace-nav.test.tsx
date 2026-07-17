import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrintSheetsWorkspaceNav } from "./print-sheets-workspace-nav";

describe("PrintSheetsWorkspaceNav", () => {
  it("exposes all sheet workflows from one accessible navigation region", () => {
    render(<PrintSheetsWorkspaceNav active="automatic" />);

    expect(
      screen.getByRole("navigation", { name: "Print Sheets workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manual creation/ })).toHaveAttribute(
      "href",
      "/production/sheets?view=manual",
    );
    expect(
      screen.getByRole("link", { name: /Automatic pairing/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: /Generated history/ }),
    ).toHaveAttribute("href", "/production/sheets?view=history");
  });
});
