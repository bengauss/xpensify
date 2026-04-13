import { h } from "preact";

export interface IconProps {
  color?: string;
  size?: number;
}

const defaults = { color: "#e8e8ed", size: 20 };

function svgWrap(color: string, size: number, children: any[]) {
  return h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      width: size,
      height: size,
      fill: "none",
      stroke: color,
      "stroke-width": "1.5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
    ...children
  );
}

// 1. Food — coffee mug with steam
export function FoodIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    // mug body
    h("path", { d: "M6 8h10l-1 9H7L6 8z" }),
    // handle
    h("path", { d: "M16 10h2a2 2 0 0 1 0 4h-2" }),
    // steam left
    h("path", { d: "M9 5c0-1 1-1 1-2" }),
    // steam right
    h("path", { d: "M12 5c0-1 1-1 1-2" }),
  ]);
}

// 2. Living — house with chimney
export function LivingIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    // roof
    h("path", { d: "M3 10.5L12 3l9 7.5" }),
    // walls
    h("path", { d: "M5 9v11h14V9" }),
    // door
    h("path", { d: "M9 20v-6h6v6" }),
    // chimney
    h("path", { d: "M15 9V5h3v6" }),
  ]);
}

// 3. Household — wrench
export function HouseholdIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", {
      d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3-3a6 6 0 0 1-7.2 7.2l-6.3 6.3a2.12 2.12 0 0 1-3-3l6.3-6.3a6 6 0 0 1 7.2-7.2l-3 3z",
    }),
  ]);
}

// 4. Transportation — car/truck side view
export function TransportationIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    // body
    h("path", { d: "M1 17h22" }),
    h("path", { d: "M2 17V11l3-5h12l3 5v6" }),
    // cabin top
    h("path", { d: "M6 6l1.5-3h9L18 6" }),
    // wheels
    h("circle", { cx: "6", cy: "17", r: "2" }),
    h("circle", { cx: "18", cy: "17", r: "2" }),
  ]);
}

// 5. Health — heart
export function HealthIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", {
      d: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
    }),
  ]);
}

// 6. Subscriptions — two circular refresh arrows
export function SubscriptionsIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    // outer arc going clockwise, with arrowhead at end
    h("path", { d: "M23 4v6h-6" }),
    h("path", { d: "M1 20v-6h6" }),
    h("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10" }),
    h("path", { d: "M21 15a9 9 0 0 1-14.85 3.36L1 14" }),
  ]);
}

// 7. Entertainment — 5-point star
export function EntertainmentIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", {
      d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
    }),
  ]);
}

// 8. Insurance — shield
export function InsuranceIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", {
      d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    }),
  ]);
}

// 9. Apparel — t-shirt
export function ApparelIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", {
      d: "M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z",
    }),
  ]);
}

// 10. Electronics — monitor/screen
export function ElectronicsIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    // screen
    h("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2" }),
    // stand
    h("path", { d: "M8 21h8" }),
    h("path", { d: "M12 17v4" }),
  ]);
}

// 11. Charlie — sun with rays
export function LilyIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("circle", { cx: "12", cy: "12", r: "4" }),
    h("path", { d: "M12 2v2" }),
    h("path", { d: "M12 20v2" }),
    h("path", { d: "M4.93 4.93l1.41 1.41" }),
    h("path", { d: "M17.66 17.66l1.41 1.41" }),
    h("path", { d: "M2 12h2" }),
    h("path", { d: "M20 12h2" }),
    h("path", { d: "M6.34 17.66l-1.41 1.41" }),
    h("path", { d: "M19.07 4.93l-1.41 1.41" }),
  ]);
}

// 12. Education — open book
export function EducationIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" }),
    h("path", { d: "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" }),
  ]);
}

// 13. Travel — airplane
export function TravelIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", {
      d: "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z",
    }),
  ]);
}

// 14. Gift — gift box with ribbon
export function GiftIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    // box
    h("rect", { x: "3", y: "8", width: "18", height: "13", rx: "1" }),
    // lid
    h("path", { d: "M2 8h20v4H2z" }),
    // vertical ribbon
    h("path", { d: "M12 8v13" }),
    // bow left loop
    h("path", { d: "M12 8C12 8 9 5 9 3.5a2.5 2.5 0 0 1 3 2.5" }),
    // bow right loop
    h("path", { d: "M12 8c0 0 3-3 3-4.5A2.5 2.5 0 0 0 12 6" }),
  ]);
}

// 15. Other — horizontal ellipsis (three dots)
export function OtherIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("circle", { cx: "5", cy: "12", r: "1" }),
    h("circle", { cx: "12", cy: "12", r: "1" }),
    h("circle", { cx: "19", cy: "12", r: "1" }),
  ]);
}

export const categoryIcons: Record<string, (props: IconProps) => any> = {
  food: FoodIcon,
  living: LivingIcon,
  household: HouseholdIcon,
  transportation: TransportationIcon,
  health: HealthIcon,
  subscriptions: SubscriptionsIcon,
  entertainment: EntertainmentIcon,
  insurance: InsuranceIcon,
  apparel: ApparelIcon,
  electronics: ElectronicsIcon,
  charlie: LilyIcon,
  education: EducationIcon,
  travel: TravelIcon,
  gift: GiftIcon,
  other: OtherIcon,
};
