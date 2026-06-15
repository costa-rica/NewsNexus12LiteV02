import "@testing-library/jest-dom/vitest";
import React from "react";
import { vi } from "vitest";

interface MockImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string | { src: string };
  alt: string;
}

vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: MockImageProps) =>
    React.createElement("img", {
      ...props,
      src: typeof src === "string" ? src : src.src,
      alt,
    }),
}));
