/**
 * public/src/features/instagram/components/InstagramAvatar.js
 * Avatar de Instagram Direct con foto real o iniciales sobre gradiente oficial
 */

import React, { useState } from "https://cdn.skypack.dev/react";

const e = React.createElement;

/**
 * Obtiene 1 o 2 iniciales a partir del username o nombre completo
 */
export function getInitials(username, name) {
  if (name && typeof name === "string" && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length > 0) {
      return parts[0].slice(0, 2).toUpperCase();
    }
  }

  if (username && typeof username === "string" && username.trim()) {
    const clean = username.replace(/^@+/, "").replace(/^[_\.]+|[_\.]+$/g, "");
    const parts = clean.split(/[_\.]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (clean.length > 0) {
      return clean.slice(0, 2).toUpperCase();
    }
  }

  return "IG";
}

const sizeClasses = {
  sm: "w-8 h-8 text-xs",
  md: "w-11 h-11 text-sm",
  lg: "w-14 h-14 text-base",
  xl: "w-20 h-20 text-xl",
};

const InstagramAvatar = ({
  src = null,
  username = null,
  name = null,
  size = "md",
  hasStoryRing = false,
  online = false,
  className = "",
  borderClass = "border-2 border-white dark:border-gray-800",
}) => {
  const [imgError, setImgError] = useState(false);
  const sizeClass = sizeClasses[size] || sizeClasses.md;
  const initials = getInitials(username, name);
  const displayName = name || (username ? `@${username}` : "Usuario de Instagram");

  const showImage = src && !imgError;

  const innerAvatar = showImage
    ? e("img", {
        src,
        alt: displayName,
        onError: () => setImgError(true),
        className: `${sizeClass} rounded-full object-cover ${borderClass} bg-white/20 shrink-0 select-none`,
      })
    : e(
        "div",
        {
          className: `${sizeClass} rounded-full bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4] text-white font-bold flex items-center justify-center tracking-wider select-none shrink-0 ${borderClass} shadow-xs`,
          "aria-label": displayName,
          title: displayName,
        },
        initials,
      );

  return e(
    "div",
    {
      className: `relative shrink-0 ${
        hasStoryRing
          ? "p-[2px] rounded-full bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4]"
          : ""
      } ${className}`,
    },
    [
      innerAvatar,
      online &&
        e("span", {
          key: "online-dot",
          className:
            "absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full shadow-xs",
          title: "En línea",
        }),
    ],
  );
};

export default InstagramAvatar;
