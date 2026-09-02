import logoWhite from "@/assets/logo-wordmark-white.svg";

/**
 * Full-bleed brand-green header with the white Swapngo wordmark. Render it as
 * the first child of an `overflow-hidden` auth <Card>, before <CardContent>,
 * so the green header and the white form read as one joined card.
 */
export function AuthBrand() {
  return (
    <div className="flex items-center justify-center bg-primary py-5">
      <img src={logoWhite} alt="Swapngo" className="h-6 w-auto" />
    </div>
  );
}
