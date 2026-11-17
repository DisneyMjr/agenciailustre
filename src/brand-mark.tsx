import type { SVGProps } from "react";

/** A small idea bulb: open light rays, a distinctive V filament and rounded base. */
export function IlustreMark({
  size = 32,
  strokeWidth = 2.7,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M24 45v-3c0-5-9-9-9-19a17 17 0 0 1 34 0c0 10-9 14-9 19v3" />
      <path d="M24 45h16M25 51h14M28 57h8" />
      <path className="bulb-filament" d="M32 43V34l-7-7m7 7 7-7" />
      <path d="M32 1v2M7 8l4 4M1 27h5M57 8l-4 4M58 27h5" />
    </svg>
  );
}
