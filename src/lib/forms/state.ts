export type FormState = {
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialFormState: FormState = {};
