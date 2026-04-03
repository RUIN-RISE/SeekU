"use client";

import { BadgeCheck } from "lucide-react";
import { clsx } from "clsx";

interface VerifiedBadgeProps {
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  verifiedAt?: Date | string;
}

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6"
};

const labelSizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base"
};

export function VerifiedBadge({
  size = "md",
  showLabel = false,
  verifiedAt
}: VerifiedBadgeProps) {
  // Format verifiedAt date for tooltip/display
  const formattedDate = verifiedAt
    ? new Date(verifiedAt).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "short",
        day: "numeric"
      })
    : null;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1",
        "text-blue-500",
        showLabel && labelSizeClasses[size]
      )}
      title={formattedDate ? `验证于 ${formattedDate}` : undefined}
    >
      <BadgeCheck className={clsx(sizeClasses[size], "text-blue-500")} />
      {showLabel && (
        <span className="font-medium">已验证</span>
      )}
    </span>
  );
}