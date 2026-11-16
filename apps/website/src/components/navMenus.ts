import type { LucideIcon } from "lucide-react";
import {
  ListChecks,
  Tag,
  BatteryCharging,
  CircleHelp,
  MessageCircle,
  LayoutGrid,
  Sparkles,
  LayoutDashboard,
  Smartphone,
  CalendarCheck,
} from "lucide-react";

export interface MenuLink {
  label: string;
  text: string;
  to: string;
  icon: LucideIcon;
  /** Drawn as the menu's call to action rather than a plain row. */
  accent?: boolean;
}

/**
 * Each business's own pages, shown in three places from this one list: the
 * floating left rail on wide screens (SectionRail), the header dropdown on
 * narrower laptops, and the phone menu. The two businesses never share a menu.
 * Rental items are in-page anchors (that page is one long page); software
 * items are real routes.
 */
export const RENTAL_MENU: MenuLink[] = [
  { label: "How it works", text: "Pick a plan, ride, swap the battery", to: "/ev-scooter-rental#how-it-works", icon: ListChecks },
  { label: "Rental plans", text: "Weekly plans with unlimited kilometres", to: "/ev-scooter-rental#pricing", icon: Tag },
  { label: "Battery swap", text: "A fresh battery in about two minutes", to: "/ev-scooter-rental#battery-swap", icon: BatteryCharging },
  { label: "FAQ", text: "Answers to common rider questions", to: "/ev-scooter-rental#faq", icon: CircleHelp },
  { label: "Contact", text: "Talk to the Swapngo team", to: "/ev-scooter-rental#contact", icon: MessageCircle },
];

export const FLEET_MENU: MenuLink[] = [
  { label: "Overview", text: "What SwapNgo Fleet does", to: "/fleet-management", icon: LayoutGrid },
  { label: "Features", text: "Everything you can run from it", to: "/fleet-management/features", icon: Sparkles },
  { label: "Admin app", text: "The web console for your team", to: "/fleet-management/admin-app", icon: LayoutDashboard },
  { label: "Rider app", text: "The mobile app your riders use", to: "/fleet-management/rider-app", icon: Smartphone },
  { label: "Pricing", text: "Contact us for price details", to: "/fleet-management/pricing", icon: Tag },
  { label: "Request a demo", text: "See it with your own fleet", to: "/fleet-management/request-demo", icon: CalendarCheck, accent: true },
];
