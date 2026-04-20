import { useRef, useState, useEffect } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { CockpitDemo } from "./CockpitDemo";
import { PhoneFeedDemo } from "./PhoneFeedDemo";

/**
 * Scroll morph hero.
 *
 * Layout strategy: the device sits inside a generously-tall "stage" block.
 * Inside that block, the device is sticky near the top of the viewport —
 * but ONLY for the duration of the stage. Once the user scrolls past the
 * stage, sticky releases and the device scrolls up with the page like any
 * other element. So it doesn't feel trapped (sticky is bounded), but the
 * morph has enough room to play out with the phone fully visible at the
 * end.
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
    offset: ["start start", "end end"],
  });

  // Entry phase: as the stage enters the viewport, device tilts down
  // and scales up very slightly (subtle, not chunky).
  const rotateX = useTransform(scrollYProgress, [0, 0.15], [14, 0]);
  const entryScale = useTransform(scrollYProgress, [0, 0.15], [0.95, 1]);

  // Device dimensions
  const laptopWidth = isMobile ? 320 : 920;
  const phoneWidth = isMobile ? 240 : 340;
  const laptopHeight = isMobile ? 200 : 540;
  const phoneHeight = isMobile ? 420 : 560;

  // Morph phase: runs 0.25 → 0.55 so the phone has another 0.45 of scroll
  // (plenty of time for the user to see it in full) before the sticky
  // releases at end of stage.
  const width = useTransform(scrollYProgress, [0.25, 0.55], [laptopWidth, phoneWidth]);
  const height = useTransform(scrollYProgress, [0.25, 0.55], [laptopHeight, phoneHeight]);
  const radius = useTransform(scrollYProgress, [0.25, 0.55], [22, 42]);

  // Crossfade content midway through the morph
  const laptopOpacity = useTransform(scrollYProgress, [0.28, 0.42], [1, 0]);
  const phoneOpacity = useTransform(scrollYProgress, [0.40, 0.52], [0, 1]);

  return (
    <div className="relative atmosphere">
      <div className="pt-28 md:pt-36 pb-10 md:pb-14 px-6 max-w-5xl mx-auto text-center">
        {titleComponent}
      </div>

      {/* Stage: defines the scroll budget for the morph. */}
      <div
        ref={stageRef}
        className="relative"
        style={{ height: isMobile ? "260vh" : "280vh" }}
      >
        {/* Sticky slot — pins the device near the top-center of the viewport
            during the morph, then releases. */}
        <div
          className="sticky flex justify-center items-start"
          style={{
            top: isMobile ? "12vh" : "14vh",
            height: "calc(100vh - 18vh)",
          }}
        >
          {/* Flying editorial words positioned around the device */}
          <HeroWord
            progress={scrollYProgress}
            enter={[0.08, 0.18]}
            exit={[0.55, 0.68]}
            from="left"
            className="absolute left-6 md:left-[6%] top-[10%] font-display text-[clamp(28px,3.2vw,52px)] italic text-text-primary/90 pointer-events-none"
          >
            10x what you
            <br />
            create.
          </HeroWord>

          <HeroWord
            progress={scrollYProgress}
            enter={[0.18, 0.28]}
            exit={[0.60, 0.72]}
            from="right"
            className="absolute right-6 md:right-[6%] top-[15%] font-display text-[clamp(26px,2.8vw,44px)] text-text-primary/90 tracking-tight pointer-events-none text-right"
          >
            10x what you
            <br />
            <span className="display-serif text-accent">absorb.</span>
          </HeroWord>

          <HeroWord
            progress={scrollYProgress}
            enter={[0.40, 0.52]}
            exit={[0.78, 0.90]}
            from="bottom"
            className="absolute left-6 md:left-[8%] bottom-[14%] font-display text-[clamp(20px,2vw,30px)] italic text-text-primary/70 max-w-[260px] pointer-events-none"
          >
            wait time,
            <br />
            turned into
            <br />
            learning time.
          </HeroWord>

          <HeroWord
            progress={scrollYProgress}
            enter={[0.46, 0.58]}
            exit={[0.82, 0.92]}
            from="right"
            className="absolute right-6 md:right-[8%] bottom-[16%] font-mono text-[11px] uppercase tracking-[0.24em] text-text-secondary max-w-[200px] text-right pointer-events-none"
          >
            no distraction.
            <br />
            no context switch.
            <br />
            no dashboard.
          </HeroWord>

          {/* The device */}
          <motion.div
            style={{
              rotateX,
              scale: entryScale,
              width,
              height,
              borderRadius: radius,
              marginTop: isMobile ? 30 : 40,
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
  const axisX = from === "left" || from === "right";
  const axisY = !axisX;

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
