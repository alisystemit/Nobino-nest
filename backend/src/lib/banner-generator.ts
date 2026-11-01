/**
 * تولید بنر SVG برای سالن‌ها
 * بنر شامل نام سالن با فونت فارسی و طراحی گرادیانی زیباست
 */

interface BannerOptions {
  name: string;
  color?: string; // اگر ارسال نشد، رنگ رندم انتخاب میشه
}

const COLOR_GRADIENTS = [
  { from: '#ec4899', to: '#8b5cf6' }, // Pink to Purple
  { from: '#f97316', to: '#dc2626' }, // Orange to Red
  { from: '#06b6d4', to: '#3b82f6' }, // Cyan to Blue
  { from: '#10b981', to: '#059669' }, // Emerald to Green
  { from: '#f59e0b', to: '#eab308' }, // Amber to Yellow
  { from: '#8b5cf6', to: '#6366f1' }, // Purple to Indigo
  { from: '#ec4899', to: '#db2777' }, // Pink to Rose
  { from: '#14b8a6', to: '#0d9488' }, // Teal to Teal Dark
];

/**
 * انتخاب یک گرادیانت رندم یا از رنگ coverColor
 */
function selectGradient(color?: string): { from: string; to: string } {
  if (color) {
    // اگر رنگ داده شده، از همون رنگ با تیره‌تر برای گرادیانت استفاده میکنیم
    return { from: color, to: adjustBrightness(color, -20) };
  }
  return COLOR_GRADIENTS[Math.floor(Math.random() * COLOR_GRADIENTS.length)];
}

/**
 * تنظیم روشنایی رنگ hex
 */
function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

/**
 * تولید SVG بنر سالن با نام و آیکون‌های آرایشگاهی
 */
export function generateSalonBanner({ name, color }: BannerOptions): string {
  const gradient = selectGradient(color);
  
  // محاسبه عرض متن تقریبی برای مرکز کردن
  const textLength = name.length;
  const estimatedWidth = textLength * 30; // تقریبی
  const textX = Math.max(100, 600 - estimatedWidth / 2);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400">
  <defs>
    <linearGradient id="mainGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${gradient.from}"/>
      <stop offset="1" stop-color="${gradient.to}"/>
    </linearGradient>
    <radialGradient id="highlight" cx="0.2" cy="0.1" r="0.9">
      <stop offset="0" stop-color="#fff" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  
  <!-- Background Gradient -->
  <rect width="1200" height="400" fill="url(#mainGrad)"/>
  <rect width="1200" height="400" fill="url(#highlight)"/>
  
  <!-- Decorative Circles -->
  <circle cx="1090" cy="70" r="120" fill="#fff" fill-opacity="0.07"/>
  <circle cx="240" cy="40" r="70" fill="#fff" fill-opacity="0.08"/>
  <circle cx="950" cy="340" r="90" fill="#fff" fill-opacity="0.06"/>
  
  <!-- Mirror/Frame Decoration (Left) -->
  <g opacity="0.18">
    <rect x="70" y="60" width="170" height="250" rx="85" fill="#fff"/>
    <rect x="82" y="72" width="146" height="226" rx="73" fill="none" stroke="#fff" stroke-width="4"/>
    <path d="M92 270L214 94" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="0.6"/>
  </g>
  
  <!-- Scissors (Right Top) -->
  <g transform="translate(1020, 120)" opacity="0.22">
    <circle cx="0" cy="0" r="18" fill="#fff"/>
    <circle cx="30" cy="0" r="18" fill="#fff"/>
    <path d="M0 0 L50 -40 M30 0 L50 -40" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
  </g>
  
  <!-- Hair Dryer (Right Bottom) -->
  <g transform="translate(950, 280)" opacity="0.2">
    <rect x="0" y="0" width="60" height="40" rx="8" fill="#fff"/>
    <rect x="50" y="10" width="30" height="20" rx="4" fill="#fff"/>
    <circle cx="15" cy="20" r="6" fill="#000" fill-opacity="0.3"/>
    <circle cx="35" cy="20" r="6" fill="#000" fill-opacity="0.3"/>
  </g>
  
  <!-- Comb (Left Bottom) -->
  <g transform="translate(100, 320)" opacity="0.18">
    <rect x="0" y="0" width="80" height="20" rx="10" fill="#fff"/>
    <rect x="10" y="20" width="4" height="25" fill="#fff"/>
    <rect x="20" y="20" width="4" height="30" fill="#fff"/>
    <rect x="30" y="20" width="4" height="28" fill="#fff"/>
    <rect x="40" y="20" width="4" height="30" fill="#fff"/>
    <rect x="50" y="20" width="4" height="26" fill="#fff"/>
    <rect x="60" y="20" width="4" height="29" fill="#fff"/>
  </g>
  
  <!-- Spray Bottle (Center Right) -->
  <g transform="translate(880, 50)" opacity="0.16">
    <rect x="10" y="20" width="30" height="50" rx="6" fill="#fff"/>
    <rect x="20" y="0" width="10" height="25" rx="3" fill="#fff"/>
    <circle cx="25" cy="0" r="6" fill="#fff"/>
    <path d="M25 -6 L25 -15 M20 -10 L30 -10" stroke="#fff" stroke-width="2"/>
  </g>
  
  <!-- Stars Decoration -->
  <g fill="#fff" opacity="0.25">
    <circle cx="350" cy="80" r="3"/>
    <circle cx="780" cy="320" r="4"/>
    <circle cx="450" cy="340" r="3"/>
    <circle cx="650" cy="60" r="4"/>
  </g>
  
  <!-- Salon Name Text -->
  <text 
    x="600" 
    y="220" 
    font-family="'Vazirmatn', 'Tahoma', sans-serif" 
    font-size="72" 
    font-weight="900" 
    fill="#fff" 
    text-anchor="middle"
    filter="url(#glow)"
    style="text-shadow: 0 4px 12px rgba(0,0,0,0.3)">
    ${escapeXml(name)}
  </text>
  
  <!-- Subtitle -->
  <text 
    x="600" 
    y="260" 
    font-family="'Vazirmatn', 'Tahoma', sans-serif" 
    font-size="24" 
    font-weight="400" 
    fill="#fff" 
    fill-opacity="0.85" 
    text-anchor="middle">
    سالن زیبایی و آرایشگاه
  </text>
</svg>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
