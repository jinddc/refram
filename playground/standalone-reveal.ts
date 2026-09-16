import {
  registerMotionReveal,
  type MotionRevealElement,
} from "../src";

const advancedReveal = document.querySelector<MotionRevealElement>(
  "#advanced-reveal",
);
const revealGrid = document.querySelector<HTMLDivElement>("#reveal-grid");

if (!advancedReveal || !revealGrid) {
  throw new Error("Standalone reveal playground markup is incomplete.");
}

advancedReveal.options = {
  duration: 1,
  ease: "power4.out",
  from: { autoAlpha: 0, x: -32, y: 0 },
  to: {
    autoAlpha: 1, x: 0, y: 0,
  },

};

for (let index = 1; index <= 20; index += 1) {
  const reveal = document.createElement(
    "motion-reveal",
  ) as MotionRevealElement;
  reveal.className = "reveal-card";
  reveal.options = {
    ...(index === 1 ? { threshold: 0.35 } : {}),
    duration: 0.55 + (index % 4) * 0.1,
    from: {
      autoAlpha: 0,
      y: 16 + (index % 3) * 8,
    },
    to: { autoAlpha: 1, y: 0 },
    threshold: 0.5,
  };

  const number = document.createElement("span");
  number.className = "card-number";
  number.textContent = String(index).padStart(2, "0");

  const title = document.createElement("h3");
  title.textContent = index % 2 === 0 ? "Observed once" : "Owned cleanup";

  const description = document.createElement("p");
  description.textContent =
    "Each host owns one visibility trigger and one renderer context.";

  reveal.append(number, title, description);
  revealGrid.append(reveal);
}

registerMotionReveal();
