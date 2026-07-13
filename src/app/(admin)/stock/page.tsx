import { redirect } from "next/navigation";

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const queryParams = new URLSearchParams();

  // Copy all search params over
  Object.entries(params).forEach(([key, val]) => {
    if (typeof val === "string") {
      queryParams.set(key, val);
    }
  });

  // Force stock tab
  queryParams.set("tab", "stock");

  redirect(`/inventory?${queryParams.toString()}`);
}
