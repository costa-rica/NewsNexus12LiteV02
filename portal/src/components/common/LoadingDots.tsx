import type { CSSProperties } from "react";

interface LoadingDotsProps {
  className?: string;
  size?: number;
}

export function LoadingDots({ className = "", size = 3 }: LoadingDotsProps) {
  const dotSize = `${size * 4}px`;
  const dotStyle: CSSProperties = {
    width: dotSize,
    height: dotSize,
  };

  return (
    <div
      className={`flex items-center justify-center gap-2 ${className}`}
      aria-hidden="true"
    >
      <span
        className="rounded-full bg-brand-500 motion-safe:animate-[loadingDotBounce_0.6s_ease-in-out_0s_infinite]"
        style={dotStyle}
      />
      <span
        className="rounded-full bg-brand-500 motion-safe:animate-[loadingDotBounce_0.6s_ease-in-out_0.15s_infinite]"
        style={dotStyle}
      />
      <span
        className="rounded-full bg-brand-500 motion-safe:animate-[loadingDotBounce_0.6s_ease-in-out_0.3s_infinite]"
        style={dotStyle}
      />
      <style>{`
        @keyframes loadingDotBounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-16px);
          }
        }
      `}</style>
    </div>
  );
}
