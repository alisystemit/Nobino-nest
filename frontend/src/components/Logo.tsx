import React from "react";

export default function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
        <radialGradient id="logo-highlight" cx="0.2" cy="0.1" r="0.9">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="256" height="256" fill="url(#logo-gradient)" />
      <rect width="256" height="256" fill="url(#logo-highlight)" />
      <circle cx="64" cy="52" r="30" fill="#fff" fillOpacity="0.18" />
      <circle cx="206" cy="198" r="44" fill="#fff" fillOpacity="0.10" />
      <g transform="translate(150 150) scale(0.5)" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="7" strokeLinecap="round">
        <circle cx="0" cy="34" r="12" />
        <circle cx="0" cy="72" r="12" />
        <path d="M9 26 46 -2" />
        <path d="M9 64 46 92" />
        <path d="M32 40 58 12" />
        <path d="M32 58 58 86" />
      </g>
      <text x="128" y="142" textAnchor="middle" dominantBaseline="central" fontSize="112" fontWeight="bold" fill="#fff" fontFamily="'Yekan','Vazirmatn',Tahoma,sans-serif">
        س
      </text>
    </svg>
  );
}
