import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:
          "border-cyan-500/30 bg-cyan-500/10 text-cyber shadow-sm shadow-cyan-500/5",
        secondary:
          "border-border-default bg-bg-elevated text-text-secondary",
        destructive:
          "border-red-500/30 bg-red-500/10 text-red-400 shadow-sm",
        outline: "text-text-muted border-border-default bg-transparent",
        gold: "border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-sm shadow-amber-500/5",
        purple: "border-purple-500/30 bg-purple-500/10 text-purple-400 shadow-sm shadow-purple-500/5",
        cyber: "border-cyan-500/40 bg-cyan-500/[0.08] text-cyber font-tech tracking-widest [text-shadow:0_0_8px_hsl(var(--cyber-cyan)/0.3)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
