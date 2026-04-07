import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { 
  Search, Plus, Edit2, Trash2, Package, Ruler, Link2,
  ChevronRight, Loader2, X, FolderPlus, Star, Check, AlertTriangle, Calculator
} from 'lucide-react'
import toast from 'react-hot-toast'
import { 
  Button, Input, Card, CardContent, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from '@/components/ui'
import { productsService } from '@/services'
import api from '@/services/api'
import { formatMoney, formatNumber, formatInputNumber, cn } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'
import type { Product, Category, UnitOfMeasure, UOMConversion } from '@/types'

interface ProductFormData {
  name: string
  article?: string
  barcode?: string
  category_id?: number
  base_uom_id: number
  sale_price: number  // UZS da sotish narxi
  vip_price?: number  // UZS da VIP narx
  color?: string
  is_favorite?: boolean
  min_stock_level?: number
  default_per_piece?: number  // Kalkulyator standart qiymat
  use_calculator?: boolean  // Kassada kalkulyator ko'rsatish
}

interface UOMConversionFormData {
  from_uom_id: number
  to_uom_id: number
  factor: number
  sale_price?: number
}

interface CategoryFormData {
  name: string
}

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const { t } = useLanguage()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showUOMDialog, setShowUOMDialog] = useState(false)
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [showEditCategoryDialog, setShowEditCategoryDialog] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [colorValue, setColorValue] = useState('#3B82F6')

  // Price display states (formatted with spaces)
  const [salePriceDisplay, setSalePriceDisplay] = useState('')
  const [vipPriceDisplay, setVipPriceDisplay] = useState('')

  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors } } = useForm<ProductFormData>()
  const { register: registerUOM, handleSubmit: handleUOMSubmit, reset: resetUOM } = useForm<UOMConversionFormData>()

  // Watch color field
  const watchedColor = watch('color')

  // Sync color value
  useEffect(() => {
    if (watchedColor) {
      setColorValue(watchedColor)
    }
  }, [watchedColor])

  // Fetch products
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', searchQuery, selectedCategory, page],
    queryFn: () => productsService.getProducts({
      q: searchQuery || undefined,
      category_id: selectedCategory || undefined,
      page,
      per_page: 20,
    }),
  })

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: productsService.getCategories,
  })

  // Fetch UOMs
  const { data: uomsResponse } = useQuery({
    queryKey: ['uoms'],
    queryFn: productsService.getUOMs,
  })
  const uoms: UnitOfMeasure[] = Array.isArray(uomsResponse) ? uomsResponse : []

  // Fetch product UOM conversions
  const { data: productUOMsData } = useQuery({
    queryKey: ['product-uoms', selectedProduct?.id],
    queryFn: async () => {
      if (!selectedProduct) return null
      const response = await api.get(`/products/${selectedProduct.id}/uom-conversions`)
      return response.data
    },
    enabled: !!selectedProduct,
  })

  // Create product
  const createProduct = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const response = await api.post('/products', {
        name: data.name,
        article: data.article,
        barcode: data.barcode,
        category_id: data.category_id,
        base_uom_id: data.base_uom_id,
        cost_price: 0, // Kelish narxi omborga kirim qilganda aniqlanadi
        sale_price: data.sale_price,  // UZS da sotish narxi
        vip_price: data.vip_price || null,  // UZS da VIP narx
        color: data.color,
        is_favorite: data.is_favorite || false,
        min_stock_level: data.min_stock_level || 0,
        default_per_piece: (data.default_per_piece && !isNaN(data.default_per_piece)) ? data.default_per_piece : null,
        use_calculator: data.use_calculator || false,
        uom_conversions: []
      })
      return response.data
    },
    onSuccess: () => {
      toast.success(t('productSaved'))
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products-pos'] })
      setShowAddDialog(false)
      reset()
      setSalePriceDisplay('')
      setVipPriceDisplay('')
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

  // Update product
  const updateProduct = useMutation({
    mutationFn: async (data: ProductFormData) => {
      if (!editingProduct) return
      const response = await api.patch(`/products/${editingProduct.id}`, {
        name: data.name,
        article: data.article,
        barcode: data.barcode,
        category_id: data.category_id,
        base_uom_id: data.base_uom_id,  // Asosiy o'lchov birligi
        sale_price: data.sale_price,  // UZS da sotish narxi
        vip_price: data.vip_price || null,  // UZS da VIP narx
        color: data.color,
        is_favorite: data.is_favorite,
        min_stock_level: data.min_stock_level,
        default_per_piece: (data.default_per_piece && !isNaN(data.default_per_piece)) ? data.default_per_piece : null,
        use_calculator: data.use_calculator || false,
      })
      return response.data
    },
    onSuccess: () => {
      toast.success(t('productUpdated'))
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['products-pos'] })
      setShowAddDialog(false)
      setEditingProduct(null)
      reset()
      setSalePriceDisplay('')
      setVipPriceDisplay('')
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

  // Add UOM conversion
  const addUOMConversion = useMutation({
    mutationFn: async (data: UOMConversionFormData) => {
      if (!selectedProduct) return
      // Send universal conversion data to backend
      const response = await api.post(`/products/${selectedProduct.id}/uom-conversions`, {
        from_uom_id: data.from_uom_id,
        to_uom_id: data.to_uom_id,
        factor: data.factor,
        sale_price: data.sale_price || null
      })
      return response.data
    },
    onSuccess: () => {
      toast.success(t('uomAdded'))
      queryClient.invalidateQueries({ queryKey: ['product-uoms', selectedProduct?.id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      resetUOM()
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

  // Delete UOM conversion
  const deleteUOMConversion = useMutation({
    mutationFn: async (conversionId: number) => {
      if (!selectedProduct) return
      await api.delete(`/products/${selectedProduct.id}/uom-conversions/${conversionId}`)
    },
    onSuccess: () => {
      toast.success(t('uomDeleted'))
      queryClient.invalidateQueries({ queryKey: ['product-uoms', selectedProduct?.id] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
    },
  })

  // Delete product
  const deleteProduct = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/products/${id}`)
    },
    onSuccess: () => {
      toast.success(t('productDeleted'))
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
    },
  })

  // Create category
  const createCategory = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post('/products/categories', { name })
      return response.data
    },
    onSuccess: () => {
      toast.success(t('categoryAdded'))
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setShowCategoryDialog(false)
      setCategoryName('')
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

  // Update category
  const updateCategory = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const response = await api.patch(`/products/categories/${id}`, { name })
      return response.data
    },
    onSuccess: () => {
      toast.success(t('categoryUpdated'))
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      setShowEditCategoryDialog(false)
      setEditingCategory(null)
      setEditCategoryName('')
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
    },
  })

  // Delete category
  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/products/categories/${id}`)
    },
    onSuccess: () => {
      toast.success(t('categoryDeleted'))
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      if (selectedCategory === editingCategory?.id) {
        setSelectedCategory(null)
      }
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : t('categoryHasProducts'))
    },
  })

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category)
    setEditCategoryName(category.name)
    setShowEditCategoryDialog(true)
  }

  const onSubmit = (data: ProductFormData) => {
    if (editingProduct) {
      updateProduct.mutate(data)
    } else {
      createProduct.mutate(data)
    }
  }

  const onUOMSubmit = (data: UOMConversionFormData) => {
    addUOMConversion.mutate(data)
  }

  const handleEdit = (product: Product) => {
    setEditingProduct(product)
    setValue('name', product.name)
    setValue('article', product.article || '')
    setValue('barcode', product.barcode || '')
    setValue('category_id', product.category_id)
    setValue('base_uom_id', product.base_uom_id)
    setValue('sale_price', product.sale_price || 0)
    setValue('vip_price', product.vip_price || undefined)
    setSalePriceDisplay(formatInputNumber(product.sale_price || 0))
    setVipPriceDisplay(formatInputNumber(product.vip_price || 0))
    setValue('min_stock_level', product.min_stock_level || 0)
    setValue('color', product.color || '#3B82F6')
    setColorValue(product.color || '#3B82F6')
    setValue('is_favorite', product.is_favorite || false)
    setValue('default_per_piece', product.default_per_piece || '')
    setValue('use_calculator', product.use_calculator || false)
    setShowAddDialog(true)
  }

  const handleOpenUOMDialog = (product: Product) => {
    setSelectedProduct(product)
    setShowUOMDialog(true)
  }

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">{t('products')}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCategoryDialog(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-blue-300 text-blue-700 text-sm font-semibold active:scale-95 transition-all"
          >
            <FolderPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Kategoriya</span>
          </button>
          <button
            onClick={() => { setEditingProduct(null); reset(); setSalePriceDisplay(''); setVipPriceDisplay(''); setShowAddDialog(true) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            Qo'shish
          </button>
        </div>
      </div>

      {/* ── Search + Category Filter ── */}
      <div className="bg-white rounded-2xl border border-border p-3 space-y-2 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Mahsulot qidirish..."
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {/* Category chips */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95",
              selectedCategory === null
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-600"
            )}
          >
            Barchasi
          </button>
          {categories?.map((cat: Category) => (
            <div key={cat.id} className={cn(
              "flex items-center gap-1 rounded-xl text-xs font-semibold transition-all",
              selectedCategory === cat.id
                ? "bg-primary/10 border border-primary/30"
                : "bg-gray-100"
            )}>
              <button
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                className="px-2.5 py-1.5"
              >
                {cat.name}
              </button>
              <button
                onClick={() => handleEditCategory(cat)}
                className="pr-1 py-1.5 text-blue-500 active:opacity-70"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => { if (confirm(`"${cat.name}" o'chirilsinmi?`)) deleteCategory.mutate(cat.id) }}
                className="pr-2 py-1.5 text-red-400 active:opacity-70"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Products List ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : productsData?.data && productsData.data.length > 0 ? (
        <div className="space-y-2">
          {productsData.data.map((product: Product) => {
            const stock = product.current_stock || 0
            const stockColor = stock <= 0 ? "text-danger" : stock < 10 ? "text-warning" : "text-success"
            const stockBg = stock <= 0 ? "bg-red-50 border-red-100" : stock < 10 ? "bg-orange-50 border-orange-100" : "bg-green-50 border-green-100"
            return (
              <div key={product.id} className="bg-white rounded-2xl border border-border shadow-sm p-3">
                {/* Row 1: color dot + name + star + actions */}
                <div className="flex items-start gap-2">
                  {product.color && (
                    <div className="w-3 h-3 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: product.color }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-bold text-sm leading-tight">{product.name}</span>
                      {product.is_favorite && <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />}
                      {product.category_name && (
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded-md text-xs text-gray-500">{product.category_name}</span>
                      )}
                    </div>
                    {product.article && (
                      <p className="text-xs text-gray-400 mt-0.5">Art: {product.article}</p>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleOpenUOMDialog(product)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border border-blue-200 text-blue-500 active:bg-blue-50"
                      title="O'lchov birliklari"
                    >
                      <Link2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEdit(product)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border border-border text-gray-500 active:bg-gray-100"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { if (confirm(t('confirmDelete'))) deleteProduct.mutate(product.id) }}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-200 text-danger active:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Row 2: prices + stock + UOMs */}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  {/* Sale price */}
                  <div className="flex items-center gap-1 bg-green-50 border border-green-100 rounded-xl px-2.5 py-1.5">
                    <span className="text-xs text-gray-500">Narx:</span>
                    <span className="text-sm font-bold text-success whitespace-nowrap">{formatMoney(product.sale_price)}</span>
                  </div>
                  {/* VIP price */}
                  {product.vip_price && product.vip_price > 0 && (
                    <div className="flex items-center gap-1 bg-purple-50 border border-purple-100 rounded-xl px-2.5 py-1.5">
                      <span className="text-xs text-gray-500">VIP:</span>
                      <span className="text-sm font-bold text-purple-600 whitespace-nowrap">{formatMoney(product.vip_price)}</span>
                    </div>
                  )}
                  {/* Stock */}
                  <div className={cn("flex items-center gap-1 border rounded-xl px-2.5 py-1.5", stockBg)}>
                    <span className="text-xs text-gray-500">Qoldiq:</span>
                    <span className={cn("text-sm font-bold whitespace-nowrap", stockColor)}>
                      {formatNumber(stock)} {product.base_uom_symbol}
                    </span>
                  </div>
                  {/* UOM badges */}
                  {product.uom_conversions && product.uom_conversions.length > 0 && (
                    <div className="flex gap-1">
                      {product.uom_conversions.map((conv) => (
                        <span key={conv.uom_id} className="px-2 py-1 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-600 font-medium">
                          {conv.uom_symbol}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-text-secondary">
          <Package className="w-16 h-16 mb-4 opacity-50" />
          <p>{t('noProductsFound')}</p>
        </div>
      )}

      {/* Pagination */}
      {productsData && productsData.total > 20 && (
        <div className="flex items-center justify-between bg-white rounded-2xl border border-border px-4 py-3 shadow-sm">
          <p className="text-sm text-text-secondary">
            Jami: {productsData.total} ta
          </p>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium disabled:opacity-40 active:bg-gray-100"
            >
              ← Oldingi
            </button>
            <button
              disabled={page * 20 >= productsData.total}
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium disabled:opacity-40 active:bg-gray-100"
            >
              Keyingi →
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Product Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open)
        if (!open) {
          setSalePriceDisplay('')
          setVipPriceDisplay('')
          setEditingProduct(null)
          reset()
        }
      }}>
        <DialogContent className="w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-2xl">
          {/* Fixed header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
            <h2 className="text-base font-bold">
              {editingProduct ? "Mahsulotni tahrirlash" : "Yangi mahsulot"}
            </h2>
          </div>

          {/* Scrollable form */}
          <div className="flex-1 overflow-y-auto">
            <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
              <input type="hidden" {...register('sale_price', { valueAsNumber: true })} />
              <input type="hidden" {...register('vip_price', { valueAsNumber: true })} />

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Nomi *</label>
                <Input {...register('name', { required: true })} placeholder="Mahsulot nomi" className="h-11" />
              </div>

              {/* Article + Barcode */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Artikul</label>
                  <Input {...register('article')} placeholder="Art-001" className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Shtrix-kod</label>
                  <Input {...register('barcode')} placeholder="0000000" className="h-11" />
                </div>
              </div>

              {/* Category + Base UOM */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Kategoriya</label>
                  <select
                    {...register('category_id', { valueAsNumber: true })}
                    className="w-full h-11 px-3 border border-border rounded-xl text-sm bg-white"
                  >
                    <option value="">Tanlanmagan</option>
                    {categories?.map((cat: Category) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Asosiy o'lchov *</label>
                  <select
                    {...register('base_uom_id', { required: true, valueAsNumber: true })}
                    className="w-full h-11 px-3 border border-border rounded-xl text-sm bg-white"
                  >
                    <option value="">Tanlang</option>
                    {uoms.map((uom) => (
                      <option key={uom.id} value={uom.id}>{uom.name} ({uom.symbol})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Prices */}
              <div className="bg-green-50 border border-green-100 rounded-2xl p-3 space-y-3">
                <p className="text-sm font-semibold text-green-800">💰 Narxlar</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">Sotish narxi *</label>
                    <div className="relative">
                      <Input
                        type="text"
                        value={salePriceDisplay}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\s/g, '')
                          const num = parseFloat(raw) || 0
                          setValue('sale_price', num)
                          setSalePriceDisplay(formatInputNumber(num))
                        }}
                        placeholder="0"
                        className="h-11 pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">so'm</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600">VIP narxi</label>
                    <div className="relative">
                      <Input
                        type="text"
                        value={vipPriceDisplay}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\s/g, '')
                          const num = parseFloat(raw) || 0
                          setValue('vip_price', num)
                          setVipPriceDisplay(formatInputNumber(num))
                        }}
                        placeholder="0"
                        className="h-11 pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">so'm</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Calculator toggle */}
              <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3">
                <label className="flex items-center justify-between cursor-pointer gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-violet-100 rounded-xl">
                      <Calculator className="w-4 h-4 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-violet-800">Kalkulyator rejimi</p>
                      <p className="text-xs text-violet-500">Kassada dona × o'lcham hisoblash</p>
                    </div>
                  </div>
                  <div className="relative flex-shrink-0">
                    <input type="checkbox" {...register('use_calculator')} className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-violet-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                  </div>
                </label>
              </div>

              {/* Default per piece + min stock */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Standart o'lcham</label>
                  <div className="relative">
                    <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400" />
                    <Input type="number" step="0.01" {...register('default_per_piece', { valueAsNumber: true })} placeholder="12.5" className="h-11 pl-10" />
                  </div>
                  <p className="text-xs text-gray-400">{t('defaultPerPieceHint')}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Min zaxira</label>
                  <div className="relative">
                    <AlertTriangle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                    <Input type="number" step="0.01" {...register('min_stock_level', { valueAsNumber: true })} placeholder="10" className="h-11 pl-10" />
                  </div>
                  <p className="text-xs text-gray-400">{t('minStockHint')}</p>
                </div>
              </div>

              {/* Color + Favorite */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Rang</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={colorValue}
                      onChange={(e) => { setColorValue(e.target.value); setValue('color', e.target.value) }}
                      className="w-11 h-11 rounded-xl border border-border cursor-pointer p-1"
                    />
                    <Input
                      value={colorValue}
                      onChange={(e) => { setColorValue(e.target.value); setValue('color', e.target.value) }}
                      placeholder="#3B82F6"
                      className="flex-1 h-11"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Sevimli</label>
                  <label className="flex items-center gap-3 h-11 px-3 border border-border rounded-xl cursor-pointer">
                    <input type="checkbox" {...register('is_favorite')} className="w-5 h-5 rounded accent-yellow-500" />
                    <span className="text-sm text-gray-600 flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /> Sevimli
                    </span>
                  </label>
                </div>
              </div>

              <p className="text-xs text-gray-400 bg-blue-50 px-3 py-2 rounded-xl">
                💡 {t('costPriceHint')}
              </p>

              {/* Submit buttons */}
              <div className="flex gap-3 pt-1 pb-2">
                <button
                  type="button"
                  onClick={() => setShowAddDialog(false)}
                  className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50"
                >
                  Bekor
                </button>
                <button
                  type="submit"
                  disabled={createProduct.isPending || updateProduct.isPending}
                  className="flex-1 h-12 rounded-2xl bg-primary text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98]"
                >
                  {(createProduct.isPending || updateProduct.isPending) ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Saqlanmoqda...
                    </span>
                  ) : "Saqlash"}
                </button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* UOM Conversions Dialog */}
      <Dialog open={showUOMDialog} onOpenChange={setShowUOMDialog}>
        <DialogContent className="w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[85vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-2xl">
          {/* Header */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border">
            <h2 className="text-base font-bold">O'lchov birliklarini sozlash</h2>
            <p className="text-xs text-gray-500 mt-0.5">{selectedProduct?.name}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Existing units */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mavjud birliklar</p>
              {productUOMsData?.data?.map((conv: any) => {
                const ratio = conv.is_base ? 1 : (1 / conv.conversion_factor)
                return (
                  <div
                    key={conv.uom_id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-2xl",
                      conv.is_base
                        ? "bg-blue-50 border-2 border-primary"
                        : "bg-gray-50 border border-border"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-xl",
                        conv.is_base ? "bg-primary/10" : "bg-gray-100"
                      )}>
                        <Ruler className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{conv.uom_name}
                          <span className="ml-1 text-gray-400 font-normal">({conv.uom_symbol})</span>
                        </p>
                        {conv.is_base ? (
                          <span className="text-xs text-primary font-medium">Asosiy birlik</span>
                        ) : (
                          <span className="text-xs text-success font-medium">
                            1 {selectedProduct?.base_uom_symbol} = {formatNumber(ratio, 4)} {conv.uom_symbol}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {conv.sale_price > 0 && (
                        <span className="text-xs font-bold text-success bg-green-50 px-2 py-1 rounded-lg">
                          {formatMoney(conv.sale_price)}
                        </span>
                      )}
                      {!conv.is_base && conv.id && (
                        <button
                          onClick={() => deleteUOMConversion.mutate(conv.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-200 text-danger active:bg-red-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add new conversion */}
            <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Yangi birlik qo'shish</p>
              <form onSubmit={handleUOMSubmit(onUOMSubmit)} className="space-y-3">
                {/* Formula row */}
                <div className="bg-white rounded-xl p-3 space-y-2">
                  <p className="text-xs text-gray-500 font-medium">Formula: 1 [dan] = ? [ga]</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-primary">1</span>
                    <select
                      {...registerUOM('from_uom_id', { required: true, valueAsNumber: true })}
                      className="flex-1 h-10 px-2 border-2 border-primary rounded-xl text-sm bg-white font-medium"
                    >
                      <option value="">Dan birlik</option>
                      {productUOMsData?.data?.map((conv: any) => (
                        <option key={conv.uom_id} value={conv.uom_id}>
                          {conv.uom_symbol}
                        </option>
                      ))}
                    </select>
                    <span className="text-lg font-bold text-gray-400">=</span>
                    <Input
                      type="number"
                      step="0.0001"
                      {...registerUOM('factor', { required: true, valueAsNumber: true, min: 0.0001 })}
                      className="w-20 h-10 text-center font-bold text-lg border-2"
                      placeholder="?"
                    />
                    <select
                      {...registerUOM('to_uom_id', { required: true, valueAsNumber: true })}
                      className="flex-1 h-10 px-2 border-2 border-success rounded-xl text-sm bg-white font-medium"
                    >
                      <option value="">Ga birlik</option>
                      {uoms
                        .filter(u => !productUOMsData?.data?.find((c: any) => c.uom_id === u.id))
                        .map((uom) => (
                          <option key={uom.id} value={uom.id}>{uom.symbol}</option>
                        ))
                      }
                    </select>
                  </div>
                  <div className="text-xs text-gray-400 space-y-0.5 pt-1 border-t border-gray-100">
                    <p>Misol: 1 <b>tonna</b> = 52 <b>dona</b></p>
                    <p>Misol: 1 <b>dona</b> = 12 <b>metr</b></p>
                  </div>
                </div>

                {/* Optional price */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-600">Narxi (ixtiyoriy)</label>
                  <Input
                    type="number"
                    step="0.01"
                    {...registerUOM('sale_price', { valueAsNumber: true })}
                    placeholder="Avtomatik hisoblanadi"
                    className="h-11"
                  />
                </div>

                <button
                  type="submit"
                  disabled={addUOMConversion.isPending}
                  className="w-full h-12 bg-primary text-white rounded-2xl text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {addUOMConversion.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Qo'shilmoqda...</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Birlik qo'shish</>
                  )}
                </button>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('newCategory')}</DialogTitle>
            <DialogDescription>{t('enterCategoryName')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder={t('categoryName')}
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  if (categoryName.trim()) {
                    createCategory.mutate(categoryName.trim())
                  } else {
                    toast.error(t('enterCategoryName'))
                  }
                }}
                disabled={createCategory.isPending}
              >
                {createCategory.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {t('add')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog open={showEditCategoryDialog} onOpenChange={setShowEditCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editCategory')}</DialogTitle>
            <DialogDescription>{t('changeCategoryName')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder={t('categoryName')}
              value={editCategoryName}
              onChange={(e) => setEditCategoryName(e.target.value)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditCategoryDialog(false)}>
                {t('cancel')}
              </Button>
              <Button
                onClick={() => {
                  if (editCategoryName.trim() && editingCategory) {
                    updateCategory.mutate({ id: editingCategory.id, name: editCategoryName.trim() })
                  } else {
                    toast.error(t('enterCategoryName'))
                  }
                }}
                disabled={updateCategory.isPending}
              >
                {updateCategory.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                {t('save')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}