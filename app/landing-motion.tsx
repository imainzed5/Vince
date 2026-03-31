"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

type LandingRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
};

type LandingHoverProps = {
  children: ReactNode;
  className?: string;
};

export function LandingReveal({
  children,
  className,
  delay = 0,
  distance = 24,
}: LandingRevealProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

export function LandingHover({ children, className }: LandingHoverProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={cn(className)}
      whileHover={reduceMotion ? undefined : { y: -6, scale: 1.01 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
