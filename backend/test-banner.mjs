/**
 * تست ساده برای تولید بنر SVG
 */
import { writeFileSync } from 'fs';
import { generateSalonBanner } from './src/lib/banner-generator.ts';

// تست با نام‌های مختلف
const testCases = [
  { name: 'سالن زیبایی ماه', color: '#ec4899' },
  { name: 'آرایشگاه بهار', color: '#10b981' },
  { name: 'سالن نیلوفر', color: undefined }, // رنگ رندم
];

testCases.forEach((test, index) => {
  try {
    const svg = generateSalonBanner(test);
    writeFileSync(`test-banner-${index + 1}.svg`, svg);
    console.log(`✅ بنر ${index + 1} برای "${test.name}" با موفقیت ساخته شد`);
  } catch (error) {
    console.error(`❌ خطا در ساخت بنر ${index + 1}:`, error.message);
  }
});

console.log('\n✨ تمام بنرها در دایرکتوری backend ذخیره شدند.');
