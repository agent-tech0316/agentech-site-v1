import Link from "next/link";
import { MyWorks } from "@/components/my-works";
import { getServerAccountIdentity } from "@/lib/server-account-session";
import styles from "./my-works.module.css";

export const metadata = {
  title: "My Works | Agentech",
  description: "Your personal workspace for finished robot projects.",
  robots: { index: false, follow: false }
};

export default async function MyWorksPage({ searchParams }: {
  searchParams: Promise<{ preview?: string | string[] }>;
}) {
  const params = await searchParams;
  // Development review has no account data. This option is never honored in production.
  const localPreview = process.env.NODE_ENV === "development" && params.preview === "1";
  const identity = await getServerAccountIdentity(undefined, { allowLegacyCookie: false }).catch(() => null);

  if (!identity && !localPreview) {
    return (
      <div data-my-works-page className={styles.page}>
        <section data-my-works-access-gate className={styles.accessGate}>
          <p className={styles.eyebrow}>YOUR ACCOUNT · EAIS</p>
          <h1>My Works</h1>
          <p>Sign in to open your personal project workspace.</p>
          <p className={styles.muted}>This area requires a verified account session. Projects here are saved privately and are never published to the EAIS showcase automatically.</p>
          <Link href="/login?next=/account/my-works" className={styles.primaryAction}>Sign in to continue <span aria-hidden="true">↗</span></Link>
          <Link href="/agentech-products/eais" className={styles.textAction}>Explore EAIS</Link>
        </section>
      </div>
    );
  }

  return <MyWorks key={localPreview ? "local-preview" : identity?.userId} localPreview={localPreview} />;
}
