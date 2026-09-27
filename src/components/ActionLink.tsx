import type { AnchorHTMLAttributes, ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ActionLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  tone?: "primary" | "light" | "outline";
};

export default function ActionLink({
  children,
  className,
  tone = "primary",
  ...props
}: ActionLinkProps) {
  const variant = tone === "outline" ? "outline" : "default";

  return (
    <a
      className={cn(
        buttonVariants({ variant, size: "lg" }),
        "public-action",
        `public-action--${tone}`,
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}