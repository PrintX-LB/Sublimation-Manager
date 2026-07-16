export const PRODUCTION_INCIDENT_REASONS = [
  "Damaged during pressing",
  "Misprint",
  "Wrong artwork",
  "Machine failure",
  "Customer-requested change",
  "Other",
] as const;

export type ProductionIncidentReason = (typeof PRODUCTION_INCIDENT_REASONS)[number];

export const OTHER_MATERIAL_WASTE_OPTIONS = [
  "None",
  "Sublimation paper",
  "Ink",
  "Heat tape",
  "Other",
] as const;
