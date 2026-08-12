import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Impact } from "@/components/sections/Impact";
import { Vehicles } from "@/components/sections/Vehicles";
import { WhySwapNgo } from "@/components/sections/WhySwapNgo";
import { Pricing } from "@/components/sections/Pricing";
import { About } from "@/components/sections/About";
import { Faq } from "@/components/sections/Faq";
import { GetApp } from "@/components/sections/GetApp";
import { Contact } from "@/components/sections/Contact";

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Impact />
        <Vehicles />
        <WhySwapNgo />
        <Pricing />
        <About />
        <Faq />
        <GetApp />
        <Contact />
      </main>
      <Footer />
    </div>
  );
}
