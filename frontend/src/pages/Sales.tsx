import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { 
  Search, Calendar, Filter, Loader2, Eye, Pencil, Trash2, 
  Receipt, User, DollarSign, CreditCard, Banknote, AlertTriangle,
  Info, X, Phone, Package, Printer, Edit3
} from 'lucide-react'
import toast from 'react-hot-toast'
import { 
  Button, Input, Card, CardContent, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from '@/components/ui'
import api from '@/services/api'
import { formatMoney, formatNumber, cn, formatDateTashkent, formatTimeTashkent, formatDateTimeTashkent } from '@/lib/utils'
import { useAuthStore, usePOSStore } from '@/stores'
import { useLanguage } from '@/contexts/LanguageContext'

interface Sale {
  id: number
  sale_number: string
  sale_date: string
  customer_id: number | null
  customer_name: string | null
  customer_phone: string | null
  contact_phone: string | null
  seller_id: number
  seller_name: string
  total_amount: number
  paid_amount: number
  debt_amount: number
  payment_status: string
  items_count: number
  is_cancelled: boolean
  created_at: string
  updated_at?: string
  updated_by?: string
  edit_reason?: string
  // Permission flags
  can_edit: boolean
  is_own_sale: boolean
}

interface SaleDetail {
  id: number
  sale_number: string
  sale_date: string
  customer_id: number | null
  customer_name: string | null
  customer_phone: string | null
  contact_phone: string | null
  seller_id: number
  seller_name: string
  warehouse_id: number
  warehouse_name: string
  subtotal: number
  discount_amount: number
  discount_percent: number
  total_amount: number
  paid_amount: number
  debt_amount: number
  payment_status: string
  payment_type: string | null
  items: {
    id: number
    product_name: string
    quantity: number
    uom_symbol: string
    unit_price: number
    total_price: number
  }[]
  payments: {
    id: number
    payment_number: string
    payment_date: string
    payment_type: string
    amount: number
  }[]
  notes: string | null
  is_cancelled: boolean
  cancelled_reason: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  created_at: string
  updated_at: string | null
  updated_by: string | null
  edit_reason: string | null
}

interface Customer {
  id: number
  name: string
  phone: string
}

export default function SalesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { loadSaleForEdit, resetPOS } = usePOSStore()
  const { t } = useLanguage()
  const isDirector = user?.role_type === 'director'

  // Filters
  const today = new Date()
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const [startDate, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<string>('')
  const [showCancelled, setShowCancelled] = useState(false)
  const [page, setPage] = useState(1)

  // Dialogs
  const [viewingSale, setViewingSale] = useState<SaleDetail | null>(null)
  const [deletingSale, setDeletingSale] = useState<{id: number, sale_number: string} | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [loadingEditSale, setLoadingEditSale] = useState<number | null>(null)

  // Fetch sales
  const { data: salesData, isLoading } = useQuery({
    queryKey: ['sales', startDate, endDate, paymentStatus, showCancelled, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.append('start_date', startDate)
      params.append('end_date', endDate)
      params.append('page', page.toString())
      params.append('per_page', '20')
      params.append('is_cancelled', showCancelled.toString())
      if (paymentStatus) params.append('payment_status', paymentStatus)

      const response = await api.get(`/sales?${params}`)
      return response.data
    }
  })

  // View sale detail
  const viewSale = async (saleId: number) => {
    try {
      const response = await api.get(`/sales/${saleId}`)
      setViewingSale(response.data.data)
    } catch (error) {
      toast.error(t('saleLoadError'))
    }
  }

  // Edit sale - load data and redirect to POS
  const handleEditSale = async (saleId: number) => {
    setLoadingEditSale(saleId)
    try {
      const response = await api.get(`/sales/${saleId}`)
      const sale = response.data.data

      // Reset POS and load sale data
      resetPOS()

      loadSaleForEdit({
        id: sale.id,
        sale_number: sale.sale_number,
        customer: sale.customer_id ? {
          id: sale.customer_id,
          name: sale.customer_name,
          phone: sale.customer_phone || '',
          current_debt: 0
        } : null,
        warehouse_id: sale.warehouse_id,
        items: sale.items.map((item: any) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          uom_id: item.uom_id,
          uom_symbol: item.uom_symbol,
          unit_price: item.unit_price,
          original_price: item.original_price || item.unit_price
        })),
        subtotal: sale.subtotal,
        discount_amount: sale.discount_amount,
        final_total: sale.total_amount,
        paid_amount: sale.paid_amount
      })

      // Navigate to POS
      navigate('/pos')
      toast.success(`Sotuv #${sale.sale_number} tahrirlash uchun yuklandi`)
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Sotuvni yuklashda xatolik')
    } finally {
      setLoadingEditSale(null)
    }
  }

  // Delete sale mutation
  const deleteSaleMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number, reason: string }) => {
      const response = await api.delete(`/sales/${id}?reason=${encodeURIComponent(reason)}&return_to_stock=true`)
      return response.data
    },
    onSuccess: () => {
      toast.success(t('saleDeletedSuccess'))
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      setDeletingSale(null)
      setDeleteReason('')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('deleteError'))
    }
  })

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="success">{t('paid')}</Badge>
      case 'partial':
        return <Badge variant="warning">{t('partial')}</Badge>
      case 'debt':
        return <Badge variant="danger">{t('onDebt')}</Badge>
      case 'pending':
        return <Badge variant="secondary">{t('pending')}</Badge>
      case 'cancelled':
        return <Badge variant="secondary">{t('cancelled')}</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  // Filter sales by search
  const filteredSales = salesData?.data?.filter((sale: Sale) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      sale.sale_number.toLowerCase().includes(query) ||
      sale.customer_name?.toLowerCase().includes(query) ||
      sale.customer_phone?.toLowerCase().includes(query) ||
      sale.contact_phone?.toLowerCase().includes(query) ||
      sale.seller_name.toLowerCase().includes(query)
    )
  }) || []

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t('sales')}</h1>
        {salesData?.summary && (
          <span className="text-xs text-gray-500">{salesData.total} ta sotuv</span>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-border p-3 space-y-2 shadow-sm">
        {/* Date range */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="flex-1 h-10 px-3 border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
          <span className="text-gray-400">—</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="flex-1 h-10 px-3 border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
        </div>
        {/* Search + status */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 h-10 border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="h-10 px-3 border border-border rounded-xl text-sm bg-white"
          >
            <option value="">Barchasi</option>
            <option value="paid">To'langan</option>
            <option value="partial">Qisman</option>
            <option value="debt">Qarzga</option>
          </select>
        </div>
        {/* Cancelled toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
            className="w-4 h-4 rounded accent-primary"
          />
          <span className="text-sm text-gray-600">Bekor qilinganlarni ko'rsatish</span>
        </label>
      </div>

      {/* ── Summary chips ── */}
      {salesData?.summary && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
            <p className="text-xs text-gray-400">Jami summa</p>
            <p className="text-sm font-bold text-primary mt-0.5">{formatMoney(salesData.summary.total_amount)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
            <p className="text-xs text-gray-400">To'langan</p>
            <p className="text-sm font-bold text-success mt-0.5">{formatMoney(salesData.summary.total_paid)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
            <p className="text-xs text-gray-400">Qarz</p>
            <p className="text-sm font-bold text-danger mt-0.5">{formatMoney(salesData.summary.total_debt)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
            <p className="text-xs text-gray-400">Sotuvlar soni</p>
            <p className="text-sm font-bold mt-0.5">{salesData.total} ta</p>
          </div>
        </div>
      )}

      {/* ── Seller info ── */}
      {!isDirector && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-800">
            Faqat <b>oxirgi sotuvingizni</b> tahrirlash yoki o'chirish mumkin.
          </p>
        </div>
      )}

      {/* ── Sales list ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredSales.length > 0 ? (
        <div className="space-y-2">
          {filteredSales.map((sale: Sale) => (
            <div
              key={sale.id}
              className={cn(
                "bg-white rounded-2xl border shadow-sm p-3 transition-all",
                sale.is_cancelled ? "opacity-60 border-gray-200" : "border-border",
                sale.can_edit && !isDirector && !sale.is_cancelled ? "border-l-4 border-l-success" : ""
              )}
            >
              {/* Row 1: number + date + status + actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold">#{sale.sale_number}</span>
                    {sale.is_cancelled ? (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg">Bekor</span>
                    ) : (
                      getStatusBadge(sale.payment_status)
                    )}
                    {sale.updated_by && (
                      <span className="text-xs text-warning flex items-center gap-0.5">
                        <Pencil className="w-3 h-3" />Tahrirlangan
                      </span>
                    )}
                    {sale.can_edit && !isDirector && !sale.is_cancelled && (
                      <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded-lg font-medium">Oxirgi</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDateTashkent(sale.sale_date)}</span>
                    <span>·</span>
                    <span>{formatTimeTashkent(sale.created_at)}</span>
                    <span>·</span>
                    <span>{sale.seller_name}</span>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => viewSale(sale.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl border border-border text-primary active:bg-blue-50"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {sale.can_edit && !sale.is_cancelled && (
                    <>
                      <button
                        onClick={() => handleEditSale(sale.id)}
                        disabled={loadingEditSale === sale.id}
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-orange-200 text-warning active:bg-orange-50 disabled:opacity-40"
                      >
                        {loadingEditSale === sale.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Edit3 className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setDeletingSale({ id: sale.id, sale_number: sale.sale_number })}
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-200 text-danger active:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Row 2: customer */}
              <div className="mt-2 flex items-center gap-2">
                {sale.customer_id && sale.customer_name ? (
                  <span className="text-sm font-medium">{sale.customer_name}</span>
                ) : (sale.contact_phone || sale.customer_phone) ? (
                  <a href={`tel:${sale.contact_phone || sale.customer_phone}`}
                    className="text-sm font-medium text-blue-600 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {sale.contact_phone || sale.customer_phone}
                  </a>
                ) : (
                  <span className="text-sm text-gray-400">Noma'lum mijoz</span>
                )}
              </div>

              {/* Row 3: amounts */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <div className="flex items-center gap-1 bg-gray-50 rounded-xl px-2.5 py-1.5">
                  <span className="text-xs text-gray-400">Jami:</span>
                  <span className="text-sm font-bold whitespace-nowrap">{formatMoney(sale.total_amount)}</span>
                </div>
                <div className="flex items-center gap-1 bg-green-50 rounded-xl px-2.5 py-1.5">
                  <span className="text-xs text-gray-400">To'langan:</span>
                  <span className="text-sm font-bold text-success whitespace-nowrap">{formatMoney(sale.paid_amount)}</span>
                </div>
                {sale.debt_amount > 0 && (
                  <div className="flex items-center gap-1 bg-red-50 rounded-xl px-2.5 py-1.5">
                    <span className="text-xs text-gray-400">Qarz:</span>
                    <span className="text-sm font-bold text-danger whitespace-nowrap">{formatMoney(sale.debt_amount)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
          <Receipt className="w-16 h-16 mb-4 opacity-30" />
          <p>{t('noSalesFound')}</p>
        </div>
      )}

      {/* ── Pagination ── */}
      {salesData && salesData.total > 20 && (
        <div className="flex items-center justify-between bg-white rounded-2xl border border-border px-4 py-3 shadow-sm">
          <span className="text-sm text-gray-500">Sahifa {page}</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium disabled:opacity-40 active:bg-gray-100"
            >← Oldingi</button>
            <button
              onClick={() => setPage(page + 1)}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium active:bg-gray-100"
            >Keyingi →</button>
          </div>
        </div>
      )}

      {/* View Sale Dialog */}
      <Dialog open={!!viewingSale} onOpenChange={() => setViewingSale(null)}>
        <DialogContent className="w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-2xl">
          {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
            <div>
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                <h2 className="text-base font-bold">#{viewingSale?.sale_number}</h2>
                {viewingSale && !viewingSale.is_cancelled && getStatusBadge(viewingSale.payment_status)}
                {viewingSale?.is_cancelled && (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg">Bekor</span>
                )}
              </div>
              {viewingSale && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDateTashkent(viewingSale.sale_date)} · {formatTimeTashkent(viewingSale.created_at)}
                </p>
              )}
            </div>
            <button onClick={() => setViewingSale(null)}
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-border text-gray-400 active:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {viewingSale && (
              <>
                {/* Info chips */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-2xl p-3">
                    <p className="text-xs text-gray-400">Sotuvchi</p>
                    <p className="text-sm font-semibold mt-0.5">{viewingSale.seller_name}</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-3">
                    <p className="text-xs text-gray-400">Ombor</p>
                    <p className="text-sm font-semibold mt-0.5">{viewingSale.warehouse_name}</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-3 col-span-2">
                    <p className="text-xs text-gray-400">Mijoz</p>
                    {viewingSale.customer_id && viewingSale.customer_name ? (
                      <div className="mt-0.5">
                        <p className="text-sm font-semibold">{viewingSale.customer_name}</p>
                        {viewingSale.customer_phone && (
                          <a href={`tel:${viewingSale.customer_phone}`}
                            className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" />{viewingSale.customer_phone}
                          </a>
                        )}
                      </div>
                    ) : (viewingSale.contact_phone || viewingSale.customer_phone) ? (
                      <a href={`tel:${viewingSale.contact_phone || viewingSale.customer_phone}`}
                        className="text-sm font-semibold text-blue-600 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3.5 h-3.5" />
                        {viewingSale.contact_phone || viewingSale.customer_phone}
                      </a>
                    ) : (
                      <p className="text-sm text-gray-400 mt-0.5">Noma'lum mijoz</p>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tovarlar</p>
                  {viewingSale.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-2xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{item.product_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatNumber(item.quantity)} {item.uom_symbol} × {formatMoney(item.unit_price)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-primary whitespace-nowrap">{formatMoney(item.total_price)}</p>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Subtotal</span>
                    <span className="text-sm font-semibold">{formatMoney(viewingSale.subtotal)}</span>
                  </div>
                  {viewingSale.discount_amount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-success">Chegirma ({viewingSale.discount_percent.toFixed(1)}%)</span>
                      <span className="text-sm font-semibold text-success">−{formatMoney(viewingSale.discount_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-t border-white/60 pt-2">
                    <span className="text-base font-bold">Jami</span>
                    <span className="text-base font-bold text-primary">{formatMoney(viewingSale.total_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">To'langan</span>
                    <span className="text-sm font-bold text-success">{formatMoney(viewingSale.paid_amount)}</span>
                  </div>
                  {viewingSale.debt_amount > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Qarz</span>
                      <span className="text-sm font-bold text-danger">{formatMoney(viewingSale.debt_amount)}</span>
                    </div>
                  )}
                </div>

                {/* Edit info */}
                {viewingSale.updated_by && (
                  <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3">
                    <div className="flex items-start gap-2">
                      <Pencil className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-orange-800 space-y-0.5">
                        <p className="font-semibold">Tahrirlangan</p>
                        <p>{viewingSale.updated_by} · {formatDateTimeTashkent(viewingSale.updated_at)}</p>
                        {viewingSale.edit_reason && <p>Sabab: {viewingSale.edit_reason}</p>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Cancelled info */}
                {viewingSale.is_cancelled && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
                    <div className="flex items-start gap-2">
                      <X className="w-4 h-4 text-danger mt-0.5 flex-shrink-0" />
                      <div className="text-xs text-red-800 space-y-0.5">
                        <p className="font-semibold">Bekor qilingan</p>
                        <p>{viewingSale.cancelled_by} · {formatDateTimeTashkent(viewingSale.cancelled_at)}</p>
                        {viewingSale.cancelled_reason && <p>Sabab: {viewingSale.cancelled_reason}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-4 pb-4 pt-3 border-t border-border">
            <button
              onClick={() => setViewingSale(null)}
              className="w-full h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50"
            >
              Yopish
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Sale Dialog */}
      <Dialog open={!!deletingSale} onOpenChange={() => { setDeletingSale(null); setDeleteReason('') }}>
        <DialogContent className="w-full max-w-sm p-0 gap-0 rounded-2xl overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-100 rounded-2xl">
                <Trash2 className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="font-bold text-base">Sotuvni o'chirish</h3>
                <p className="text-xs text-gray-500">#{deletingSale?.sale_number}</p>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-danger mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-800">{t('saleDeleteWarning')}</p>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Sabab *</label>
              <input
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="O'chirish sababini kiriting..."
                className="w-full h-11 px-3 border border-border rounded-xl text-sm focus:outline-none focus:border-danger"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => { setDeletingSale(null); setDeleteReason('') }}
                className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50"
              >
                Bekor
              </button>
              <button
                onClick={() => deletingSale && deleteSaleMutation.mutate({ id: deletingSale.id, reason: deleteReason })}
                disabled={deleteSaleMutation.isPending || !deleteReason.trim()}
                className="flex-1 h-12 rounded-2xl bg-danger text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {deleteSaleMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" />O'chirilmoqda...</>
                  : <><Trash2 className="w-4 h-4" />O'chirish</>}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}