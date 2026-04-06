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
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 lg:gap-4">
        <h1 className="text-xl lg:text-pos-xl font-bold">{t('warehouse')}</h1>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="flex items-center justify-center gap-2 px-3 lg:px-4 py-2 bg-primary/10 rounded-xl text-sm lg:text-base">
            <DollarSign className="w-4 h-4 lg:w-5 lg:h-5 text-primary" />
            <span className="font-semibold">1$ = {formatNumber(usdRate)} {t('sum')}</span>
          </div>
          <Button size="lg" variant="success" onClick={() => { setLandedCosts([]); setSelectedSupplierId(''); setSupplierPaidDisplay(''); setShowIncomeDialog(true) }} className="w-full sm:w-auto text-sm lg:text-base">
            <TrendingUp className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
            {t('stockIn')}
          </Button>
          <Button size="lg" variant="outline" onClick={() => { resetExcelImport(); setShowExcelImport(true) }} className="w-full sm:w-auto text-sm lg:text-base border-2 border-green-600 text-green-700 hover:bg-green-50">
            <FileSpreadsheet className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
            Excel kirim
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
        {warehouses?.map((wh: Warehouse) => (
          <Card
            key={wh.id}
            className={cn('cursor-pointer transition-all', selectedWarehouse === wh.id && 'ring-2 ring-primary')}
            onClick={() => setSelectedWarehouse(selectedWarehouse === wh.id ? null : wh.id)}
          >
            <CardContent className="p-2.5 lg:p-4 flex flex-col lg:flex-row items-center gap-2 lg:gap-4">
              <div className="p-2 lg:p-3 bg-primary/10 rounded-xl">
                <WarehouseIcon className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
              </div>
              <div className="text-center lg:text-left">
                <p className="font-semibold text-sm lg:text-base">{wh.name}</p>
                <p className="text-xs lg:text-sm text-text-secondary truncate">{formatMoney(wh.total_value || 0)}</p>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card
          className={cn('cursor-pointer transition-all border-warning', showLowOnly && 'ring-2 ring-warning')}
          onClick={() => setShowLowOnly(!showLowOnly)}
        >
          <CardContent className="p-2.5 lg:p-4 flex flex-col lg:flex-row items-center gap-2 lg:gap-4">
            <div className="p-2 lg:p-3 bg-warning/10 rounded-xl">
              <AlertTriangle className="w-5 h-5 lg:w-6 lg:h-6 text-warning" />
            </div>
            <div className="text-center lg:text-left">
              <p className="font-semibold text-sm lg:text-base">{t('lowStock')}</p>
              <p className="text-xs lg:text-sm text-danger font-bold">{lowStock?.data?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 lg:gap-2 border-b border-border overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('stock')}
          className={cn(
            'px-4 lg:px-6 py-2.5 lg:py-3 font-medium border-b-2 transition-colors whitespace-nowrap text-sm lg:text-base',
            activeTab === 'stock' ? 'border-primary text-primary' : 'border-transparent hover:text-primary'
          )}
        >
          <Package className="w-4 h-4 lg:w-5 lg:h-5 inline mr-1.5 lg:mr-2" />
          {t('inventory')}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            'px-4 lg:px-6 py-2.5 lg:py-3 font-medium border-b-2 transition-colors whitespace-nowrap text-sm lg:text-base',
            activeTab === 'history' ? 'border-primary text-primary' : 'border-transparent hover:text-primary'
          )}
        >
          <History className="w-4 h-4 lg:w-5 lg:h-5 inline mr-1.5 lg:mr-2" />
          {t('movements')}
        </button>
      </div>

      {/* Stock Tab */}
      {activeTab === 'stock' && (
        <>
          {/* Filters */}
          <Card>
            <CardContent className="p-3 lg:p-4">
              <div className="flex flex-col sm:flex-row gap-2 lg:gap-4 items-stretch sm:items-center">
                <div className="flex-1">
                  <Input
                    icon={<Search className="w-4 h-4 lg:w-5 lg:h-5" />}
                    placeholder={t('searchProducts') + '...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="text-sm lg:text-base"
                  />
                </div>
                <select
                  className="min-h-[44px] lg:min-h-btn px-3 lg:px-4 py-2 lg:py-3 border-2 border-border rounded-xl text-sm lg:text-pos-base"
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{t('allCategories')}</option>
                  {categories?.map((cat: any) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Stock List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium">{t('product')}</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">{t('article')}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t('balance')}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t('avgCostUsd')}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t('avgCostUzs')}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t('sellingPrice')}</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">{t('totalValue')}</th>
                      <th className="px-4 py-3 text-center text-sm font-medium">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stockData?.data?.map((stock: Stock) => {
                      // Mahsulotni topish va UOM konversiyalarini olish
                      const product = productsList.find((p: Product) => p.id === stock.product_id)
                      const uomConversions = product?.uom_conversions || []

                      return (
                      <tr key={stock.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <p className="font-medium">{stock.product_name}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {stock.product_article || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {/* Asosiy UOM dagi qoldiq */}
                          <div className="font-semibold">
                            {formatNumber(stock.quantity, stock.quantity < 1 && stock.quantity > 0 ? 3 : 1)} {stock.base_uom_symbol}
                          </div>
                          {/* Boshqa UOM lardagi qoldiq */}
                          {uomConversions.length > 0 && stock.quantity > 0 && (
                            <div className="text-xs text-gray-500 mt-0.5 space-y-0.5">
                              {uomConversions.map((conv: any) => (
                                <div key={conv.uom_id}>
                                  ≈ {formatNumber(stock.quantity / conv.conversion_factor, 1)} {conv.uom_symbol}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          ${formatNumber(stock.average_cost / usdRate, 2)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-warning">
                          {formatMoney(stock.average_cost)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-success">
                          {formatMoney((productsList.find((p: Product) => p.id === stock.product_id)?.sale_price) || 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatMoney(stock.total_value)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {stock.is_below_minimum ? (
                            <Badge variant="danger">{t('low')}</Badge>
                          ) : stock.quantity === 0 ? (
                            <Badge variant="secondary">{t('outOfStock')}</Badge>
                          ) : (
                            <Badge variant="success">OK</Badge>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>

              {stockData?.data?.length === 0 && (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 mx-auto text-text-secondary opacity-50 mb-4" />
                  <p className="text-text-secondary">{t('productsNotFound')}</p>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <>
          {/* Search & Filter Panel */}
          <Card className="mb-4">
            <CardContent className="p-4 space-y-4">
              {/* Search Input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={movementSearchInput}
                    onChange={(e) => setMovementSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleMovementSearch()}
                    placeholder={t('Qidiruv: ') + '... (Olma, Kraska, ...)'}
                    className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg focus:outline-none focus:border-primary"
                  />
                  {movementSearchInput && (
                    <button
                      onClick={clearMovementSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={handleMovementSearch}
                  className="px-4"
                >
                  <Search className="w-4 h-4 mr-1" />
                  {t('search')}
                </Button>
              </div>

              {/* Active search indicator */}
              {movementSearch && (
                <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg text-sm">
                  <span className="text-blue-700">
                    🔍 Qidiruv: "<strong>{movementSearch}</strong>"
                  </span>
                  <button
                    onClick={clearMovementSearch}
                    className="ml-auto text-blue-600 hover:text-blue-800 text-xs"
                  >
                    Tozalash
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4">
                {/* Movement Type Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t('movementType')}:</span>
                  <div className="flex rounded-lg border overflow-hidden">
                    <button
                      onClick={() => { setMovementFilter('all'); setPage(1) }}
                      className={cn(
                        "px-3 py-1.5 text-sm",
                        movementFilter === 'all' ? 'bg-primary text-white' : 'hover:bg-gray-100'
                      )}
                    >
                      {t('all')}
                    </button>
                    <button
                      onClick={() => { setMovementFilter('income'); setPage(1) }}
                      className={cn(
                        "px-3 py-1.5 text-sm border-l",
                        movementFilter === 'income' ? 'bg-green-600 text-white' : 'hover:bg-gray-100'
                      )}
                    >
                      {t('incomeType')}
                    </button>
                    <button
                      onClick={() => { setMovementFilter('outcome'); setPage(1) }}
                      className={cn(
                        "px-3 py-1.5 text-sm border-l",
                        movementFilter === 'outcome' ? 'bg-red-600 text-white' : 'hover:bg-gray-100'
                      )}
                    >
                      {t('soldType')}
                    </button>
                  </div>
                </div>

                {/* Date Range */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t('date')}:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
                    className="h-9 px-3 text-sm border rounded-lg"
                  />
                  <span className="text-gray-500">—</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                    className="h-9 px-3 text-sm border rounded-lg"
                  />
                </div>

                {/* Clear Filters */}
                {(movementFilter !== 'all' || startDate || endDate) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMovementFilter('all')
                      setStartDate('')
                      setEndDate('')
                      setPage(1)
                    }}
                  >
                    {t('clearFilters')}
                  </Button>
                )}

                {/* Results count */}
                <div className="ml-auto text-sm text-gray-500">
                  {t('totalCount')}: {movementsData?.total || 0}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {loadingMovements ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : movementsData?.data && movementsData.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium">{t('date')}</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">{t('product')}</th>
                        <th className="px-4 py-3 text-right text-sm font-medium">{t('quantity')}</th>
                        <th className="px-4 py-3 text-right text-sm font-medium">{t('priceUsd')}</th>
                        <th className="px-4 py-3 text-right text-sm font-medium">{t('priceUzs')}</th>
                        <th className="px-4 py-3 text-right text-sm font-medium">{t('total')}</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">{t('documentNo')}</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">{t('supplier')}</th>
                        <th className="px-4 py-3 text-center text-sm font-medium">{t('movementType')}</th>
                        {isDirector && <th className="px-4 py-3 text-center text-sm font-medium">{t('actions')}</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {movementsData.data.map((movement: any) => {
                      const canEdit = ['purchase', 'adjustment_plus', 'adjustment_minus'].includes(movement.movement_type)
                      return (
                      <tr key={movement.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4 text-text-secondary" />
                            {formatDateTashkent(movement.created_at)}
                          </div>
                          <div className="text-xs text-text-secondary">
                            {formatTimeTashkent(movement.created_at)}
                          </div>
                          {movement.updated_at && movement.updated_by_name && (
                            <div className="text-xs text-warning mt-1 flex items-center gap-1">
                              <Pencil className="w-3 h-3" />
                              {movement.updated_by_name}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{movement.product_name}</p>
                          <p className="text-xs text-text-secondary">{movement.product_article || ''}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          <span className={['purchase', 'transfer_in', 'adjustment_plus', 'return_from_customer'].includes(movement.movement_type) ? 'text-success' : 'text-danger'}>
                            {['purchase', 'transfer_in', 'adjustment_plus', 'return_from_customer'].includes(movement.movement_type) ? '+' : '-'}{formatNumber(movement.quantity)} {movement.uom_symbol}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          ${formatNumber(movement.unit_price_usd || (movement.unit_price / (movement.exchange_rate || usdRate)), 2)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-warning">
                          {formatMoney(movement.unit_price)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatMoney(movement.total_price || movement.quantity * movement.unit_price)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {movement.document_number || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {movement.supplier_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={['purchase', 'transfer_in', 'adjustment_plus', 'return_from_customer'].includes(movement.movement_type) ? 'success' : 'danger'}>
                            {movement.movement_type === 'purchase' ? t('incomeType') :
                             movement.movement_type === 'sale' ? t('soldType') :
                             movement.movement_type === 'transfer_in' ? t('transferIn') :
                             movement.movement_type === 'transfer_out' ? t('transferOut') :
                             movement.movement_type === 'adjustment_plus' ? t('adjustmentPlus') :
                             movement.movement_type === 'adjustment_minus' ? t('adjustmentMinus') :
                             movement.movement_type === 'write_off' ? t('writeOff') : movement.movement_type}
                          </Badge>
                        </td>
                        {isDirector && (
                          <td className="px-4 py-3 text-center">
                            {canEdit ? (
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="p-1 h-8 w-8"
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
                                >
                                  <Pencil className="w-4 h-4 text-primary" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="p-1 h-8 w-8"
                                  onClick={() => setDeletingMovement({ id: movement.id, name: movement.product_name })}
                                >
                                  <Trash2 className="w-4 h-4 text-danger" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-text-secondary">-</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <History className="w-16 h-16 mx-auto text-text-secondary opacity-50 mb-4" />
                <p className="text-text-secondary">{t('movementHistoryNotFound')}</p>
              </div>
            )}
          </CardContent>
        </Card>
        </>
      )}

      {/* Pagination */}
      {((activeTab === 'stock' && stockData && stockData.total > 20) ||
        (activeTab === 'history' && movementsData && movementsData.total > 30)) && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</Button>
          <span className="px-4">{page}</span>
          <Button variant="outline" onClick={() => setPage(page + 1)}>{t('next')}</Button>
        </div>
      )}

      {/* Income Dialog */}
      <Dialog open={showIncomeDialog} onOpenChange={setShowIncomeDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-visible">
          <DialogHeader>
            <DialogTitle>{t('stockIncome')}</DialogTitle>
            <DialogDescription>{t('currentRateInfo')}: 1$ = {formatNumber(usdRate)} {t('sum')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Currency Selection */}
            <div className="flex items-center justify-center gap-2 p-2 bg-gray-100 rounded-pos">
              <span className="text-sm font-medium mr-2">{t('currency')}:</span>
              <div className="flex rounded-lg overflow-hidden border-2 border-border">
                <button
                  type="button"
                  onClick={() => setIncomeCurrency('USD')}
                  className={`px-4 py-2 font-bold text-sm transition-all ${
                    incomeCurrency === 'USD'
                      ? 'bg-primary text-white'
                      : 'bg-white text-text-secondary hover:bg-gray-50'
                  }`}
                >
                  $ USD
                </button>
                <button
                  type="button"
                  onClick={() => setIncomeCurrency('UZS')}
                  className={`px-4 py-2 font-bold text-sm transition-all ${
                    incomeCurrency === 'UZS'
                      ? 'bg-success text-white'
                      : 'bg-white text-text-secondary hover:bg-gray-50'
                  }`}
                >
                  UZS {t('sum')}
                </button>
              </div>
            </div>

            {/* Warehouse & Document & Supplier */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="font-medium">{t('warehouse')}</label>
                <select
                  {...register('warehouse_id', { valueAsNumber: true })}
                  className="w-full min-h-btn px-4 py-3 border-2 border-border rounded-pos"
                >
                  {warehouses?.map((wh: Warehouse) => (
                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="font-medium">{t('documentNo')}</label>
                <Input {...register('document_number')} placeholder={t('invoiceNo')} />
              </div>
              <div className="space-y-2">
                <label className="font-medium">Ta'minotchi</label>
                <select
                  value={selectedSupplierId}
                  onChange={e => {
                    const val = e.target.value
                    setSelectedSupplierId(val ? Number(val) : '')
                    if (val) {
                      const sup = suppliersList.find((s: any) => s.id === Number(val))
                      if (sup) setValue('supplier_name', sup.name)
                    } else {
                      setValue('supplier_name', '')
                    }
                  }}
                  className="w-full min-h-btn px-4 py-3 border-2 border-border rounded-pos"
                >
                  <option value="">Tanlang (ixtiyoriy)</option>
                  {suppliersList.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.current_debt > 0 ? ` (qarz: ${formatMoney(s.current_debt)})` : ''}
                    </option>
                  ))}
                </select>
                <input type="hidden" {...register('supplier_name')} />
              </div>
              <div className="space-y-2">
                <label className="font-medium">To'langan (ixtiyoriy)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={supplierPaidDisplay}
                  onChange={e => {
                    const n = parseFloat(e.target.value.replace(/\s/g, '')) || 0
                    setSupplierPaidDisplay(n > 0 ? formatInputNumber(n) : '')
                  }}
                  placeholder="0"
                  className="w-full min-h-btn px-4 py-3 border-2 border-border rounded-pos text-center font-bold text-green-600"
                  disabled={!selectedSupplierId}
                />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="font-medium">{t('productsLabel')}</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ product_id: 0, quantity: 1, uom_id: 1, unit_price_usd: 0, unit_price_uzs: 0 })}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  {t('add')}
                </Button>
              </div>

              <div className="border border-border rounded-pos overflow-visible">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-sm font-medium">{t('product')}</th>
                      <th className="px-3 py-2 text-center text-sm font-medium w-32">{t('quantity')}</th>
                      <th className="px-3 py-2 text-center text-sm font-medium w-24">{t('measureUnit')}</th>
                      <th className="px-3 py-2 text-center text-sm font-medium w-36">
                        {t('price')} {incomeCurrency === 'USD' ? '($)' : '(UZS)'}
                      </th>
                      <th className="px-3 py-2 text-right text-sm font-medium w-36">
                        {t('total')} {incomeCurrency === 'USD' ? '($)' : '(UZS)'}
                      </th>
                      {landedCosts.length > 0 && landedCosts.some(lc => lc.amount > 0) && (
                        <th className="px-3 py-2 text-right text-sm font-medium w-44 text-orange-600">
                          Landed narx (UZS)
                        </th>
                      )}
                      <th className="px-3 py-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fields.map((field, index) => {
                      const item = watchItems?.[index]
                      const itemTotal = incomeCurrency === 'USD'
                        ? (item?.quantity || 0) * (item?.unit_price_usd || 0)
                        : (item?.quantity || 0) * (item?.unit_price_uzs || 0)

                      // Landed cost preview hisoblash
                      const itemUzsCost = incomeCurrency === 'USD'
                        ? (item?.unit_price_usd || 0) * usdRate
                        : (item?.unit_price_uzs || 0)
                      const itemTotalValue = itemUzsCost * (item?.quantity || 0)

                      // Umumiy tovarlar summasi (UZS)
                      const allItemsTotalValue = (watchItems || []).reduce((sum: number, it: any) => {
                        const cost = incomeCurrency === 'USD'
                          ? (it?.unit_price_usd || 0) * usdRate
                          : (it?.unit_price_uzs || 0)
                        return sum + cost * (it?.quantity || 0)
                      }, 0)
                      const allItemsTotalQty = (watchItems || []).reduce((sum: number, it: any) => sum + (it?.quantity || 0), 0)

                      // Har bir taqsimlash usuli uchun extra cost hisoblash
                      let extraPerUnit = 0
                      if (landedCosts.length > 0 && (item?.quantity || 0) > 0) {
                        for (const lc of landedCosts) {
                          if (!lc.amount || lc.amount <= 0) continue
                          if (lc.allocation_method === 'by_value' && allItemsTotalValue > 0) {
                            const share = itemTotalValue / allItemsTotalValue
                            extraPerUnit += (lc.amount * share) / (item?.quantity || 1)
                          } else if (lc.allocation_method === 'by_weight' && allItemsTotalQty > 0) {
                            const share = (item?.quantity || 0) / allItemsTotalQty
                            extraPerUnit += (lc.amount * share) / (item?.quantity || 1)
                          } else if (lc.allocation_method === 'equal' && (watchItems || []).filter((it: any) => it?.product_id > 0).length > 0) {
                            const itemCount = (watchItems || []).filter((it: any) => it?.product_id > 0).length
                            extraPerUnit += (lc.amount / itemCount) / (item?.quantity || 1)
                          }
                        }
                      }
                      const landedUnitCost = itemUzsCost + extraPerUnit
                      const hasLandedCosts = landedCosts.length > 0 && landedCosts.some(lc => lc.amount > 0)

                      return (
                        <tr key={field.id}>
                          <td className="px-3 py-2 min-w-[200px]">
                            <input type="hidden" {...register(`items.${index}.product_id`, { valueAsNumber: true })} />
                            <ProductSearchSelect
                              products={productsList}
                              value={item?.product_id || 0}
                              onChange={(id) => setValue(`items.${index}.product_id`, id)}
                              loading={productsLoading}
                              placeholder={`${t('selectProduct')} (${productsList.length})`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              step="any"
                              {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                              className="text-center text-sm w-full"
                              placeholder="0"
                              onFocus={(e) => e.target.select()}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              {...register(`items.${index}.uom_id`, { valueAsNumber: true })}
                              className="w-full px-2 py-2 border border-border rounded text-sm"
                            >
                              {uoms.map((uom: any) => (
                                <option key={uom.id} value={uom.id}>{uom.symbol}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            {incomeCurrency === 'USD' ? (
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary font-bold">$</span>
                                <Input
                                  type="number"
                                  step="any"
                                  {...register(`items.${index}.unit_price_usd`, { valueAsNumber: true })}
                                  className="text-center text-sm pl-6 w-full"
                                  placeholder="0.00"
                                  onFocus={(e) => e.target.select()}
                                />
                              </div>
                            ) : (
                              <Input
                                type="number"
                                step="any"
                                {...register(`items.${index}.unit_price_uzs`, { valueAsNumber: true })}
                                className="text-center text-sm w-full"
                                placeholder="0"
                                onFocus={(e) => e.target.select()}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-success">
                            {incomeCurrency === 'USD'
                              ? `$${formatNumber(itemTotal, 2)}`
                              : formatMoney(itemTotal)
                            }
                          </td>
                          {hasLandedCosts && (
                            <td className="px-3 py-2 text-right">
                              {extraPerUnit > 0 && itemUzsCost > 0 ? (
                                <div>
                                  <div className="text-xs text-gray-400 line-through">{formatMoney(itemUzsCost)}</div>
                                  <div className="font-bold text-orange-600">{formatMoney(landedUnitCost)}</div>
                                  <div className="text-xs text-orange-500">+{formatMoney(extraPerUnit)}</div>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                              disabled={fields.length === 1}
                            >
                              <Trash2 className="w-4 h-4 text-danger" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="font-medium">{t('notes')}</label>
              <Input {...register('notes')} placeholder={t('additionalInfo')} />
            </div>

            {/* ===== LANDED COSTS / QO'SHIMCHA XARAJATLAR ===== */}
            <div className="space-y-3 border-2 border-dashed border-orange-200 rounded-pos p-4 bg-orange-50/30">
              <div className="flex justify-between items-center">
                <label className="font-medium flex items-center gap-2 text-orange-700">
                  <Wallet className="w-4 h-4" />
                  Qo'shimcha xarajatlar (Landed Cost)
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-orange-300 text-orange-600 hover:bg-orange-50"
                  onClick={() => setLandedCosts([...landedCosts, {
                    cost_type: 'transport',
                    description: '',
                    amount: 0,
                    allocation_method: 'by_value'
                  }])}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Xarajat qo'shish
                </Button>
              </div>

              {landedCosts.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">
                  Transport, yuk tushirish, bojxona va boshqa xarajatlarni qo'shing — tovar narxiga avtomatik taqsimlanadi
                </p>
              ) : (
                <div className="space-y-2">
                  {landedCosts.map((lc, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-white p-2 rounded-lg border border-orange-100">
                      {/* Cost Type */}
                      <div className="col-span-3">
                        {idx === 0 && <label className="text-xs text-gray-500 mb-1 block">Xarajat turi</label>}
                        <select
                          value={lc.cost_type}
                          onChange={e => {
                            const updated = [...landedCosts]
                            updated[idx].cost_type = e.target.value
                            setLandedCosts(updated)
                          }}
                          className="w-full h-9 px-2 border rounded-lg text-sm"
                        >
                          <option value="transport">🚛 Transport</option>
                          <option value="loading">📦 Yuk tushirish</option>
                          <option value="customs">🏛 Bojxona</option>
                          <option value="insurance">🛡 Sug'urta</option>
                          <option value="other">📝 Boshqa</option>
                        </select>
                      </div>

                      {/* Description */}
                      <div className="col-span-3">
                        {idx === 0 && <label className="text-xs text-gray-500 mb-1 block">Izoh</label>}
                        <input
                          type="text"
                          value={lc.description}
                          onChange={e => {
                            const updated = [...landedCosts]
                            updated[idx].description = e.target.value
                            setLandedCosts(updated)
                          }}
                          placeholder="Masalan: Toshkentdan yetkazish"
                          className="w-full h-9 px-2 border rounded-lg text-sm"
                        />
                      </div>

                      {/* Amount */}
                      <div className="col-span-2">
                        {idx === 0 && <label className="text-xs text-gray-500 mb-1 block">Summa (UZS)</label>}
                        <input
                          type="text"
                          inputMode="numeric"
                          value={lc.amount > 0 ? formatInputNumber(lc.amount) : ''}
                          onChange={e => {
                            const updated = [...landedCosts]
                            updated[idx].amount = parseFloat(e.target.value.replace(/\s/g, '')) || 0
                            setLandedCosts(updated)
                          }}
                          placeholder="0"
                          className="w-full h-9 px-2 border rounded-lg text-sm font-bold text-center text-orange-600"
                        />
                      </div>

                      {/* Allocation Method */}
                      <div className="col-span-3">
                        {idx === 0 && <label className="text-xs text-gray-500 mb-1 block">Taqsimlash usuli</label>}
                        <select
                          value={lc.allocation_method}
                          onChange={e => {
                            const updated = [...landedCosts]
                            updated[idx].allocation_method = e.target.value
                            setLandedCosts(updated)
                          }}
                          className="w-full h-9 px-2 border rounded-lg text-sm"
                        >
                          <option value="by_value">📊 Summaga nisbatan</option>
                          <option value="by_weight">⚖️ Miqdorga nisbatan</option>
                          <option value="equal">➗ Teng bo'lish</option>
                        </select>
                      </div>

                      {/* Delete */}
                      <div className="col-span-1 flex justify-center">
                        {idx === 0 && <label className="text-xs text-transparent mb-1 block">X</label>}
                        <button
                          type="button"
                          onClick={() => setLandedCosts(landedCosts.filter((_, i) => i !== idx))}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Landed costs total */}
                  <div className="flex justify-between items-center pt-2 border-t border-orange-200">
                    <span className="text-sm text-orange-700 font-medium">
                      Jami qo'shimcha xarajat:
                    </span>
                    <span className="text-lg font-bold text-orange-600">
                      {formatMoney(landedCosts.reduce((sum, lc) => sum + (lc.amount || 0), 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Total */}
            <div className={`p-4 rounded-pos ${incomeCurrency === 'USD' ? 'bg-gradient-to-r from-primary/10 to-success/10' : 'bg-gradient-to-r from-success/10 to-primary/10'}`}>
              <div className="flex justify-between items-center">
                {incomeCurrency === 'USD' ? (
                  <>
                    <div>
                      <p className="text-sm text-text-secondary">{t('totalUsd')}:</p>
                      <p className="text-pos-xl font-bold text-primary">${formatNumber(incomeTotalUsd, 2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-text-secondary">≈ {t('inUzs')}:</p>
                      <p className="text-pos-lg font-bold text-success">{formatMoney(incomeTotalUzs)}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-sm text-text-secondary">{t('totalUzs')}:</p>
                      <p className="text-pos-xl font-bold text-success">{formatMoney(incomeTotalUzs)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-text-secondary">≈ {t('inUsd')}:</p>
                      <p className="text-pos-lg font-bold text-primary">${formatNumber(incomeTotalUsd, 2)}</p>
                    </div>
                  </>
                )}
              </div>
              {landedCosts.length > 0 && landedCosts.some(lc => lc.amount > 0) && (
                <div className="mt-3 pt-3 border-t border-gray-200/50">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-orange-700">+ Qo'shimcha xarajatlar:</span>
                    <span className="font-bold text-orange-600">{formatMoney(landedCosts.reduce((s, lc) => s + (lc.amount || 0), 0))}</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="font-semibold">Yakuniy umumiy:</span>
                    <span className="font-bold text-lg">{formatMoney(incomeTotalUzs + landedCosts.reduce((s, lc) => s + (lc.amount || 0), 0))}</span>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowIncomeDialog(false); setIncomeCurrency('USD'); setLandedCosts([]); setSelectedSupplierId(''); setSupplierPaidDisplay(''); }}>{t('cancel')}</Button>
              <Button type="submit" variant="success" disabled={stockIncome.isPending}>
                {stockIncome.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-2" />}
                {t('saveIncome')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Movement Dialog (Director only) */}
      <Dialog open={!!editingMovement} onOpenChange={() => setEditingMovement(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-primary" />
              {t('editMovementTitle')}
            </DialogTitle>
            <DialogDescription>
              {editingMovement?.product_name}
            </DialogDescription>
          </DialogHeader>

          {editingMovement && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="font-medium text-sm">{t('quantity')}</label>
                  <Input
                    type="number"
                    step="any"
                    value={editingMovement.quantity}
                    onChange={(e) => setEditingMovement({...editingMovement, quantity: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-medium text-sm">{t('unit')}</label>
                  <select
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    value={editingMovement.uom_id}
                    onChange={(e) => {
                      const availableUoms = productUoms.length > 0 ? productUoms : uoms
                      const selectedUom = availableUoms.find((u: any) => u.uom_id === parseInt(e.target.value) || u.id === parseInt(e.target.value))
                      setEditingMovement({
                        ...editingMovement,
                        uom_id: parseInt(e.target.value),
                        uom_symbol: selectedUom?.uom_symbol || selectedUom?.symbol || ''
                      })
                    }}
                  >
                    {productUoms.length > 0 ? (
                      productUoms.map((uom: any) => (
                        <option key={uom.uom_id} value={uom.uom_id}>
                          {uom.uom_name} ({uom.uom_symbol}) - koef: {uom.conversion_factor}
                        </option>
                      ))
                    ) : (
                      uoms.map((uom: any) => (
                        <option key={uom.id} value={uom.id}>{uom.name} ({uom.symbol})</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="font-medium text-sm">{t('priceUsd')}</label>
                  <Input
                    type="number"
                    step="any"
                    value={editingMovement.unit_price_usd || ''}
                    onChange={(e) => setEditingMovement({
                      ...editingMovement,
                      unit_price_usd: parseFloat(e.target.value) || 0,
                      unit_price: (parseFloat(e.target.value) || 0) * usdRate
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-medium text-sm">{t('priceUzs')}</label>
                  <Input
                    type="number"
                    step="any"
                    value={editingMovement.unit_price}
                    onChange={(e) => setEditingMovement({...editingMovement, unit_price: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="font-medium text-sm">{t('documentNo')}</label>
                <Input
                  value={editingMovement.document_number}
                  onChange={(e) => setEditingMovement({...editingMovement, document_number: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="font-medium text-sm">{t('supplier')}</label>
                <Input
                  value={editingMovement.supplier_name}
                  onChange={(e) => setEditingMovement({...editingMovement, supplier_name: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="font-medium text-sm">{t('notes')}</label>
                <Input
                  value={editingMovement.notes}
                  onChange={(e) => setEditingMovement({...editingMovement, notes: e.target.value})}
                />
              </div>

              <div className="bg-warning/10 p-3 rounded-lg text-sm">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-warning mt-0.5" />
                  <p>{t('quantityChangeWarning')}</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMovement(null)}>{t('cancel')}</Button>
            <Button
              variant="primary"
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
            >
              {editMovement.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Movement Dialog (Director only) */}
      <Dialog open={!!deletingMovement} onOpenChange={() => { setDeletingMovement(null); setDeleteReason(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-danger">
              <Trash2 className="w-5 h-5" />
              {t('deleteMovementTitle')}
            </DialogTitle>
            <DialogDescription>
              <span className="font-semibold">{deletingMovement?.name}</span> {t('confirmDeleteMovement')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-danger/10 p-3 rounded-lg text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-danger mt-0.5" />
                <div>
                  <p className="font-medium text-danger">{t('attentionWarning')}</p>
                  <p>{t('deleteMovementWarning')}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-medium text-sm">{t('deleteReasonLabel')} *</label>
              <Input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={t('enterReasonRequired')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeletingMovement(null); setDeleteReason(''); }}>{t('cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => deletingMovement && deleteMovement.mutate({ id: deletingMovement.id, reason: deleteReason })}
              disabled={deleteMovement.isPending || !deleteReason.trim()}
            >
              {deleteMovement.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {t('delete')}
            </Button>
          </DialogFooter>
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