import type { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return resolvePublicPageMetadata("/agentech-bots", parent);
}

const agentechBotsImages = [
  {
    src: "/assets/edge-products/edge-product-01.png",
    alt: "Agentech Bots immersive interface concept"
  },
  {
    src: "/assets/edge-products/edge-product-02.png",
    alt: "Agentech Bots concept vehicle interface"
  },
  {
    src: "/assets/edge-products/edge-product-03.png",
    alt: "Agentech Bots holographic mobility prototype"
  }
] as const;

export default function AgentechBotsPage() {
  return (
    <>
      <section>
        <div className="mx-auto max-w-7xl px-6 pb-8 pt-16 lg:px-8 lg:pb-10 lg:pt-20">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-white md:text-6xl">
            Agentech Bots
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16 pt-6 lg:px-8 lg:pb-24 lg:pt-8">
        <div className="space-y-16 md:space-y-20">
          {agentechBotsImages.map((image, index) => (
            <article key={image.src}>
              <div className="relative overflow-hidden rounded-[24px] bg-[#05080b]">
                <Image
                  src={image.src}
                  alt={image.alt}
                  width={1536}
                  height={1024}
                  className="h-auto w-full"
                  priority={index === 0}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/30 to-transparent" />
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
