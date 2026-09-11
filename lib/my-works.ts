export const workCategories = ["Humanoid", "Robot dog", "Navi", "Robot arm", "Other"] as const;
export type WorkCategory = typeof workCategories[number];
export type WorkDetails = { title: string; category: WorkCategory; description: string };
export const workCoverAccept = "image/jpeg,image/png,image/webp,image/gif";

export function validateWorkCover(file: { type: string; size: number }): string | null {
  if (!workCoverAccept.split(",").includes(file.type)) {
    return "Choose a JPG, PNG, WebP, or GIF image.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "This file is empty or unreadable. Choose another image.";
  }
  if (file.size > 10 * 1024 * 1024) {
    return "Choose an image smaller than 10 MB.";
  }
  return null;
}

export function validateWorkDetails(input: { title: string; category: string; description: string }):
  { ok: true; details: WorkDetails } | { ok: false; error: string } {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || title.length > 80) {
    return { ok: false, error: "Give your project a title of 1–80 characters." };
  }
  if (!workCategories.includes(input.category as WorkCategory)) {
    return { ok: false, error: "Choose a robot category." };
  }
  if (description.length > 600) {
    return { ok: false, error: "Keep the description to 600 characters or fewer." };
  }
  return { ok: true, details: { title, category: input.category as WorkCategory, description } };
}
