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

// 1. Food — fork and knife
export function FoodIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    // fork
    h("path", { d: "M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2" }),
    h("path", { d: "M5 2v20" }),
    h("path", { d: "M7 2v6" }),
    // knife
    h("path", { d: "M19 2l0 8c0 1.1-.4 2-1.5 2S16 11.1 16 10V2" }),
    h("path", { d: "M17.5 12v10" }),
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

// 3. Household — couch/sofa
export function HouseholdIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    // seat back
    h("path", { d: "M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" }),
    // seat cushion + armrests
    h("path", { d: "M2 11h20v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z" }),
    // legs
    h("path", { d: "M4 18v2" }),
    h("path", { d: "M20 18v2" }),
    // cushion divider
    h("path", { d: "M12 11v5" }),
  ]);
}

// 4. Transportation — car side view
export function TransportationIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    // car body
    h("path", { d: "M3 14l2-6h4l3-3h4l2 3h3v6H3z" }),
    // windshield
    h("path", { d: "M9 8l-1.5 6" }),
    // rear window
    h("path", { d: "M16 8l1 6" }),
    // wheels
    h("circle", { cx: "7", cy: "17", r: "2" }),
    h("circle", { cx: "17", cy: "17", r: "2" }),
    // ground line between wheels
    h("path", { d: "M9 17h6" }),
    h("path", { d: "M3 14h18" }),
  ]);
}

// 5. Health — stethoscope
export function HealthIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    // earpieces and tube
    h("path", { d: "M6 2v6a6 6 0 0 0 12 0V2" }),
    // chest piece
    h("circle", { cx: "12", cy: "14", r: "2" }),
    // connecting tube down
    h("path", { d: "M12 10v2" }),
    // hose to bell
    h("path", { d: "M12 16v2a4 4 0 0 0 4 4h1a2 2 0 0 0 2-2v-1" }),
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

// 11. Charlie — baby/child
export function LilyIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    // head
    h("circle", { cx: "12", cy: "5.5", r: "3.5" }),
    // body
    h("path", { d: "M8 22v-6a4 4 0 0 1 8 0v6" }),
    // arms
    h("path", { d: "M5 14l3.5-1.5" }),
    h("path", { d: "M19 14l-3.5-1.5" }),
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
