import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform, useMotionValueEvent } from "framer-motion";
import { CockpitDemo } from "./CockpitDemo";
import { PhoneFeedDemo } from "./PhoneFeedDemo";

/**
 * Scroll-driven hero: as the user scrolls, the laptop-shaped cockpit
 * screen tilts flat, then shrinks and reshapes into a phone, revealing
 * an X-style feed.
 *
 * scrollYProgress (0-1) phases:
 *   0.00 - 0.30  tilt in + scale in (card lying flat)
 *   0.30 - 0.65  laptop plateau (fully readable cockpit)
 *   0.65 - 1.00  morph to phone (width narrows, radius grows, content swaps)
 */
export function ScrollMorphHero({
  titleComponent,
}: {
  titleComponent: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Phase 1: entry tilt + scale
  const rotateX = useTransform(scrollYProgress, [0, 0.3, 0.65], [22, 0, 0]);
  const entryScale = useTransform(scrollYProgress, [0, 0.3], [isMobile ? 0.82 : 1.02, 1]);

  // Phase 3: morph. We animate a single "morphT" 0..1 across 0.65..1.
  const morphT = useTransform(scrollYProgress, [0.65, 1], [0, 1]);

  // Width (laptop → phone). On desktop laptop is ~1100px, phone is 360px
  const maxLaptopWidth = isMobile ? 340 : 1100;
  const phoneWidth = isMobile ? 260 : 360;
  const width = useTransform(morphT, [0, 1], [maxLaptopWidth, phoneWidth]);

  // Height (laptop 620px → phone 720px on desktop, proportional on mobile)
  const maxLaptopHeight = isMobile ? 200 : 620;
  const phoneHeight = isMobile ? 520 : 720;
  const height = useTransform(morphT, [0, 1], [maxLaptopHeight, phoneHeight]);

  // Border radius morphs from 24px to 44px (phone-y)
  const borderRadius = useTransform(morphT, [0, 1], [24, 44]);

  // Combined scale from entry
  const scale = useTransform([entryScale], ([e]: number[]) => e as number);

  // Content crossfade
  const laptopOpacity = useTransform(morphT, [0, 0.55, 0.7], [1, 1, 0]);
  const phoneOpacity = useTransform(morphT, [0.55, 0.8, 1], [0, 1, 1]);

  // Track morph stage for an overlay label
  const [morphStage, setMorphStage] = useState<"laptop" | "morphing" | "phone">("laptop");
  useMotionValueEvent(morphT, "change", (v) => {
    if (v < 0.1) setMorphStage("laptop");
    else if (v > 0.85) setMorphStage("phone");
    else setMorphStage("morphing");
  });

  // Title translates up as user scrolls
  const titleTranslate = useTransform(scrollYProgress, [0, 0.3], [0, -60]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.4, 0.7], [1, 0.3, 0]);

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: isMobile ? "240vh" : "280vh" }}
    >
      {/* Sticky stage */}
      <div className="sticky top-0 h-screen w-full flex flex-col items-center justify-start pt-20 md:pt-24 overflow-hidden">
        <motion.div
          style={{ translateY: titleTranslate, opacity: titleOpacity }}
          className="max-w-5xl mx-auto text-center px-6"
        >
          {titleComponent}
        </motion.div>

        <div
          className="relative w-full flex items-center justify-center mt-8 md:mt-14"
          style={{ perspective: "1400px" }}
        >
          <motion.div
            style={{
              rotateX,
              scale,
              width,
              height,
              borderRadius,
              boxShadow:
                "0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, 0 84px 50px #00000026, 0 149px 60px #0000000a",
            }}
            className="relative bg-ink-1 border border-line p-2 md:p-3 overflow-hidden"
            data-stage={morphStage}
          >
            <div
              className="relative h-full w-full overflow-hidden bg-ink-0"
              style={{ borderRadius: "calc(var(--r, 20px) - 8px)" }}
            >
              <motion.div style={{ opacity: laptopOpacity }} className="absolute inset-0">
                <CockpitDemo />
              </motion.div>
              <motion.div style={{ opacity: phoneOpacity }} className="absolute inset-0">
                <PhoneFeedDemo />
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Stage hint */}
        <div className="mt-6 text-[11px] font-mono uppercase tracking-[0.2em] text-text-secondary/60">
          {morphStage === "laptop" && "scroll to morph →"}
          {morphStage === "morphing" && "keep going..."}
          {morphStage === "phone" && "picture-to-picture feed"}
        </div>
      </div>
    </div>
  );
}
