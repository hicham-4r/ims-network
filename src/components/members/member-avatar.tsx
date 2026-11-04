"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  userId: string;
  displayName: string;
  hasAvatar: boolean;
  version?: string;
  size?: "sm" | "md" | "lg";
};

const dimensions = {
  sm: 40,
  md: 56,
  lg: 96,
};

const classes = {
  sm: "size-10 text-sm",
  md: "size-14 text-lg",
  lg: "size-24 text-2xl",
};

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toLocaleUpperCase("en-US") || "?";
}

export function MemberAvatar({
  userId,
  displayName,
  hasAvatar,
  version,
  size = "md",
}: Props) {
  const src =
    `/api/avatar/${encodeURIComponent(userId)}` +
    (version ? `?v=${encodeURIComponent(version)}` : "");

  const [failedSrc, setFailedSrc] =
    useState<string | null>(null);

  const showImage = hasAvatar && failedSrc !== src;
  const dimension = dimensions[size];

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full border bg-muted ${classes[size]}`}
    >
      {showImage ? (
        <Image
          src={src}
          alt={`Profile picture of ${displayName}`}
          width={dimension}
          height={dimension}
          unoptimized
          className="size-full object-cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div
          role="img"
          aria-label={`Avatar for ${displayName}`}
          className="flex size-full items-center justify-center font-semibold text-muted-foreground"
        >
          {getInitials(displayName)}
        </div>
      )}
    </div>
  );
}
