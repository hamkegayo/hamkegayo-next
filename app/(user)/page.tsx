import { HomeHero } from "./_components/home/home-hero";
import { ServiceIntro } from "./_components/home/service-intro";
import { Differentiators } from "./_components/home/differentiators";
import { HowToUse } from "./_components/home/how-to-use";
import { Reviews } from "./_components/home/reviews";
import { HomeCta } from "./_components/home/home-cta";

export default function HomePage() {
  return (
    <>
      <HomeHero />
      <ServiceIntro />
      <Differentiators />
      <HowToUse />
      <Reviews />
      <HomeCta />
    </>
  );
}
