import type { MotionCategory, MotionProduct } from "./motion-store-data";

export type MotionFilterCategory = "All" | MotionCategory;

export function filterMotions(
  motions: readonly MotionProduct[],
  query: string,
  category: MotionFilterCategory
): MotionProduct[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return motions.filter((motion) => {
    const matchesCategory = category === "All" || motion.category === category;
    const searchText = `${motion.name} ${motion.category} ${motion.description}`.toLocaleLowerCase();
    const matchesQuery = normalizedQuery.length === 0 || searchText.includes(normalizedQuery);

    return matchesCategory && matchesQuery;
  });
}
