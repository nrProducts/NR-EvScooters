import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { PreBookModal } from "@/components/PreBookModal";

interface PreBookModalContextValue {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const PreBookModalContext = createContext<PreBookModalContextValue | null>(null);

/** Any CTA on the site can open the same modal instance without prop-drilling — mirrors the SiteDataProvider pattern. */
export function usePreBookModal(): PreBookModalContextValue {
  const ctx = useContext(PreBookModalContext);
  if (!ctx) throw new Error("usePreBookModal must be used within a PreBookModalProvider");
  return ctx;
}

export function PreBookModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ isOpen, openModal, closeModal }), [isOpen, openModal, closeModal]);

  return (
    <PreBookModalContext.Provider value={value}>
      {children}
      <PreBookModal open={isOpen} onClose={closeModal} />
    </PreBookModalContext.Provider>
  );
}
