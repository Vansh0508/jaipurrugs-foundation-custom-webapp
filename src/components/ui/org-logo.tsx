// Jaipur Rugs Foundation logo, loaded directly from the org's live site.
// Plain <img> (not next/image) — it's an external URL and an SVG, so there's
// no local optimization to gain from routing it through the image loader.
// The source SVG is drawn in solid white (meant for the org's dark site
// header), so it's invisible on this app's light-mode-only background unless
// given a dark backing chip — that's what the wrapper below is for.
const LOGO_URL = "https://www.jaipurrugs.org/svg/Logo.svg";

export function OrgLogo({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center justify-center rounded-lg bg-neutral-900 px-3 py-2 ${className ?? ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="Jaipur Rugs Foundation" className="h-full w-auto" src={LOGO_URL} />
    </span>
  );
}
