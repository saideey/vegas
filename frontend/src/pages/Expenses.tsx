import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Plus, Search, Wallet, Trash2, Edit, Download, Loader2,
  Calendar, Banknote, CreditCard, Building, Tag, TrendingDown, TrendingUp, DollarSign,
  PieChart, Filter
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Button, Input, Card, CardContent, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui'
import api from '@/services/api'
import { formatMoney, formatInputNumber, cn, formatDateTashkent, formatTimeTashkent } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'

interface ExpenseCategory {
  id: number
  name: string
  description?: string
}

interface ExpenseItem {
  id: number
  expense_date: string
  category_id?: number
  category_name: string
  amount: number
  payment_type: string
  description: string
  created_by_name?: string
  created_at: string
}

interface ExpenseFormData {
  expense_date: string
  category_id?: number
  amount: number
  payment_type: string
  description: string
}

interface CategoryFormData {
  name: string
  description?: string
}

const PAYMENT_TYPES = [
  { value: 'cash', label: 'Naqd', icon: Banknote },
  { value: 'card', label: 'Karta', icon: CreditCard },
  { value: 'transfer', label: "O'tkazma", icon: Building },
]

const PERIOD_OPTIONS = [
  { value: 'day', label: 'Bugun' },
  { value: 'week', label: 'Hafta' },
  { value: 'month', label: 'Oy' },
  { value: 'year', label: 'Yil' },
]

