import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import {
  Search, Plus, Package, Warehouse as WarehouseIcon, AlertTriangle,
  TrendingUp, Trash2, Calendar, DollarSign, History, Loader2, Filter, Download,
  Pencil, X, Info, Wallet, FileSpreadsheet, Upload, CheckCircle, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Button, Input, Card, CardContent, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui'
import { warehouseService, productsService } from '@/services'
import api from '@/services/api'
import { formatMoney, formatNumber, formatInputNumber, cn, formatDateTashkent, formatTimeTashkent, debounce } from '@/lib/utils'
import { useAuthStore } from '@/stores'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Stock, Warehouse, Product } from '@/types'

interface IncomeItem {
  product_id: number
  quantity: number
  uom_id: number
  unit_price_usd: number // Dollarda narx
  unit_price_uzs: number // So'mda narx
}

interface LandedCostEntry {
  cost_type: string
  description: string
  amount: number
  allocation_method: string
}

type IncomeCurrency = 'USD' | 'UZS'

interface IncomeFormData {
  warehouse_id: number
  document_number?: string
  supplier_name?: string
  notes?: string
  items: IncomeItem[]
}

interface MovementEditData {
  id: number
  product_id: number
  product_name: string
  quantity: number
  uom_id: number
  uom_symbol: string
  unit_price: number
  unit_price_usd: number | null
  document_number: string
  supplier_name: string
  notes: string
}

type MovementFilter = 'all' | 'income' | 'outcome'

