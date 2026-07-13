import { redirect } from "next/navigation";

export default async function ProductsPage({
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
  
  // Force products tab
  queryParams.set("tab", "products");

  redirect(`/inventory?${queryParams.toString()}`);
}
