import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { CockpitDemo } from "./CockpitDemo";
import { PhoneFeedDemo } from "./PhoneFeedDemo";

/**
 * Scroll-morph hero. The device lives in normal document flow. As the
 * page scrolls, the device's transform progress is derived from its own
 * viewport position, so users can scroll naturally through and past it.
 * A series of editorial "hero words" drift into the margins during the
 * morph, each tied to a different progress window.
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

  const stageRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ["start end", "end start"],
  });

  const rotateX = useTransform(scrollYProgress, [0.08, 0.30], [16, 0]);
  const entryScale = useTransform(scrollYProgress, [0.08, 0.30], [0.93, 1]);

  const laptopWidth = isMobile ? 320 : 920;
  const phoneWidth = isMobile ? 230 : 340;
  const laptopHeight = isMobile ? 200 : 540;
  const phoneHeight = isMobile ? 440 : 600;

  // Morph window — tightened to 0.30..0.58 so the phone settles well before
  // the device scrolls out of view, and pinned upward with a counter-drift
  // so the fully-morphed phone sits centered in the viewport.
  const width = useTransform(scrollYProgress, [0.30, 0.58], [laptopWidth, phoneWidth]);
  const height = useTransform(scrollYProgress, [0.30, 0.58], [laptopHeight, phoneHeight]);
  const radius = useTransform(scrollYProgress, [0.30, 0.58], [22, 44]);
  // Drift upward during the morph so the phone stays centered in viewport.
  // Without this, the device scrolls off with the page before the user sees
  // the fully-morphed phone.
  const driftY = useTransform(
    scrollYProgress,
    [0.10, 0.30, 0.58, 0.90],
    [0, -40, -220, -320],
  );

  const laptopOpacity = useTransform(scrollYProgress, [0.30, 0.45], [1, 0]);
  const phoneOpacity = useTransform(scrollYProgress, [0.40, 0.55], [0, 1]);

  return (
    <div ref={stageRef} className="relative atmosphere">
      <div className="pt-28 md:pt-36 pb-10 md:pb-14 px-6 max-w-5xl mx-auto text-center">
        {titleComponent}
      </div>

      <div className="relative" style={{ minHeight: isMobile ? "140vh" : "180vh" }}>
        {/* Flying editorial words positioned around the device */}
        <HeroWord
          progress={scrollYProgress}
          enter={[0.10, 0.20]}
          exit={[0.55, 0.68]}
          from="left"
          className="absolute left-6 md:left-[8%] top-[12%] font-display text-[clamp(28px,3.2vw,52px)] italic text-text-primary/90"
        >
          10x what you
          <br />
          create.
        </HeroWord>

        <HeroWord
          progress={scrollYProgress}
          enter={[0.18, 0.28]}
          exit={[0.58, 0.70]}
          from="right"
          className="absolute right-6 md:right-[8%] top-[22%] font-display text-[clamp(26px,2.8vw,44px)] text-text-primary/90 tracking-tight"
        >
          10x what you
          <br />
          <span className="display-serif text-accent">absorb.</span>
        </HeroWord>

        <HeroWord
          progress={scrollYProgress}
          enter={[0.32, 0.44]}
          exit={[0.72, 0.84]}
          from="bottom"
          className="absolute left-6 md:left-[10%] top-[58%] font-display text-[clamp(22px,2.2vw,34px)] italic text-text-primary/80 max-w-xs"
        >
          wait time,
          <br />
          turned into learning time.
        </HeroWord>

        <HeroWord
          progress={scrollYProgress}
          enter={[0.42, 0.54]}
          exit={[0.78, 0.88]}
          from="right"
          className="absolute right-8 md:right-[10%] top-[62%] font-mono text-[11px] uppercase tracking-[0.24em] text-text-secondary max-w-[180px] text-right"
        >
          no distraction.
          <br />
          no dashboard.
          <br />
          no reset of context.
        </HeroWord>

        {/* The device — pinned upward during morph so the phone stays centered */}
        <div className="flex items-center justify-center pt-16 md:pt-24 pb-32 md:pb-56">
          <motion.div
            style={{
              rotateX,
              scale: entryScale,
              width,
              height,
              borderRadius: radius,
              translateY: driftY,
              boxShadow:
                "0 0 #0000004d, 0 9px 20px #0000004a, 0 37px 37px #00000042, 0 84px 50px #00000026, 0 149px 60px #0000000a",
            }}
            className="relative bg-ink-1 border border-line p-2 md:p-3 overflow-hidden will-change-transform"
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
      </div>

      <div className="text-center pb-20 md:pb-28 font-mono text-[11px] uppercase tracking-[0.24em] text-text-tertiary">
        <span className="inline-block" style={{ animation: "drift 3s ease-in-out infinite" }}>
          keep going
        </span>
      </div>
    </div>
  );
}

function HeroWord({
  progress,
  enter,
  exit,
  from,
  className,
  children,
}: {
  progress: MotionValue<number>;
  enter: [number, number];
  exit: [number, number];
  from: "left" | "right" | "bottom" | "top";
  className?: string;
  children: React.ReactNode;
}) {
  const opacity = useTransform(progress, [enter[0], enter[1], exit[0], exit[1]], [0, 1, 1, 0]);

  const offsetStart =
    from === "left" ? -60 :
    from === "right" ? 60 :
    from === "bottom" ? 40 :
    -40;
  const axisX = from === "left" || from === "right" ? "x" : null;
  const axisY = axisX ? null : "y";

  const xInput = useTransform(progress, [enter[0], enter[1]], [axisX ? offsetStart : 0, 0]);
  const yInput = useTransform(progress, [enter[0], enter[1]], [axisY ? offsetStart : 0, 0]);

  return (
    <motion.div
      style={{ opacity, x: xInput, y: yInput }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
