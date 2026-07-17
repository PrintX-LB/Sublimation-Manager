import { redirect } from "next/navigation";

export default async function LegacySheetQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ generated?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams({ view: "automatic" });
  if (params.generated) query.set("generated", params.generated);
  redirect(`/production/sheets?${query.toString()}`);
}
