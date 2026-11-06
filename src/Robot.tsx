import { useEffect, useRef } from "react";

export function Robot({
  resting,
  finished,
  cheer,
  reduced,
  compact = false,
}: {
  resting: boolean;
  finished: boolean;
  cheer: boolean;
  reduced: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const context = canvas.getContext("2d")!;
    const shouldReduce =
      reduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0,
      handle = 0,
      last = 0;
    const round = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      fill: string,
      stroke?: string,
    ) => {
      context.beginPath();
      context.roundRect(x, y, w, h, r);
      context.fillStyle = fill;
      context.fill();
      if (stroke) {
        context.strokeStyle = stroke;
        context.lineWidth = 3;
        context.stroke();
      }
    };
    const draw = (stamp = 0) => {
      if (document.hidden) {
        handle = requestAnimationFrame(draw);
        return;
      }
      if (!shouldReduce && stamp - last < 33 && stamp !== 0) {
        handle = requestAnimationFrame(draw);
        return;
      }
      last = stamp;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = 440 * ratio;
      canvas.height = 300 * ratio;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, 440, 300);
      const time = frame / 30;
      const bounce = shouldReduce ? 0 : Math.sin(time * 2) * (cheer ? 8 : 3);
      context.fillStyle = "#dbeae6";
      context.beginPath();
      context.ellipse(218, 261, 86, 12, 0, 0, Math.PI * 2);
      context.fill();
      context.save();
      context.translate(0, bounce);
      round(170, 229, 30, 29, 9, "#244d44");
      round(236, 229, 30, 29, 9, "#244d44");
      context.save();
      context.translate(160, 169);
      context.rotate(cheer ? -1.4 : 0.12);
      round(-18, 0, 22, 65, 10, "#a6d7c2", "#376757");
      context.restore();
      context.save();
      context.translate(275, 169);
      context.rotate(cheer ? 1.4 : -0.12);
      round(0, 0, 22, 65, 10, "#a6d7c2", "#376757");
      context.restore();
      round(166, 153, 105, 83, 20, "#abd9c5", "#376757");
      round(194, 184, 48, 27, 7, "#f3fbf7");
      context.fillStyle = "#619b83";
      context.fillRect(204, 194, 5, 8);
      context.fillRect(214, 190, 5, 12);
      context.fillRect(224, 187, 5, 15);
      context.strokeStyle = "#376757";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(218, 78);
      context.lineTo(218, 60);
      context.stroke();
      context.fillStyle = cheer ? "#eeb85a" : "#72b69a";
      context.beginPath();
      context.arc(218, 54, 8, 0, Math.PI * 2);
      context.fill();
      round(140, 82, 156, 96, 28, "#c4e6d5", "#376757");
      round(157, 99, 122, 58, 17, "#244d44");
      context.strokeStyle = "#d9f1d9";
      context.fillStyle = "#d9f1d9";
      context.lineWidth = 4;
      context.lineCap = "round";
      const blink = !shouldReduce && frame % 150 > 145;
      for (const x of [186, 249]) {
        if (resting || blink || cheer) {
          context.beginPath();
          context.moveTo(x - 7, 122);
          context.quadraticCurveTo(x, cheer ? 109 : 128, x + 7, 122);
          context.stroke();
        } else {
          round(x - 5, 111, 10, 16, 5, "#d9f1d9");
        }
      }
      context.beginPath();
      context.moveTo(209, 136);
      context.quadraticCurveTo(218, finished || cheer ? 148 : 140, 227, 136);
      context.stroke();
      round(144, 130, 11, 8, 4, "#e8bb9e");
      round(281, 130, 11, 8, 4, "#e8bb9e");
      context.restore();
      if (!finished && !resting) {
        round(276, 207, 39, 42, 5, "#fafafa", "#b5c7bd");
        context.strokeStyle = "#b5c7bd";
        context.lineWidth = 3;
        context.beginPath();
        context.arc(315, 223, 9, -Math.PI / 2, Math.PI / 2);
        context.stroke();
        if (!shouldReduce) {
          context.strokeStyle = "#a7c6b9";
          for (let i = 0; i < 2; i++) {
            context.beginPath();
            context.moveTo(287 + i * 12, 197);
            context.bezierCurveTo(
              278 + i * 12,
              189,
              300 + i * 12,
              180,
              287 + i * 12,
              170,
            );
            context.stroke();
          }
        }
      }
      if (resting) {
        context.fillStyle = "#779c8d";
        context.font = "bold 22px system-ui";
        context.fillText("z", 311, 92);
        context.font = "bold 15px system-ui";
        context.fillText("z", 329, 72);
      }
      if (cheer) {
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI) / 5;
          context.fillStyle = i % 2 ? "#d5a153" : "#69aa91";
          context.save();
          context.translate(
            218 + Math.cos(angle) * 140,
            135 + Math.sin(angle) * 106,
          );
          context.rotate(angle + time);
          context.fillRect(-3, -6, 6, 12);
          context.restore();
        }
      }
      frame++;
      if (!shouldReduce) handle = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(handle);
  }, [resting, finished, cheer, reduced]);
  return (
    <canvas
      ref={ref}
      className={compact ? "robot compact" : "robot"}
      aria-hidden="true"
    />
  );
}
