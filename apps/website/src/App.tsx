import { Suspense, lazy, type ComponentType } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SectionRail } from "@/components/SectionRail";
import { SiteDataProvider } from "@/lib/siteData";
import { PreBookModalProvider } from "@/lib/preBookModal";
import { Router, ScrollManager, useLocation, normalizePath } from "@/lib/router";
import { Seo, findPage } from "@/seo/Seo";
import { GrainOverlay } from "@/components/ui/GrainOverlay";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { HomePage } from "@/pages/HomePage";
import { RentalPage } from "@/pages/RentalPage";

/**
 * Everything outside the two entry pages is code-split: a rider arriving on
 * the rental page never downloads the fleet-software pages, and vice versa.
 * Named exports are adapted to React.lazy's default-export contract here.
 */
function page<T extends Record<string, ComponentType>>(loader: () => Promise<T>, name: keyof T) {
  return lazy(async () => ({ default: (await loader())[name] }));
}

const AboutPage = page(() => import("@/pages/AboutPage"), "AboutPage");
const ContactPage = page(() => import("@/pages/ContactPage"), "ContactPage");
const NotFoundPage = page(() => import("@/pages/NotFoundPage"), "NotFoundPage");
const FleetLandingPage = page(() => import("@/pages/fleet/FleetLandingPage"), "FleetLandingPage");
const FleetFeaturesPage = page(() => import("@/pages/fleet/FleetFeaturesPage"), "FleetFeaturesPage");
const FleetAdminPage = page(() => import("@/pages/fleet/FleetAdminPage"), "FleetAdminPage");
const FleetRiderPage = page(() => import("@/pages/fleet/FleetRiderPage"), "FleetRiderPage");
const FleetPricingPage = page(() => import("@/pages/fleet/FleetPricingPage"), "FleetPricingPage");
const FleetDemoPage = page(() => import("@/pages/fleet/FleetDemoPage"), "FleetDemoPage");

const ROUTES: Record<string, ComponentType> = {
  "/": HomePage,
  "/ev-scooter-rental": RentalPage,
  "/about": AboutPage,
  "/contact": ContactPage,
  "/fleet-management": FleetLandingPage,
  "/fleet-management/features": FleetFeaturesPage,
  "/fleet-management/admin-app": FleetAdminPage,
  "/fleet-management/rider-app": FleetRiderPage,
  "/fleet-management/pricing": FleetPricingPage,
  "/fleet-management/request-demo": FleetDemoPage,
};

function Routes() {
  const { pathname } = useLocation();
  const path = normalizePath(pathname);
  const Page = ROUTES[path] ?? NotFoundPage;
  const known = path in ROUTES && findPage(path);

  return (
    <>
      {known && <Seo path={path} />}
      <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
        <Page />
      </Suspense>
    </>
  );
}

export default function App({ url }: { url?: string } = {}) {
  return (
    <Router url={url}>
      <SiteDataProvider>
        <PreBookModalProvider>
          <div className="min-h-screen bg-background">
            <GrainOverlay />
            <ScrollManager />
            <Header />
            <SectionRail />
            <main>
              <Routes />
            </main>
            <Footer />
            <ScrollToTop />
          </div>
        </PreBookModalProvider>
      </SiteDataProvider>
    </Router>
  );
}
