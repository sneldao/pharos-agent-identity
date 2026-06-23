export function Rule({
  weight = "hair",
  tone = "default",
  className = "",
}: {
  weight?: "hair" | "edge";
  tone?: "default" | "soft";
  className?: string;
}) {
  const height = weight === "edge" ? "h-px" : "h-[0.5px]";
  const color = tone === "soft" ? "bg-rule-soft" : "bg-rule";
  return <hr className={`w-full border-0 ${height} ${color} ${className}`} aria-hidden />;
}
