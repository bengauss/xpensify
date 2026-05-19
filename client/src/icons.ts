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

// 1. Food — bowl with steam
export function FoodIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M3 12h18a1 1 0 0 1 0 1 9 9 0 0 1-18 0 1 1 0 0 1 0-1z" }),
    h("path", { d: "M9 9c0-1 1-2 0-3" }),
    h("path", { d: "M15 9c0-1 1-2 0-3" }),
  ]);
}

// 2. Living — house
export function LivingIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M3 10.5L12 3l9 7.5" }),
    h("path", { d: "M5 9v11h14V9" }),
    h("path", { d: "M10 20v-6h4v6" }),
  ]);
}

// 3. Household — couch
export function HouseholdIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M4 11V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" }),
    h("path", { d: "M2 11h20v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z" }),
    h("path", { d: "M4 18v2" }),
    h("path", { d: "M20 18v2" }),
  ]);
}

// 4. Transportation — car
export function TransportationIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M5 17h14a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1l-2-4H8L6 11H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2z" }),
    h("circle", { cx: "7.5", cy: "17", r: "2", fill: "none" }),
    h("circle", { cx: "16.5", cy: "17", r: "2", fill: "none" }),
  ]);
}

// 5. Health — heart with pulse
export function HealthIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M20.42 4.58a5.4 5.4 0 0 0-7.65 0L12 5.35l-.77-.77a5.4 5.4 0 0 0-7.65 0 5.4 5.4 0 0 0 0 7.65L12 20.65l8.42-8.42a5.4 5.4 0 0 0 0-7.65z" }),
    h("path", { d: "M3.5 12h4l1.5-3 2 6 1.5-3h4" }),
  ]);
}

// 6. Subscriptions — refresh arrows
export function SubscriptionsIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M23 4v6h-6" }),
    h("path", { d: "M1 20v-6h6" }),
    h("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10" }),
    h("path", { d: "M21 15a9 9 0 0 1-14.85 3.36L1 14" }),
  ]);
}

// 7. Entertainment — star
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

// 10. Electronics — monitor
export function ElectronicsIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2" }),
    h("path", { d: "M8 21h8" }),
    h("path", { d: "M12 17v4" }),
  ]);
}

// 11. Lily — child figure
export function LilyIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("circle", { cx: "12", cy: "5.5", r: "3.5" }),
    h("path", { d: "M8 22v-6a4 4 0 0 1 8 0v6" }),
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
    h("rect", { x: "3", y: "8", width: "18", height: "4", rx: "1" }),
    h("rect", { x: "3", y: "12", width: "18", height: "9", rx: "1" }),
    h("path", { d: "M12 8v13" }),
    h("path", { d: "M7.5 8a2.5 2.5 0 0 1 0-5C9 3 12 8 12 8" }),
    h("path", { d: "M16.5 8a2.5 2.5 0 0 0 0-5C15 3 12 8 12 8" }),
  ]);
}

// 15. Other — horizontal ellipsis
export function OtherIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("circle", { cx: "5", cy: "12", r: "1.5", fill: "none" }),
    h("circle", { cx: "12", cy: "12", r: "1.5", fill: "none" }),
    h("circle", { cx: "19", cy: "12", r: "1.5", fill: "none" }),
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
  lily: LilyIcon,
  education: EducationIcon,
  travel: TravelIcon,
  gift: GiftIcon,
  other: OtherIcon,
};
