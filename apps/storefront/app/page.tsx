import HomeView from "@/components/HomeView";
import { getHome, type HomeData } from "@/lib/catalog";

// Regenerate the home page at most once a minute so a build-time or
// transient API failure never gets stuck in the cache.
export const revalidate = 60;

export default async function HomePage() {
  let data: HomeData | null = null;
  try {
    data = await getHome();
  } catch (err) {
    console.error("[CaratFlow] Failed to load home page catalog:", err);
  }
  return <HomeView data={data} />;
}
