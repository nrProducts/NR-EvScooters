import { Hero } from "@/components/sections/Hero";
import { Impact } from "@/components/sections/Impact";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { WhySwapngo } from "@/components/sections/WhySwapNgo";
import { ScooterShowcase } from "@/components/sections/ScooterShowcase";
import { Pricing } from "@/components/sections/Pricing";
import { DeliveryPartners } from "@/components/sections/DeliveryPartners";
import { BatterySwap } from "@/components/sections/BatterySwap";
import { About } from "@/components/sections/About";
import { Faq } from "@/components/sections/Faq";
import { GetApp } from "@/components/sections/GetApp";
import { Contact } from "@/components/sections/Contact";

/**
 * The EV scooter rental business. This is the previous single-page site, kept
 * section for section and in the same order — it simply lives at
 * /ev-scooter-rental now, with Home free to introduce both businesses.
 * DeliveryPartners is the one addition (a short block for a keyword audience
 * the page previously did not mention at all). Nothing here talks about the
 * software product or its pricing — that is the other journey.
 */
export function RentalPage() {
  return (
    <>
      <Hero />
      <Impact />
      <HowItWorks />
      <WhySwapngo />
      <ScooterShowcase />
      <Pricing />
      <DeliveryPartners />
      <BatterySwap />
      <About />
      <Faq />
      <GetApp />
      <Contact />
    </>
  );
}
