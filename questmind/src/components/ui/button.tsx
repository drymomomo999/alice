import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] relative overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 border border-cyan-400/20",
        destructive:
          "bg-gradient-to-r from-red-500 to-rose-600 text-white hover:from-red-400 hover:to-rose-500 shadow-lg shadow-red-500/20 border border-red-400/20",
        outline:
          "border border-cyan-500/30 bg-transparent hover:bg-cyan-500/10 hover:border-cyan-500/60 text-cyan-400 shadow-sm hover:shadow-cyan-500/10",
        secondary:
          "bg-bg-elevated text-text-secondary border border-border-subtle hover:bg-hover hover:text-text-primary hover:border-border-default",
        ghost: "hover:bg-cyan-500/8 hover:text-cyber text-text-muted",
        link: "text-cyan-400 underline-offset-4 hover:underline",
        glow: "bg-gradient-to-r from-cyan-400 to-blue-500 text-white hover:from-cyan-300 hover:to-blue-400 shadow-xl shadow-cyan-500/30 hover:shadow-cyan-500/50 animate-neon border border-cyan-300/30",
        romantic: "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-400 hover:to-pink-400 shadow-lg shadow-purple-500/20 border border-purple-400/20",
        gold: "bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-900 hover:from-amber-400 hover:to-yellow-400 shadow-lg shadow-amber-500/30 border border-amber-400/30 font-bold",
        tactical: "bg-transparent text-cyber border border-cyan-500/30 hover:bg-cyan-500/10 hover:border-cyan-500/50 uppercase tracking-wider text-xs font-tech clip-path-[polygon(0_0,calc(100%-6px)_0,100%_6px,100%_calc(100%-6px),calc(100%-6px)_100%,6px_100%,0_calc(100%-6px)]",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
