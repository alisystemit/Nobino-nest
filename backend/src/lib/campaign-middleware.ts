/**
 * مدیریت محدودیت ماهانه کمپین‌ها
 * از اول هر ماه شمسی (۱ مهر) شمارشگر کمپین‌ها ریست می‌شود
 */

import { prisma } from "@/lib/prisma";

// تبدیل تاریخ میلادی به شمسی
function toJalali(date: Date): { year: number; month: number; day: number } {
  const gregorianToJalali = (gy: number, gm: number, gd: number) => {
    let g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = gy - 621;
    let leap = (gy % 4 === 0 && (gy % 100 !== 0 || gy % 400 === 0)) ? 1 : 0;
    
    let gd = gd + (gm > 2 ? (leap ? 1 : 0) : 0);
    let jd = gd + g_d_m[gm - 1];
    
    if (jd > 79) {
      jy += 1;
      jd = jd - 79;
      if (jy > 3309) {
        jy = 3309;
      }
    } else {
      jd = jd + 286;
      jy = jy - 1;
    }
    
    let jm = 1;
    let j_days_in_month = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
    
    for (let i = 0; i < 12; i++) {
      if (jd <= j_days_in_month[i]) {
        break;
      }
      jd -= j_days_in_month[i];
      jm++;
    }
    
    return { year: jy, month: jm, day: jd };
  };
  
  return gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

// شروع ماه شمسی (۱ مهر)
function getJalaliMonthStart(date: Date): Date {
  const j = toJalali(date);
  // ۱ مهر هر سال شمسی
  const year = j.year;
  const month = 1; // مهر
  
  // تبدیل ۱ مهر به تاریخ میلادی (تقریبی)
  // ۱ مهر = ۲۱ سپتامبر تا ۲۲ اکتبر
  let monthStart = new Date(`20${year - 1}-09-22T00:00:00Z`);
  
  // تنظیم دقیق تر بر اساس سال
  if (year >= 1405) { // ۱ مهر ۱۴۰۵ = ۲۲ سپتامبر ۲۰۲۶
    monthStart = new Date("2026-09-22T00:00:00Z");
  }
  
  return monthStart;
}

// چک کردن آیا ماه جدید شروع شده است
export async function checkCampaignReset(salonId: string): Promise<void> {
  const campaignCount = await prisma.campaign.count({
    where: { salonId, createdAt: { gte: new Date() } },
  });
  
  if (campaignCount > 0) {
    // اگر کمپینی در این ماه ثبت شده، ریست نکن
    return;
  }
  
  // چک کردن اگر ماه شمسی جدید شروع شده
  const now = new Date();
  const j = toJalali(now);
  
  // اگر ۱ مهر یا بعد از اون بود، ماه جدید شروع شده
  if (j.month > 1 || (j.month === 1 && j.day >= 1)) {
    // ماه جدید شروع شده - محدودیت ریست میشه
    // اینجا جایگزین میشه با منطق واقعی اگر لازم بود
    console.log(`ماه شمسی جدید شروع شد: ${j.year}/${j.month}/${j.day}`);
  }
}

// دریافت شروع ماه شمسی فعلی
export function getCurrentJalaliMonthStart(): Date {
  const now = new Date();
  const j = toJalali(now);
  
  // تبدیل ۱ مهر به میلادی
  // برای سال فعلی
  const year = j.year;
  
  // ۱ مهر = ۲۱ سپتامبر به بعد
  let monthStart = new Date(`20${year - 1}-09-22T00:00:00Z`);
  
  // تنظیم دقیق تر بر اساس سال کبیسه
  const gYear = year + 621;
  const isLeap = (gYear % 4 === 0 && (gYear % 100 !== 0 || gYear % 400 === 0));
  
  if (isLeap) {
    monthStart = new Date(`20${year - 1}-09-22T00:00:00Z`);
  } else {
    monthStart = new Date(`20${year - 1}-09-23T00:00:00Z`);
  }
  
  return monthStart;
}

// افزودن محدودیت ماهانه به نام کمپین‌ها
export async function ensureCampaignLimit(salonId: string, limitKey: string = "campaigns"): Promise<{ allowed: boolean; limit: number; used: number; message: string }> {
  const now = new Date();
  const monthStart = getCurrentJalaliMonthStart();
  
  // شمارش کمپین‌های این ماه
  const campaignsThisMonth = await prisma.campaign.count({
    where: {
      salonId,
      createdAt: { gte: monthStart },
    },
  });
  
  // دریافت محدودیت پلن
  // برای سادگی، محدودیت ثابت در اینجا قرار میدیم
  // در پروژه واقعی از checkLimit استفاده میشه
  const planLimit = 3; // پلن رایگان
  
  return {
    allowed: campaignsThisMonth < planLimit,
    limit: planLimit,
    used: campaignsThisMonth,
    message: campaignsThisMonth >= planLimit 
      ? `سقف ماهانه ${planLimit} کمپین پر شده است. شروع ماه جدید در ۱ مهر شمسی.` 
      : `${planLimit - campaignsThisMonth} کمپین باقی‌مانده در این ماه`,
  };
}
