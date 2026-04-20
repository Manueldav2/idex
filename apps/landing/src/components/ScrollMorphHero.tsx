import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { CockpitDemo } from "./CockpitDemo";
import { PhoneFeedDemo } from "./PhoneFeedDemo";

/**
 * Scroll-morph hero — free-scroll version.
 *
 * No sticky hijacking. The device lives in the normal document flow;
 * as the page scrolls, the device's transform progress is derived from
 * its own position in the viewport. This feels like natural page scroll,
 * not a trapped cinematic stage.
 *
 * Progress (0..1 across the device's "enter from bottom" → "exit to top"
 * window) drives rotate, scale, width, height, border-radius, and the
 * crossfade between the laptop cockpit and the phone feed.
 */
export function ScrollMorphHero({
  titleComponent,
}: {
  titleComponent: React.ReactNode;
}) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const deviceRef = useRef<HTMLDivElement>(null);
  // progress 0 → device's top is at viewport bottom (not yet visible)
  // progress 1 → device's bottom has left the viewport top
  // we only care about ~0.15 → 0.65 (the "while on screen" window)
  const { scrollYProgress } = useScroll({
    target: deviceRef,
    offset: ["start end", "end start"],
  });

  // Entry tilt (as the device first comes up from below)
  const rotateX = useTransform(scrollYProgress, [0.05, 0.3], [18, 0]);
  const entryScale = useTransform(scrollYProgress, [0.05, 0.3], [0.92, 1]);

  // Morph window — starts after user has lingered on the laptop, ends before
  // the device exits the top
  const laptopWidth = isMobile ? 340 : 980;
  const phoneWidth = isMobile ? 240 : 320;
  const laptopHeight = isMobile ? 200 : 560;
  const phoneHeight = isMobile ? 440 : 620;

  const width = useTransform(scrollYProgress, [0.35, 0.6], [laptopWidth, phoneWidth]);
  const height = useTransform(scrollYProgress, [0.35, 0.6], [laptopHeight, phoneHeight]);
  const radius = useTransform(scrollYProgress, [0.35, 0.6], [24, 44]);

  // Slight upward drift as it morphs (feels like parallax)
  const translateY = useTransform(scrollYProgress, [0.3, 0.7], [0, -60]);

  // Content crossfade
  const laptopOpacity = useTransform(scrollYProgress, [0.35, 0.5], [1, 0]);
  const phoneOpacity = useTransform(scrollYProgress, [0.45, 0.58], [0, 1]);

  return (
    <div className="relative">
      {/* Title block — scrolls naturally, no translate hijack */}
      <div className="pt-24 md:pt-32 pb-10 md:pb-12 px-6 max-w-5xl mx-auto text-center">
        {titleComponent}
      </div>

      {/* Device block — sits at its natural place in the document. Users can
          keep scrolling past it into the rest of the page. */}
      <div className="flex items-center justify-center py-12 md:py-20">
        <motion.div
          ref={deviceRef}
          style={{
            rotateX,
            scale: entryScale,
            width,
            height,
            borderRadius: radius,
            translateY,
            boxShadow:
              "0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, 0 84px 50px #00000026, 0 149px 60px #0000000a",
          }}
          className="relative bg-ink-1 border border-line p-2 md:p-3 overflow-hidden"
        >
          <div
            className="relative h-full w-full overflow-hidden bg-ink-0"
            style={{ borderRadius: 18 }}
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

      {/* A subtle caption beneath the device, so users know to keep scrolling.
          Also tells them what the morph is showing. */}
      <div className="text-center pb-12 md:pb-16 text-text-secondary/70 text-[12px] font-mono">
        <span className="inline-block animate-pulse">↓</span>{" "}
        keep scrolling — the laptop becomes the feed
      </div>
    </div>
  );
}
