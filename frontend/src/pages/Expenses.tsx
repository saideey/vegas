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
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Wallet className="w-7 h-7 text-orange-500" />
            Chiqimlar
          </h1>
          <p className="text-sm text-gray-500 mt-1">Arenda, oylik, abed va boshqa xarajatlar</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCategoryDialog(true)}>
            <Tag className="w-4 h-4 mr-2" />
            Kategoriyalar
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Excel
          </Button>
          <Button onClick={() => {
            setEditingExpense(null)
            setAmountDisplay('')
            reset({ payment_type: 'cash', expense_date: today })
            setShowAddDialog(true)
          }}>
            <Plus className="w-4 h-4 mr-2" />
            Chiqim yozish
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summaryData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <TrendingDown className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Chiqimlar</p>
                  <p className="text-lg font-bold text-red-600">{formatMoney(summaryData.total_expenses)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Yalpi foyda</p>
                  <p className="text-lg font-bold text-blue-600">{formatMoney(summaryData.gross_profit)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Sof foyda</p>
                  <p className={cn("text-lg font-bold", summaryData.net_profit >= 0 ? "text-green-600" : "text-red-600")}>
                    {formatMoney(summaryData.net_profit)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <PieChart className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Davr</p>
                  <div className="flex gap-1 mt-1">
                    {PERIOD_OPTIONS.map(p => (
                      <button
                        key={p.value}
                        onClick={() => setSummaryPeriod(p.value)}
                        className={cn(
                          "px-2 py-0.5 text-xs rounded-full transition-colors",
                          summaryPeriod === p.value
                            ? "bg-purple-600 text-white"
                            : "bg-gray-100 hover:bg-gray-200"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Category breakdown */}
      {summaryData?.categories && summaryData.categories.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Kategoriyalar bo'yicha
            </h3>
            <div className="flex flex-wrap gap-2">
              {summaryData.categories.map((cat: any) => (
                <div key={cat.id || 'other'} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm">{cat.name}</span>
                  <span className="text-sm font-bold text-red-600">{formatMoney(cat.total)}</span>
                  <span className="text-xs text-gray-400">({cat.count})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Boshlanish</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={e => { setFilterStartDate(e.target.value); setPage(1) }}
                className="h-9 px-3 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tugash</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={e => { setFilterEndDate(e.target.value); setPage(1) }}
                className="h-9 px-3 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Kategoriya</label>
              <select
                value={filterCategory}
                onChange={e => { setFilterCategory(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
                className="h-9 px-3 border rounded-lg text-sm"
              >
                <option value="">Barchasi</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-gray-500">Jami ({totalExpenses} ta):</p>
              <p className="text-lg font-bold text-red-600">{formatMoney(totalAmount)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Wallet className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>Chiqimlar topilmadi</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Sana</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Kategoriya</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Summa</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">To'lov</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Izoh</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Kim yozdi</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">{formatDateTashkent(e.created_at)}</div>
                        <div className="text-xs text-gray-400">{formatTimeTashkent(e.created_at)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{e.category_name}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-red-600">{formatMoney(e.amount)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm">{paymentLabel(e.payment_type)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[250px]">
                        <div className="truncate" title={e.description}>{e.description}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{e.created_by_name || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEditClick(e)}
                            className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors text-blue-600"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(e.id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4 border-t">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                ←
              </button>
              <span className="text-sm text-gray-500">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
              >
                →
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Expense Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Chiqimni tahrirlash' : 'Chiqim yozish'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Sana *</label>
                <input
                  type="date"
                  {...register('expense_date', { required: true })}
                  className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg text-sm focus:border-orange-500 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Kategoriya</label>
                <select
                  {...register('category_id')}
                  className="w-full h-10 px-3 border-2 border-gray-200 rounded-lg text-sm focus:border-orange-500 outline-none"
                >
                  <option value="">Tanlang...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Summa *</label>
              <input
                type="text"
                inputMode="numeric"
                value={amountDisplay}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\s/g, '')
                  const num = parseFloat(raw) || 0
                  setAmountDisplay(num > 0 ? formatInputNumber(num) : '')
                  setValue('amount', num)
                }}
                placeholder="0"
                className="w-full h-12 px-3 text-lg font-bold text-center border-2 border-gray-200 rounded-lg focus:border-orange-500 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">To'lov turi</label>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_TYPES.map((pt) => (
                  <label key={pt.value} className="cursor-pointer">
                    <input type="radio" {...register('payment_type')} value={pt.value} className="sr-only peer" />
                    <div className="flex flex-col items-center gap-1 p-2 border-2 border-gray-200 rounded-lg peer-checked:border-orange-500 peer-checked:bg-orange-50 transition-colors">
                      <pt.icon className="w-4 h-4" />
                      <span className="text-xs">{pt.label}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Izoh / sabab *</label>
              <textarea
                {...register('description', { required: true })}
                placeholder="Masalan: Iyul oyi arenda to'lovi, Haydovchi oyligi..."
                rows={3}
                className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-orange-500 outline-none resize-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowAddDialog(false); setEditingExpense(null) }}
                className="flex-1 h-10 border-2 border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={createExpense.isPending || updateExpense.isPending}
                className="flex-1 h-10 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {(createExpense.isPending || updateExpense.isPending) ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wallet className="w-4 h-4" />
                )}
                {editingExpense ? 'Saqlash' : 'Yozish'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Categories Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Chiqim kategoriyalari</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Existing categories */}
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {categories.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Kategoriyalar yo'q</p>
              ) : (
                categories.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`"${c.name}" kategoriyasini o'chirishni tasdiqlaysizmi?`)) {
                          deleteCategory.mutate(c.id)
                        }
                      }}
                      className="p-1 hover:bg-red-50 rounded text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add new category */}
            <form onSubmit={handleCatSubmit((data) => createCategory.mutate(data))} className="border-t pt-4 space-y-3">
              <Input
                {...registerCat('name', { required: true })}
                placeholder="Yangi kategoriya nomi..."
                className="text-sm"
              />
              <button
                type="submit"
                disabled={createCategory.isPending}
                className="w-full h-9 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                {createCategory.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Kategoriya qo'shish
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
