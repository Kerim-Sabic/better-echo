import { getThemeAwareLogoUrl } from "@/lib/branding";

export default function BrandLogo({
  theme,
  forceDark = false,
  alt = "Horalix Logo",
  className = "",
}) {
  return (
    <img
      src={getThemeAwareLogoUrl({ theme, forceDark })}
      alt={alt}
      className={className}
      draggable="false"
    />
  );
}
