import { redirect } from "next/navigation";

export default async function LegacySheetBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; created?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ view: "manual" });
  if (params.q) query.set("q", params.q);
  if (params.created) query.set("created", params.created);
  redirect(`/production/sheets?${query.toString()}`);
}
