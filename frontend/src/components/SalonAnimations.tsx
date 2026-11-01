/**
 * انیمیشن‌های شناور آرایشگاهی برای هدر و صفحات
 * شامل: قیچی، سشوار، اسپری، شونه
 */

export default function SalonAnimations() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Scissors Animation - چپ بالا */}
      <div className="absolute left-[10%] top-[15%] animate-float-slow opacity-20">
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="18" cy="18" r="12" stroke="white" strokeWidth="2.5" fill="white" fillOpacity="0.3"/>
          <circle cx="42" cy="18" r="12" stroke="white" strokeWidth="2.5" fill="white" fillOpacity="0.3"/>
          <path d="M18 18 L50 50 M42 18 L50 50" stroke="white" strokeWidth="3" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Hair Dryer Animation - راست بالا */}
      <div className="absolute right-[15%] top-[20%] animate-float-medium opacity-25">
        <svg width="70" height="50" viewBox="0 0 70 50" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="5" width="40" height="30" rx="6" fill="white" fillOpacity="0.4" stroke="white" strokeWidth="2"/>
          <rect x="45" y="12" width="20" height="16" rx="3" fill="white" fillOpacity="0.3"/>
          <circle cx="25" cy="20" r="4" fill="white" fillOpacity="0.6"/>
          <circle cx="35" cy="20" r="3" fill="white" fillOpacity="0.5"/>
        </svg>
      </div>

      {/* Comb Animation - چپ پایین */}
      <div className="absolute bottom-[20%] left-[20%] animate-float-fast opacity-20">
        <svg width="80" height="60" viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5" y="10" width="70" height="18" rx="9" fill="white" fillOpacity="0.4" stroke="white" strokeWidth="2"/>
          <rect x="12" y="28" width="5" height="22" rx="2" fill="white" fillOpacity="0.4"/>
          <rect x="22" y="28" width="5" height="26" rx="2" fill="white" fillOpacity="0.4"/>
          <rect x="32" y="28" width="5" height="24" rx="2" fill="white" fillOpacity="0.4"/>
          <rect x="42" y="28" width="5" height="26" rx="2" fill="white" fillOpacity="0.4"/>
          <rect x="52" y="28" width="5" height="23" rx="2" fill="white" fillOpacity="0.4"/>
          <rect x="62" y="28" width="5" height="25" rx="2" fill="white" fillOpacity="0.4"/>
        </svg>
      </div>

      {/* Spray Bottle Animation - راست پایین */}
      <div className="absolute bottom-[25%] right-[12%] animate-float-slow opacity-22">
        <svg width="50" height="80" viewBox="0 0 50 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="15" y="30" width="20" height="40" rx="5" fill="white" fillOpacity="0.35" stroke="white" strokeWidth="2"/>
          <rect x="20" y="10" width="10" height="22" rx="3" fill="white" fillOpacity="0.3"/>
          <circle cx="25" cy="8" r="5" fill="white" fillOpacity="0.4" stroke="white" strokeWidth="1.5"/>
          <path d="M25 3 L25 -5 M20 -1 L30 -1" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Mirror Animation - مرکز */}
      <div className="absolute left-[45%] top-[30%] animate-float-medium opacity-15">
        <svg width="60" height="80" viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5" y="5" width="50" height="65" rx="25" stroke="white" strokeWidth="3" fill="white" fillOpacity="0.2"/>
          <rect x="10" y="10" width="40" height="55" rx="20" stroke="white" strokeWidth="2" fill="none"/>
        </svg>
      </div>

      {/* Additional Small Scissors - راست وسط */}
      <div className="absolute right-[8%] top-[50%] animate-float-fast opacity-18">
        <svg width="45" height="45" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="18" cy="18" r="10" stroke="white" strokeWidth="2" fill="white" fillOpacity="0.25"/>
          <circle cx="38" cy="18" r="10" stroke="white" strokeWidth="2" fill="white" fillOpacity="0.25"/>
          <path d="M18 18 L45 45 M38 18 L45 45" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Additional Comb - چپ وسط */}
      <div className="absolute left-[5%] top-[60%] animate-float-medium opacity-16">
        <svg width="60" height="45" viewBox="0 0 60 45" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="5" y="8" width="50" height="14" rx="7" fill="white" fillOpacity="0.3" stroke="white" strokeWidth="1.5"/>
          <rect x="10" y="22" width="3" height="16" rx="1.5" fill="white" fillOpacity="0.3"/>
          <rect x="17" y="22" width="3" height="18" rx="1.5" fill="white" fillOpacity="0.3"/>
          <rect x="24" y="22" width="3" height="17" rx="1.5" fill="white" fillOpacity="0.3"/>
          <rect x="31" y="22" width="3" height="18" rx="1.5" fill="white" fillOpacity="0.3"/>
          <rect x="38" y="22" width="3" height="16" rx="1.5" fill="white" fillOpacity="0.3"/>
          <rect x="45" y="22" width="3" height="17" rx="1.5" fill="white" fillOpacity="0.3"/>
        </svg>
      </div>

      {/* Stars decoration */}
      <div className="absolute left-[25%] top-[10%] h-2 w-2 animate-pulse rounded-full bg-white opacity-30"></div>
      <div className="absolute right-[30%] top-[40%] h-3 w-3 animate-pulse rounded-full bg-white opacity-25" style={{ animationDelay: '0.5s' }}></div>
      <div className="absolute left-[60%] bottom-[35%] h-2 w-2 animate-pulse rounded-full bg-white opacity-20" style={{ animationDelay: '1s' }}></div>
      <div className="absolute right-[20%] bottom-[15%] h-2 w-2 animate-pulse rounded-full bg-white opacity-30" style={{ animationDelay: '1.5s' }}></div>
    </div>
  );
}
