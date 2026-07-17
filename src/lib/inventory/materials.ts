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

export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

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
  { value: "PACKAGING_PIECES", label: "Packaging / Pieces" },
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
  { value: "PIECE", label: "Pieces" },
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
  // Units are intentionally an internal compatibility detail. New inventory
  // records are tracked as whole user-defined units regardless of legacy unit.
  void unit;
  return "Unit";
}

export function inventoryQuantityLabel(value: number | string): string {
  const numeric = typeof value === "number" ? value : Number(value);
  return numeric === 1 ? "unit" : "units";
}
