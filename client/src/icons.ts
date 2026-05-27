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

// 1. Food — bowl on a counter line, two steam wisps
export function FoodIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M2.5 11.5h19" }),
    h("path", { d: "M3.5 11.5a8.5 8.5 0 0 0 17 0" }),
    h("path", { d: "M9.5 7.5c0-1.5 1-1.5 0-3.5", "stroke-width": "1" }),
    h("path", { d: "M14.5 7.5c0-1.5 1-1.5 0-3.5", "stroke-width": "1" }),
  ]);
}

// 2. Living — pitched-roof house with arched door, doorknob detail
export function LivingIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M3 11L12 3.5l9 7.5" }),
    h("path", { d: "M5.5 9.5V20h13V9.5" }),
    h("path", { d: "M10 20v-5a2 2 0 0 1 4 0v5", "stroke-width": "1" }),
    h("circle", { cx: "13.4", cy: "17.4", r: "0.35", fill: color, stroke: "none" }),
  ]);
}

// 3. Household — couch (back curve + seat + legs + cushion divider)
export function HouseholdIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M4 14V11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3" }),
    h("path", { d: "M2.5 14h19v3a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2z" }),
    h("path", { d: "M12 14V9.5", "stroke-width": "1" }),
    h("path", { d: "M5.5 19v1.5", "stroke-width": "1" }),
    h("path", { d: "M18.5 19v1.5", "stroke-width": "1" }),
  ]);
}

// 4. Transportation — car with curved roof, window detail
export function TransportationIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M3 17h18v-3a2 2 0 0 0-2-2h-1.5l-1.8-3.6A2 2 0 0 0 13.9 7H10.1a2 2 0 0 0-1.8 1.4L6.5 12H5a2 2 0 0 0-2 2v3z" }),
    h("path", { d: "M7 12h10", "stroke-width": "1" }),
    h("circle", { cx: "7", cy: "17", r: "2", fill: "none" }),
    h("circle", { cx: "17", cy: "17", r: "2", fill: "none" }),
  ]);
}

// 5. Health — heart with pulse line (pulse is secondary)
export function HealthIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M20.4 4.6a5.4 5.4 0 0 0-7.65 0L12 5.35l-.75-.75a5.4 5.4 0 1 0-7.65 7.65L12 20.65l8.4-8.4a5.4 5.4 0 0 0 0-7.65z" }),
    h("path", { d: "M4.5 12h3l1.5-2.5L11.5 14l1.5-3 1 1.5h3.5", "stroke-width": "1" }),
  ]);
}

// 6. Subscriptions — two refresh arcs (arrowheads are secondary)
export function SubscriptionsIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M21 4v5h-5", "stroke-width": "1" }),
    h("path", { d: "M3 20v-5h5", "stroke-width": "1" }),
    h("path", { d: "M3 9a9 9 0 0 1 15.4-3.4L21 9" }),
    h("path", { d: "M21 15a9 9 0 0 1-15.4 3.4L3 15" }),
  ]);
}

// 7. Entertainment — five-point star
export function EntertainmentIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M12 2.5l2.94 6 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.12 1.12-6.54L2.5 9.48l6.56-.95z" }),
  ]);
}

// 8. Insurance — shield with check (check is secondary)
export function InsuranceIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M12 21.5c-1-.4-7-3-7-9V5l7-2.5L19 5v7.5c0 6-6 8.6-7 9z" }),
    h("path", { d: "M9 12.2l2.5 2.5L15 10.5", "stroke-width": "1" }),
  ]);
}

// 9. Apparel — t-shirt with collar arc detail
export function ApparelIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M20.4 3.5L16 2a4 4 0 0 1-8 0L3.6 3.5a2 2 0 0 0-1.3 2.2l.58 3.57a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.13a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.3-2.2z" }),
    h("path", { d: "M8 2.5a4 4 0 0 0 8 0", "stroke-width": "1" }),
  ]);
}

// 10. Electronics — monitor with flared/splayed stand
export function ElectronicsIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("rect", { x: "2.5", y: "4", width: "19", height: "12", rx: "2" }),
    h("path", { d: "M8 20h8", "stroke-width": "1" }),
    h("path", { d: "M10.5 16l-1.5 4", "stroke-width": "1" }),
    h("path", { d: "M13.5 16l1.5 4", "stroke-width": "1" }),
  ]);
}

// 11. Child — figure (arms are secondary)
export function ChildIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("circle", { cx: "12", cy: "5.5", r: "3.5", fill: "none" }),
    h("path", { d: "M8 22v-6a4 4 0 0 1 8 0v6" }),
    h("path", { d: "M5 14l3-1.3", "stroke-width": "1" }),
    h("path", { d: "M19 14l-3-1.3", "stroke-width": "1" }),
  ]);
}

// 12. Education — open book with page rules
export function EducationIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M2.5 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2.5z" }),
    h("path", { d: "M21.5 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" }),
    h("path", { d: "M5 8h4", "stroke-width": "1" }),
    h("path", { d: "M15 8h4", "stroke-width": "1" }),
  ]);
}

// 13. Travel — airplane silhouette
export function TravelIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("path", { d: "M21 14.5v-1.5L13 8V3.5a1 1 0 0 0-2 0V8l-8 5v1.5l8-2.5V18l-2 1.4v1l3-.7 3 .7v-1L13 18v-5.5z" }),
  ]);
}

// 14. Gift — box with ribbon + bow (ribbon + bow are secondary)
export function GiftIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("rect", { x: "3", y: "8.5", width: "18", height: "3.5", rx: "0.75" }),
    h("path", { d: "M4.5 12v7.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V12" }),
    h("path", { d: "M12 8.5v12", "stroke-width": "1" }),
    h("path", { d: "M8 8.5C6.5 8.5 5.5 7 6 5.5S8 4 9 5s3 3.5 3 3.5", "stroke-width": "1" }),
    h("path", { d: "M16 8.5C17.5 8.5 18.5 7 18 5.5S16 4 15 5s-3 3.5-3 3.5", "stroke-width": "1" }),
  ]);
}

// 15. Other — three filled dots
export function OtherIcon({ color = defaults.color, size = defaults.size }: IconProps = {}) {
  return svgWrap(color, size, [
    h("circle", { cx: "5", cy: "12", r: "1.2", fill: color, stroke: "none" }),
    h("circle", { cx: "12", cy: "12", r: "1.2", fill: color, stroke: "none" }),
    h("circle", { cx: "19", cy: "12", r: "1.2", fill: color, stroke: "none" }),
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
  child: ChildIcon,
  education: EducationIcon,
  travel: TravelIcon,
  gift: GiftIcon,
  other: OtherIcon,
};
