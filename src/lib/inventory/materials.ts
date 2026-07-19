export const INVENTORY_UNITS = [
  "PIECE",
  "SHEET",
  "ROLL",
  "METRE",
  "MILLILITRE",
  "LITRE",
  "GRAM",
  "KILOGRAM",
] as const;

/** Canonical units for container-tracked consumables. Legacy inventory units remain supported for blank products. */
export const CONSUMABLE_UNITS = ["UNITS", "SHEETS", "ML", "M"] as const;
export type ConsumableUnit = (typeof CONSUMABLE_UNITS)[number];

export type InventoryUnit = (typeof INVENTORY_UNITS)[number] | ConsumableUnit;

export function canonicalConsumableUnit(unit: string): ConsumableUnit {
  if (unit === "SHEET" || unit === "SHEETS") return "SHEETS";
  if (unit === "MILLILITRE" || unit === "ML") return "ML";
  if (unit === "METRE" || unit === "M") return "M";
  return "UNITS";
}

export function consumableUnitLabel(unit: string): string {
  switch (canonicalConsumableUnit(unit)) {
    case "ML": return "ml";
    case "M": return "m";
    case "SHEETS": return "sheets";
    default: return "units";
  }
}

export function formatInventoryQuantity(value: number | string, unit: string): string {
  const numeric = typeof value === "number" ? value : Number(value);
  const formatted = Number.isFinite(numeric)
    ? numeric.toLocaleString("en-US", { maximumFractionDigits: 3 })
    : "—";
  const normalized = canonicalConsumableUnit(unit);
  const label = normalized === "ML"
    ? "ml"
    : normalized === "M"
      ? "m"
      : normalized === "SHEETS"
        ? numeric === 1 ? "sheet" : "sheets"
        : numeric === 1 ? "unit" : "units";
  return `${formatted} ${label}`;
}

export function containerLabelFor(unit: string, override?: string | null): string {
  if (override?.trim() && !/^(pieces?|units?|sheets?|ml|m)$/i.test(override.trim())) return override.trim();
  switch (canonicalConsumableUnit(unit)) {
    case "ML": return "Bottle";
    case "M": return "Roll";
    case "SHEETS": return "Pack";
    default: return "Container";
  }
}

export const MATERIAL_TYPES = [
  "PAPER_SHEETS",
  "INK_LIQUID",
  "TAPE_LENGTH",
  "PACKAGING_PIECES",
  "OTHER",
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const MATERIAL_TYPE_OPTIONS: ReadonlyArray<{
  value: MaterialType;
  label: string;
}> = [
  { value: "PAPER_SHEETS", label: "Paper / Sheets" },
  { value: "INK_LIQUID", label: "Ink / Liquid" },
  { value: "TAPE_LENGTH", label: "Tape / Length" },
  { value: "PACKAGING_PIECES", label: "Packaging / Units" },
  { value: "OTHER", label: "Other" },
];

export const MATERIAL_TYPE_TO_UNIT: Record<MaterialType, InventoryUnit> = {
  PAPER_SHEETS: "SHEET",
  INK_LIQUID: "MILLILITRE",
  TAPE_LENGTH: "METRE",
  PACKAGING_PIECES: "PIECE",
  OTHER: "PIECE",
};

export const INVENTORY_UNIT_OPTIONS: ReadonlyArray<{
  value: InventoryUnit;
  label: string;
}> = [
  { value: "PIECE", label: "Units" },
  { value: "SHEET", label: "Sheets" },
  { value: "ROLL", label: "Rolls" },
  { value: "METRE", label: "Metres" },
  { value: "MILLILITRE", label: "Millilitres" },
  { value: "LITRE", label: "Litres" },
  { value: "GRAM", label: "Grams" },
  { value: "KILOGRAM", label: "Kilograms" },
];

export function materialUnitForType(type: MaterialType): InventoryUnit {
  return MATERIAL_TYPE_TO_UNIT[type];
}

export function materialTypeFromUnit(unit: string): MaterialType {
  if (unit === "SHEET") return "PAPER_SHEETS";
  if (unit === "MILLILITRE" || unit === "LITRE") return "INK_LIQUID";
  if (unit === "METRE" || unit === "ROLL") return "TAPE_LENGTH";
  if (unit === "PIECE") return "PACKAGING_PIECES";
  return "OTHER";
}

export function inventoryUnitLabel(unit: string): string {
  return consumableUnitLabel(unit);
}

export function inventoryQuantityLabel(value: number | string, unit = "UNITS"): string {
  return formatInventoryQuantity(value, unit);
}
