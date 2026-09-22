import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

const SIZES = {
  default: "h-12",
  md: "h-16",
  lg: "h-24",
} as const;

export function Brand({
  href = "/",
  size = "default",
  className,
}: {
  href?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("group inline-flex items-center", className)}>
      <Image
        src="/logo.png"
        alt="Pinto & Aparte"
        width={220}
        height={144}
        priority
        className={cn(
          SIZES[size],
          "w-auto transition-transform duration-300 group-hover:scale-105",
        )}
      />
    </Link>
  );
}
