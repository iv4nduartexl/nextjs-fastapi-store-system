"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Bar as ChartJSBar, Pie as ChartJSPie, Line as ChartJSLine } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from "chart.js";
import {
  fetchAnalyticsSummary,
  fetchAnalyticsByCategory,
  fetchAnalyticsByPaymentMethod,
  fetchAnalyticsTopProducts,
  fetchAnalyticsProfitability,
  fetchAnalyticsRevenueTrend,
  fetchAnalyticsDayOfWeek,
  fetchAnalyticsPurchases,
  fetchAnalyticsInventory,
  fetchAnalyticsDiscounts,
  fetchAnalyticsCustomersAdvanced,
  fetchAnalyticsCancellations,
  fetchAnalyticsCashbox,
  fetchAnalyticsPeakTimes,
  fetchAnalyticsBasket,
} from "@/components/actions/analytics-action";
import type {
  AnalyticsSummary,
  CategoryStat,
  PaymentMethodStat,
  TopProduct,
  Profitability,
  RevenueTrend,
  DayOfWeekStat,
  PurchaseAnalytics,
  InventoryAnalytics,
  DiscountAnalytics,
  CustomersAdvanced,
  CancellationAnalytics,
  CashboxAnalytics,
  PeakTimes,
  BasketAnalysis,
} from "@/components/actions/analytics-action";
import { DateRangeSelector, DateRangePreset } from "@/components/ui/date-range-selector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/currency";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Package,
  Users,
  AlertTriangle,
  Percent,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Info,
} from "lucide-react";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

const COLORS = [
  "hsl(210, 100%, 56%)",
  "hsl(350, 85%, 56%)",
  "hsl(160, 62%, 41%)",
  "hsl(35, 90%, 55%)",
  "hsl(270, 60%, 56%)",
  "hsl(190, 80%, 45%)",
  "hsl(330, 70%, 56%)",
  "hsl(50, 90%, 50%)",
];

function EmptyState({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground text-center py-8">{text}</p>
  );
}