// Searchable product select component
function ProductSearchSelect({ products, value, onChange, loading, placeholder }: {
  products: Product[]
  value: number
  onChange: (id: number) => void
  loading?: boolean
  placeholder?: string
}) {
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedProduct = products.find(p => p.id === value)

  const filtered = search.trim()
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.article && p.article.toLowerCase().includes(search.toLowerCase())) ||
        (p.barcode && p.barcode.includes(search))
      ).slice(0, 50)
    : products.slice(0, 50)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        if (!value) setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [value])

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? search : (selectedProduct?.name || '')}
        onChange={(e) => {
          setSearch(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => {
          setIsOpen(true)
          setSearch('')
        }}
        placeholder={loading ? '...' : (placeholder || 'Tovar qidirish...')}
        className="w-full px-2 py-2 border border-border rounded text-sm bg-white"
        autoComplete="off"
      />
      {value > 0 && (
        <button
          type="button"
          onClick={() => { onChange(0); setSearch(''); inputRef.current?.focus() }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-border rounded shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">Topilmadi</div>
          ) : (
            filtered.map(p => (
              <div
                key={p.id}
                onClick={() => {
                  onChange(p.id)
                  setSearch('')
                  setIsOpen(false)
                }}
                className={cn(
                  'px-3 py-2 text-sm cursor-pointer hover:bg-blue-50',
                  value === p.id && 'bg-blue-100 font-medium'
                )}
              >
                {p.name}
                {p.article && <span className="text-gray-400 ml-1">({p.article})</span>}
              </div>
            ))
          )}
          {products.length > 50 && !search && (
            <div className="px-3 py-1 text-xs text-gray-400 text-center border-t">
              Qidirish orqali toping ({products.length} ta tovar)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function WarehousePage() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { t } = useLanguage()
  const isDirector = user?.role_type === 'director'

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [showIncomeDialog, setShowIncomeDialog] = useState(false)
  const [incomeCurrency, setIncomeCurrency] = useState<IncomeCurrency>('USD')
  const [landedCosts, setLandedCosts] = useState<LandedCostEntry[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | ''>('')
  const [supplierPaidDisplay, setSupplierPaidDisplay] = useState('')
  const [activeTab, setActiveTab] = useState<'stock' | 'history'>('stock')

  // Excel import states
  const [showExcelImport, setShowExcelImport] = useState(false)
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [excelPreview, setExcelPreview] = useState<any>(null)
  const [excelLoading, setExcelLoading] = useState(false)
  const [excelImportMode, setExcelImportMode] = useState<'add' | 'replace'>('add')
  const [excelWarehouseId, setExcelWarehouseId] = useState<number | ''>('')
  const [excelDocNumber, setExcelDocNumber] = useState('')
  const [excelImportResult, setExcelImportResult] = useState<any>(null)
  const [showPreviewRows, setShowPreviewRows] = useState(false)
  const excelInputRef = useRef<HTMLInputElement>(null)

  // History filters
  const [movementFilter, setMovementFilter] = useState<MovementFilter>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [showFilters, setShowFilters] = useState(false)
  const [movementSearchInput, setMovementSearchInput] = useState('')
  const [movementSearch, setMovementSearch] = useState('')

  // Search handler - Enter yoki button bosganda
  const handleMovementSearch = () => {
    setMovementSearch(movementSearchInput.trim())
    setPage(1)
  }

  // Clear search
  const clearMovementSearch = () => {
    setMovementSearchInput('')
    setMovementSearch('')
    setPage(1)
  }

  // Edit/Delete state
  const [editingMovement, setEditingMovement] = useState<MovementEditData | null>(null)
  const [deletingMovement, setDeletingMovement] = useState<{id: number, name: string} | null>(null)
  const [deleteReason, setDeleteReason] = useState('')

  // Fetch product UOMs for editing
  const { data: productUomsData } = useQuery({
    queryKey: ['product-uoms', editingMovement?.product_id],
    queryFn: async () => {
      if (!editingMovement?.product_id) return []
      const response = await productsService.getProductUOMs(editingMovement.product_id)
      return response
    },
    enabled: !!editingMovement?.product_id
  })
  const productUoms = Array.isArray(productUomsData) ? productUomsData : []

  const { register, control, handleSubmit, reset, watch, setValue } = useForm<IncomeFormData>({
    defaultValues: {
      warehouse_id: 1,
      items: [{ product_id: 0, quantity: 1, uom_id: 1, unit_price_usd: 0, unit_price_uzs: 0 }]
    }
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  // Fetch exchange rate
  const { data: exchangeRateData } = useQuery({
    queryKey: ['exchange-rate'],
    queryFn: async () => {
      const response = await api.get('/settings/exchange-rate')
      return response.data
    },
  })
  const usdRate = exchangeRateData?.usd_rate || 12800

  // Fetch warehouses
  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => warehouseService.getWarehouses(),
  })

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: productsService.getCategories,
  })

  // Fetch products for income form
  const { data: productsForSelect, isLoading: productsLoading } = useQuery({
    queryKey: ['products-for-select'],
    queryFn: async () => {
      const result = await productsService.getProducts({ per_page: 10000, is_active: true })
      return result
    },
  })

  // Safe products array - sort by name
  const productsList = (productsForSelect?.data || []).sort((a: Product, b: Product) =>
    a.name.localeCompare(b.name, 'uz')
  )

  // Fetch suppliers for income form
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-for-select'],
    queryFn: async () => (await api.get('/suppliers/list/active')).data,
  })
  const suppliersList = suppliersData?.data || []

  // Fetch UOMs
  const { data: uomsResponse } = useQuery({
    queryKey: ['uoms'],
    queryFn: productsService.getUOMs,
  })
  const uoms = Array.isArray(uomsResponse) ? uomsResponse : []

  // Fetch stock
  const { data: stockData, isLoading } = useQuery({
    queryKey: ['stock', searchQuery, selectedWarehouse, selectedCategory, showLowOnly, page],
    queryFn: () => warehouseService.getStock({
      search: searchQuery || undefined,
      warehouse_id: selectedWarehouse || undefined,
      category_id: selectedCategory || undefined,
      below_minimum: showLowOnly || undefined,
      page,
      per_page: 20,
    }),
  })

  // Fetch stock movements (transaction history)
  const { data: movementsData, isLoading: loadingMovements, refetch: refetchMovements } = useQuery({
    queryKey: ['stock-movements', selectedWarehouse, movementFilter, startDate, endDate, movementSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedWarehouse) params.append('warehouse_id', selectedWarehouse.toString())

      // Movement type filter
      if (movementFilter === 'income') {
        params.append('movement_type', 'purchase')
      } else if (movementFilter === 'outcome') {
        params.append('movement_type', 'sale')
      }

      // Date filters
      if (startDate) params.append('start_date', startDate)
      if (endDate) params.append('end_date', endDate)

      // Search filter - tovar nomi bo'yicha qidirish
      if (movementSearch && movementSearch.trim()) {
        params.append('q', movementSearch.trim())
      }

      params.append('page', page.toString())
      params.append('per_page', '50')

      const response = await api.get(`/warehouse/movements?${params}`)
      return response.data
    },
    enabled: activeTab === 'history',
    staleTime: 0, // Always refetch when parameters change
  })

  // Fetch low stock count
  const { data: lowStock } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => warehouseService.getLowStock(),
  })

  // Stock income mutation
  const stockIncome = useMutation({
    mutationFn: async (data: IncomeFormData & { currency: IncomeCurrency }) => {
      // Convert prices based on selected currency
      const itemsWithPrices = data.items
        .filter(item => item.product_id > 0 && item.quantity > 0)
        .map(item => {
          if (data.currency === 'USD') {
            // USD da kiritilgan - UZS ga convert qilish
            return {
              product_id: item.product_id,
              quantity: item.quantity,
              uom_id: item.uom_id,
              unit_price: item.unit_price_usd * usdRate, // Convert to UZS
              unit_price_usd: item.unit_price_usd,
              exchange_rate: usdRate
            }
          } else {
            // UZS da kiritilgan - USD ga convert qilish
            return {
              product_id: item.product_id,
              quantity: item.quantity,
              uom_id: item.uom_id,
              unit_price: item.unit_price_uzs, // Already in UZS
              unit_price_usd: item.unit_price_uzs / usdRate, // Convert to USD
              exchange_rate: usdRate
            }
          }
        })

      const response = await api.post('/warehouse/income', {
        ...data,
        items: itemsWithPrices,
        exchange_rate: usdRate,
        landed_costs: landedCosts.length > 0 ? landedCosts.filter(lc => lc.amount > 0) : undefined,
        supplier_id: selectedSupplierId || undefined,
        paid_amount: supplierPaidDisplay ? parseFloat(supplierPaidDisplay.replace(/\s/g, '')) || 0 : undefined,
        payment_type: selectedSupplierId ? 'cash' : undefined
      })
      return response.data
    },
    onSuccess: () => {
      toast.success(t('incomeSuccess'))
      queryClient.invalidateQueries({ queryKey: ['stock'] })
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      queryClient.invalidateQueries({ queryKey: ['low-stock'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products-pos'] })
      queryClient.invalidateQueries({ queryKey: ['products-for-select'] })
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['suppliers-for-select'] })
      setShowIncomeDialog(false)
      setIncomeCurrency('USD')
      setLandedCosts([])
      setSelectedSupplierId('')
      setSupplierPaidDisplay('')
      reset()
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      if (Array.isArray(detail)) {
        toast.error(detail.map((e: any) => e.msg).join(', ') || t('validationError'))
      } else {
        toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
      }
    },
  })

  // Edit movement mutation (Director only)
  const editMovement = useMutation({
    mutationFn: async (data: { id: number, quantity?: number, uom_id?: number, unit_price?: number, unit_price_usd?: number, document_number?: string, supplier_name?: string, notes?: string }) => {
      const params = new URLSearchParams()
      if (data.quantity !== undefined) params.append('quantity', data.quantity.toString())
      if (data.uom_id !== undefined) params.append('uom_id', data.uom_id.toString())
      if (data.unit_price !== undefined) params.append('unit_price', data.unit_price.toString())
      if (data.unit_price_usd !== undefined) params.append('unit_price_usd', data.unit_price_usd.toString())
      if (data.document_number !== undefined) params.append('document_number', data.document_number)
      if (data.supplier_name !== undefined) params.append('supplier_name', data.supplier_name)
      if (data.notes !== undefined) params.append('notes', data.notes)

      const response = await api.put(`/warehouse/movements/${data.id}?${params}`)
      return response.data
    },
    onSuccess: () => {
      toast.success(t('movementEdited'))
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      queryClient.invalidateQueries({ queryKey: ['stock'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products-pos'] })
      queryClient.invalidateQueries({ queryKey: ['products-for-select'] })
      setEditingMovement(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('editError'))
    }
  })

  // Delete movement mutation (Director only)
  const deleteMovement = useMutation({
    mutationFn: async ({ id, reason }: { id: number, reason: string }) => {
      const response = await api.delete(`/warehouse/movements/${id}?reason=${encodeURIComponent(reason)}`)
      return response.data
    },
    onSuccess: () => {
      toast.success(t('movementDeleted'))
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] })
      queryClient.invalidateQueries({ queryKey: ['stock'] })
      setDeletingMovement(null)
      setDeleteReason('')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('deleteError'))
    }
  })

  const onSubmit = (data: IncomeFormData) => {
    const validItems = data.items.filter(item => {
      if (incomeCurrency === 'USD') {
        return item.product_id > 0 && item.quantity > 0 && item.unit_price_usd > 0
      } else {
        return item.product_id > 0 && item.quantity > 0 && item.unit_price_uzs > 0
      }
    })
    if (validItems.length === 0) {
      toast.error(t('addAtLeastOneProduct'))
      return
    }
    stockIncome.mutate({ ...data, currency: incomeCurrency })
  }

  // Calculate total for income form based on currency
  const watchItems = watch('items')
  const incomeTotalUsd = incomeCurrency === 'USD'
    ? (watchItems?.reduce((sum, item) => sum + (item.quantity || 0) * (item.unit_price_usd || 0), 0) || 0)
    : (watchItems?.reduce((sum, item) => sum + (item.quantity || 0) * (item.unit_price_uzs || 0), 0) || 0) / usdRate

  const incomeTotalUzs = incomeCurrency === 'UZS'
    ? (watchItems?.reduce((sum, item) => sum + (item.quantity || 0) * (item.unit_price_uzs || 0), 0) || 0)
    : incomeTotalUsd * usdRate

  // ─── Excel import handlers ───────────────────────────────────
  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExcelFile(file)
    setExcelPreview(null)
    setExcelImportResult(null)
    setShowPreviewRows(false)
    setExcelLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/warehouse/import-excel/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setExcelPreview(res.data)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Fayl o'qishda xato")
    } finally {
      setExcelLoading(false)
    }
  }

  const handleExcelImportConfirm = async () => {
    if (!excelFile || !excelWarehouseId) {
      toast.error('Ombor tanlanmagan')
      return
    }
    setExcelLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', excelFile)
      formData.append('warehouse_id', String(excelWarehouseId))
      formData.append('mode', excelImportMode)
      formData.append('document_number', excelDocNumber)
      formData.append('notes', 'Excel import')
      const res = await api.post('/warehouse/import-excel/confirm', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setExcelImportResult(res.data)
      queryClient.invalidateQueries({ queryKey: ['stock'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      toast.success(res.data.message)
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Import xatosi')
    } finally {
      setExcelLoading(false)
    }
  }

  const resetExcelImport = () => {
    setExcelFile(null)
    setExcelPreview(null)
    setExcelImportResult(null)
    setExcelDocNumber('')
    setExcelWarehouseId('')
    setExcelImportMode('add')
    setShowPreviewRows(false)
    if (excelInputRef.current) excelInputRef.current.value = ''
  }

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">{t('warehouse')}</h1>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 rounded-xl text-xs font-semibold text-primary">
            <DollarSign className="w-3.5 h-3.5" />
            1$ = {formatNumber(usdRate)}
          </span>
          <button
            onClick={() => { resetExcelImport(); setShowExcelImport(true) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-green-500 text-green-700 text-sm font-semibold active:scale-95 transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            onClick={() => { setLandedCosts([]); setSelectedSupplierId(''); setSupplierPaidDisplay(''); setShowIncomeDialog(true) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-success text-white text-sm font-semibold active:scale-95 transition-all"
          >
            <TrendingUp className="w-4 h-4" />
            Kirim
          </button>
        </div>
      </div>

      {/* ── Warehouse chips + Low stock ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {warehouses?.map((wh: Warehouse) => (
          <button
            key={wh.id}
            onClick={() => setSelectedWarehouse(selectedWarehouse === wh.id ? null : wh.id)}
            className={cn(
              "flex-shrink-0 flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-2xl border transition-all active:scale-95",
              selectedWarehouse === wh.id
                ? "bg-primary text-white border-primary"
                : "bg-white border-border"
            )}
          >
            <span className="text-xs font-semibold">{wh.name}</span>
            <span className={cn("text-xs", selectedWarehouse === wh.id ? "text-white/80" : "text-gray-400")}>
              {formatMoney(wh.total_value || 0)}
            </span>
          </button>
        ))}
        <button
          onClick={() => setShowLowOnly(!showLowOnly)}
          className={cn(
            "flex-shrink-0 flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-2xl border transition-all active:scale-95",
            showLowOnly ? "bg-warning text-white border-warning" : "bg-white border-warning/50"
          )}
        >
          <span className="text-xs font-semibold flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Kam qoldiq
          </span>
          <span className={cn("text-xs font-bold", showLowOnly ? "text-white/90" : "text-danger")}>
            {lowStock?.data?.length || 0} ta
          </span>
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl">
        <button
          onClick={() => setActiveTab('stock')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
            activeTab === 'stock' ? "bg-white text-primary shadow-sm" : "text-gray-500"
          )}
        >
          <Package className="w-4 h-4" />
          Qoldiq
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
            activeTab === 'history' ? "bg-white text-primary shadow-sm" : "text-gray-500"
          )}
        >
          <History className="w-4 h-4" />
          Harakatlar
        </button>
      </div>

      {/* Stock Tab */}
      {activeTab === 'stock' && (
        <>
          {/* Search + Category */}
          <div className="bg-white rounded-2xl border border-border p-3 space-y-2 shadow-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Mahsulot qidirish..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <select
              className="w-full h-10 px-3 border border-border rounded-xl text-sm bg-white"
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Barcha kategoriyalar</option>
              {categories?.map((cat: any) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Stock List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : stockData?.data?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
              <Package className="w-16 h-16 mb-4 opacity-30" />
              <p>{t('productsNotFound')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stockData?.data?.map((stock: Stock) => {
                const product = productsList.find((p: Product) => p.id === stock.product_id)
                const uomConversions = product?.uom_conversions || []
                const salePrice = product?.sale_price || 0
                const stockStatus = stock.is_below_minimum ? 'low' : stock.quantity === 0 ? 'empty' : 'ok'
                const statusColors = {
                  low: 'bg-red-50 border-red-200',
                  empty: 'bg-gray-50 border-gray-200',
                  ok: 'bg-white border-border'
                }
                return (
                  <div key={stock.id} className={cn("rounded-2xl border shadow-sm p-3", statusColors[stockStatus])}>
                    {/* Row 1: name + status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm leading-tight">{stock.product_name}</p>
                        {stock.product_article && (
                          <p className="text-xs text-gray-400 mt-0.5">Art: {stock.product_article}</p>
                        )}
                      </div>
                      {stockStatus === 'low' && (
                        <span className="flex-shrink-0 text-xs px-2 py-1 bg-red-100 text-danger rounded-xl font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Kam
                        </span>
                      )}
                      {stockStatus === 'empty' && (
                        <span className="flex-shrink-0 text-xs px-2 py-1 bg-gray-200 text-gray-500 rounded-xl font-semibold">Tugagan</span>
                      )}
                    </div>

                    {/* Row 2: chips */}
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {/* Quantity */}
                      <div className={cn(
                        "flex items-center gap-1 rounded-xl px-2.5 py-1.5 border",
                        stockStatus === 'low' ? "bg-red-50 border-red-100" :
                        stockStatus === 'empty' ? "bg-gray-100 border-gray-200" :
                        "bg-green-50 border-green-100"
                      )}>
                        <span className="text-xs text-gray-500">Qoldiq:</span>
                        <span className={cn(
                          "text-sm font-bold whitespace-nowrap",
                          stockStatus === 'low' ? "text-danger" :
                          stockStatus === 'empty' ? "text-gray-400" : "text-success"
                        )}>
                          {formatNumber(stock.quantity, stock.quantity < 1 && stock.quantity > 0 ? 3 : 1)} {stock.base_uom_symbol}
                        </span>
                      </div>
                      {/* UOM conversions */}
                      {uomConversions.length > 0 && stock.quantity > 0 && uomConversions.map((conv: any) => (
                        <div key={conv.uom_id} className="flex items-center gap-1 bg-blue-50 border border-blue-100 rounded-xl px-2.5 py-1.5">
                          <span className="text-xs text-blue-500">≈</span>
                          <span className="text-sm font-semibold text-blue-700 whitespace-nowrap">
                            {formatNumber(stock.quantity / conv.conversion_factor, 1)} {conv.uom_symbol}
                          </span>
                        </div>
                      ))}
                      {/* Cost price */}
                      <div className="flex items-center gap-1 bg-orange-50 border border-orange-100 rounded-xl px-2.5 py-1.5">
                        <span className="text-xs text-gray-500">Tan:</span>
                        <span className="text-xs font-semibold text-warning whitespace-nowrap">
                          ${formatNumber(stock.average_cost / usdRate, 2)}
                        </span>
                      </div>
                      {/* Sale price */}
                      {salePrice > 0 && (
                        <div className="flex items-center gap-1 bg-green-50 border border-green-100 rounded-xl px-2.5 py-1.5">
                          <span className="text-xs text-gray-500">Sotish:</span>
                          <span className="text-xs font-semibold text-success whitespace-nowrap">{formatMoney(salePrice)}</span>
                        </div>
                      )}
                      {/* Total value */}
                      <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
                        <span className="text-xs text-gray-500">Umumiy:</span>
                        <span className="text-xs font-bold whitespace-nowrap">{formatMoney(stock.total_value)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-2xl border border-border p-3 space-y-2 shadow-sm">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={movementSearchInput}
                onChange={(e) => setMovementSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMovementSearch()}
                placeholder="Mahsulot qidirish..."
                className="w-full pl-9 pr-10 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
              />
              {movementSearchInput && (
                <button onClick={clearMovementSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* Type filter chips */}
            <div className="flex gap-1.5">
              {[
                { key: 'all', label: 'Barchasi', color: 'bg-primary text-white' },
                { key: 'income', label: 'Kirim', color: 'bg-success text-white' },
                { key: 'outcome', label: 'Chiqim', color: 'bg-danger text-white' },
              ].map(({ key, label, color }) => (
                <button key={key}
                  onClick={() => { setMovementFilter(key); setPage(1) }}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95",
                    movementFilter === key ? color : "bg-gray-100 text-gray-600"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Date range */}
            <div className="flex items-center gap-2">
              <input type="date" value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
                className="flex-1 h-10 px-3 border border-border rounded-xl text-sm" />
              <span className="text-gray-400">—</span>
              <input type="date" value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                className="flex-1 h-10 px-3 border border-border rounded-xl text-sm" />
            </div>
            {/* Active filters */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {movementsData?.total || 0} ta natija
              </span>
              {(movementFilter !== 'all' || startDate || endDate || movementSearch) && (
                <button
                  onClick={() => { setMovementFilter('all'); setStartDate(''); setEndDate(''); clearMovementSearch(); setPage(1) }}
                  className="text-xs text-primary font-semibold"
                >
                  Tozalash
                </button>
              )}
            </div>
            {movementSearch && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl text-xs">
                <span className="text-blue-700">🔍 "<b>{movementSearch}</b>"</span>
                <button onClick={clearMovementSearch} className="ml-auto text-blue-500">✕</button>
              </div>
            )}
          </div>

          {/* Movement cards */}
          {loadingMovements ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : movementsData?.data && movementsData.data.length > 0 ? (
            <div className="space-y-2">
              {movementsData.data.map((movement: any) => {
                const isIncome = ['purchase', 'transfer_in', 'adjustment_plus', 'return_from_customer'].includes(movement.movement_type)
                const canEdit = ['purchase', 'adjustment_plus', 'adjustment_minus'].includes(movement.movement_type)
                const typeLabel =
                  movement.movement_type === 'purchase' ? 'Kirim' :
                  movement.movement_type === 'sale' ? 'Sotuv' :
                  movement.movement_type === 'transfer_in' ? "O'tkazma +" :
                  movement.movement_type === 'transfer_out' ? "O'tkazma -" :
                  movement.movement_type === 'adjustment_plus' ? 'Tuzatish +' :
                  movement.movement_type === 'adjustment_minus' ? 'Tuzatish -' :
                  movement.movement_type === 'write_off' ? 'Hisobdan chiqarish' :
                  movement.movement_type

                return (
                  <div key={movement.id}
                    className={cn(
                      "bg-white rounded-2xl border shadow-sm p-3",
                      isIncome ? "border-l-4 border-l-success" : "border-l-4 border-l-danger"
                    )}>
                    {/* Row 1: product + type + actions */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm">{movement.product_name}</span>
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-lg font-semibold",
                            isIncome ? "bg-green-100 text-success" : "bg-red-100 text-danger"
                          )}>
                            {typeLabel}
                          </span>
                        </div>
                        {movement.product_article && (
                          <p className="text-xs text-gray-400 mt-0.5">Art: {movement.product_article}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                          <Calendar className="w-3 h-3" />
                          {formatDateTashkent(movement.created_at)} · {formatTimeTashkent(movement.created_at)}
                          {movement.updated_by_name && (
                            <span className="text-warning flex items-center gap-0.5">
                              <Pencil className="w-3 h-3" />{movement.updated_by_name}
                            </span>
                          )}
                        </div>
                      </div>
                      {isDirector && canEdit && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => setEditingMovement({
                              id: movement.id,
                              product_id: movement.product_id,
                              product_name: movement.product_name,
                              quantity: movement.quantity,
                              uom_id: movement.uom_id,
                              uom_symbol: movement.uom_symbol,
                              unit_price: movement.unit_price,
                              unit_price_usd: movement.unit_price_usd,
                              document_number: movement.document_number || '',
                              supplier_name: movement.supplier_name || '',
                              notes: movement.notes || ''
                            })}
                            className="w-8 h-8 flex items-center justify-center rounded-xl border border-blue-200 text-primary active:bg-blue-50"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingMovement({ id: movement.id, name: movement.product_name })}
                            className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-200 text-danger active:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Row 2: amounts + meta */}
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      <div className={cn(
                        "flex items-center gap-1 rounded-xl px-2.5 py-1.5 border",
                        isIncome ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"
                      )}>
                        <span className="text-xs text-gray-500">Miqdor:</span>
                        <span className={cn("text-sm font-bold whitespace-nowrap", isIncome ? "text-success" : "text-danger")}>
                          {isIncome ? '+' : '-'}{formatNumber(movement.quantity)} {movement.uom_symbol}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 bg-orange-50 border border-orange-100 rounded-xl px-2.5 py-1.5">
                        <span className="text-xs text-gray-500">Narx:</span>
                        <span className="text-xs font-semibold text-warning whitespace-nowrap">
                          ${formatNumber(movement.unit_price_usd || (movement.unit_price / (movement.exchange_rate || usdRate)), 2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
                        <span className="text-xs text-gray-500">Jami:</span>
                        <span className="text-xs font-bold whitespace-nowrap">
                          {formatMoney(movement.total_price || movement.quantity * movement.unit_price)}
                        </span>
                      </div>
                      {movement.supplier_name && (
                        <div className="flex items-center gap-1 bg-blue-50 border border-blue-100 rounded-xl px-2.5 py-1.5">
                          <span className="text-xs text-blue-600 whitespace-nowrap">{movement.supplier_name}</span>
                        </div>
                      )}
                      {movement.document_number && (
                        <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5">
                          <span className="text-xs text-gray-500">Doc:</span>
                          <span className="text-xs font-medium whitespace-nowrap">{movement.document_number}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
              <History className="w-16 h-16 mb-4 opacity-30" />
              <p>{t('movementHistoryNotFound')}</p>
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      {((activeTab === 'stock' && stockData && stockData.total > 20) ||
        (activeTab === 'history' && movementsData && movementsData.total > 30)) && (
        <div className="flex items-center justify-between bg-white rounded-2xl border border-border px-4 py-3 shadow-sm">
          <span className="text-sm text-gray-500">Sahifa {page}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium disabled:opacity-40 active:bg-gray-100">
              ← Oldingi
            </button>
            <button onClick={() => setPage(page + 1)}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium active:bg-gray-100">
              Keyingi →
            </button>
          </div>
        </div>
      )}

      {/* Income Dialog */}
      <Dialog open={showIncomeDialog} onOpenChange={setShowIncomeDialog}>
        <DialogContent className="w-full max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-2xl overflow-x-visible">
          <div className="flex-shrink-0 flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
            <div>
              <h2 className="text-base font-bold">Ombor kirimi</h2>
              <p className="text-xs text-gray-500">1$ = {formatNumber(usdRate)} so'm</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-visible">

          <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
            {/* Currency toggle */}
            <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl">
              <button type="button" onClick={() => setIncomeCurrency('USD')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${incomeCurrency === 'USD' ? 'bg-primary text-white shadow-sm' : 'text-gray-500'}`}>
                $ USD
              </button>
              <button type="button" onClick={() => setIncomeCurrency('UZS')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${incomeCurrency === 'UZS' ? 'bg-success text-white shadow-sm' : 'text-gray-500'}`}>
                UZS so'm
              </button>
            </div>

            {/* Warehouse + Document */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Ombor</label>
                <select {...register('warehouse_id', { valueAsNumber: true })}
                  className="w-full h-11 px-3 border border-border rounded-xl text-sm bg-white">
                  {warehouses?.map((wh: Warehouse) => (
                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Hujjat №</label>
                <Input {...register('document_number')} placeholder="INV-001" className="h-11" />
              </div>
            </div>

            {/* Supplier + Paid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Ta'minotchi</label>
                <select value={selectedSupplierId}
                  onChange={e => {
                    const val = e.target.value
                    setSelectedSupplierId(val ? Number(val) : '')
                    if (val) {
                      const sup = suppliersList.find((s: any) => s.id === Number(val))
                      if (sup) setValue('supplier_name', sup.name)
                    } else { setValue('supplier_name', '') }
                  }}
                  className="w-full h-11 px-3 border border-border rounded-xl text-sm bg-white">
                  <option value="">Ixtiyoriy</option>
                  {suppliersList.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <input type="hidden" {...register('supplier_name')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">To'langan</label>
                <input type="text" inputMode="numeric"
                  value={supplierPaidDisplay}
                  onChange={e => {
                    const n = parseFloat(e.target.value.replace(/\s/g, '')) || 0
                    setSupplierPaidDisplay(n > 0 ? formatInputNumber(n) : '')
                  }}
                  placeholder="0"
                  className="w-full h-11 px-3 border border-border rounded-xl text-sm text-center font-bold text-success disabled:opacity-40"
                  disabled={!selectedSupplierId}
                />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Tovarlar</p>
                <button type="button"
                  onClick={() => append({ product_id: 0, quantity: 1, uom_id: 1, unit_price_usd: 0, unit_price_uzs: 0 })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-primary text-primary text-xs font-semibold active:scale-95">
                  <Plus className="w-3.5 h-3.5" /> Qo'shish
                </button>
              </div>
              <div className="space-y-2">
                {fields.map((field, index) => {
                  const item = watchItems?.[index]
                  const itemTotal = incomeCurrency === 'USD'
                    ? (item?.quantity || 0) * (item?.unit_price_usd || 0)
                    : (item?.quantity || 0) * (item?.unit_price_uzs || 0)
                  const itemUzsCost = incomeCurrency === 'USD'
                    ? (item?.unit_price_usd || 0) * usdRate
                    : (item?.unit_price_uzs || 0)
                  const itemTotalValue = itemUzsCost * (item?.quantity || 0)
                  const allItemsTotalValue = (watchItems || []).reduce((sum: number, it: any) => {
                    const cost = incomeCurrency === 'USD' ? (it?.unit_price_usd || 0) * usdRate : (it?.unit_price_uzs || 0)
                    return sum + cost * (it?.quantity || 0)
                  }, 0)
                  const allItemsTotalQty = (watchItems || []).reduce((sum: number, it: any) => sum + (it?.quantity || 0), 0)
                  let extraPerUnit = 0
                  if (landedCosts.length > 0 && (item?.quantity || 0) > 0) {
                    for (const lc of landedCosts) {
                      if (!lc.amount || lc.amount <= 0) continue
                      if (lc.allocation_method === 'by_value' && allItemsTotalValue > 0) {
                        extraPerUnit += (lc.amount * (itemTotalValue / allItemsTotalValue)) / (item?.quantity || 1)
                      } else if (lc.allocation_method === 'by_weight' && allItemsTotalQty > 0) {
                        extraPerUnit += (lc.amount * ((item?.quantity || 0) / allItemsTotalQty)) / (item?.quantity || 1)
                      } else if (lc.allocation_method === 'equal') {
                        const cnt = (watchItems || []).filter((it: any) => it?.product_id > 0).length
                        if (cnt > 0) extraPerUnit += (lc.amount / cnt) / (item?.quantity || 1)
                      }
                    }
                  }
                  const landedUnitCost = itemUzsCost + extraPerUnit
                  const hasLandedCosts = landedCosts.length > 0 && landedCosts.some(lc => lc.amount > 0)

                  return (
                    <div key={field.id} className="bg-gray-50 border border-border rounded-2xl p-3 space-y-2.5">
                      {/* Product select + delete */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <input type="hidden" {...register(`items.${index}.product_id`, { valueAsNumber: true })} />
                          <ProductSearchSelect
                            products={productsList}
                            value={item?.product_id || 0}
                            onChange={(id) => setValue(`items.${index}.product_id`, id)}
                            loading={productsLoading}
                            placeholder={`Mahsulot tanlang (${productsList.length})`}
                          />
                        </div>
                        <button type="button" onClick={() => remove(index)} disabled={fields.length === 1}
                          className="w-9 h-9 flex items-center justify-center rounded-xl border border-red-200 text-danger disabled:opacity-30 flex-shrink-0 active:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {/* Qty + UOM + Price row */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500">Miqdor</label>
                          <Input type="number" step="any"
                            {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                            className="h-10 text-center text-sm" placeholder="0"
                            onFocus={(e) => e.target.select()} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500">O'lchov</label>
                          <select {...register(`items.${index}.uom_id`, { valueAsNumber: true })}
                            className="w-full h-10 px-2 border border-border rounded-xl text-sm bg-white">
                            {uoms.map((uom: any) => (
                              <option key={uom.id} value={uom.id}>{uom.symbol}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500">
                            Narx {incomeCurrency === 'USD' ? "($)" : "(so'm)"}
                          </label>
                          {incomeCurrency === 'USD' ? (
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-primary">$</span>
                              <Input type="number" step="any"
                                {...register(`items.${index}.unit_price_usd`, { valueAsNumber: true })}
                                className="h-10 text-center text-sm pl-6" placeholder="0.00"
                                onFocus={(e) => e.target.select()} />
                            </div>
                          ) : (
                            <Input type="number" step="any"
                              {...register(`items.${index}.unit_price_uzs`, { valueAsNumber: true })}
                              className="h-10 text-center text-sm" placeholder="0"
                              onFocus={(e) => e.target.select()} />
                          )}
                        </div>
                      </div>
                      {/* Total + Landed */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Jami:</span>
                        <div className="text-right">
                          <span className="text-sm font-bold text-success">
                            {incomeCurrency === 'USD' ? `$${formatNumber(itemTotal, 2)}` : formatMoney(itemTotal)}
                          </span>
                          {hasLandedCosts && extraPerUnit > 0 && itemUzsCost > 0 && (
                            <div className="text-xs text-orange-600 font-semibold">
                              Landed: {formatMoney(landedUnitCost)} (+{formatMoney(extraPerUnit)})
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">Izoh</label>
              <Input {...register('notes')} placeholder="Qo'shimcha ma'lumot" className="h-11" />
            </div>

            {/* ===== LANDED COSTS / QO'SHIMCHA XARAJATLAR ===== */}
            <div className="space-y-3 border-2 border-dashed border-orange-200 rounded-pos p-4 bg-orange-50/30">
              <div className="flex justify-between items-center">
                <label className="font-medium flex items-center gap-2 text-orange-700">
                  <Wallet className="w-4 h-4" />
                  Qo'shimcha xarajatlar (Landed Cost)
                </label>
                <button type="button"
                  onClick={() => setLandedCosts([...landedCosts, { cost_type: 'transport', description: '', amount: 0, allocation_method: 'by_value' }])}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-orange-300 text-orange-600 text-xs font-semibold active:scale-95">
                  <Plus className="w-3.5 h-3.5" /> Xarajat qo'shish
                </button>
              </div>

              {landedCosts.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">
                  Transport, bojxona va boshqa xarajatlarni qo'shing
                </p>
              ) : (
                <div className="space-y-2">
                  {landedCosts.map((lc, idx) => (
                    <div key={idx} className="bg-white border border-orange-100 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <select value={lc.cost_type}
                          onChange={e => { const u=[...landedCosts]; u[idx].cost_type=e.target.value; setLandedCosts(u) }}
                          className="flex-1 h-10 px-2 border border-border rounded-xl text-sm bg-white">
                          <option value="transport">🚛 Transport</option>
                          <option value="loading">📦 Yuk tushirish</option>
                          <option value="customs">🏛 Bojxona</option>
                          <option value="insurance">🛡 Sug'urta</option>
                          <option value="other">📝 Boshqa</option>
                        </select>
                        <button type="button" onClick={() => setLandedCosts(landedCosts.filter((_, i) => i !== idx))}
                          className="w-10 h-10 flex items-center justify-center rounded-xl border border-red-200 text-danger active:bg-red-50 flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={lc.description}
                          onChange={e => { const u=[...landedCosts]; u[idx].description=e.target.value; setLandedCosts(u) }}
                          placeholder="Izoh (masalan: yetkazish)"
                          className="h-10 px-3 border border-border rounded-xl text-sm" />
                        <input type="text" inputMode="numeric"
                          value={lc.amount > 0 ? formatInputNumber(lc.amount) : ''}
                          onChange={e => { const u=[...landedCosts]; u[idx].amount=parseFloat(e.target.value.replace(/\s/g,''))||0; setLandedCosts(u) }}
                          placeholder="Summa"
                          className="h-10 px-3 border border-border rounded-xl text-sm text-center font-bold text-orange-600" />
                      </div>
                      <select value={lc.allocation_method}
                        onChange={e => { const u=[...landedCosts]; u[idx].allocation_method=e.target.value; setLandedCosts(u) }}
                        className="w-full h-10 px-3 border border-border rounded-xl text-sm bg-white">
                        <option value="by_value">📊 Summaga nisbatan taqsimlash</option>
                        <option value="by_weight">⚖️ Miqdorga nisbatan taqsimlash</option>
                        <option value="equal">➗ Teng taqsimlash</option>
                      </select>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-1 border-t border-orange-200">
                    <span className="text-sm font-semibold text-orange-700">Jami xarajat:</span>
                    <span className="text-base font-bold text-orange-600">
                      {formatMoney(landedCosts.reduce((s,lc) => s+(lc.amount||0), 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Total summary */}
            <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  {incomeCurrency === 'USD' ? 'Jami ($):' : "Jami (so'm):"}
                </span>
                <span className="text-lg font-bold text-primary">
                  {incomeCurrency === 'USD' ? `$${formatNumber(incomeTotalUsd, 2)}` : formatMoney(incomeTotalUzs)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {incomeCurrency === 'USD' ? "≈ so'mda:" : "≈ dollarda:"}
                </span>
                <span className="text-sm font-semibold text-success">
                  {incomeCurrency === 'USD' ? formatMoney(incomeTotalUzs) : `$${formatNumber(incomeTotalUsd, 2)}`}
                </span>
              </div>
              {landedCosts.length > 0 && landedCosts.some(lc => lc.amount > 0) && (
                <>
                  <div className="flex items-center justify-between border-t border-white/50 pt-2">
                    <span className="text-xs text-orange-700">+ Qo'shimcha xarajatlar:</span>
                    <span className="text-sm font-bold text-orange-600">{formatMoney(landedCosts.reduce((s,lc)=>s+(lc.amount||0),0))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">Yakuniy:</span>
                    <span className="text-base font-bold">{formatMoney(incomeTotalUzs + landedCosts.reduce((s,lc)=>s+(lc.amount||0),0))}</span>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 pt-2 pb-2">
              <button type="button"
                onClick={() => { setShowIncomeDialog(false); setIncomeCurrency('USD'); setLandedCosts([]); setSelectedSupplierId(''); setSupplierPaidDisplay('') }}
                className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
                Bekor
              </button>
              <button type="submit" disabled={stockIncome.isPending}
                className="flex-1 h-12 rounded-2xl bg-success text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                {stockIncome.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Saqlanmoqda...</>
                  : <><TrendingUp className="w-4 h-4" />Kirimni saqlash</>}
              </button>
            </div>
          </form>
          </div>{/* end scrollable */}
        </DialogContent>
      </Dialog>

      {/* Edit Movement Dialog */}
      <Dialog open={!!editingMovement} onOpenChange={() => setEditingMovement(null)}>
        <DialogContent className="w-full max-w-md h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-2xl">

          {/* ── Fixed Header ── */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-2xl flex-shrink-0">
                <Pencil className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base">Harakatni tahrirlash</h3>
                <p className="text-xs text-gray-500 truncate">{editingMovement?.product_name}</p>
              </div>
            </div>
          </div>

          {/* ── Scrollable Body ── */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {editingMovement && (
              <>
                {/* Miqdor + Jami preview */}
                <div className="bg-gray-50 border border-border rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Miqdor</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500">Soni</label>
                      <Input
                        type="number" step="any"
                        value={editingMovement.quantity}
                        onChange={(e) => setEditingMovement({...editingMovement, quantity: parseFloat(e.target.value) || 0})}
                        className="h-12 text-center text-base font-bold"
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500">O'lchov birligi</label>
                      <select
                        className="w-full h-12 px-3 border border-border rounded-xl text-sm bg-white font-medium"
                        value={editingMovement.uom_id}
                        onChange={(e) => {
                          const availableUoms = productUoms.length > 0 ? productUoms : uoms
                          const sel = availableUoms.find((u: any) => u.uom_id === parseInt(e.target.value) || u.id === parseInt(e.target.value))
                          setEditingMovement({ ...editingMovement, uom_id: parseInt(e.target.value), uom_symbol: sel?.uom_symbol || sel?.symbol || '' })
                        }}
                      >
                        {productUoms.length > 0
                          ? productUoms.map((u: any) => (
                              <option key={u.uom_id} value={u.uom_id}>
                                {u.uom_name} ({u.uom_symbol})
                              </option>
                            ))
                          : uoms.map((u: any) => (
                              <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>
                            ))}
                      </select>
                    </div>
                  </div>
                  {/* Live preview */}
                  <div className="bg-white rounded-xl p-3 flex items-center justify-between">
                    <span className="text-xs text-gray-400">Jami qiymat:</span>
                    <span className="text-sm font-bold text-primary">
                      {formatMoney(editingMovement.quantity * editingMovement.unit_price)}
                    </span>
                  </div>
                </div>

                {/* Narxlar */}
                <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">💰 Tan narxi</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500">Dollar ($)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-primary">$</span>
                        <Input
                          type="number" step="any"
                          value={editingMovement.unit_price_usd || ''}
                          onChange={(e) => setEditingMovement({
                            ...editingMovement,
                            unit_price_usd: parseFloat(e.target.value) || 0,
                            unit_price: (parseFloat(e.target.value) || 0) * usdRate
                          })}
                          className="h-12 pl-8 font-semibold"
                          placeholder="0.00"
                          onFocus={(e) => e.target.select()}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-500">So'm (UZS)</label>
                      <Input
                        type="number" step="any"
                        value={editingMovement.unit_price}
                        onChange={(e) => setEditingMovement({...editingMovement, unit_price: parseFloat(e.target.value) || 0})}
                        className="h-12 font-semibold"
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  </div>
                  {/* Rate hint */}
                  <div className="flex items-center justify-between text-xs text-orange-600">
                    <span>Joriy kurs: 1$ = {formatNumber(usdRate)}</span>
                    {editingMovement.unit_price_usd > 0 && (
                      <span className="font-medium">
                        ≈ {formatMoney((editingMovement.unit_price_usd) * usdRate)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Hujjat + Yetkazuvchi + Izoh */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Qo'shimcha</p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Hujjat raqami</label>
                    <Input
                      value={editingMovement.document_number}
                      onChange={(e) => setEditingMovement({...editingMovement, document_number: e.target.value})}
                      className="h-11"
                      placeholder="INV-001"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Yetkazuvchi</label>
                    <Input
                      value={editingMovement.supplier_name}
                      onChange={(e) => setEditingMovement({...editingMovement, supplier_name: e.target.value})}
                      className="h-11"
                      placeholder="Yetkazuvchi nomi"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Izoh</label>
                    <Input
                      value={editingMovement.notes}
                      onChange={(e) => setEditingMovement({...editingMovement, notes: e.target.value})}
                      className="h-11"
                      placeholder="Qo'shimcha izoh..."
                    />
                  </div>
                </div>

                {/* Warning */}
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-800 leading-relaxed">{t('quantityChangeWarning')}</p>
                </div>
              </>
            )}
          </div>

          {/* ── Fixed Footer ── */}
          <div className="flex-shrink-0 flex gap-3 px-4 pb-5 pt-3 border-t border-border">
            <button
              onClick={() => setEditingMovement(null)}
              className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50 transition-all"
            >
              Bekor
            </button>
            <button
              onClick={() => editingMovement && editMovement.mutate({
                id: editingMovement.id,
                quantity: editingMovement.quantity,
                uom_id: editingMovement.uom_id,
                unit_price: editingMovement.unit_price,
                unit_price_usd: editingMovement.unit_price_usd || undefined,
                document_number: editingMovement.document_number,
                supplier_name: editingMovement.supplier_name,
                notes: editingMovement.notes
              })}
              disabled={editMovement.isPending}
              className="flex-1 h-12 rounded-2xl bg-primary text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {editMovement.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" />Saqlanmoqda...</>
                : <><Pencil className="w-4 h-4" />Saqlash</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Movement Dialog */}
      <Dialog open={!!deletingMovement} onOpenChange={() => { setDeletingMovement(null); setDeleteReason('') }}>
        <DialogContent className="w-full max-w-sm p-0 gap-0 rounded-2xl overflow-hidden">
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-100 rounded-2xl">
                <Trash2 className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Harakatni o'chirish</h3>
                <p className="text-xs text-gray-500">{deletingMovement?.name}</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-danger mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-800">{t('deleteMovementWarning')}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Sabab *</label>
              <input type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="O'chirish sababini kiriting..."
                className="w-full h-11 px-3 border border-border rounded-xl text-sm focus:outline-none focus:border-danger"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setDeletingMovement(null); setDeleteReason('') }}
                className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
                Bekor
              </button>
              <button
                onClick={() => deletingMovement && deleteMovement.mutate({ id: deletingMovement.id, reason: deleteReason })}
                disabled={deleteMovement.isPending || !deleteReason.trim()}
                className="flex-1 h-12 rounded-2xl bg-danger text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {deleteMovement.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" />O'chirilmoqda...</>
                  : <><Trash2 className="w-4 h-4" />O'chirish</>}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Excel Import Dialog ─── */}
      <Dialog open={showExcelImport} onOpenChange={(open) => { if (!open) resetExcelImport(); setShowExcelImport(open) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-green-600" />
              Excel orqali tovarlarni import qilish
            </DialogTitle>
            <DialogDescription>
              Excel fayldan mahsulotlarni import qiling — yangi tovarlar yaratiladi, mavjudlari yangilanadi
            </DialogDescription>
          </DialogHeader>

          {!excelImportResult ? (
            <div className="space-y-5">

              {/* Step 1 — File upload */}
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary transition-colors">
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleExcelFileChange}
                />
                {excelFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileSpreadsheet className="w-8 h-8 text-green-600" />
                    <div className="text-left">
                      <p className="font-semibold text-sm">{excelFile.name}</p>
                      <p className="text-xs text-text-secondary">{(excelFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { resetExcelImport() }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-10 h-10 text-text-secondary mx-auto mb-2" />
                    <p className="font-medium mb-1">Excel faylni yuklang</p>
                    <p className="text-sm text-text-secondary mb-3">Название товара, Цена розничная, Себестоимость, Количество, Ед. изм., Штрих-код ustunlari bo'lishi kerak</p>
                    <Button type="button" variant="outline" onClick={() => excelInputRef.current?.click()}>
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      Fayl tanlash (.xlsx)
                    </Button>
                  </div>
                )}
              </div>

              {/* Loading */}
              {excelLoading && (
                <div className="flex items-center justify-center gap-3 py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-sm font-medium">Fayl tahlil qilinmoqda...</span>
                </div>
              )}

              {/* Preview results */}
              {excelPreview && !excelLoading && (
                <div className="space-y-4">
                  {/* Summary badges */}
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Yangi: <strong>{excelPreview.new}</strong> ta</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm font-medium text-yellow-700">Mavjud: <strong>{excelPreview.existing}</strong> ta</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <Package className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700">Jami: <strong>{excelPreview.total}</strong> ta</span>
                    </div>
                  </div>

                  {/* Mode selector — only if there are existing products */}
                  {excelPreview.existing > 0 && (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl space-y-3">
                      <p className="text-sm font-semibold text-yellow-800">
                        ⚠️ {excelPreview.existing} ta mahsulot allaqachon omborda mavjud. Ular bilan nima qilish kerak?
                      </p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setExcelImportMode('add')}
                          className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                            excelImportMode === 'add'
                              ? 'border-primary bg-primary text-white'
                              : 'border-border bg-white hover:border-primary'
                          }`}
                        >
                          <Plus className="w-4 h-4 inline mr-1" />
                          Ustiga qo'shish
                          <span className="block text-xs opacity-75 mt-1">Mavjud miqdorga + qo'shiladi</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExcelImportMode('replace')}
                          className={`flex-1 p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                            excelImportMode === 'replace'
                              ? 'border-orange-500 bg-orange-500 text-white'
                              : 'border-border bg-white hover:border-orange-400'
                          }`}
                        >
                          <X className="w-4 h-4 inline mr-1" />
                          Yangilab qo'yish
                          <span className="block text-xs opacity-75 mt-1">Miqdor Excel qiymati bilan almashadi</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Warehouse & doc number */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Ombor <span className="text-red-500">*</span></label>
                      <select
                        className="w-full min-h-[44px] px-3 py-2 border-2 border-border rounded-xl text-sm"
                        value={excelWarehouseId}
                        onChange={(e) => setExcelWarehouseId(e.target.value ? Number(e.target.value) : '')}
                      >
                        <option value="">— Ombor tanlang —</option>
                        {warehouses?.map((wh: Warehouse) => (
                          <option key={wh.id} value={wh.id}>{wh.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Hujjat raqami</label>
                      <input
                        className="w-full min-h-[44px] px-3 py-2 border-2 border-border rounded-xl text-sm"
                        placeholder="EXCEL-001"
                        value={excelDocNumber}
                        onChange={(e) => setExcelDocNumber(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Preview table toggle */}
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm text-primary font-medium hover:underline"
                    onClick={() => setShowPreviewRows(!showPreviewRows)}
                  >
                    {showPreviewRows ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {showPreviewRows ? "Ro'yxatni yashirish" : `Barcha ${excelPreview.total} ta tovarni ko'rish`}
                  </button>

                  {showPreviewRows && (
                    <div className="border border-border rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                      <table className="w-full text-xs min-w-[600px]">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Nomi</th>
                            <th className="px-3 py-2 text-left font-medium">Shtrix-kod</th>
                            <th className="px-3 py-2 text-right font-medium">Miqdor</th>
                            <th className="px-3 py-2 text-right font-medium">Joriy</th>
                            <th className="px-3 py-2 text-right font-medium">Kelish narxi</th>
                            <th className="px-3 py-2 text-right font-medium">Sotuv narxi</th>
                            <th className="px-3 py-2 text-center font-medium">Holat</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {excelPreview.rows.map((row: any, idx: number) => (
                            <tr key={idx} className={row.status === 'new' ? 'bg-green-50' : 'bg-yellow-50'}>
                              <td className="px-3 py-2 max-w-[200px] truncate" title={row.name}>{row.name}</td>
                              <td className="px-3 py-2 text-text-secondary">{row.barcode || '—'}</td>
                              <td className="px-3 py-2 text-right font-medium">
                                {row.quantity} {row.unit}
                                {row.status === 'existing' && excelImportMode === 'add' && (
                                  <span className="text-green-600 ml-1">(+{row.quantity})</span>
                                )}
                                {row.status === 'existing' && excelImportMode === 'replace' && (
                                  <span className="text-orange-600 ml-1">(→{row.quantity})</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right text-text-secondary">
                                {row.status === 'existing' ? row.current_stock : '—'}
                              </td>
                              <td className="px-3 py-2 text-right">{formatMoney(row.cost_price)}</td>
                              <td className="px-3 py-2 text-right">{formatMoney(row.sale_price)}</td>
                              <td className="px-3 py-2 text-center">
                                {row.status === 'new' ? (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Yangi</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">Mavjud</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ── Import result ── */
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-center">
                <div className="p-4 bg-green-50 rounded-full">
                  <CheckCircle className="w-12 h-12 text-green-600" />
                </div>
              </div>
              <h3 className="text-center text-lg font-bold">Import muvaffaqiyatli!</h3>
              <div className="flex justify-center flex-wrap gap-4">
                <div className="text-center p-4 bg-green-50 rounded-xl min-w-[100px]">
                  <p className="text-2xl font-bold text-green-700">{excelImportResult.created}</p>
                  <p className="text-sm text-text-secondary">Yangi yaratildi</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-xl min-w-[100px]">
                  <p className="text-2xl font-bold text-blue-700">{excelImportResult.updated}</p>
                  <p className="text-sm text-text-secondary">Yangilandi</p>
                </div>
                {excelImportResult.errors?.length > 0 && (
                  <div className="text-center p-4 bg-red-50 rounded-xl min-w-[100px]">
                    <p className="text-2xl font-bold text-red-700">{excelImportResult.errors.length}</p>
                    <p className="text-sm text-text-secondary">Xato</p>
                  </div>
                )}
              </div>
              {excelImportResult.errors?.length > 0 && (
                <div className="border border-red-200 rounded-xl p-3 max-h-40 overflow-y-auto">
                  <p className="text-sm font-medium text-red-700 mb-2">Xatolar:</p>
                  {excelImportResult.errors.map((err: any, i: number) => (
                    <p key={i} className="text-xs text-red-600">• {err.name}: {err.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {!excelImportResult ? (
              <>
                <Button variant="outline" onClick={() => { resetExcelImport(); setShowExcelImport(false) }}>
                  Bekor qilish
                </Button>
                <Button
                  onClick={handleExcelImportConfirm}
                  disabled={!excelPreview || !excelWarehouseId || excelLoading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {excelLoading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Import qilinmoqda...</>
                    : <><Upload className="w-4 h-4 mr-2" />Importni boshlash</>
                  }
                </Button>
              </>
            ) : (
              <Button onClick={() => { resetExcelImport(); setShowExcelImport(false) }} className="w-full">
                Yopish
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}