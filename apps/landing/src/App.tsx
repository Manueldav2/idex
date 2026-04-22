import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { ScrollThroughDemo } from "./components/ScrollThroughDemo";
import {
  HowItWorksSection,
  AgentsSection,
  FreeOSSSection,
  PrivacySection,
  FaqSection,
  FinalCta,
  Footer,
} from "./components/Sections";

export default function App() {
  return (
    <div className="grain bg-ink-0 text-text-primary min-h-screen">
      <Nav />
      <Hero />
      {/*
        Scroll-driven demo: the reader's scroll position drives a fake
        cockpit through the real IDEX flow (open → type → feed → answer).
        Lives between Hero and HowItWorks so first impressions are
        "what does this actually do" before we try to sell the why.
      */}
      <ScrollThroughDemo />
      <HowItWorksSection />
      <AgentsSection />
      <FreeOSSSection />
      <PrivacySection />
      <FaqSection />
      <FinalCta />
      <Footer />
    </div>
  );
}