export default function ExpensesPage() {
  const queryClient = useQueryClient()
  const { t } = useLanguage()
  const today = new Date().toISOString().split('T')[0]

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null)
  const [amountDisplay, setAmountDisplay] = useState('')
  const [page, setPage] = useState(1)
  const [filterCategory, setFilterCategory] = useState<number | ''>('')
  const [filterStartDate, setFilterStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
  const [filterEndDate, setFilterEndDate] = useState(today)
  const [summaryPeriod, setSummaryPeriod] = useState('month')

  const { register, handleSubmit, reset, setValue, watch } = useForm<ExpenseFormData>({
    defaultValues: { payment_type: 'cash', expense_date: today }
  })

  const { register: registerCat, handleSubmit: handleCatSubmit, reset: resetCat } = useForm<CategoryFormData>()

  // ===== QUERIES =====
  const { data: categoriesData } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const res = await api.get('/expenses/categories')
      return res.data
    }
  })

  const { data: expensesData, isLoading } = useQuery({
    queryKey: ['expenses', page, filterCategory, filterStartDate, filterEndDate],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('per_page', '20')
      if (filterStartDate) params.set('start_date', filterStartDate)
      if (filterEndDate) params.set('end_date', filterEndDate)
      if (filterCategory) params.set('category_id', String(filterCategory))
      const res = await api.get(`/expenses?${params}`)
      return res.data
    }
  })

  const { data: summaryData } = useQuery({
    queryKey: ['expenses-summary', summaryPeriod, filterStartDate, filterEndDate],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('period', summaryPeriod)
      if (summaryPeriod === 'day' || summaryPeriod === 'week' || summaryPeriod === 'month' || summaryPeriod === 'year') {
        // Use period auto-calculation
      }
      const res = await api.get(`/expenses/summary?${params}`)
      return res.data?.data
    }
  })

  const categories: ExpenseCategory[] = categoriesData?.data || []
  const expenses: ExpenseItem[] = expensesData?.data || []
  const totalExpenses = expensesData?.total || 0
  const totalAmount = expensesData?.total_amount || 0

  // ===== MUTATIONS =====
  const createExpense = useMutation({
    mutationFn: async (data: ExpenseFormData) => {
      const res = await api.post('/expenses', data)
      return res.data
    },
    onSuccess: () => {
      toast.success('Chiqim yozildi!')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['expenses-summary'] })
      setShowAddDialog(false)
      setAmountDisplay('')
      reset({ payment_type: 'cash', expense_date: today })
      setEditingExpense(null)
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail; toast.error(Array.isArray(detail) ? detail.map((e: any) => e.msg || e).join(', ') : (typeof detail === 'string' ? detail : 'Xatolik yuz berdi'))
    }
  })

  const updateExpense = useMutation({
    mutationFn: async (data: ExpenseFormData & { id: number }) => {
      const { id, ...rest } = data
      const res = await api.put(`/expenses/${id}`, rest)
      return res.data
    },
    onSuccess: () => {
      toast.success('Chiqim yangilandi!')
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['expenses-summary'] })
      setShowAddDialog(false)
      setAmountDisplay('')
      reset({ payment_type: 'cash', expense_date: today })
      setEditingExpense(null)
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail; toast.error(Array.isArray(detail) ? detail.map((e: any) => e.msg || e).join(', ') : (typeof detail === 'string' ? detail : 'Xatolik yuz berdi'))
    }
  })

  const deleteExpense = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/expenses/${id}`)
      return res.data
    },
    onSuccess: () => {
      toast.success("Chiqim o'chirildi!")
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['expenses-summary'] })
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail; toast.error(Array.isArray(detail) ? detail.map((e: any) => e.msg || e).join(', ') : (typeof detail === 'string' ? detail : 'Xatolik yuz berdi'))
    }
  })

  const createCategory = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      const res = await api.post('/expenses/categories', data)
      return res.data
    },
    onSuccess: () => {
      toast.success('Kategoriya yaratildi!')
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
      setShowCategoryDialog(false)
      resetCat()
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail; toast.error(Array.isArray(detail) ? detail.map((e: any) => e.msg || e).join(', ') : (typeof detail === 'string' ? detail : 'Xatolik yuz berdi'))
    }
  })

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/expenses/categories/${id}`)
      return res.data
    },
    onSuccess: () => {
      toast.success("Kategoriya o'chirildi!")
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] })
    }
  })

  // ===== HANDLERS =====
  const onSubmit = (data: ExpenseFormData) => {
    // Clean data - convert empty strings to proper values
    const cleanData = {
      ...data,
      category_id: data.category_id ? Number(data.category_id) : undefined,
      amount: Number(data.amount) || 0,
    }
    if (editingExpense) {
      updateExpense.mutate({ ...cleanData, id: editingExpense.id })
    } else {
      createExpense.mutate(cleanData)
    }
  }

  const handleEditClick = (expense: ExpenseItem) => {
    setEditingExpense(expense)
    setValue('expense_date', expense.expense_date)
    setValue('category_id', expense.category_id || undefined)
    setValue('amount', expense.amount)
    setValue('payment_type', expense.payment_type)
    setValue('description', expense.description)
    setAmountDisplay(formatInputNumber(expense.amount))
    setShowAddDialog(true)
  }

  const handleDeleteClick = (id: number) => {
    if (confirm("Chiqimni o'chirishni tasdiqlaysizmi?")) {
      deleteExpense.mutate(id)
    }
  }

  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      if (filterStartDate) params.set('start_date', filterStartDate)
      if (filterEndDate) params.set('end_date', filterEndDate)
      const res = await api.get(`/expenses/export?${params}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `chiqimlar_${filterStartDate}_${filterEndDate}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Excel yuklab olindi!')
    } catch {
      toast.error('Yuklab olishda xatolik')
    }
  }

  const paymentLabel = (type: string) => {
    const labels: Record<string, string> = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma" }
    return labels[type] || type
  }

  const totalPages = Math.ceil(totalExpenses / 20)

  return (
    <div className="space-y-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Wallet className="w-5 h-5 text-orange-500" />
          Chiqimlar
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCategoryDialog(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-semibold text-gray-600 active:scale-95 transition-all">
            <Tag className="w-4 h-4" />
            <span className="hidden sm:inline">Kategoriyalar</span>
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-green-400 text-green-700 text-sm font-semibold active:scale-95 transition-all">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button onClick={() => {
            setEditingExpense(null)
            setAmountDisplay('')
            reset({ payment_type: 'cash', expense_date: today })
            setShowAddDialog(true)
          }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold active:scale-95 transition-all">
            <Plus className="w-4 h-4" />
            Chiqim
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      {summaryData && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-red-100 rounded-xl">
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
              <span className="text-xs text-gray-500">Chiqimlar</span>
            </div>
            <p className="text-base font-bold text-red-600 truncate">{formatMoney(summaryData.total_expenses)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-blue-100 rounded-xl">
                <TrendingUp className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs text-gray-500">Yalpi foyda</span>
            </div>
            <p className="text-base font-bold text-blue-600 truncate">{formatMoney(summaryData.gross_profit)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-green-100 rounded-xl">
                <DollarSign className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-xs text-gray-500">Sof foyda</span>
            </div>
            <p className={cn("text-base font-bold truncate", summaryData.net_profit >= 0 ? "text-green-600" : "text-red-600")}>
              {formatMoney(summaryData.net_profit)}
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-purple-100 rounded-xl">
                <PieChart className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-xs text-gray-500">Davr</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {PERIOD_OPTIONS.map(p => (
                <button key={p.value} onClick={() => setSummaryPeriod(p.value)}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded-lg font-medium transition-all active:scale-95",
                    summaryPeriod === p.value ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-500"
                  )}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Category breakdown chips ── */}
      {summaryData?.categories && summaryData.categories.length > 0 && (
        <div className="bg-white rounded-2xl border border-border p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            Kategoriyalar
          </p>
          <div className="flex flex-wrap gap-2">
            {summaryData.categories.map((cat: any) => (
              <button key={cat.id || 'other'}
                onClick={() => { setFilterCategory(cat.id || ''); setPage(1) }}
                className="flex items-center gap-1.5 bg-gray-50 border border-border rounded-xl px-2.5 py-1.5 active:scale-95 transition-all">
                <span className="text-xs font-medium">{cat.name}</span>
                <span className="text-xs font-bold text-red-600">{formatMoney(cat.total)}</span>
                <span className="text-xs text-gray-400">({cat.count})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-border p-3 shadow-sm space-y-2">
        <div className="flex items-center gap-2">
          <input type="date" value={filterStartDate}
            onChange={e => { setFilterStartDate(e.target.value); setPage(1) }}
            className="flex-1 h-10 px-3 border border-border rounded-xl text-sm focus:outline-none focus:border-orange-400" />
          <span className="text-gray-400 text-sm">—</span>
          <input type="date" value={filterEndDate}
            onChange={e => { setFilterEndDate(e.target.value); setPage(1) }}
            className="flex-1 h-10 px-3 border border-border rounded-xl text-sm focus:outline-none focus:border-orange-400" />
        </div>
        <div className="flex items-center gap-2">
          <select value={filterCategory}
            onChange={e => { setFilterCategory(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
            className="flex-1 h-10 px-3 border border-border rounded-xl text-sm bg-white focus:outline-none focus:border-orange-400">
            <option value="">Barcha kategoriyalar</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="text-right">
            <p className="text-xs text-gray-400">{totalExpenses} ta</p>
            <p className="text-sm font-bold text-red-600 whitespace-nowrap">{formatMoney(totalAmount)}</p>
          </div>
        </div>
      </div>

      {/* ── Expenses List ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Wallet className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">Chiqimlar topilmadi</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((e) => (
            <div key={e.id} className="bg-white rounded-2xl border border-l-4 border-l-orange-400 border-border shadow-sm p-3">
              {/* Row 1: category + amount + actions */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg font-medium">
                      {e.category_name}
                    </span>
                    <span className="text-xs text-gray-400">{paymentLabel(e.payment_type)}</span>
                  </div>
                  <p className="text-base font-bold text-red-600 mt-1">{formatMoney(e.amount)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleEditClick(e)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl border border-blue-200 text-blue-600 active:bg-blue-50">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteClick(e.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-200 text-danger active:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* Row 2: description + date + author */}
              {e.description && (
                <p className="text-sm text-gray-600 mt-1.5 leading-snug">{e.description}</p>
              )}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                <span>{formatDateTashkent(e.created_at)} · {formatTimeTashkent(e.created_at)}</span>
                {e.created_by_name && <span>· {e.created_by_name}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-2xl border border-border px-4 py-3 shadow-sm">
          <span className="text-sm text-gray-500">{page} / {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium disabled:opacity-40 active:bg-gray-100">
              ← Oldingi
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-4 py-2 rounded-xl border border-border text-sm font-medium disabled:opacity-40 active:bg-gray-100">
              Keyingi →
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="w-full max-w-md h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-2xl">

          {/* Fixed header */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-orange-100 rounded-2xl">
                <Wallet className="w-4 h-4 text-orange-600" />
              </div>
              <h2 className="text-base font-bold">
                {editingExpense ? "Chiqimni tahrirlash" : "Chiqim yozish"}
              </h2>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

              {/* Summa — eng muhim, birinchi */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Summa *</label>
                <input
                  type="text" inputMode="numeric"
                  value={amountDisplay}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\s/g, '')
                    const num = parseFloat(raw) || 0
                    setAmountDisplay(num > 0 ? formatInputNumber(num) : '')
                    setValue('amount', num)
                  }}
                  placeholder="0"
                  className="w-full h-16 px-4 text-2xl font-bold text-center border-2 border-orange-200 rounded-2xl focus:border-orange-500 outline-none text-red-600 bg-red-50"
                />
              </div>

              {/* Sana + Kategoriya */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Sana *</label>
                  <input type="date"
                    {...register('expense_date', { required: true })}
                    className="w-full h-11 px-3 border border-border rounded-xl text-sm focus:outline-none focus:border-orange-400"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Kategoriya</label>
                  <select {...register('category_id')}
                    className="w-full h-11 px-3 border border-border rounded-xl text-sm bg-white focus:outline-none focus:border-orange-400">
                    <option value="">Tanlang...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* To'lov turi */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">To'lov turi</label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_TYPES.map((pt) => (
                    <label key={pt.value} className="cursor-pointer">
                      <input type="radio" {...register('payment_type')} value={pt.value} className="sr-only peer" />
                      <div className="flex flex-col items-center gap-1.5 p-3 border-2 border-border rounded-2xl peer-checked:border-orange-500 peer-checked:bg-orange-50 transition-all active:scale-95">
                        <pt.icon className="w-5 h-5" />
                        <span className="text-xs font-medium">{pt.label}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Izoh */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Izoh / sabab *</label>
                <textarea
                  {...register('description', { required: true })}
                  placeholder="Masalan: Iyul oyi arenda to'lovi..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm border border-border rounded-2xl focus:outline-none focus:border-orange-400 resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1 pb-2">
                <button type="button"
                  onClick={() => { setShowAddDialog(false); setEditingExpense(null) }}
                  className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
                  Bekor
                </button>
                <button type="submit"
                  disabled={createExpense.isPending || updateExpense.isPending}
                  className="flex-1 h-12 rounded-2xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                  {(createExpense.isPending || updateExpense.isPending)
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Saqlanmoqda...</>
                    : <><Wallet className="w-4 h-4" />{editingExpense ? "Saqlash" : "Yozish"}</>}
                </button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Categories Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="w-full max-w-sm h-[100dvh] sm:h-auto sm:max-h-[80vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-2xl">

          {/* Header */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-orange-100 rounded-2xl">
                <Tag className="w-4 h-4 text-orange-600" />
              </div>
              <h2 className="text-base font-bold">Kategoriyalar</h2>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Existing categories */}
            <div className="space-y-2">
              {categories.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Hali kategoriyalar yo'q</p>
              ) : (
                categories.map(c => (
                  <div key={c.id}
                    className="flex items-center justify-between p-3 bg-gray-50 border border-border rounded-2xl">
                    <div>
                      <p className="text-sm font-semibold">{c.name}</p>
                      {c.description && <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>}
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`"${c.name}" o'chirilsinmi?`)) {
                          deleteCategory.mutate(c.id)
                        }
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-200 text-danger active:bg-red-50 flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add new */}
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Yangi kategoriya</p>
              <form onSubmit={handleCatSubmit((data) => createCategory.mutate(data))} className="space-y-3">
                <Input
                  {...registerCat('name', { required: true })}
                  placeholder="Kategoriya nomi..."
                  className="h-11"
                />
                <button type="submit" disabled={createCategory.isPending}
                  className="w-full h-12 rounded-2xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                  {createCategory.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Qo'shilmoqda...</>
                    : <><Plus className="w-4 h-4" />Kategoriya qo'shish</>}
                </button>
              </form>
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-4 pb-5 pt-3 border-t border-border">
            <button onClick={() => setShowCategoryDialog(false)}
              className="w-full h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
              Yopish
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
