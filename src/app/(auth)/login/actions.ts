"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema } from "@/lib/validation/auth";

export type LoginState = { error?: string };

export async function login(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const result = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!result.success)
    return {
      error: result.error.issues[0]?.message ?? "Invalid sign-in details",
    };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(result.data);
  if (error) return { error: "The email or password is incorrect." };
  redirect("/dashboard");
}
