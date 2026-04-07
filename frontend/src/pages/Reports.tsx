import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  Calendar, Download, TrendingUp, TrendingDown, DollarSign, Package, 
  Users, FileSpreadsheet, FileText, Loader2, Settings, User, ShoppingCart, CreditCard, Banknote, Phone, Building, ChevronDown, ChevronUp, Wallet
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Input, Card, CardContent, Badge } from '@/components/ui'
import api from '@/services/api'
import { formatMoney, formatNumber, cn, formatDateTashkent, formatDateTimeTashkent } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'

export default function ReportsPage() {
  const { t } = useLanguage()
  
  // Date filters
  const today = new Date()
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0])
  const [activeTab, setActiveTab] = useState<'profit' | 'sales' | 'sellers' | 'export'>('profit')
  const [selectedSellerId, setSelectedSellerId] = useState<number | ''>('')
  const [expandedSection, setExpandedSection] = useState<string | null>('sales')

  // Fetch profit report
  const { data: profitData, isLoading: loadingProfit, refetch: refetchProfit } = useQuery({
    queryKey: ['profit-report', startDate, endDate],
    queryFn: async () => {
      const response = await api.get('/reports/profit', {
        params: { start_date: startDate, end_date: endDate }
      })
      return response.data
    },
    enabled: activeTab === 'profit',
  })

  // Fetch sales summary
  const { data: salesData, isLoading: loadingSales, refetch: refetchSales } = useQuery({
    queryKey: ['sales-summary', startDate, endDate],
    queryFn: async () => {
      const response = await api.get('/reports/sales-summary', {
        params: { start_date: startDate, end_date: endDate }
      })
      return response.data
    },
    enabled: activeTab === 'sales',
  })

  // Fetch exchange rate
  const { data: exchangeRateData } = useQuery({
    queryKey: ['exchange-rate'],
    queryFn: async () => {
      const response = await api.get('/settings/exchange-rate')
      return response.data
    },
  })

  // Fetch all sellers summary
  const { data: sellersSummary, isLoading: loadingSellersSummary } = useQuery({
    queryKey: ['sellers-summary', startDate, endDate],
    queryFn: async () => {
      const response = await api.get('/reports/sellers-summary', {
        params: { start_date: startDate, end_date: endDate }
      })
      return response.data
    },
    enabled: activeTab === 'sellers',
  })

  // Fetch specific seller stats
  const { data: sellerStats, isLoading: loadingSellerStats } = useQuery({
    queryKey: ['seller-stats', selectedSellerId, startDate, endDate],
    queryFn: async () => {
      const response = await api.get('/reports/seller-stats', {
        params: { seller_id: selectedSellerId, start_date: startDate, end_date: endDate }
      })
      return response.data
    },
    enabled: activeTab === 'sellers' && !!selectedSellerId,
  })

  // Download Excel report
  const handleDownloadExcel = async (type: string) => {
    try {
      toast.loading(t('reportPreparing'))
      
      const response = await api.get(`/reports/excel/${type}`, {
        params: { start_date: startDate, end_date: endDate },
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${type}_${startDate}_${endDate}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      
      toast.dismiss()
      toast.success(t('reportDownloaded'))
    } catch (error) {
      toast.dismiss()
      toast.error(t('reportError'))
    }
  }

  // Download PDF report
  const handleDownloadPDF = async (type: string) => {
    try {
      toast.loading(t('reportPreparing'))
      
      const response = await api.get(`/reports/pdf/${type}`, {
        params: { start_date: startDate, end_date: endDate },
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${type}_${startDate}_${endDate}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      
      toast.dismiss()
      toast.success(t('reportDownloaded'))
    } catch (error) {
      toast.dismiss()
      toast.error(t('reportError'))
    }
  }

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">{t('reports')}</h1>
        {exchangeRateData && (
          <span className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 rounded-xl text-xs font-semibold text-primary">
            <DollarSign className="w-3.5 h-3.5" />
            1$ = {formatNumber(exchangeRateData.usd_rate)}
          </span>
        )}
      </div>

      {/* ── Date range ── */}
      <div className="bg-white rounded-2xl border border-border p-3 shadow-sm flex items-center gap-2">
        <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input type="date" value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="flex-1 h-10 px-3 border border-border rounded-xl text-sm focus:outline-none focus:border-primary" />
        <span className="text-gray-400">—</span>
        <input type="date" value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="flex-1 h-10 px-3 border border-border rounded-xl text-sm focus:outline-none focus:border-primary" />
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto no-scrollbar">
        {[
          { key: 'profit', icon: TrendingUp, label: t('profitReport') },
          { key: 'sales',  icon: DollarSign, label: t('salesReport') },
          { key: 'sellers',icon: Users,      label: t('sellerReport') },
          { key: 'export', icon: Download,   label: t('export') },
        ].map(({ key, icon: Icon, label }) => (
          <button key={key}
            onClick={() => setActiveTab(key as any)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap min-w-fit px-2",
              activeTab === key ? "bg-white text-primary shadow-sm" : "text-gray-500"
            )}>
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Profit Tab */}
      {activeTab === 'profit' && (
        <div className="space-y-3">
          {loadingProfit ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : profitData ? (
            <>
              {/* Summary 2x3 grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: t('totalRevenue'),   value: formatMoney(profitData.summary.total_revenue),          color: 'text-primary',   bg: 'bg-blue-50',   border: 'border-blue-100' },
                  { label: t('totalCostPrice'), value: formatMoney(profitData.summary.total_cost),             color: 'text-warning',   bg: 'bg-orange-50', border: 'border-orange-100' },
                  { label: 'Yalpi foyda',       value: formatMoney(profitData.summary.total_profit),           color: profitData.summary.total_profit >= 0 ? 'text-success' : 'text-danger', bg: 'bg-green-50', border: 'border-green-100' },
                  { label: 'Chiqimlar',         value: formatMoney(profitData.summary.total_expenses || 0),    color: 'text-red-500',   bg: 'bg-red-50',    border: 'border-red-100' },
                  { label: 'Sof foyda',         value: formatMoney(profitData.summary.net_profit || 0),        color: (profitData.summary.net_profit || 0) >= 0 ? 'text-green-700' : 'text-danger', bg: 'bg-green-50', border: 'border-green-200', bold: true },
                  { label: t('profitPercent'),  value: `${profitData.summary.profit_margin.toFixed(1)}%`,     color: profitData.summary.profit_margin >= 0 ? 'text-success' : 'text-danger', bg: 'bg-gray-50', border: 'border-gray-200' },
                ].map((item, i) => (
                  <div key={i} className={cn("rounded-2xl border p-3 shadow-sm", item.bg, item.border)}>
                    <p className="text-xs text-gray-500">{item.label}</p>
                    <p className={cn("text-base font-bold mt-0.5 truncate", item.color, item.bold && "text-lg")}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Expenses breakdown */}
              {profitData.summary.expenses_list && profitData.summary.expenses_list.length > 0 && (
                <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
                  <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-orange-500" />
                    Chiqimlar tafsiloti
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {profitData.summary.expenses_list.map((exp: any, i: number) => (
                      <div key={i} className="flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-xl px-2.5 py-1.5">
                        <span className="text-xs text-gray-600">{exp.name}</span>
                        <span className="text-xs font-bold text-red-600">{formatMoney(exp.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Products — mobile cards */}
              <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-bold">{t('profitByProducts')}</h3>
                  <span className="text-xs text-gray-400">{profitData.summary.products_count} ta</span>
                </div>
                <div className="space-y-0 divide-y divide-border">
                  {profitData.data.map((item: any, index: number) => (
                    <div key={item.product_id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{item.product_name}</p>
                          {item.product_article && (
                            <p className="text-xs text-gray-400">Art: {item.product_article}</p>
                          )}
                        </div>
                        <span className={cn(
                          "flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-lg",
                          item.profit_margin >= 20 ? "bg-green-100 text-success"
                          : item.profit_margin >= 10 ? "bg-orange-100 text-warning"
                          : "bg-red-100 text-danger"
                        )}>
                          {item.profit_margin.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <div className="flex items-center gap-1 bg-gray-50 rounded-xl px-2 py-1">
                          <span className="text-xs text-gray-400">Miqdor:</span>
                          <span className="text-xs font-semibold">{formatNumber(item.total_quantity)}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-orange-50 rounded-xl px-2 py-1">
                          <span className="text-xs text-gray-400">Tan:</span>
                          <span className="text-xs font-semibold text-warning">{formatMoney(item.total_cost)}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-blue-50 rounded-xl px-2 py-1">
                          <span className="text-xs text-gray-400">Tushim:</span>
                          <span className="text-xs font-semibold text-primary">{formatMoney(item.total_revenue)}</span>
                        </div>
                        <div className={cn("flex items-center gap-1 rounded-xl px-2 py-1", item.total_profit >= 0 ? "bg-green-50" : "bg-red-50")}>
                          <span className="text-xs text-gray-400">Foyda:</span>
                          <span className={cn("text-xs font-bold", item.total_profit >= 0 ? "text-success" : "text-danger")}>
                            {formatMoney(item.total_profit)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-center py-16 text-text-secondary text-sm">{t('noData')}</p>
          )}
        </div>
      )}

      {/* Sales Tab */}
      {activeTab === 'sales' && (
        <div className="space-y-3">
          {loadingSales ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : salesData ? (
            <>
              {/* Summary 2x3 grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: t('salesCount'),   value: salesData.summary.total_sales,                bg: 'bg-blue-50',   border: 'border-blue-100',   color: 'text-blue-700' },
                  { label: t('totalSum'),     value: formatMoney(salesData.summary.total_amount),   bg: 'bg-green-50',  border: 'border-green-100',  color: 'text-primary' },
                  { label: t('paid'),         value: formatMoney(salesData.summary.total_paid),     bg: 'bg-green-50',  border: 'border-green-100',  color: 'text-success' },
                  { label: t('debt'),         value: formatMoney(salesData.summary.total_debt),     bg: 'bg-red-50',    border: 'border-red-100',    color: 'text-danger' },
                  { label: t('discounts'),    value: formatMoney(salesData.summary.total_discount), bg: 'bg-orange-50', border: 'border-orange-100', color: 'text-warning' },
                  { label: t('averageCheck'), value: formatMoney(salesData.summary.average_sale),   bg: 'bg-gray-50',   border: 'border-gray-200',   color: 'text-gray-700' },
                ].map((item, i) => (
                  <div key={i} className={cn("rounded-2xl border p-3 shadow-sm", item.bg, item.border)}>
                    <p className="text-xs text-gray-500">{item.label}</p>
                    <p className={cn("text-base font-bold mt-0.5", item.color)}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Payment breakdown chips */}
              <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
                <p className="text-xs font-semibold text-gray-500 mb-2.5 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  {t('paymentType')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(salesData.payment_breakdown).map(([type, amount]: [string, any]) => (
                    <div key={type} className="bg-gray-50 border border-border rounded-2xl p-3">
                      <p className="text-xs text-gray-500 capitalize">{type}</p>
                      <p className="text-sm font-bold mt-0.5">{formatMoney(amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-center py-16 text-text-secondary text-sm">{t('noData')}</p>
          )}
        </div>
      )}

      {/* Sellers Tab */}
      {activeTab === 'sellers' && (
        <div className="space-y-3">
          {/* Selector */}
          <div className="bg-white rounded-2xl border border-border p-3 shadow-sm space-y-1.5">
            <label className="text-xs font-semibold text-gray-500">{t('selectSeller')}</label>
            <select
              value={selectedSellerId}
              onChange={(e) => setSelectedSellerId(e.target.value ? Number(e.target.value) : '')}
              className="w-full h-11 px-3 border border-border rounded-xl text-sm bg-white focus:outline-none focus:border-primary"
            >
              <option value="">{t('all')} — {t('sellersList').toLowerCase()}</option>
              {sellersSummary?.sellers?.map((seller: any) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name} ({seller.sales_count} sotuv)
                </option>
              ))}
            </select>
          </div>

          {/* All Sellers Summary */}
          {!selectedSellerId && (
            <>
              {loadingSellersSummary ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : sellersSummary ? (
                <>
                  {/* Totals */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: t('totalSales'), value: sellersSummary.totals.total_sales,                    bg: 'bg-blue-50',   color: 'text-blue-700',   border: 'border-blue-100' },
                      { label: t('totalSum'),   value: formatMoney(sellersSummary.totals.total_amount),       bg: 'bg-green-50',  color: 'text-green-700',  border: 'border-green-100' },
                      { label: t('paid'),       value: formatMoney(sellersSummary.totals.total_paid),         bg: 'bg-purple-50', color: 'text-purple-700', border: 'border-purple-100' },
                      { label: t('onCredit'),   value: formatMoney(sellersSummary.totals.total_debt),         bg: 'bg-red-50',    color: 'text-red-700',    border: 'border-red-100' },
                    ].map((item, i) => (
                      <div key={i} className={cn("rounded-2xl border p-3 shadow-sm", item.bg, item.border)}>
                        <p className="text-xs text-gray-500">{item.label}</p>
                        <p className={cn("text-base font-bold mt-0.5", item.color)}>{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Sellers list */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />{t('sellersList')}
                    </p>
                    {sellersSummary.sellers?.map((seller: any) => (
                      <button key={seller.id} onClick={() => setSelectedSellerId(seller.id)}
                        className="w-full bg-white rounded-2xl border border-border shadow-sm p-3 text-left active:scale-[0.99] transition-all hover:border-primary">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm">{seller.name}</p>
                            <p className="text-xs text-gray-400">@{seller.username}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-sm text-success">{formatMoney(seller.total_amount)}</p>
                            <p className="text-xs text-gray-400">{seller.sales_count} sotuv</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2.5">
                          <div className="bg-green-50 rounded-xl p-2 text-center">
                            <p className="text-xs text-green-600">{t('paid')}</p>
                            <p className="text-xs font-bold text-green-700">{formatMoney(seller.total_paid)}</p>
                          </div>
                          <div className="bg-red-50 rounded-xl p-2 text-center">
                            <p className="text-xs text-red-600">{t('onCredit')}</p>
                            <p className="text-xs font-bold text-red-700">{formatMoney(seller.total_debt)}</p>
                          </div>
                          <div className="bg-blue-50 rounded-xl p-2 text-center">
                            <p className="text-xs text-blue-600">O'rtacha</p>
                            <p className="text-xs font-bold text-blue-700">
                              {formatMoney(seller.sales_count > 0 ? seller.total_amount / seller.sales_count : 0)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </>
          )}

          {/* Selected Seller Stats */}
          {selectedSellerId && (
            <>
              {loadingSellerStats ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : sellerStats ? (
                <>
                  {/* Seller profile card */}
                  <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-4 text-white">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                        <User className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-base font-bold">{sellerStats.seller.name}</h2>
                        <p className="text-blue-200 text-xs">@{sellerStats.seller.username} · {sellerStats.seller.role}</p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            toast.loading(t('excelPreparing'))
                            const response = await api.get('/reports/excel/seller-stats', {
                              params: { seller_id: selectedSellerId, start_date: startDate, end_date: endDate },
                              responseType: 'blob'
                            })
                            const url = window.URL.createObjectURL(new Blob([response.data]))
                            const link = document.createElement('a')
                            link.href = url
                            link.setAttribute('download', `kassir_${sellerStats.seller.username}_${startDate}_${endDate}.xlsx`)
                            document.body.appendChild(link); link.click(); link.remove()
                            toast.dismiss(); toast.success(t('excelDownloaded'))
                          } catch { toast.dismiss(); toast.error(t('excelError')) }
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/20 rounded-xl text-xs font-semibold active:bg-white/30 flex-shrink-0">
                        <Download className="w-3.5 h-3.5" /> Excel
                      </button>
                    </div>
                  </div>

                  {/* Main stats 2x2 */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: t('salesCount'),    value: sellerStats.summary.total_sales_count,        bg: 'bg-blue-50',   border: 'border-blue-100',   color: 'text-blue-700' },
                      { label: t('totalSum'),       value: formatMoney(sellerStats.summary.total_amount), bg: 'bg-green-50',  border: 'border-green-100',  color: 'text-success' },
                      { label: t('paid'),           value: formatMoney(sellerStats.summary.total_paid),   bg: 'bg-purple-50', border: 'border-purple-100', color: 'text-purple-700' },
                      { label: t('soldOnCredit'),   value: formatMoney(sellerStats.summary.total_debt),   bg: 'bg-red-50',    border: 'border-red-100',    color: 'text-danger' },
                      { label: t('averageCheck'),   value: formatMoney(sellerStats.summary.average_sale), bg: 'bg-yellow-50', border: 'border-yellow-100', color: 'text-yellow-700' },
                      { label: t('customersCount'), value: sellerStats.summary.unique_customers,          bg: 'bg-indigo-50', border: 'border-indigo-100', color: 'text-indigo-700' },
                      { label: t('anonymousSales'), value: sellerStats.summary.anonymous_sales,           bg: 'bg-gray-50',   border: 'border-gray-200',   color: 'text-gray-700' },
                      { label: t('discounts'),      value: formatMoney(sellerStats.summary.total_discount),bg: 'bg-orange-50', border: 'border-orange-100', color: 'text-warning' },
                    ].map((item, i) => (
                      <div key={i} className={cn("rounded-2xl border p-3 shadow-sm", item.bg, item.border)}>
                        <p className="text-xs text-gray-500">{item.label}</p>
                        <p className={cn("text-base font-bold mt-0.5", item.color)}>{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Payment breakdown */}
                  <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
                    <p className="text-xs font-semibold text-gray-500 mb-2.5 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" />{t('paymentType')}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: t('cash'),     value: sellerStats.payment_breakdown.CASH || 0,     icon: Banknote,   bg: 'bg-green-50',  color: 'text-green-700' },
                        { label: t('card'),     value: sellerStats.payment_breakdown.CARD || 0,     icon: CreditCard, bg: 'bg-blue-50',   color: 'text-blue-700' },
                        { label: t('transfer'), value: sellerStats.payment_breakdown.TRANSFER || 0, icon: Building,   bg: 'bg-purple-50', color: 'text-purple-700' },
                        { label: t('debt'),     value: sellerStats.summary.total_debt,              icon: Package,    bg: 'bg-red-50',    color: 'text-danger' },
                      ].map((pt) => (
                        <div key={pt.label} className={cn("rounded-2xl p-3 flex items-center gap-2", pt.bg)}>
                          <pt.icon className="w-5 h-5 opacity-60 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500">{pt.label}</p>
                            <p className={cn("text-sm font-bold", pt.color)}>{formatMoney(pt.value)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Collapsible sections */}
                  {[
                    {
                      key: 'daily', icon: Calendar, title: t('dailyIndicators'),
                      count: sellerStats.daily_breakdown?.length || 0,
                      content: (
                        <div className="space-y-2">
                          {sellerStats.daily_breakdown?.map((day: any) => (
                            <div key={day.date} className="flex items-center justify-between p-3 bg-gray-50 border border-border rounded-2xl">
                              <div>
                                <p className="text-sm font-semibold">{formatDateTashkent(day.date)}</p>
                                <p className="text-xs text-gray-400">{day.sales_count} sotuv</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-success">{formatMoney(day.total_amount)}</p>
                                {day.debt_amount > 0 && <p className="text-xs text-danger">{formatMoney(day.debt_amount)}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    },
                    {
                      key: 'customers', icon: Users, title: t('customers'),
                      count: sellerStats.customers?.length || 0,
                      content: (
                        <div className="space-y-2">
                          {sellerStats.customers?.map((cust: any) => (
                            <div key={cust.id} className="flex items-center gap-3 p-3 bg-gray-50 border border-border rounded-2xl">
                              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                                cust.customer_type === 'VIP' ? "bg-yellow-100" : "bg-blue-100")}>
                                <User className={cn("w-4 h-4", cust.customer_type === 'VIP' ? "text-yellow-600" : "text-blue-600")} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{cust.name}</p>
                                <p className="text-xs text-gray-400">{cust.phone} · {cust.sales_count} sotuv</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold text-success">{formatMoney(cust.total_amount)}</p>
                                {cust.total_debt > 0 && <p className="text-xs text-danger">{formatMoney(cust.total_debt)}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    },
                    {
                      key: 'products', icon: Package, title: t('topProducts'),
                      count: sellerStats.top_products?.length || 0,
                      content: (
                        <div className="space-y-2">
                          {sellerStats.top_products?.map((prod: any, idx: number) => (
                            <div key={prod.product_id} className="flex items-center gap-3 p-3 bg-gray-50 border border-border rounded-2xl">
                              <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{prod.product_name}</p>
                                <p className="text-xs text-gray-400">{prod.times_sold} marta · {formatNumber(prod.total_quantity)} dona</p>
                              </div>
                              <p className="text-sm font-bold text-success flex-shrink-0">{formatMoney(prod.total_revenue)}</p>
                            </div>
                          ))}
                        </div>
                      )
                    },
                    {
                      key: 'sales', icon: ShoppingCart, title: t('recentSalesTitle'),
                      count: sellerStats.recent_sales?.length || 0,
                      content: (
                        <div className="space-y-2">
                          {sellerStats.recent_sales?.map((sale: any) => (
                            <div key={sale.id} className="flex items-center justify-between p-3 bg-gray-50 border border-border rounded-2xl">
                              <div>
                                <p className="text-sm font-bold">#{sale.sale_number}</p>
                                <p className="text-xs text-gray-500">{sale.customer_name}</p>
                                <p className="text-xs text-gray-400">{formatDateTimeTashkent(sale.created_at)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-success">{formatMoney(sale.total_amount)}</p>
                                <p className="text-xs text-gray-400">{sale.items_count} mahsulot</p>
                                {sale.debt_amount > 0 && (
                                  <p className="text-xs font-semibold text-danger">{formatMoney(sale.debt_amount)}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  ].map(({ key, icon: Icon, title, count, content }) => (
                    <div key={key} className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
                      <button
                        onClick={() => setExpandedSection(expandedSection === key ? null : key)}
                        className="w-full flex items-center justify-between p-3">
                        <span className="text-sm font-semibold flex items-center gap-2">
                          <Icon className="w-4 h-4 text-gray-400" />
                          {title}
                          <span className="text-xs text-gray-400 font-normal">({count})</span>
                        </span>
                        {expandedSection === key
                          ? <ChevronUp className="w-4 h-4 text-gray-400" />
                          : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </button>
                      {expandedSection === key && (
                        <div className="px-3 pb-3 max-h-80 overflow-y-auto space-y-2 border-t border-border pt-2">
                          {content}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 px-1">Hisobot turini tanlang va yuklab oling</p>
          {[
            { key: 'sales',      icon: DollarSign,     bg: 'bg-blue-50',   iconColor: 'text-primary',  title: t('salesReportTitle'),   sub: t('forSelectedPeriod') },
            { key: 'stock',      icon: Package,        bg: 'bg-orange-50', iconColor: 'text-warning',  title: t('stockReportTitle'),   sub: t('currentStatus') },
            { key: 'debtors',    icon: Users,          bg: 'bg-red-50',    iconColor: 'text-danger',   title: t('debtorsReportTitle'), sub: t('currentDebts') },
            { key: 'daily',      icon: Calendar,       bg: 'bg-green-50',  iconColor: 'text-success',  title: t('dailyReportTitle'),   sub: t('forToday') },
            { key: 'price-list', icon: FileSpreadsheet,bg: 'bg-blue-50',   iconColor: 'text-primary',  title: t('priceListTitle'),     sub: t('allProducts') },
          ].map(({ key, icon: Icon, bg, iconColor, title, sub }) => (
            <div key={key} className="bg-white rounded-2xl border border-border shadow-sm p-3">
              <div className="flex items-center gap-3 mb-3">
                <div className={cn("p-2.5 rounded-2xl flex-shrink-0", bg)}>
                  <Icon className={cn("w-5 h-5", iconColor)} />
                </div>
                <div>
                  <p className="text-sm font-bold">{title}</p>
                  <p className="text-xs text-gray-400">{sub}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleDownloadExcel(key)}
                  className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-green-300 text-green-700 text-sm font-semibold active:scale-95 bg-green-50">
                  <FileSpreadsheet className="w-4 h-4" /> Excel
                </button>
                <button onClick={() => handleDownloadPDF(key)}
                  className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl border border-red-300 text-red-600 text-sm font-semibold active:scale-95 bg-red-50">
                  <FileText className="w-4 h-4" /> PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
