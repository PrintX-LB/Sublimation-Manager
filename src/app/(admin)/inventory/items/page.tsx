import { redirect } from "next/navigation";

export default function InventoryItemsPage() {
  redirect("/inventory?tab=materials");
}
