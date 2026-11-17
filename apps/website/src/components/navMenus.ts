import type { LucideIcon } from "lucide-react";
import {
  ListChecks,
  Tag,
  BatteryCharging,
  CircleHelp,
  MessageCircle,
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
 * The rental page's own sections, shown in the header dropdown and the phone
 * menu. They are in-page anchors (that page is one long page). The fleet
 * software is a single page and has no menu.
 */
export const RENTAL_MENU: MenuLink[] = [
  { label: "How it works", text: "Pick a plan, ride, swap the battery", to: "/ev-scooter-rental#how-it-works", icon: ListChecks },
  { label: "Rental plans", text: "Weekly plans with unlimited kilometres", to: "/ev-scooter-rental#pricing", icon: Tag },
  { label: "Battery swap", text: "A fresh battery in about two minutes", to: "/ev-scooter-rental#battery-swap", icon: BatteryCharging },
  { label: "FAQ", text: "Answers to common rider questions", to: "/ev-scooter-rental#faq", icon: CircleHelp },
  { label: "Contact", text: "Talk to the Swapngo team", to: "/ev-scooter-rental#contact", icon: MessageCircle },
];
