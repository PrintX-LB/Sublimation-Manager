import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeading } from "./page-heading";

describe("PageHeading", () => {
  it("renders one accessible page heading and its description", () => {
    render(<PageHeading title="Orders" description="Manage orders" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Orders" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Manage orders")).toBeInTheDocument();
  });
});
