import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/sections/Hero";
import { Impact } from "@/components/sections/Impact";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { WhySwapngo } from "@/components/sections/WhySwapNgo";
import { ScooterShowcase } from "@/components/sections/ScooterShowcase";
import { Pricing } from "@/components/sections/Pricing";
import { BatterySwap } from "@/components/sections/BatterySwap";
import { About } from "@/components/sections/About";
import { Faq } from "@/components/sections/Faq";
import { GetApp } from "@/components/sections/GetApp";
import { Contact } from "@/components/sections/Contact";
import { SiteDataProvider } from "@/lib/siteData";

export default function App() {
  return (
    <SiteDataProvider>
      <div className="min-h-screen bg-background">
        <Header />
        <main>
          <Hero />
          <Impact />
          <HowItWorks />
          <WhySwapngo />
          <ScooterShowcase />
          <Pricing />
          <BatterySwap />
          <About />
          <Faq />
          <GetApp />
          <Contact />
        </main>
        <Footer />
      </div>
    </SiteDataProvider>
  );
}
