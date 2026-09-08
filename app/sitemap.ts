import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-config";
import { internshipRoles } from "@/lib/internship-roles";

const routes = [
  "",
  "/about",
  "/news",
  "/career-intern",
  "/career-intern/apply",
  "/career",
  "/agentech-robotic",
  "/agentech-education",
  "/agentech-bots",
  "/ai-robotics-club",
  "/ai-robotics-club/zh",
  "/ai-robotics-club/apply",
  "/tech-education",
  "/talents"
];

export default function sitemap(): MetadataRoute.Sitemap {
  const roleRoutes = internshipRoles.map((role) => `/career-intern/${role.slug}`);

  return [...routes, ...roleRoutes].map((route) => ({
    url: `${siteUrl}${route}`
  }));
}
