import * as React from "react"

import { cn } from "@/lib/utils"

/** @typedef {React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>} DivProps */

/** @type {React.ForwardRefExoticComponent<DivProps>} */
const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-xl border bg-card text-card-foreground shadow transition-all duration-200", className)}
    {...props} />
))
Card.displayName = "Card"

/** @type {React.ForwardRefExoticComponent<DivProps>} */
const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props} />
))
CardHeader.displayName = "CardHeader"

/** @type {React.ForwardRefExoticComponent<DivProps>} */
const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props} />
))
CardTitle.displayName = "CardTitle"

/** @type {React.ForwardRefExoticComponent<DivProps>} */
const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props} />
))
CardDescription.displayName = "CardDescription"

/** @type {React.ForwardRefExoticComponent<DivProps>} */
const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

/** @type {React.ForwardRefExoticComponent<DivProps>} */
const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props} />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
