import type {
  MedicationSchedule,
  OfficialMedicationMatchStatus,
  RegistrationMethod,
  SavedMedication,
} from "@/lib/types";

export type SupabaseMedicationRow = {
  id: string;
  user_id: string;
  catalog_id: string | null;
  display_label: string | null;
  name: string;
  ingredient_name: string | null;
  strength_value: number;
  strength_unit: "mg";
  manufacturer: string | null;
  english_name: string | null;
  image_path: string;
  product_image: string | null;
  fallback_image: string | null;
  image_type: "product" | "fallback" | null;
  image_source_name: string | null;
  image_source_url: string | null;
  search_keywords: string[] | null;
  official_match_status: OfficialMedicationMatchStatus | null;
  registration_method: RegistrationMethod;
  schedule: MedicationSchedule;
  active: boolean;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

export function fromSupabaseMedication(row: SupabaseMedicationRow): SavedMedication {
  return {
    id: row.id,
    catalogId: row.catalog_id ?? undefined,
    displayLabel: row.display_label ?? undefined,
    name: row.name,
    ingredientName: row.ingredient_name ?? undefined,
    strengthValue: row.strength_value,
    strengthUnit: row.strength_unit,
    manufacturer: row.manufacturer ?? undefined,
    englishName: row.english_name ?? undefined,
    imagePath: row.image_path,
    productImage: row.product_image ?? undefined,
    fallbackImage: row.fallback_image ?? undefined,
    imageType: row.image_type ?? undefined,
    imageSourceName: row.image_source_name ?? undefined,
    imageSourceUrl: row.image_source_url ?? undefined,
    searchKeywords: row.search_keywords ?? undefined,
    officialMatchStatus: row.official_match_status ?? undefined,
    registrationMethod: row.registration_method,
    schedule: row.schedule,
    active: row.active,
    deactivatedAt: row.deactivated_at ?? undefined,
    createdAt: row.created_at,
  };
}

export function toSupabaseMedication(
  medication: SavedMedication,
  userId: string,
): SupabaseMedicationRow {
  return {
    id: medication.id,
    user_id: userId,
    catalog_id: medication.catalogId ?? null,
    display_label: medication.displayLabel ?? null,
    name: medication.name,
    ingredient_name: medication.ingredientName ?? null,
    strength_value: medication.strengthValue,
    strength_unit: medication.strengthUnit,
    manufacturer: medication.manufacturer ?? null,
    english_name: medication.englishName ?? null,
    image_path: medication.imagePath,
    product_image: medication.productImage ?? null,
    fallback_image: medication.fallbackImage ?? null,
    image_type: medication.imageType ?? null,
    image_source_name: medication.imageSourceName ?? null,
    image_source_url: medication.imageSourceUrl ?? null,
    search_keywords: medication.searchKeywords ?? null,
    official_match_status: medication.officialMatchStatus ?? null,
    registration_method: medication.registrationMethod,
    schedule: medication.schedule,
    active: medication.active !== false,
    deactivated_at: medication.deactivatedAt ?? null,
    created_at: medication.createdAt,
    updated_at: medication.deactivatedAt ?? medication.createdAt,
  };
}
