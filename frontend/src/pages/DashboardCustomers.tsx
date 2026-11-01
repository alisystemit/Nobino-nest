/**
 * صفحه مدیریت مشتریان سالن — با لیست کامل مشتریان، یاداشت‌ها و عکس/ویس.
 * هر سالن مشتری‌های مخصوص خودش را دارد (مشتری‌ها یونیک نیستند).
 */
import { useState, useEffect } from "react";
import { Link, useParamsTyped } from "@/router-shim";
import { Search, MoreVertical, Image, Mic, X } from "lucide-react";
import { formatToman, toPersianDigits } from "@/lib/utils";
import { useMeta } from "@/lib/use-meta";

type Customer = {
  id: string;
  phone: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  visits: number;
  spend: number;
  lastVisitAt?: string | null;
  createdAt: string;
};

export default function DashboardCustomersPage() {
  const { id: salonId } = useParamsTyped<{ id: string }>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  useMeta(`مدیریت مشتریان - ${salonId}`, "لیست مشتریان سالن");

  useEffect(() => {
    fetchCustomers();
  }, [salonId]);

  async function fetchCustomers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/salons/${salonId}/customers`);
      const data = await res.json();
      if (data.success) {
        setCustomers(data.customers);
      }
    } catch (e) {
      console.error("خطا در بارگذاری مشتریان:", e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCustomerDetail(customerId: string) {
    try {
      const res = await fetch(`/api/dashboard/salons/${salonId}/customers/${customerId}`);
      const data = await res.json();
      if (data.success) {
        setSelectedCustomer(data.customer);
      }
    } catch (e) {
      console.error("خطا در بارگذاری جزئیات مشتری:", e);
    }
  }

  const filteredCustomers = customers.filter(c => {
    const searchLower = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(searchLower) ||
      c.phone.includes(search) ||
      c.firstName?.toLowerCase().includes(searchLower) ||
      c.lastName?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 dark:text-neutral-100">مدیریت مشتریان</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            لیست تمام مشتریانی که در این سالن نوبت گرفته‌اند
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="جستجوی مشتری..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-xl border border-neutral-300 bg-white pl-10 pr-4 py-2 text-sm outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-pink-500"
          />
        </div>
      </div>

      {/* لیست مشتریان */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full py-12 text-center text-neutral-500">در حال بارگذاری...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 p-12 text-center text-neutral-400">
            مشتری‌ای یافت نشد
          </div>
        ) : (
          filteredCustomers.map((c) => (
            <div
              key={c.id}
              onClick={() => fetchCustomerDetail(c.id)}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-purple-100 text-lg dark:from-pink-900/30 dark:to-purple-900/30">
                    {c.name ? c.name[0] : c.phone[0]}
                  </div>
                  <div>
                    <div className="font-bold text-neutral-900 dark:text-neutral-100">
                      {c.name || <span className="text-neutral-400">بدون نام</span>}
                    </div>
                    <div className="text-xs text-neutral-500">{c.phone}</div>
                  </div>
                </div>
                <MoreVertical className="h-5 w-5 text-neutral-300 group-hover:text-pink-500" />
              </div>
              
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800">
                  <div className="text-[10px] text-neutral-500">تعداد بازدید</div>
                  <div className="font-bold text-neutral-700 dark:text-neutral-300">{toPersianDigits(c.visits)}</div>
                </div>
                <div className="rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800">
                  <div className="text-[10px] text-neutral-500">مجموع خرج</div>
                  <div className="font-bold text-pink-600">{formatToman(c.spend)}</div>
                </div>
              </div>
              
              {c.lastVisitAt && (
                <div className="mt-2 text-[10px] text-neutral-400">
                  آخرین مراجعه: {toPersianDigits(new Date(c.lastVisitAt).toLocaleDateString("fa-IR"))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal جزئیات مشتری */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white dark:bg-neutral-900">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 p-4 dark:border-neutral-800">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-white text-xl">
                  {selectedCustomer.name ? selectedCustomer.name[0] : selectedCustomer.phone[0]}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                    {selectedCustomer.name || "بدون نام"}
                  </h2>
                  <div className="text-sm text-neutral-500">{selectedCustomer.phone}</div>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-neutral-100 dark:border-neutral-800">
              <button className="flex-1 py-3 text-sm font-bold text-pink-600 border-b-2 border-pink-600">
                اطلاعات کامل
              </button>
              <button className="flex-1 py-3 text-sm font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
                نوبت‌ها ({selectedCustomer.appointments?.length || 0})
              </button>
              <button className="flex-1 py-3 text-sm font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
                یاداشت‌ها ({selectedCustomer.notes?.length || 0})
              </button>
              <button className="flex-1 py-3 text-sm font-bold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
                رسانه ({selectedCustomer.media?.length || 0})
              </button>
            </div>

            {/* Content */}
            <div className="max-h-[60vh] overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-800">
                  <h3 className="mb-3 text-sm font-bold text-neutral-700 dark:text-neutral-300">اطلاعات تماس</h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-[10px] text-neutral-500">نام کامل</div>
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">
                        {selectedCustomer.firstName} {selectedCustomer.lastName}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500">شماره موبایل</div>
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">{selectedCustomer.phone}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-800">
                  <h3 className="mb-3 text-sm font-bold text-neutral-700 dark:text-neutral-300">آمار مشتری</h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="text-center">
                      <div className="text-2xl font-black text-emerald-600">{toPersianDigits(selectedCustomer.visits)}</div>
                      <div className="text-[10px] text-neutral-500">بازدید کل</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-black text-pink-600">{formatToman(selectedCustomer.spend)}</div>
                      <div className="text-[10px] text-neutral-500">مجموع خرج</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-black text-amber-600">{selectedCustomer.appointments?.length || 0}</div>
                      <div className="text-[10px] text-neutral-500">نوبت در این سالن</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t border-neutral-100 p-4 dark:border-neutral-800">
              <button onClick={() => setSelectedCustomer(null)} className="rounded-xl px-4 py-2 text-sm font-bold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
