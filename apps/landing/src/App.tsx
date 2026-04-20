import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
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