export default function StatisticsPage() {
  const t = useTranslations("statistics");
  const [loading, setLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DateRangePreset>("30d");
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryStat[]>([]);
  const [paymentData, setPaymentData] = useState<PaymentMethodStat[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [profitability, setProfitability] = useState<Profitability | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrend | null>(null);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeekStat[]>([]);
  const [purchases, setPurchases] = useState<PurchaseAnalytics | null>(null);
  const [inventory, setInventory] = useState<InventoryAnalytics | null>(null);
  const [discounts, setDiscounts] = useState<DiscountAnalytics | null>(null);
  const [customersAdv, setCustomersAdv] = useState<CustomersAdvanced | null>(null);
  const [cancellations, setCancellations] = useState<CancellationAnalytics | null>(null);
  const [cashbox, setCashbox] = useState<CashboxAnalytics | null>(null);
  const [peakTimes, setPeakTimes] = useState<PeakTimes | null>(null);
  const [basket, setBasket] = useState<BasketAnalysis | null>(null);

  const handleDateRangeChange = useCallback(
    (range: { from?: Date; to?: Date } | undefined, preset: DateRangePreset) => {
      setDatePreset(preset);
      if (preset === "custom" && range) {
        setStartDate(range.from?.toISOString());
        setEndDate(range.to?.toISOString());
      } else if (preset === "today") {
        const now = new Date();
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        setStartDate(start.toISOString());
        setEndDate(end.toISOString());
      } else {
        setStartDate(undefined);
        setEndDate(undefined);
      }
    },
    []
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    const p = datePreset === "today" || datePreset === "custom" ? undefined : datePreset;

    const [s, cat, pay, prod, prof, trend, dow, pur, inv, disc, cust, canc, cb, peak, basketData] = await Promise.all([
      fetchAnalyticsSummary(p, startDate, endDate),
      fetchAnalyticsByCategory(p, startDate, endDate),
      fetchAnalyticsByPaymentMethod(p, startDate, endDate),
      fetchAnalyticsTopProducts(10, p, startDate, endDate),
      fetchAnalyticsProfitability(p, startDate, endDate),
      fetchAnalyticsRevenueTrend(p, startDate, endDate),
      fetchAnalyticsDayOfWeek(p, startDate, endDate),
      fetchAnalyticsPurchases(p, startDate, endDate),
      fetchAnalyticsInventory(),
      fetchAnalyticsDiscounts(p, startDate, endDate),
      fetchAnalyticsCustomersAdvanced(p, startDate, endDate),
      fetchAnalyticsCancellations(p, startDate, endDate),
      fetchAnalyticsCashbox(p, startDate, endDate),
      fetchAnalyticsPeakTimes(p, startDate, endDate),
      fetchAnalyticsBasket(p, startDate, endDate),
    ]);

    if ("message" in s) { setLoading(false); return; }
    setSummary(s);
    if (!("message" in cat)) setCategoryData(cat);
    if (!("message" in pay)) setPaymentData(pay);
    if (!("message" in prod)) setTopProducts(prod);
    if (!("message" in prof)) setProfitability(prof);
    if (!("message" in trend)) setRevenueTrend(trend);
    if (!("message" in dow)) setDayOfWeek(dow);
    if (!("message" in pur)) setPurchases(pur);
    if (!("message" in inv)) setInventory(inv);
    if (!("message" in disc)) setDiscounts(disc);
    if (!("message" in cust)) setCustomersAdv(cust);
    if (!("message" in canc)) setCancellations(canc);
    if (!("message" in cb)) setCashbox(cb);
    if (!("message" in peak)) setPeakTimes(peak);
    if (!("message" in basketData)) setBasket(basketData);
    setLoading(false);
  }, [datePreset, startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">{t("title")}</h2>
          <p className="text-gray-500 mt-1">{t("subtitle")}</p>
        </div>
        <DateRangeSelector onChange={handleDateRangeChange} defaultPreset={datePreset} labels={t.raw("dateRange")} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : !summary ? (
        <EmptyState text={t("empty.noData")} />
      ) : (
        <>
          <TooltipProvider>
            {/* KPI Row 1 — Core Business Performance */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    {t("kpi.netRevenue")}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent><p className="max-w-[250px]">{t("kpi.tooltips.netRevenue")}</p></TooltipContent>
                    </Tooltip>
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(summary.totalRevenue - (cancellations?.totalLostRevenue ?? 0))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {cancellations && cancellations.totalLostRevenue > 0
                      ? `-${formatCurrency(cancellations.totalLostRevenue)} ${t("operations.cancelled").toLowerCase()}`
                      : t("kpi.totalRevenue")}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    {t("kpi.totalOrders")}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent><p className="max-w-[250px]">{t("kpi.tooltips.totalOrders")}</p></TooltipContent>
                    </Tooltip>
                  </CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.totalOrders}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    {t("kpi.avgOrderValue")}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent><p className="max-w-[250px]">{t("kpi.tooltips.avgOrderValue")}</p></TooltipContent>
                    </Tooltip>
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(summary.avgOrderValue)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    {t("kpi.grossProfit")}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent><p className="max-w-[250px]">{t("kpi.tooltips.grossProfit")}</p></TooltipContent>
                    </Tooltip>
                  </CardTitle>
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {profitability ? (
                    <>
                      <div className="text-2xl font-bold">{formatCurrency(profitability.grossProfit)}</div>
                      <p className={`text-xs ${profitability.grossMarginPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {profitability.grossMarginPercent}% {t("kpi.grossMargin").toLowerCase()}
                      </p>
                    </>
                  ) : (
                    <div className="text-2xl font-bold text-muted-foreground">—</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* KPI Row 2 — Operations & Health */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    {t("kpi.purchaseSpend")}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent><p className="max-w-[250px]">{t("kpi.tooltips.purchaseSpend")}</p></TooltipContent>
                    </Tooltip>
                  </CardTitle>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(purchases?.totalSpend ?? 0)}</div>
                  <p className="text-xs text-muted-foreground">
                    {purchases?.totalPurchases ?? 0} {t("orders")}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    {t("kpi.creditSales")}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent><p className="max-w-[250px]">{t("kpi.tooltips.creditSales")}</p></TooltipContent>
                    </Tooltip>
                  </CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {(() => {
                    const creditMethod = paymentData.find(d => d.method === "credit");
                    const creditTotal = creditMethod?.revenue ?? 0;
                    return (
                      <>
                        <div className="text-2xl font-bold">{formatCurrency(creditTotal)}</div>
                        <p className="text-xs text-muted-foreground">
                          {creditMethod?.count ?? 0} {t("orders")}
                        </p>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    {t("kpi.creditOutstanding")}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent><p className="max-w-[250px]">{t("kpi.tooltips.creditOutstanding")}</p></TooltipContent>
                    </Tooltip>
                  </CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(customersAdv?.creditOutstanding ?? 0)}</div>
                  <p className="text-xs text-muted-foreground">
                    {customersAdv?.activeCustomers ?? 0} {t("kpi.activeCustomers").toLowerCase()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    {t("kpi.lowStockCount")}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent><p className="max-w-[250px]">{t("kpi.tooltips.lowStockCount")}</p></TooltipContent>
                    </Tooltip>
                  </CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{inventory?.lowStockItems.length ?? 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {inventory?.totalItems ?? 0} {t("units")}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TooltipProvider>

          {/* Tabs */}
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
              <TabsTrigger value="charts">{t("tabs.charts")}</TabsTrigger>
              <TabsTrigger value="profitability">{t("tabs.profitability")}</TabsTrigger>
              <TabsTrigger value="business">{t("tabs.business")}</TabsTrigger>
              <TabsTrigger value="operations">{t("tabs.operations")}</TabsTrigger>
            </TabsList>

            {/* OVERVIEW TAB */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>{t("charts.revenueByCategory")}</CardTitle></CardHeader>
                  <CardContent>
                    {categoryData.length > 0 ? (
                      <div className="h-64">
                        <ChartJSPie data={{
                          labels: categoryData.map(d => d.category === "Uncategorized" ? t("charts.uncategorized") : d.category),
                          datasets: [{ data: categoryData.map(d => d.revenue), backgroundColor: COLORS.slice(0, categoryData.length) }],
                        }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }} />
                      </div>
                    ) : <EmptyState text={t("empty.noData")} />}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>{t("charts.revenueByPaymentMethod")}</CardTitle></CardHeader>
                  <CardContent>
                    {paymentData.length > 0 ? (
                      <div className="h-64">
                        <ChartJSPie data={{
                          labels: paymentData.map(d => `${t(`paymentMethods.${d.method}`)} (${d.percentage}%)`),
                          datasets: [{ data: paymentData.map(d => d.revenue), backgroundColor: COLORS.slice(0, paymentData.length) }],
                        }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }} />
                      </div>
                    ) : <EmptyState text={t("empty.noData")} />}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* CHARTS & TRENDS TAB */}
            <TabsContent value="charts" className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>{t("charts.revenueTrend")}</CardTitle></CardHeader>
                  <CardContent>
                    {revenueTrend && revenueTrend.data.length > 0 ? (
                      <div className="h-64">
                        <ChartJSLine data={{
                          labels: revenueTrend.data.map(d => d.period),
                          datasets: [{
                            label: t("kpi.totalRevenue"),
                            data: revenueTrend.data.map(d => d.revenue),
                            borderColor: COLORS[0],
                            backgroundColor: COLORS[0] + "33",
                            fill: true,
                            tension: 0.3,
                          }],
                        }} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: "top" } } }} />
                      </div>
                    ) : <EmptyState text={t("empty.noData")} />}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>{t("charts.dayOfWeek")}</CardTitle></CardHeader>
                  <CardContent>
                    {dayOfWeek.length > 0 ? (
                      <div className="h-64">
                        <ChartJSBar data={{
                          labels: dayOfWeek.map(d => {
                            const dayIndex = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].indexOf(d.day);
                            const days = t.raw("days") as string[];
                            return dayIndex >= 0 ? days[dayIndex] : d.day;
                          }),
                          datasets: [{
                            label: t("kpi.totalRevenue"),
                            data: dayOfWeek.map(d => d.revenue),
                            backgroundColor: COLORS[2],
                          }],
                        }} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: "top" } } }} />
                      </div>
                    ) : <EmptyState text={t("empty.noData")} />}
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader><CardTitle>{t("charts.discountImpact")}</CardTitle></CardHeader>
                <CardContent>
                  {discounts && discounts.totalSalesCount > 0 ? (
                    <div className="grid gap-4 grid-cols-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold">{formatCurrency(discounts.totalDiscountAmount)}</p>
                        <p className="text-sm text-muted-foreground">{t("table.discount")}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{discounts.discountedSaleCount}</p>
                        <p className="text-sm text-muted-foreground">{t("table.count")}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{discounts.discountRate}%</p>
                        <p className="text-sm text-muted-foreground">{t("table.usage")}</p>
                      </div>
                    </div>
                  ) : <EmptyState text={t("empty.noData")} />}
                </CardContent>
              </Card>
              {peakTimes && peakTimes.byTimeBlock.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader><CardTitle>{t("charts.timeBlock")}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {peakTimes.byTimeBlock.map((block) => {
                          const timeBlocks = t.raw("timeBlocks") as Record<string, string>;
                          return (
                            <div key={block.block} className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <p className="font-medium">{timeBlocks[block.block] ?? block.label}</p>
                                <p className="text-sm text-muted-foreground">{block.orders} {t("orders")}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold">{formatCurrency(block.revenue)}</p>
                                <p className="text-xs text-muted-foreground">{block.percentage}%</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>{t("charts.dayOfWeekSales")}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {peakTimes.byDayOfWeek.map((day) => (
                          <div key={day.day} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium">{day.day}</p>
                              <p className="text-sm text-muted-foreground">{day.orders} {t("orders")}</p>
                            </div>
                            <p className="font-semibold">{formatCurrency(day.revenue)}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* PROFITABILITY TAB */}
            <TabsContent value="profitability" className="space-y-6">
              {profitability ? (
                <>
                  <div className="grid gap-4 grid-cols-3">
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("profitability.totalRevenue")}</CardTitle></CardHeader>
                      <CardContent><p className="text-2xl font-bold">{formatCurrency(profitability.totalRevenue)}</p></CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("profitability.totalCost")}</CardTitle></CardHeader>
                      <CardContent><p className="text-2xl font-bold">{formatCurrency(profitability.totalCOGS)}</p></CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("profitability.grossProfit")}</CardTitle></CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold">{formatCurrency(profitability.grossProfit)}</p>
                        <p className="text-xs text-muted-foreground">{profitability.grossMarginPercent}% {t("profitability.margin").toLowerCase()}</p>
                      </CardContent>
                    </Card>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    <Card>
                      <CardHeader><CardTitle>{t("profitability.topProducts")}</CardTitle></CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {profitability.topProfitableProducts.slice(0, 10).map((p, i) => (
                            <div key={p.itemId} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">{i + 1}</span>
                                <div>
                                  <p className="font-medium">{p.name}</p>
                                  <p className="text-sm text-muted-foreground">{p.category}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold">{formatCurrency(p.profit)}</p>
                                <p className="text-xs text-muted-foreground">{p.margin}% {t("profitability.margin").toLowerCase()}</p>
                              </div>
                            </div>
                          ))}
                          {profitability.topProfitableProducts.length === 0 && <EmptyState text={t("empty.noData")} />}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle>{t("profitability.leastProducts")}</CardTitle></CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {profitability.leastProfitableProducts.slice(0, 10).map((p, i) => (
                            <div key={p.itemId} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-destructive text-destructive-foreground text-sm font-bold">{i + 1}</span>
                                <div>
                                  <p className="font-medium">{p.name}</p>
                                  <p className="text-sm text-muted-foreground">{p.category}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`font-semibold ${p.profit < 0 ? "text-red-600" : ""}`}>{formatCurrency(p.profit)}</p>
                                <p className="text-xs text-muted-foreground">{p.margin}% {t("profitability.margin").toLowerCase()}</p>
                              </div>
                            </div>
                          ))}
                          {profitability.leastProfitableProducts.length === 0 && <EmptyState text={t("empty.noData")} />}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </>
              ) : <EmptyState text={t("empty.noData")} />}
            </TabsContent>

            {/* BUSINESS INTELLIGENCE TAB */}
            <TabsContent value="business" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />{t("business.topProducts")}</CardTitle></CardHeader>
                  <CardContent>
                    {topProducts.length > 0 ? (
                      <div className="space-y-3">
                        {topProducts.map((p, i) => (
                          <div key={p.itemId} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">{i + 1}</span>
                              <div>
                                <p className="font-medium">{p.name}</p>
                                <p className="text-sm text-muted-foreground">{p.category}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{formatCurrency(p.revenue)}</p>
                              <p className="text-xs text-muted-foreground">{p.quantity} {t("units")} / {p.orderCount} {t("orders")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <EmptyState text={t("empty.noData")} />}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />{t("business.topCustomers")}</CardTitle></CardHeader>
                  <CardContent>
                    {customersAdv && customersAdv.topByValue.length > 0 ? (
                      <div className="space-y-3">
                        {customersAdv.topByValue.map((c, i) => (
                          <div key={c.customerId} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">{i + 1}</span>
                              <div>
                                <p className="font-medium">{c.name}</p>
                                <p className="text-sm text-muted-foreground">{c.orderCount} {t("orders")}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{formatCurrency(c.totalSpent)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <EmptyState text={t("empty.noData")} />}
                  </CardContent>
                </Card>
              </div>
              {purchases && (
                <Card>
                  <CardHeader><CardTitle>{t("business.supplierSpend")}</CardTitle></CardHeader>
                  <CardContent>
                    {purchases.bySupplier.length > 0 ? (
                      <div className="space-y-3">
                        {purchases.bySupplier.map((s, i) => (
                          <div key={s.supplierId || i} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-secondary text-secondary-foreground text-sm font-bold">{i + 1}</span>
                              <div>
                                <p className="font-medium">{s.name}</p>
                                <p className="text-sm text-muted-foreground">{s.purchaseCount} {t("orders")}</p>
                              </div>
                            </div>
                            <p className="font-semibold">{formatCurrency(s.totalSpend)}</p>
                          </div>
                        ))}
                      </div>
                    ) : <EmptyState text={t("empty.noData")} />}
                  </CardContent>
                </Card>
              )}
              {basket && basket.topPairs.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("business.basketAnalysis")}</CardTitle>
                    <p className="text-sm text-muted-foreground">{t("business.basketInsight")}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 grid-cols-2 mb-4">
                      <div className="text-center p-3 border rounded-lg">
                        <p className="text-2xl font-bold">{basket.totalBaskets}</p>
                        <p className="text-sm text-muted-foreground">{t("orders")}</p>
                      </div>
                      <div className="text-center p-3 border rounded-lg">
                        <p className="text-2xl font-bold">{basket.avgItemsPerBasket}</p>
                        <p className="text-sm text-muted-foreground">{t("units")} / {t("orders").toLowerCase()}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {basket.topPairs.map((pair, i) => (
                        <div key={`${pair.categoryA}-${pair.categoryB}`} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">{i + 1}</span>
                            <div>
                              <p className="font-medium">{pair.categoryA} + {pair.categoryB}</p>
                              <p className="text-sm text-muted-foreground">{pair.count} {t("business.pairCount").toLowerCase()} ({pair.percentage}%)</p>
                            </div>
                          </div>
                          <p className="font-semibold">{formatCurrency(pair.totalRevenue)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {customersAdv && customersAdv.creditOutstanding > 0 && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" />{t("business.creditOutstanding")}</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-amber-600">{formatCurrency(customersAdv.creditOutstanding)}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* INVENTORY & OPERATIONS TAB */}
            <TabsContent value="operations" className="space-y-6">
              {inventory && (
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader><CardTitle>{t("operations.lowStockAlerts")}</CardTitle></CardHeader>
                    <CardContent>
                      {inventory.lowStockItems.length > 0 ? (
                        <div className="space-y-3">
                          {inventory.lowStockItems.map(item => (
                            <div key={item.itemId} className="flex items-center justify-between p-3 border rounded-lg border-amber-200 bg-amber-50">
                              <div>
                                <p className="font-medium">{item.name}</p>
                                <p className="text-sm text-muted-foreground">{item.category}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-amber-700">{item.stock} {item.unitType}</p>
                                <p className="text-xs text-muted-foreground">min: {item.minStock}</p>
                              </div>
                            </div>
                          ))}
                      </div>
                      ) : <EmptyState text={t("empty.noData")} />}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>{t("operations.deadStock")}</CardTitle></CardHeader>
                    <CardContent>
                      {inventory.deadStockItems.length > 0 ? (
                        <div className="space-y-3">
                          {inventory.deadStockItems.slice(0, 10).map(item => (
                            <div key={item.itemId} className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <p className="font-medium">{item.name}</p>
                                <p className="text-sm text-muted-foreground">{item.category}</p>
                              </div>
                              <p className="font-semibold">{item.stock} {t("units")}</p>
                            </div>
                          ))}
                        </div>
                      ) : <EmptyState text={t("empty.noData")} />}
                    </CardContent>
                  </Card>
                </div>
              )}
              <div className="grid gap-6 md:grid-cols-2">
                {cancellations && (
                  <Card>
                    <CardHeader><CardTitle>{t("operations.cancellations")}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">{t("operations.cancelled")}</p>
                          <p className="text-xl font-bold">{cancellations.cancelledCount}</p>
                          <p className="text-sm text-muted-foreground">{formatCurrency(cancellations.cancelledRevenue)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{t("operations.refunded")}</p>
                          <p className="text-xl font-bold">{cancellations.refundedCount}</p>
                          <p className="text-sm text-muted-foreground">{formatCurrency(cancellations.refundedRevenue)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {cashbox && (
                  <Card>
                    <CardHeader><CardTitle>{t("operations.cashboxSummary")}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1"><ArrowUpRight className="h-3 w-3" /> {t("table.inflow")}</p>
                          <p className="text-xl font-bold text-green-600">{formatCurrency(cashbox.totalInflow)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1"><ArrowDownRight className="h-3 w-3" /> {t("table.outflow")}</p>
                          <p className="text-xl font-bold text-red-600">{formatCurrency(cashbox.totalOutflow)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" /> {t("table.net")}</p>
                          <p className={`text-xl font-bold ${cashbox.netCashflow >= 0 ? "text-green-600" : "text-red-600"}`}>{formatCurrency(cashbox.netCashflow)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
