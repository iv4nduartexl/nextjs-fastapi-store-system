"use server";

import { cookies } from "next/headers";

export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  topCategory: { name: string; revenue: number } | null;
}

export interface CategoryStat {
  category: string;
  revenue: number;
  quantity: number;
  orderCount: number;
}

export interface PaymentMethodStat {
  method: string;
  revenue: number;
  count: number;
  percentage: number;
}

export interface TopProduct {
  itemId: string;
  name: string;
  revenue: number;
  quantity: number;
  orderCount: number;
  category: string;
}

export interface CustomerInsight {
  customerId: string;
  name: string;
  totalSpent: number;
  orderCount: number;
  avgOrder: number;
  lastOrder: string;
}

export interface ProfitableProduct {
  itemId: string;
  name: string;
  category: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  quantity: number;
}

export interface Profitability {
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  grossMarginPercent: number;
  topProfitableProducts: ProfitableProduct[];
  leastProfitableProducts: ProfitableProduct[];
}

export interface TrendPoint {
  period: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
}

export interface RevenueTrend {
  data: TrendPoint[];
}

export interface DayOfWeekStat {
  day: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
}

export interface SupplierSpend {
  supplierId: string;
  name: string;
  totalSpend: number;
  purchaseCount: number;
}

export interface PurchasePaymentStatus {
  status: string;
  count: number;
  total: number;
}

export interface PurchaseAnalytics {
  totalSpend: number;
  totalPurchases: number;
  avgPurchaseValue: number;
  bySupplier: SupplierSpend[];
  byPaymentStatus: PurchasePaymentStatus[];
}

export interface LowStockItem {
  itemId: string;
  name: string;
  stock: number;
  minStock: number | null;
  category: string;
  unitType: string;
}

export interface DeadStockItem {
  itemId: string;
  name: string;
  stock: number;
  category: string;
  lastSold: string | null;
}

export interface InventoryAnalytics {
  totalInventoryValue: number;
  totalItems: number;
  lowStockItems: LowStockItem[];
  deadStockItems: DeadStockItem[];
}

export interface DiscountRuleStat {
  ruleName: string;
  usageCount: number;
  totalDiscount: number;
}

export interface DiscountAnalytics {
  totalDiscountAmount: number;
  discountedSaleCount: number;
  totalSalesCount: number;
  discountRate: number;
  byRule: DiscountRuleStat[];
}

export interface AdvancedCustomer {
  customerId: string;
  name: string;
  totalSpent: number;
  orderCount: number;
  creditOwed: number;
}

export interface CustomersAdvanced {
  totalCustomers: number;
  activeCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  creditOutstanding: number;
  topByValue: AdvancedCustomer[];
}

export interface CancellationAnalytics {
  cancelledCount: number;
  cancelledRevenue: number;
  refundedCount: number;
  refundedRevenue: number;
  totalLostRevenue: number;
  refundRate: number;
}

export interface CashboxTypeStat {
  type: string;
  direction: string;
  amount: number;
  count: number;
}

export interface CashboxAnalytics {
  totalInflow: number;
  totalOutflow: number;
  netCashflow: number;
  byType: CashboxTypeStat[];
}

export interface TimeBlockStat {
  block: string;
  label: string;
  revenue: number;
  orders: number;
  percentage: number;
}

export interface PeakTimes {
  byTimeBlock: TimeBlockStat[];
  byDayOfWeek: { day: string; revenue: number; orders: number }[];
}

export interface CategoryPair {
  categoryA: string;
  categoryB: string;
  count: number;
  percentage: number;
  totalRevenue: number;
}

export interface BasketAnalysis {
  topPairs: CategoryPair[];
  totalBaskets: number;
  avgItemsPerBasket: number;
}

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("accessToken")?.value;
}

const API = process.env.API_BASE_URL;

async function fetchAnalytics<T>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T | { message: string }> {
  const token = await getToken();
  if (!token) return { message: "Not authenticated" };

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  });

  const url = `${API}/sales/analytics/${endpoint}?${searchParams.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) return { message: `Error ${res.status}` };
  return res.json();
}

const dateParams = (period?: string, startDate?: string, endDate?: string) => ({
  period: period || "30d",
  start_date: startDate,
  end_date: endDate,
});

export async function fetchAnalyticsSummary(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<AnalyticsSummary | { message: string }> {
  return fetchAnalytics<AnalyticsSummary>("summary", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsByCategory(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<CategoryStat[] | { message: string }> {
  return fetchAnalytics<CategoryStat[]>("by-category", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsByPaymentMethod(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<PaymentMethodStat[] | { message: string }> {
  return fetchAnalytics<PaymentMethodStat[]>("by-payment-method", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsTopProducts(
  limit: number = 10,
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<TopProduct[] | { message: string }> {
  return fetchAnalytics<TopProduct[]>("top-products", { limit, ...dateParams(period, startDate, endDate) });
}

export async function fetchAnalyticsCustomerInsights(
  limit: number = 5,
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<CustomerInsight[] | { message: string }> {
  return fetchAnalytics<CustomerInsight[]>("customer-insights", { limit, ...dateParams(period, startDate, endDate) });
}

export async function fetchAnalyticsProfitability(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<Profitability | { message: string }> {
  return fetchAnalytics<Profitability>("profitability", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsRevenueTrend(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<RevenueTrend | { message: string }> {
  return fetchAnalytics<RevenueTrend>("revenue-trend", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsDayOfWeek(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<DayOfWeekStat[] | { message: string }> {
  return fetchAnalytics<DayOfWeekStat[]>("day-of-week", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsPurchases(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<PurchaseAnalytics | { message: string }> {
  return fetchAnalytics<PurchaseAnalytics>("purchases", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsInventory(): Promise<InventoryAnalytics | { message: string }> {
  return fetchAnalytics<InventoryAnalytics>("inventory");
}

export async function fetchAnalyticsDiscounts(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<DiscountAnalytics | { message: string }> {
  return fetchAnalytics<DiscountAnalytics>("discounts", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsCustomersAdvanced(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<CustomersAdvanced | { message: string }> {
  return fetchAnalytics<CustomersAdvanced>("customers-advanced", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsCancellations(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<CancellationAnalytics | { message: string }> {
  return fetchAnalytics<CancellationAnalytics>("cancellations", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsCashbox(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<CashboxAnalytics | { message: string }> {
  return fetchAnalytics<CashboxAnalytics>("cashbox", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsPeakTimes(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<PeakTimes | { message: string }> {
  return fetchAnalytics<PeakTimes>("peak-times", dateParams(period, startDate, endDate));
}

export async function fetchAnalyticsBasket(
  period?: string,
  startDate?: string,
  endDate?: string
): Promise<BasketAnalysis | { message: string }> {
  return fetchAnalytics<BasketAnalysis>("basket", dateParams(period, startDate, endDate));
}
