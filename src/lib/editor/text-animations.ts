export type AnimationConfig = {
  id: string;
  name: string;
  type: "entrance" | "exit" | "continuous";
  cssKeyframes: string;
  durationMs: number;
};

export const TEXT_ANIMATIONS: Record<string, AnimationConfig> = {
  // Entrance
  fade_in: {
    id: "fade_in",
    name: "Fade In",
    type: "entrance",
    durationMs: 600,
    cssKeyframes: `
      @keyframes fade_in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `,
  },
  slide_up: {
    id: "slide_up",
    name: "Slide Up",
    type: "entrance",
    durationMs: 800,
    cssKeyframes: `
      @keyframes slide_up {
        from { opacity: 0; transform: translateY(40px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `,
  },
  slide_left: {
    id: "slide_left",
    name: "Slide Left",
    type: "entrance",
    durationMs: 800,
    cssKeyframes: `
      @keyframes slide_left {
        from { opacity: 0; transform: translateX(60px); }
        to { opacity: 1; transform: translateX(0); }
      }
    `,
  },
  zoom_in: {
    id: "zoom_in",
    name: "Zoom In",
    type: "entrance",
    durationMs: 600,
    cssKeyframes: `
      @keyframes zoom_in {
        from { opacity: 0; transform: scale(0.8); }
        to { opacity: 1; transform: scale(1); }
      }
    `,
  },
  bounce: {
    id: "bounce",
    name: "Bounce Drop",
    type: "entrance",
    durationMs: 1000,
    cssKeyframes: `
      @keyframes bounce {
        0% { opacity: 0; transform: translateY(-60px); }
        60% { opacity: 1; transform: translateY(15px); }
        80% { transform: translateY(-10px); }
        100% { transform: translateY(0); }
      }
    `,
  },

  // Exit
  fade_out: {
    id: "fade_out",
    name: "Fade Out",
    type: "exit",
    durationMs: 600,
    cssKeyframes: `
      @keyframes fade_out {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `,
  },
  slide_down: {
    id: "slide_down",
    name: "Slide Down",
    type: "exit",
    durationMs: 800,
    cssKeyframes: `
      @keyframes slide_down {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(40px); }
      }
    `,
  },
  zoom_out: {
    id: "zoom_out",
    name: "Zoom Out",
    type: "exit",
    durationMs: 600,
    cssKeyframes: `
      @keyframes zoom_out {
        from { opacity: 1; transform: scale(1); }
        to { opacity: 0; transform: scale(0.8); }
      }
    `,
  },

  // Continuous
  pulse: {
    id: "pulse",
    name: "Gentle Pulse",
    type: "continuous",
    durationMs: 2000,
    cssKeyframes: `
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
    `,
  },
  float: {
    id: "float",
    name: "Float",
    type: "continuous",
    durationMs: 3000,
    cssKeyframes: `
      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
    `,
  },
};

/**
 * Returns all active animation CSS rules and keyframes for a given element state
 */
export function getAnimationStyles(
  animations: { entrance?: string; exit?: string; continuous?: string },
  clipStartMs: number,
  clipEndMs: number,
  playheadMs: number
): React.CSSProperties {
  if (!animations) return {};
  
  const localMs = playheadMs - clipStartMs;
  const durationMs = clipEndMs - clipStartMs;
  
  let animationName = "";
  let animationDuration = "";
  let animationTiming = "";
  let animationIteration = "";
  let animationFillMode = "both";
  
  // 1. Entrance phase
  if (animations.entrance && localMs < TEXT_ANIMATIONS[animations.entrance]?.durationMs) {
    const anim = TEXT_ANIMATIONS[animations.entrance];
    animationName = anim.id;
    animationDuration = `${anim.durationMs}ms`;
    animationTiming = "ease-out";
    animationIteration = "1";
  } 
  // 2. Exit phase
  else if (animations.exit && localMs > durationMs - TEXT_ANIMATIONS[animations.exit]?.durationMs) {
    const anim = TEXT_ANIMATIONS[animations.exit];
    animationName = anim.id;
    animationDuration = `${anim.durationMs}ms`;
    animationTiming = "ease-in";
    animationIteration = "1";
    animationFillMode = "forwards"; // keep the final state (opacity 0)
  }
  // 3. Continuous phase
  else if (animations.continuous) {
    const anim = TEXT_ANIMATIONS[animations.continuous];
    animationName = anim.id;
    animationDuration = `${anim.durationMs}ms`;
    animationTiming = "ease-in-out";
    animationIteration = "infinite";
  }
  
  if (!animationName) return {};
  
  return {
    animationName,
    animationDuration,
    animationTimingFunction: animationTiming,
    animationIterationCount: animationIteration,
    animationFillMode,
  };
}
