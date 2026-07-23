"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function sourceAttemptId(reference: string) {
  return reference.split(":copy:", 1)[0] ?? reference;
}

import { generateDynamicSheetAction } from "../../sheet-builder/actions-dynamic";

export async function generateQueueSheetAction(formData: FormData) {
  const attemptIds = formData.getAll("attempt").map(String).filter(Boolean);
  if (formData.has("attempt1")) attemptIds.push(String(formData.get("attempt1") ?? "").trim());
  if (formData.has("attempt2")) attemptIds.push(String(formData.get("attempt2") ?? "").trim());
  if (formData.has("attempt3")) attemptIds.push(String(formData.get("attempt3") ?? "").trim());

  const cleanIds = attemptIds.map(sourceAttemptId).filter(Boolean);
  if (cleanIds.length === 0) throw new Error("SELECT_QUEUE_ATTEMPT");

  const generation = new FormData();
  for (const id of cleanIds) {
    generation.append("attempt", id);
  }
  
  if (formData.has("paperSize")) {
    generation.set("paperSize", String(formData.get("paperSize")));
  }
  generation.set("generationRequestKey", String(formData.get("generationRequestKey") ?? ""));

  await generateDynamicSheetAction(generation);
  
  revalidatePath("/production/sheets/queue");
  revalidatePath("/production/sheets");
  if (String(formData.get("bulk") ?? "") === "1") return;
  redirect("/production/sheets?view=automatic&generated=1");
}

export async function generateAllQueueSheetsAction(formData: FormData) {
  const raw = String(formData.get("batch") ?? "");
  let batches: string[][];
  try {
    batches = JSON.parse(raw) as string[][];
  } catch {
    throw new Error("QUEUE_BATCH_INVALID");
  }
  if (!Array.isArray(batches) || batches.length === 0 || batches.length > 200) throw new Error("QUEUE_BATCH_INVALID");
  const paperSize = String(formData.get("paperSize") ?? "A4");
  for (const batch of batches) {
    if (!Array.isArray(batch)) continue;
    const request = new FormData();
    for (const attemptId of batch) {
      request.append("attempt", attemptId);
    }
    request.set("bulk", "1");
    request.set("paperSize", paperSize);
    request.set("generationRequestKey", `bulk-${String(formData.get("generationRequestKey") ?? "")}-${batch[0]}`);
    await generateQueueSheetAction(request);
  }
  revalidatePath("/production/sheets/queue");
  revalidatePath("/production/sheets");
  redirect("/production/sheets?view=automatic&generated=1");
}
