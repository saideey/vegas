import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { 
  Search, Plus, Phone, CreditCard, User, Banknote, Calendar,
  ShoppingCart, Eye, Loader2, Building, Mail, MapPin, ChevronDown, ChevronRight, Download, Package, Edit, Trash2, AlertTriangle, Users, FileSpreadsheet, Tag, Settings2, X, Palette
} from 'lucide-react'
import toast from 'react-hot-toast'
import { 
  Button, Input, Card, CardContent, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from '@/components/ui'
import { customersService } from '@/services'
import api from '@/services/api'
import { formatMoney, formatNumber, formatPhone, formatInputNumber, cn, formatDateTashkent, formatTimeTashkent, formatDateTimeTashkent } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'
import { useAuthStore } from '@/stores/authStore'
import type { Customer, Sale, User as UserType } from '@/types'

interface CustomerFormData {
  name: string
  phone: string
  phone_secondary?: string
  telegram_id?: string
  company_name?: string
  email?: string
  address?: string
  customer_type: 'REGULAR' | 'VIP' | 'WHOLESALE'
  credit_limit?: number
  manager_id?: number  // Biriktirilgan kassir
  initial_debt_amount?: number      // Boshlang'ich qarz (UZS)
  initial_debt_amount_usd?: number  // Boshlang'ich qarz (USD)
  initial_debt_note?: string  // Qarz izohi
}

interface PaymentFormData {
  amount: number
  currency: string
  target_debt: string
  exchange_rate?: number
  payment_type: string
  description?: string
}

interface AddDebtFormData {
  amount: number
  currency: string
  description?: string
}

interface SaleItem {
  id: number
  product_name: string
  quantity: number
  uom_symbol: string
  unit_price: number
  total_price: number
  discount_amount: number
}

interface DebtRecord {
  id: number
  transaction_type: string
  currency?: string
  amount: number
  balance_before: number
  balance_after: number
  reference_type: string
  description: string
  created_by_name?: string
  created_at: string
}

export default function CustomersPage() {
  const queryClient = useQueryClient()
  const { t } = useLanguage()
  const currentUser = useAuthStore(s => s.user)
  const isDirector = currentUser?.role_type === 'director'
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterSellerId, setFilterSellerId] = useState<number | ''>('')
  const [showDebtorsOnly, setShowDebtorsOnly] = useState(false)
  const [filterCategoryId, setFilterCategoryId] = useState<number | ''>('')
  const [page, setPage] = useState(1)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [editingCategory, setEditingCategory] = useState<any>(null)
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '#6366f1' })
  const [categoryLoading, setCategoryLoading] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [showAddDebtDialog, setShowAddDebtDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null)
  const [saleItems, setSaleItems] = useState<Record<number, SaleItem[]>>({})
  const [loadingSaleItems, setLoadingSaleItems] = useState<number | null>(null)
  const [paymentAmountDisplay, setPaymentAmountDisplay] = useState('')
  const [paymentCurrency, setPaymentCurrency] = useState<'UZS'|'USD'>('UZS')
  const [paymentTargetDebt, setPaymentTargetDebt] = useState<'UZS'|'USD'>('UZS')
  const [debtAmountDisplay, setDebtAmountDisplay] = useState('')
  const [debtAmountUsdDisplay, setDebtAmountUsdDisplay] = useState('')
  const [addDebtAmountDisplay, setAddDebtAmountDisplay] = useState('')
  const [addDebtCurrency, setAddDebtCurrency] = useState<'UZS'|'USD'>('UZS')

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CustomerFormData>({
    defaultValues: { customer_type: 'REGULAR', credit_limit: 0 }
  })

  const { register: registerPayment, handleSubmit: handlePaymentSubmit, reset: resetPayment, setValue: setPaymentValue } = useForm<PaymentFormData>({
    defaultValues: { payment_type: 'CASH' }
  })

  const { register: registerAddDebt, handleSubmit: handleAddDebtSubmit, reset: resetAddDebt, setValue: setAddDebtValue } = useForm<AddDebtFormData>()

  // Fetch customers
  const { data: customersRaw, isLoading } = useQuery({
    queryKey: ['customers', searchQuery, filterType, filterSellerId, showDebtorsOnly, filterCategoryId, page],
    queryFn: () => customersService.getCustomers({
      q: searchQuery || undefined,
      customer_type: filterType || undefined,
      manager_id: filterSellerId || undefined,
      has_debt: showDebtorsOnly || undefined,
      category_id: filterCategoryId || undefined,
      page,
      per_page: 20,
    }),
  })

  // Fetch fresh USD debts for listed customers (bypass ORM cache)
  const { data: usdDebtsData } = useQuery({
    queryKey: ['customers-usd-debts', customersRaw?.data?.map((c: Customer) => c.id)],
    enabled: !!customersRaw?.data?.length,
    queryFn: async () => {
      const ids = customersRaw!.data!.map((c: Customer) => c.id)
      const res = await api.get('/customers/usd-debts', { params: { ids: ids.join(',') } })
      return res.data as Record<number, number>
    },
    staleTime: 0,
  })

  // Merge USD debts into customers list
  const customersData = customersRaw ? {
    ...customersRaw,
    data: customersRaw.data?.map((c: Customer) => ({
      ...c,
      current_debt_usd: usdDebtsData ? (usdDebtsData[c.id] ?? c.current_debt_usd ?? 0) : c.current_debt_usd ?? 0
    }))
  } : customersRaw

  // Fetch sellers (users who can be assigned to customers)
  const { data: sellersData } = useQuery({
    queryKey: ['sellers-list'],
    queryFn: async () => {
      const response = await api.get('/users/sellers')
      return response.data
    },
  })

  // Fetch customer categories
  const { data: categoriesData, refetch: refetchCategories } = useQuery({
    queryKey: ['customer-categories'],
    queryFn: async () => {
      const res = await api.get('/customers/categories')
      return res.data
    }
  })
  const categories: any[] = categoriesData?.data || []

  // Category CRUD handlers
  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) { toast.error("Kategoriya nomini kiriting"); return }
    setCategoryLoading(true)
    try {
      if (editingCategory) {
        await api.put(`/customers/categories/${editingCategory.id}`, categoryForm)
        toast.success("Kategoriya yangilandi")
      } else {
        await api.post('/customers/categories', categoryForm)
        toast.success("Kategoriya yaratildi")
      }
      await refetchCategories()
      setEditingCategory(null)
      setCategoryForm({ name: '', description: '', color: '#6366f1' })
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Xato")
    } finally { setCategoryLoading(false) }
  }

  const handleDeleteCategory = async (id: number) => {
    if (!confirm("Kategoriyani o'chirishni tasdiqlaysizmi?")) return
    try {
      await api.delete(`/customers/categories/${id}`)
      toast.success("O'chirildi")
      await refetchCategories()
      if (filterCategoryId === id) setFilterCategoryId('')
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Xato") }
  }

  const handleAssignCategory = async (customerId: number, catId: number | null) => {
    try {
      await api.patch(`/customers/${customerId}/category`, { category_id: catId })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success(catId ? "Kategoriya biriktirildi" : "Kategoriya olib tashlandi")
    } catch (e: any) { toast.error(e?.response?.data?.detail || "Xato") }
  }

  // Fetch USD exchange rate
  const { data: exchangeRateData } = useQuery({
    queryKey: ['exchange-rate'],
    queryFn: async () => {
      const res = await api.get('/settings/exchange-rate')
      return res.data
    },
    staleTime: 5 * 60 * 1000,
  })
  const usdRate = exchangeRateData?.usd_rate || 12800

  // Fetch debtors summary
  const { data: debtorsData } = useQuery({
    queryKey: ['debtors-summary'],
    queryFn: () => customersService.getDebtors(),
  })

  // Fetch customer sales
  const { data: customerSales, isLoading: loadingSales } = useQuery({
    queryKey: ['customer-sales', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer) return null
      const response = await api.get(`/sales?customer_id=${selectedCustomer.id}&per_page=100`)
      return response.data
    },
    enabled: !!selectedCustomer && showDetailDialog,
  })

  // Fetch customer debt history (with running balance)
  const { data: customerDebtHistory } = useQuery({
    queryKey: ['customer-debt-history', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer) return null
      const response = await api.get(`/customers/${selectedCustomer.id}/debt-history?per_page=100`)
      return response.data
    },
    enabled: !!selectedCustomer && showDetailDialog,
  })

  // Load sale items when expanding a row
  const loadSaleItems = async (saleId: number) => {
    if (saleItems[saleId]) {
      setExpandedSaleId(expandedSaleId === saleId ? null : saleId)
      return
    }

    setLoadingSaleItems(saleId)
    try {
      const response = await api.get(`/sales/${saleId}`)
      setSaleItems(prev => ({ ...prev, [saleId]: response.data.data.items }))
      setExpandedSaleId(saleId)
    } catch (error) {
      toast.error('Xatolik yuz berdi')
    } finally {
      setLoadingSaleItems(null)
    }
  }

  // Export ALL customer data to single professional Excel file
  const exportCustomerDataToExcel = async () => {
    if (!selectedCustomer) return

    try {
      toast.loading('Hisobot tayyorlanmoqda...')

      // Dynamic imports
      const ExcelJS = await import('exceljs')
      const { saveAs } = await import('file-saver')

      // Use already fetched data or fetch if not available
      let salesData = customerSales?.data || []
      let debtData = customerDebtHistory?.data || []

      // If data not available, fetch it
      if (salesData.length === 0) {
        try {
          const res = await api.get(`/sales?customer_id=${selectedCustomer.id}&per_page=200`)
          salesData = res.data?.data || []
        } catch (e) {
          console.log('Sales fetch failed', e)
        }
      }

      if (debtData.length === 0) {
        try {
          const res = await api.get(`/customers/${selectedCustomer.id}/debt-history`)
          debtData = res.data?.data || []
        } catch (e) {
          console.log('Debt fetch failed', e)
        }
      }

      // Fetch detailed items for each sale
      const salesWithItems = await Promise.all(
        salesData.map(async (sale: any) => {
          try {
            const response = await api.get(`/sales/${sale.id}`)
            return { ...sale, items: response.data?.data?.items || response.data?.items || [] }
          } catch {
            return { ...sale, items: [] }
          }
        })
      )

      // Create workbook
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Vegas'
      workbook.created = new Date()

      const ws = workbook.addWorksheet('Mijoz hisoboti', {
        pageSetup: { paperSize: 9, orientation: 'landscape' }
      })

      // Define colors
      const colors = {
        header: '1F4E79',      // Dark blue
        subHeader: '2E75B6',   // Medium blue
        tableHeader: '4472C4', // Light blue
        success: '70AD47',     // Green
        danger: 'C00000',      // Red
        warning: 'FFC000',     // Yellow/Orange
        lightBlue: 'D6DCE4',   // Light gray-blue
        lightGreen: 'E2EFDA',  // Light green
        lightRed: 'FCE4D6',    // Light red/peach
        white: 'FFFFFF',
        black: '000000',
        gray: '808080'
      }

      // Helper function for border style
      const thinBorder = {
        top: { style: 'thin' as const, color: { argb: 'FF000000' } },
        left: { style: 'thin' as const, color: { argb: 'FF000000' } },
        bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
        right: { style: 'thin' as const, color: { argb: 'FF000000' } }
      }

      let currentRow = 1

      // ═══════════════════════════════════════════════════════════════
      // SECTION 1: HEADER - Company and Report Title
      // ═══════════════════════════════════════════════════════════════
      ws.mergeCells(`A${currentRow}:K${currentRow}`)
      const titleCell = ws.getCell(`A${currentRow}`)
      titleCell.value = '🏢 Vegas - MIJOZ HISOBOTI'
      titleCell.font = { bold: true, size: 18, color: { argb: 'FF' + colors.white } }
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.header } }
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(currentRow).height = 35
      currentRow += 2

      // ═══════════════════════════════════════════════════════════════
      // SECTION 2: CUSTOMER INFO
      // ═══════════════════════════════════════════════════════════════
      ws.mergeCells(`A${currentRow}:E${currentRow}`)
      const custHeader = ws.getCell(`A${currentRow}`)
      custHeader.value = '👤 MIJOZ MA\'LUMOTLARI'
      custHeader.font = { bold: true, size: 12, color: { argb: 'FF' + colors.white } }
      custHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.subHeader } }
      custHeader.alignment = { horizontal: 'center' }

      ws.mergeCells(`F${currentRow}:K${currentRow}`)
      const statsHeader = ws.getCell(`F${currentRow}`)
      statsHeader.value = '📊 MOLIYAVIY STATISTIKA'
      statsHeader.font = { bold: true, size: 12, color: { argb: 'FF' + colors.white } }
      statsHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.success } }
      statsHeader.alignment = { horizontal: 'center' }
      currentRow++

      // Calculate statistics
      const totalSalesCount = salesData.length
      const totalAmount = salesData.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0)
      const totalPaid = salesData.reduce((sum: number, s: any) => sum + Number(s.paid_amount || 0), 0)
      const totalDebtFromSales = salesData.reduce((sum: number, s: any) => sum + Number(s.debt_amount || 0), 0)
      const totalPayments = debtData
        .filter((r: any) => r.transaction_type === 'PAYMENT' || r.transaction_type === 'DEBT_PAYMENT')
        .reduce((sum: number, r: any) => sum + Math.abs(Number(r.amount || 0)), 0)
      const totalItemsCount = salesWithItems.reduce((sum: number, s: any) => sum + (s.items?.length || 0), 0)

      // Customer info rows
      const debtUzsForInfo = Number(selectedCustomer.current_debt || 0)
      const debtUsdForInfo = Number(selectedCustomer.current_debt_usd || 0)

      const customerInfo = [
        ['Mijoz ismi:', selectedCustomer.name, '', '', '', 'Jami xaridlar:', `${totalSalesCount} ta`],
        ['Telefon:', selectedCustomer.phone, '', '', '', 'Jami summa:', formatMoney(totalAmount)],
        ['Telegram:', selectedCustomer.telegram_id || '-', '', '', '', 'To\'langan:', formatMoney(totalPaid)],
        ['Kompaniya:', selectedCustomer.company_name || '-', '', '', '', 'Qarz (sotuvlardan):', formatMoney(totalDebtFromSales)],
        ['Manzil:', selectedCustomer.address || '-', '', '', '', 'To\'lovlar (alohida):', formatMoney(totalPayments)],
        ['Mijoz turi:', selectedCustomer.customer_type === 'VIP' ? '⭐ VIP Mijoz' : 'Oddiy mijoz', '', '', '', 'Sotib olingan tovarlar:', `${totalItemsCount} ta`],
        ['', '', '', '', '', 'Joriy qarz (so\'m):', debtUzsForInfo > 0 ? formatMoney(debtUzsForInfo) : '0 so\'m'],
        ['', '', '', '', '', 'Joriy qarz ($):', debtUsdForInfo > 0 ? `$${debtUsdForInfo.toLocaleString('ru-RU', {minimumFractionDigits:2,maximumFractionDigits:2})}` : '$0.00'],
        ['', '', '', '', '', 'Avans balansi:', formatMoney(selectedCustomer.advance_balance)],
      ]

      customerInfo.forEach((row, idx) => {
        const r = ws.addRow(row)
        r.getCell(1).font = { bold: true, color: { argb: 'FF' + colors.subHeader } }
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.lightBlue } }
        r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.white } }
        // Color code debt rows
        if (idx === 6) { // UZS debt row
          r.getCell(6).font = { bold: true, color: { argb: 'FF' + (debtUzsForInfo > 0 ? colors.danger : colors.success) } }
          r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.lightBlue } }
          r.getCell(7).font = { bold: true, color: { argb: 'FF' + (debtUzsForInfo > 0 ? colors.danger : colors.success) } }
          r.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (debtUzsForInfo > 0 ? colors.lightRed : colors.lightGreen) } }
        } else if (idx === 7) { // USD debt row
          r.getCell(6).font = { bold: true, color: { argb: 'FF1E40AF' } }
          r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
          r.getCell(7).font = { bold: true, color: { argb: 'FF' + (debtUsdForInfo > 0 ? '1E40AF' : colors.success) } }
          r.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (debtUsdForInfo > 0 ? 'DBEAFE' : colors.lightGreen) } }
        } else if (idx === 8) { // Advance row
          r.getCell(6).font = { bold: true, color: { argb: 'FF' + colors.success } }
          r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.lightGreen } }
          r.getCell(7).font = { bold: true, color: { argb: 'FF' + colors.success } }
          r.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.lightGreen } }
        } else {
          r.getCell(6).font = { bold: true, color: { argb: 'FF' + colors.success } }
          r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.lightGreen } }
          r.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.white } }
          r.getCell(7).alignment = { horizontal: 'right' }
        }
        currentRow++
      })

      // Current debt highlight - UZS and USD separately
      currentRow++
      const debtUzs = Number(selectedCustomer.current_debt || 0)
      const debtUsd = Number(selectedCustomer.current_debt_usd || 0)
      const hasAnyDebt = debtUzs > 0 || debtUsd > 0

      // UZS debt row
      ws.mergeCells(`A${currentRow}:C${currentRow}`)
      const debtLabelCell = ws.getCell(`A${currentRow}`)
      debtLabelCell.value = '💰 SO\'M QARZ:'
      debtLabelCell.font = { bold: true, size: 13, color: { argb: 'FF' + colors.white } }
      debtLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (debtUzs > 0 ? colors.danger : colors.success) } }
      debtLabelCell.alignment = { horizontal: 'center', vertical: 'middle' }

      ws.mergeCells(`D${currentRow}:F${currentRow}`)
      const debtValueCell = ws.getCell(`D${currentRow}`)
      debtValueCell.value = formatMoney(debtUzs)
      debtValueCell.font = { bold: true, size: 13, color: { argb: 'FF' + (debtUzs > 0 ? colors.danger : colors.success) } }
      debtValueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + (debtUzs > 0 ? colors.lightRed : colors.lightGreen) } }
      debtValueCell.alignment = { horizontal: 'center', vertical: 'middle' }

      // USD debt row
      if (debtUsd > 0) {
        ws.mergeCells(`G${currentRow}:H${currentRow}`)
        const debtUsdLabelCell = ws.getCell(`G${currentRow}`)
        debtUsdLabelCell.value = '💵 DOLLAR QARZ:'
        debtUsdLabelCell.font = { bold: true, size: 13, color: { argb: 'FF' + colors.white } }
        debtUsdLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
        debtUsdLabelCell.alignment = { horizontal: 'center', vertical: 'middle' }

        ws.mergeCells(`I${currentRow}:K${currentRow}`)
        const debtUsdValueCell = ws.getCell(`I${currentRow}`)
        debtUsdValueCell.value = `$${debtUsd.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        debtUsdValueCell.font = { bold: true, size: 13, color: { argb: 'FF1E40AF' } }
        debtUsdValueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
        debtUsdValueCell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else {
        ws.mergeCells(`G${currentRow}:K${currentRow}`)
      }

      // Date shown on next row
      currentRow++
      ws.mergeCells(`A${currentRow}:K${currentRow}`)
      const dateCell = ws.getCell(`A${currentRow}`)
      dateCell.value = `📅 Hisobot sanasi: ${formatDateTimeTashkent(new Date())}`
      dateCell.font = { italic: true, color: { argb: 'FF' + colors.gray } }
      dateCell.alignment = { horizontal: 'right' }

      ws.getRow(currentRow).height = 25
      currentRow += 2

      // ═══════════════════════════════════════════════════════════════
      // SECTION 3: SALES HISTORY TABLE
      // ═══════════════════════════════════════════════════════════════
      ws.mergeCells(`A${currentRow}:K${currentRow}`)
      const salesTitle = ws.getCell(`A${currentRow}`)
      salesTitle.value = `🛒 SOTUVLAR TARIXI (${totalSalesCount} ta xarid)`
      salesTitle.font = { bold: true, size: 12, color: { argb: 'FF' + colors.white } }
      salesTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.tableHeader } }
      salesTitle.alignment = { horizontal: 'center' }
      ws.getRow(currentRow).height = 22
      currentRow++

      // Sales table header
      const salesHeaders = ['№', 'Sana', 'Vaqt', 'Chek raqami', 'Tovarlar soni', 'Umumiy summa', 'To\'langan', 'Qarz', 'Holat', '', '']
      const salesHeaderRow = ws.addRow(salesHeaders)
      salesHeaderRow.eachCell((cell, colNumber) => {
        if (colNumber <= 9) {
          cell.font = { bold: true, color: { argb: 'FF' + colors.white } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.subHeader } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.border = thinBorder
        }
      })
      ws.getRow(currentRow).height = 20
      currentRow++

      // Sales data rows
      if (salesWithItems.length > 0) {
        salesWithItems.forEach((sale: any, index: number) => {
          const status = sale.payment_status === 'PAID' ? '✅ To\'langan' :
                        sale.payment_status === 'DEBT' ? '❌ Qarzga' :
                        sale.payment_status === 'PARTIAL' ? '⚠️ Qisman' : sale.payment_status

          const rowData = [
            index + 1,
            formatDateTashkent(sale.created_at),
            formatTimeTashkent(sale.created_at),
            sale.sale_number || '-',
            `${sale.items?.length || sale.items_count || 0} ta`,
            Number(sale.total_amount || 0),
            Number(sale.paid_amount || 0),
            Number(sale.debt_amount || 0),
            status,
            '',
            ''
          ]

          const dataRow = ws.addRow(rowData)
          dataRow.eachCell((cell, colNumber) => {
            if (colNumber <= 9) {
              cell.border = thinBorder
              cell.alignment = { horizontal: colNumber <= 5 ? 'center' : 'right', vertical: 'middle' }

              // Alternate row colors
              if (index % 2 === 0) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.lightBlue } }
              }

              // Format numbers
              if (colNumber >= 6 && colNumber <= 8) {
                cell.numFmt = '#,##0'
              }

              // Color status
              if (colNumber === 9) {
                cell.alignment = { horizontal: 'center' }
                if (sale.payment_status === 'PAID') {
                  cell.font = { color: { argb: 'FF' + colors.success } }
                } else if (sale.payment_status === 'DEBT') {
                  cell.font = { color: { argb: 'FF' + colors.danger } }
                } else {
                  cell.font = { color: { argb: 'FF' + colors.warning } }
                }
              }
            }
          })
          currentRow++
        })

        // Sales totals row
        const salesTotalRow = ws.addRow(['', '', '', '', 'JAMI:', totalAmount, totalPaid, totalDebtFromSales, '', '', ''])
        salesTotalRow.eachCell((cell, colNumber) => {
          if (colNumber >= 5 && colNumber <= 8) {
            cell.font = { bold: true }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.warning } }
            cell.border = thinBorder
            if (colNumber >= 6) {
              cell.numFmt = '#,##0'
              cell.alignment = { horizontal: 'right' }
            }
          }
        })
        currentRow++
      } else {
        const noDataRow = ws.addRow(['', '', '', '', 'Ma\'lumot yo\'q', '', '', '', '', '', ''])
        noDataRow.getCell(5).font = { italic: true, color: { argb: 'FF' + colors.gray } }
        currentRow++
      }

      currentRow++

      // ═══════════════════════════════════════════════════════════════
      // SECTION 4: DETAILED ITEMS TABLE
      // ═══════════════════════════════════════════════════════════════
      ws.mergeCells(`A${currentRow}:K${currentRow}`)
      const itemsTitle = ws.getCell(`A${currentRow}`)
      itemsTitle.value = `📦 SOTIB OLINGAN TOVARLAR BATAFSIL (${totalItemsCount} ta tovar)`
      itemsTitle.font = { bold: true, size: 12, color: { argb: 'FF' + colors.white } }
      itemsTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.success } }
      itemsTitle.alignment = { horizontal: 'center' }
      ws.getRow(currentRow).height = 22
      currentRow++

      // Items table header
      const itemsHeaders = ['№', 'Sana', 'Chek №', 'Tovar nomi', 'Artikul', 'Miqdor', 'O\'lchov', 'Narx', 'Chegirma', 'Summa', '']
      const itemsHeaderRow = ws.addRow(itemsHeaders)
      itemsHeaderRow.eachCell((cell, colNumber) => {
        if (colNumber <= 10) {
          cell.font = { bold: true, color: { argb: 'FF' + colors.white } }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } }
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.border = thinBorder
        }
      })
      ws.getRow(currentRow).height = 20
      currentRow++

      // Items data
      let itemNo = 0
      let totalItemsSum = 0

      if (salesWithItems.length > 0) {
        salesWithItems.forEach((sale: any) => {
          if (sale.items && sale.items.length > 0) {
            sale.items.forEach((item: any) => {
              itemNo++
              const itemSum = Number(item.total || item.total_price || (item.quantity * (item.unit_price || item.price || 0)) || 0)
              totalItemsSum += itemSum

              const itemRowData = [
                itemNo,
                formatDateTashkent(sale.created_at),
                sale.sale_number || '-',
                item.product_name || item.name || '-',
                item.product_article || item.article || '-',
                Number(item.quantity || 0),
                item.uom_symbol || item.uom || '-',
                Number(item.unit_price || item.price || 0),
                Number(item.discount || 0),
                itemSum,
                ''
              ]

              const itemRow = ws.addRow(itemRowData)
              itemRow.eachCell((cell, colNumber) => {
                if (colNumber <= 10) {
                  cell.border = thinBorder
                  cell.alignment = { horizontal: colNumber <= 5 ? 'left' : (colNumber <= 7 ? 'center' : 'right'), vertical: 'middle' }

                  if (itemNo % 2 === 0) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.lightGreen } }
                  }

                  if (colNumber >= 6 && colNumber !== 7) {
                    cell.numFmt = '#,##0'
                  }
                }
              })
              currentRow++
            })
          }
        })

        // Items total row
        if (totalItemsCount > 0) {
          const itemsTotalRow = ws.addRow(['', '', '', '', '', '', '', '', 'JAMI:', totalItemsSum, ''])
          itemsTotalRow.eachCell((cell, colNumber) => {
            if (colNumber >= 9 && colNumber <= 10) {
              cell.font = { bold: true }
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colors.success } }
              cell.border = thinBorder
              if (colNumber === 10) {
                cell.numFmt = '#,##0'
                cell.alignment = { horizontal: 'right' }
              }
            }
          })
          currentRow++
        }
      } else {
        const noItemsRow = ws.addRow(['', '', '', 'Tovarlar ma\'lumoti yo\'q', '', '', '', '', '', '', ''])
        noItemsRow.getCell(4).font = { italic: true, color: { argb: 'FF' + colors.gray } }
        currentRow++
      }

      currentRow++

      // ═══════════════════════════════════════════════════════════════
      // SECTION 5: DEBT & PAYMENTS HISTORY — UZS va USD alohida
      // ═══════════════════════════════════════════════════════════════

      // Ajratish: UZS va USD yozuvlar
      const uzsRecords = debtData.filter((r: any) => !r.currency || r.currency === 'UZS')
      const usdRecords = debtData.filter((r: any) => r.currency === 'USD')

      // Helper: debt section renderer
      const renderDebtSection = (
        records: any[],
        titleText: string,
        titleColor: string,
        headerColor: string,
        isUsd: boolean
      ) => {
        ws.mergeCells(`A${currentRow}:K${currentRow}`)
        const sTitle = ws.getCell(`A${currentRow}`)
        sTitle.value = titleText
        sTitle.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
        sTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: titleColor } }
        sTitle.alignment = { horizontal: 'center' }
        ws.getRow(currentRow).height = 22
        currentRow++

        const currency = isUsd ? '$' : "so'm"
        const hdr = ws.addRow(['№', 'Sana', 'Vaqt', 'Turi', `Miqdor (${currency})`, `Qarz oldin (${currency})`, `Qarz keyin (${currency})`, "O'zgarish", '', 'Izoh', ''])
        hdr.eachCell((cell, col) => {
          if (col <= 8 || col === 10) {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } }
            cell.alignment = { horizontal: 'center', vertical: 'middle' }
            cell.border = thinBorder
          }
        })
        ws.getRow(currentRow).height = 20
        currentRow++

        if (records.length === 0) {
          const noRow = ws.addRow(['', '', '', "Ma'lumot yo'q", '', '', '', '', '', '', ''])
          noRow.getCell(4).font = { italic: true, color: { argb: 'FF' + colors.gray } }
          currentRow++
          return
        }

        let totalDebt = 0, totalPayment = 0
        records.forEach((record: any, index: number) => {
          const isPayment = record.transaction_type === 'PAYMENT' || record.transaction_type === 'DEBT_PAYMENT'
          const amt = Math.abs(Number(record.amount || 0))
          if (isPayment) totalPayment += amt; else totalDebt += amt
          const change = Number(record.balance_after || 0) - Number(record.balance_before || 0)

          let typeLabel = ''
          if (isPayment) typeLabel = "💰 To'lov"
          else if (record.transaction_type === 'DEBT_INCREASE') typeLabel = "📈 Qarz qo'shildi"
          else if (record.reference_type === 'adjustment' || record.reference_type === 'adjustment_usd') typeLabel = "📝 Boshlang'ich qarz"
          else typeLabel = "📦 Xarid"

          const fmt = isUsd
            ? (v: number) => `$${v.toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2})}`
            : (v: number) => v

          const row = ws.addRow([
            index + 1,
            formatDateTashkent(record.created_at),
            formatTimeTashkent(record.created_at),
            typeLabel,
            isUsd ? `$${amt.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}` : amt,
            isUsd ? `$${Number(record.balance_before||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}` : Number(record.balance_before||0),
            isUsd ? `$${Number(record.balance_after||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}` : Number(record.balance_after||0),
            isUsd ? (change >= 0 ? `+$${Math.abs(change).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}` : `-$${Math.abs(change).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}`) : change,
            '',
            record.description || '-',
            ''
          ])
          row.eachCell((cell, col) => {
            if (col <= 8 || col === 10) {
              cell.border = thinBorder
              cell.alignment = { horizontal: col <= 4 || col === 10 ? 'left' : 'right', vertical: 'middle' }
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isPayment ? 'FFE2EFDA' : 'FFFCE4D6' } }
              if (!isUsd && col >= 5 && col <= 8) cell.numFmt = '#,##0'
              if (col === 8) cell.font = { bold: true, color: { argb: change < 0 ? 'FF375623' : 'FFC00000' } }
            }
          })
          currentRow++
        })

        // Totals row
        const totColor = isUsd ? 'FF1E40AF' : 'FFC00000'
        const totRow = ws.addRow([
          '', '', '', 'JAMI:',
          isUsd
            ? `Qarz: $${totalDebt.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}  |  To'lov: $${totalPayment.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}`
            : `Qarz: ${totalDebt.toLocaleString("ru-RU")} so\'m  |  To\'lov: ${totalPayment.toLocaleString("ru-RU")} so\'m`,
          '', '', '', '', '', ''
        ])
        totRow.eachCell((cell, col) => {
          if (col === 4 || col === 5) {
            cell.font = { bold: true, color: { argb: totColor } }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
            cell.border = thinBorder
          }
        })
        currentRow += 2
      }

      // ── So'm operatsiyalari ──
      renderDebtSection(
        uzsRecords,
        `💰 SO'M OPERATSIYALARI (${uzsRecords.length} ta yozuv)`,
        'FFBF0000',
        'FFC00000',
        false
      )

      // ── Dollar operatsiyalari ──
      renderDebtSection(
        usdRecords,
        `💵 DOLLAR OPERATSIYALARI (${usdRecords.length} ta yozuv)`,
        'FF1E40AF',
        'FF2E75B6',
        true
      )

      currentRow++

      // ═══════════════════════════════════════════════════════════════
      // FOOTER
      // ═══════════════════════════════════════════════════════════════
      ws.mergeCells(`A${currentRow}:K${currentRow}`)
      const footerCell = ws.getCell(`A${currentRow}`)
      footerCell.value = '© Vegas System | Hisobot avtomatik tarzda yaratildi'
      footerCell.font = { italic: true, size: 10, color: { argb: 'FF' + colors.gray } }
      footerCell.alignment = { horizontal: 'center' }

      // Set column widths - YANADA KENGAYTIRILGAN
      ws.columns = [
        { width: 6 },   // A - №
        { width: 14 },  // B - Sana
        { width: 22 },  // C - Vaqt / Chek № (items) - KENGAYTIRILDI
        { width: 28 },  // D - Chek raqami (sales) / Tovar nomi (items) / Turi (debt) - KENGAYTIRILDI
        { width: 35 },  // E - Tovarlar soni (sales) / Artikul (items) / Summa (debt)
        { width: 22 },  // F - Umumiy summa (sales) / Miqdor (items) / Qarz oldin (debt) - KENGAYTIRILDI
        { width: 20 },  // G - To'langan (sales) / O'lchov (items) / Qarz keyin (debt) - KENGAYTIRILDI
        { width: 20 },  // H - Qarz (sales) / Narx (items) / O'zgarish (debt) - KENGAYTIRILDI
        { width: 18 },  // I - Holat (sales) / Chegirma (items)
        { width: 50 },  // J - Summa (items) / Izoh (debt) - JUDA KENGAYTIRILDI
        { width: 5 },   // K - Extra
      ]

      // Generate and download file
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const fileName = `${selectedCustomer.name.replace(/\s+/g, '_')}_hisobot_${formatDateTashkent(new Date()).replace(/\./g, '-')}.xlsx`
      saveAs(blob, fileName)

      toast.dismiss()
      toast.success('Hisobot muvaffaqiyatli yuklandi!')
    } catch (error) {
      toast.dismiss()
      toast.error('Xatolik yuz berdi')
      console.error('Excel export error:', error)
    }
  }

  // Fetch customer payments (keeping for backward compatibility)
  const { data: customerPayments } = useQuery({
    queryKey: ['customer-payments', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer) return null
      const response = await api.get(`/customers/${selectedCustomer.id}/payments`)
      return response.data
    },
    enabled: !!selectedCustomer && showDetailDialog,
  })

  // Create customer mutation
  const createCustomer = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      // Filter out empty strings - backend expects null, not empty string
      const cleanData: any = {}
      Object.entries(data).forEach(([key, value]) => {
        if (value !== '' && value !== undefined && value !== null) {
          cleanData[key] = value
        }
      })
      // manager_id: NaN yoki 0 bo'lsa null qilish
      if ('manager_id' in cleanData && (!cleanData.manager_id || isNaN(cleanData.manager_id))) {
        delete cleanData.manager_id
      }
      // Always send exchange_rate for USD debt conversion
      if (cleanData.initial_debt_amount_usd) {
        cleanData.initial_debt_exchange_rate = usdRate
      }
      const response = await api.post('/customers', cleanData)
      return response.data
    },
    onSuccess: () => {
      toast.success(t('customerAdded'))
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setShowAddDialog(false)
      setDebtAmountDisplay('')
      setDebtAmountUsdDisplay('')
      reset()
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      // Handle validation errors (array of objects)
      if (Array.isArray(detail)) {
        const messages = detail.map((e: any) => {
          if (typeof e === 'string') return e
          if (typeof e.msg === 'string') return e.msg
          return t('validationError')
        })
        toast.error(messages.join(', '))
      } else if (typeof detail === 'string') {
        toast.error(detail)
      } else {
        toast.error(t('errorOccurred'))
      }
    },
  })

  // Update customer mutation
  const updateCustomer = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      if (!editingCustomer) return
      const cleanData: any = {}
      Object.entries(data).forEach(([key, value]) => {
        if (value !== '' && value !== undefined && value !== null) {
          // Map form fields to backend field names for debt
          if (key === 'initial_debt_amount') {
            cleanData['adjust_debt_amount'] = value
          } else if (key === 'initial_debt_note') {
            cleanData['adjust_debt_note'] = value
          } else {
            cleanData[key] = value
          }
        }
      })
      // manager_id: NaN yoki 0 bo'lsa null yuborish (biriktirishni olib tashlash)
      if ('manager_id' in cleanData && (!cleanData.manager_id || isNaN(cleanData.manager_id))) {
        cleanData.manager_id = null
      }
      // Agar formada manager_id tanlanmagan bo'lsa ham yuborish (null qilish uchun)
      if (!('manager_id' in cleanData)) {
        cleanData.manager_id = null
      }
      const response = await api.patch(`/customers/${editingCustomer.id}`, cleanData)
      return response.data
    },
    onSuccess: () => {
      toast.success(t('customerUpdated'))
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['debtors-summary'] })
      setShowAddDialog(false)
      setEditingCustomer(null)
      setDebtAmountDisplay('')
      reset()
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      if (Array.isArray(detail)) {
        const messages = detail.map((e: any) => typeof e.msg === 'string' ? e.msg : t('validationError'))
        toast.error(messages.join(', '))
      } else {
        toast.error(typeof detail === 'string' ? detail : t('errorOccurred'))
      }
    },
  })

  // Delete customer mutation
  const deleteCustomer = useMutation({
    mutationFn: async (customerId: number) => {
      const response = await api.delete(`/customers/${customerId}`)
      return response.data
    },
    onSuccess: () => {
      toast.success('Mijoz o\'chirildi!')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['debtors-summary'] })
      setShowDeleteConfirm(false)
      setSelectedCustomer(null)
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Mijozni o\'chirib bo\'lmadi')
    },
  })

  // Pay debt mutation
  const payDebt = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      if (!selectedCustomer) return
      const response = await api.post(`/customers/${selectedCustomer.id}/pay-debt`, {
        ...data,
        currency: paymentCurrency,
        target_debt: paymentTargetDebt,
        exchange_rate: usdRate
      })
      return response.data
    },
    onSuccess: (data) => {
      const debtMsg = paymentCurrency === 'USD'
        ? `Qolgan dollar qarz: $${Number(data.current_debt_usd || 0).toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
        : `Qolgan qarz: ${formatMoney(data.current_debt)}`
      toast.success(`To'lov qabul qilindi! ${debtMsg}`)
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['debtors-summary'] })
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] })
      setShowPaymentDialog(false)
      setPaymentAmountDisplay('')
      setPaymentCurrency('UZS')
      setPaymentTargetDebt('UZS')
      resetPayment()
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      if (Array.isArray(detail)) {
        const messages = detail.map((e: any) => typeof e.msg === 'string' ? e.msg : 'Xatolik')
        toast.error(messages.join(', '))
      } else {
        toast.error(typeof detail === 'string' ? detail : 'Xatolik yuz berdi')
      }
    },
  })

  const onSubmit = (data: CustomerFormData) => {
    if (editingCustomer) {
      updateCustomer.mutate(data)
    } else {
      createCustomer.mutate(data)
    }
  }
  const onPaymentSubmit = (data: PaymentFormData) => payDebt.mutate(data)

  // ===== ADD DEBT MUTATION =====
  const addDebtMutation = useMutation({
    mutationFn: async (data: AddDebtFormData) => {
      if (!selectedCustomer) return
      const response = await api.post(`/customers/${selectedCustomer.id}/add-debt`, {
        ...data,
        currency: addDebtCurrency
      })
      return response.data
    },
    onSuccess: (data) => {
      const msg = addDebtCurrency === 'USD'
        ? `Dollar qarz qo'shildi! Joriy: $${Number(data.current_debt_usd||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}`
        : `Qarz qo'shildi! Joriy: ${formatMoney(data.current_debt)}`
      toast.success(msg)
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['debtors-summary'] })
      queryClient.invalidateQueries({ queryKey: ['customer-debt-history'] })
      setShowAddDebtDialog(false)
      setAddDebtAmountDisplay('')
      setAddDebtCurrency('UZS')
      resetAddDebt()
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Xatolik yuz berdi')
    },
  })

  const onAddDebtSubmit = (data: AddDebtFormData) => addDebtMutation.mutate(data)

  // Helper: fetch fresh customer data with correct current_debt_usd
  const fetchFreshCustomer = async (customer: Customer): Promise<Customer> => {
    try {
      const res = await api.get(`/customers/${customer.id}`)
      return { ...customer, ...res.data }
    } catch {
      return customer
    }
  }

  const handleAddDebtClick = async (customer: Customer) => {
    const fresh = await fetchFreshCustomer(customer)
    setSelectedCustomer(fresh)
    setAddDebtAmountDisplay('')
    resetAddDebt()
    setShowAddDebtDialog(true)
  }

  const handlePayClick = async (customer: Customer) => {
    const fresh = await fetchFreshCustomer(customer)
    setSelectedCustomer(fresh)
    const hasUzs = Number(fresh.current_debt) > 0
    const hasUsd = Number(fresh.current_debt_usd) > 0
    if (!hasUzs && hasUsd) {
      setPaymentCurrency('USD')
      setPaymentTargetDebt('USD')
      setPaymentAmountDisplay('')
      setPaymentValue('amount', 0)
    } else {
      setPaymentCurrency('UZS')
      setPaymentTargetDebt('UZS')
      setPaymentAmountDisplay(formatInputNumber(Number(fresh.current_debt)))
      setPaymentValue('amount', Number(fresh.current_debt))
    }
    setShowPaymentDialog(true)
  }

  const handleEditClick = async (customer: Customer) => {
    const fresh = await fetchFreshCustomer(customer)
    setEditingCustomer(fresh)
    setValue('name', fresh.name)
    setValue('phone', fresh.phone)
    setValue('phone_secondary', fresh.phone_secondary || '')
    setValue('telegram_id', fresh.telegram_id || '')
    setValue('company_name', fresh.company_name || '')
    setValue('email', fresh.email || '')
    setValue('address', fresh.address || '')
    setValue('customer_type', fresh.customer_type)
    setValue('credit_limit', fresh.credit_limit || 0)
    setValue('manager_id', fresh.manager_id || '')
    setValue('initial_debt_amount', fresh.current_debt || 0)
    setDebtAmountDisplay(Number(fresh.current_debt) > 0 ? formatInputNumber(Number(fresh.current_debt)) : '')
    setValue('initial_debt_amount_usd', Number(fresh.current_debt_usd) > 0 ? Number(fresh.current_debt_usd) : undefined)
    setDebtAmountUsdDisplay(Number(fresh.current_debt_usd) > 0 ? String(Number(fresh.current_debt_usd)) : '')
    setValue('initial_debt_note', '')
    setShowAddDialog(true)
  }

  const handleDeleteClick = (customer: Customer) => {
    setSelectedCustomer(customer)
    setShowDeleteConfirm(true)
  }

  const handleDetailClick = async (customer: Customer) => {
    // Set immediately for fast UI, then fetch fresh data with current_debt_usd
    setSelectedCustomer(customer)
    setShowDetailDialog(true)
    try {
      const res = await api.get(`/customers/${customer.id}`)
      const fresh = res.data
      setSelectedCustomer(prev => prev?.id === customer.id ? { ...prev, ...fresh } : prev)
    } catch (_) {}
  }

  const getTypeBadge = (type: string) => {
    const normalizedType = type?.toUpperCase() || 'REGULAR'
    const badges: Record<string, { variant: 'warning' | 'primary' | 'secondary', label: string }> = {
      'VIP': { variant: 'warning', label: 'VIP' },
      'WHOLESALE': { variant: 'primary', label: 'Ulgurji' },
      'REGULAR': { variant: 'secondary', label: 'Oddiy' },
    }
    const b = badges[normalizedType] || badges.REGULAR
    return <Badge variant={b.variant}>{b.label}</Badge>
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">{t('customers')}</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCategoryManager(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-purple-400 text-purple-700 text-sm font-semibold active:scale-95 transition-all">
            <Tag className="w-4 h-4" />
            <span className="hidden sm:inline">Kategoriyalar</span>
          </button>
          <button onClick={() => { setEditingCustomer(null); reset(); setDebtAmountDisplay(''); setValue('manager_id', currentUser?.id || ''); setShowAddDialog(true) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold active:scale-95 transition-all">
            <Plus className="w-4 h-4" />
            <span>Qo'shish</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-2xl p-3 border border-border flex flex-col items-center gap-1 shadow-sm">
          <div className="p-2 bg-blue-50 rounded-xl">
            <User className="w-5 h-5 text-primary" />
          </div>
          <p className="text-xs text-text-secondary leading-none">Mijozlar</p>
          <p className="text-base font-bold leading-none">{customersData?.total || 0}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 border border-border flex flex-col items-center gap-1 shadow-sm">
          <div className="p-2 bg-red-50 rounded-xl">
            <CreditCard className="w-5 h-5 text-danger" />
          </div>
          <p className="text-xs text-text-secondary leading-none">Qarzdor</p>
          <p className="text-base font-bold leading-none">{debtorsData?.data?.length || 0}</p>
        </div>
        <div className="bg-white rounded-2xl p-3 border border-border flex flex-col items-center gap-1 shadow-sm min-w-0">
          <div className="p-2 bg-orange-50 rounded-xl">
            <Banknote className="w-5 h-5 text-warning" />
          </div>
          <p className="text-xs text-text-secondary leading-none">Jami qarz</p>
          <p className="text-xs font-bold text-danger truncate w-full text-center">{formatMoney(debtorsData?.total_debt || 0)}</p>
          {Number(debtorsData?.total_debt_usd || 0) > 0 && (
            <p className="text-xs font-bold text-blue-600 truncate w-full text-center">
              ${Number(debtorsData?.total_debt_usd || 0).toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2})}
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-border p-3 space-y-2 shadow-sm">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
        </div>
        {/* Selects row */}
        <div className="grid grid-cols-2 gap-2">
          <select
            className="h-10 px-3 border border-border rounded-xl text-sm bg-white"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">Barchasi</option>
            <option value="REGULAR">Oddiy</option>
            <option value="VIP">VIP</option>
            <option value="WHOLESALE">Ulgurji</option>
          </select>
          <select
            className="h-10 px-3 border border-border rounded-xl text-sm bg-white"
            value={filterSellerId}
            onChange={(e) => setFilterSellerId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Barcha sotuvchi</option>
            {sellersData?.data?.map((seller: UserType) => (
              <option key={seller.id} value={seller.id}>
                {seller.first_name} {seller.last_name}
              </option>
            ))}
          </select>
        </div>
        {/* Category + filter button */}
        <div className="flex gap-2">
          <select
            className="flex-1 h-10 px-3 border border-purple-300 rounded-xl text-sm bg-white"
            value={filterCategoryId}
            onChange={(e) => { setFilterCategoryId(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
          >
            <option value="">Barcha kategoriyalar</option>
            {categories.map((cat: any) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowDebtorsOnly(!showDebtorsOnly)}
            className={`flex items-center gap-1.5 px-3 h-10 rounded-xl border text-sm font-medium transition-all active:scale-95 ${
              showDebtorsOnly
                ? 'bg-danger text-white border-danger'
                : 'bg-white text-gray-600 border-border'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Qarzdorlar</span>
          </button>
        </div>
      </div>

      {/* Customers List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          {customersData?.data?.map((customer: Customer) => (
            <div key={customer.id} className="bg-white rounded-2xl border border-border shadow-sm active:scale-[0.99] transition-all">
              <div className="p-3">
                {/* Row 1: name + badge + action icons */}
                <div className="flex items-start gap-2">
                  {/* Name block */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm leading-tight">{customer.name}</span>
                      {getTypeBadge(customer.customer_type)}
                      {customer.category_name && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: customer.category_color || '#6366f1' }}>
                          {customer.category_name}
                        </span>
                      )}
                    </div>
                    <a href={`tel:${customer.phone}`}
                      className="flex items-center gap-1 mt-0.5 text-xs text-primary font-medium"
                      onClick={(e) => e.stopPropagation()}>
                      <Phone className="w-3 h-3" />
                      <span className="whitespace-nowrap">{formatPhone(customer.phone)}</span>
                    </a>
                    {customer.company_name && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{customer.company_name}</p>
                    )}
                  </div>
                  {/* Icon actions */}
                  <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                    <button onClick={() => handleDetailClick(customer)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border border-border text-gray-500 active:bg-gray-100">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleEditClick(customer)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border border-border text-gray-500 active:bg-gray-100">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteClick(customer)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-200 text-danger active:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Row 2: debt info + pay/add buttons */}
                <div className="flex items-center justify-between gap-2 mt-2.5">
                  {/* Debt chips */}
                  <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                    {customer.current_debt > 0 && (
                      <span className="inline-flex items-center gap-1 bg-red-50 border border-red-100 rounded-lg px-2 py-1 text-xs font-bold text-danger whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                        {formatMoney(customer.current_debt)}
                      </span>
                    )}
                    {Number(customer.current_debt_usd) > 0 && (
                      <span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 text-xs font-bold text-blue-600 whitespace-nowrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                        ${Number(customer.current_debt_usd).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </span>
                    )}
                    {customer.current_debt === 0 && Number(customer.current_debt_usd) === 0 && (
                      <span className="text-xs text-green-600 font-medium">✓ Qarz yo'q</span>
                    )}
                  </div>
                  {/* Pay + add buttons */}
                  <div className="flex gap-1.5 flex-shrink-0">
                    {(customer.current_debt > 0 || Number(customer.current_debt_usd) > 0) && (
                      <button onClick={() => handlePayClick(customer)}
                        className="flex items-center gap-1 bg-success text-white rounded-xl px-3 py-1.5 text-xs font-bold active:scale-95 transition-all">
                        <Banknote className="w-3.5 h-3.5" />
                        To'lov
                      </button>
                    )}
                    <button onClick={() => handleAddDebtClick(customer)}
                      className="flex items-center gap-1 border border-orange-300 text-orange-600 rounded-xl px-2.5 py-1.5 text-xs font-bold active:scale-95 transition-all">
                      <Plus className="w-3.5 h-3.5" />
                      Qarz
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {customersData?.data?.length === 0 && (
            <div className="text-center py-12">
              <User className="w-16 h-16 mx-auto text-text-secondary opacity-50 mb-4" />
              <p className="text-text-secondary">{t('noCustomersFound')}</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {customersData && customersData.total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('previous')}</Button>
          <span className="px-4">{page} / {Math.ceil(customersData.total / 20)}</span>
          <Button variant="outline" disabled={page >= Math.ceil(customersData.total / 20)} onClick={() => setPage(page + 1)}>{t('next')}</Button>
        </div>
      )}

      {/* Add/Edit Customer Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open)
        if (!open) {
          setEditingCustomer(null)
          setDebtAmountDisplay('')
          reset()
        }
      }}>
        <DialogContent className="max-w-lg max-h-[92vh] flex flex-col p-0 gap-0">
          {/* Fixed header */}
          <div className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
            <DialogHeader>
              <DialogTitle>{editingCustomer ? t('editCustomerTitle') : t('addCustomerTitle')}</DialogTitle>
              <DialogDescription>{t('enterCustomerDetails')}</DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div className="space-y-2">
              <label className="font-medium">{t('customerName')} *</label>
              <Input {...register('name', { required: t('nameRequired') })} placeholder={t('fullName')} />
              {errors.name && <p className="text-danger text-sm">{errors.name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-medium">{t('phone')} *</label>
                <Input {...register('phone', { required: t('phoneRequired') })} placeholder="+998 90 123 45 67" />
              </div>
              <div className="space-y-2">
                <label className="font-medium">{t('secondaryPhone')}</label>
                <Input {...register('phone_secondary')} placeholder="+998 90 123 45 67" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-medium">{t('telegramId')}</label>
                <Input {...register('telegram_id')} placeholder={t('telegramPlaceholder')} />
              </div>
              <div className="space-y-2">
                <label className="font-medium">{t('emailLabel')}</label>
                <Input {...register('email')} type="email" placeholder="email@example.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-medium">{t('companyName')}</label>
                <Input {...register('company_name')} placeholder={t('companyPlaceholder')} />
              </div>
              <div className="space-y-2">
                <label className="font-medium">{t('address')}</label>
                <Input {...register('address')} placeholder={t('fullAddress')} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-medium">{t('customerType')}</label>
                <select {...register('customer_type')} className="w-full min-h-btn px-4 py-3 border-2 border-border rounded-pos">
                  <option value="REGULAR">{t('regular')}</option>
                  <option value="VIP">{t('vip')}</option>
                  <option value="WHOLESALE">{t('wholesale')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="font-medium">{t('creditLimit')}</label>
                <Input type="number" {...register('credit_limit', { valueAsNumber: true })} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                {t('assignedSeller')}
              </label>
              <select {...register('manager_id', { valueAsNumber: true })} className="w-full min-h-btn px-4 py-3 border-2 border-border rounded-pos">
                <option value="">{t('notAssigned')}</option>
                {sellersData?.data?.map((seller: UserType) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.first_name} {seller.last_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Debt section - new customer: initial debt, editing: director only */}
            {(!editingCustomer || (editingCustomer && isDirector)) && (
              <div className={cn(
                "space-y-3 p-3 rounded-lg border",
                editingCustomer
                  ? "bg-red-50 border-red-200"
                  : "bg-orange-50 border-orange-200"
              )}>
                {/* Header */}
                <label className={cn(
                  "font-medium flex items-center gap-2",
                  editingCustomer ? "text-red-700" : "text-orange-700"
                )}>
                  <Banknote className="w-4 h-4" />
                  {editingCustomer ? (
                    <span>
                      Qarz —{' '}
                      {Number(editingCustomer.current_debt || 0) > 0 && (
                        <span className="text-red-600">{formatMoney(editingCustomer.current_debt)}</span>
                      )}
                      {Number(editingCustomer.current_debt || 0) > 0 && Number(editingCustomer.current_debt_usd || 0) > 0 && ' · '}
                      {Number(editingCustomer.current_debt_usd || 0) > 0 && (
                        <span className="text-blue-600">${Number(editingCustomer.current_debt_usd).toLocaleString('ru-RU', {minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                      )}
                      {Number(editingCustomer.current_debt || 0) === 0 && Number(editingCustomer.current_debt_usd || 0) === 0 && (
                        <span className="text-green-600">qarz yo'q</span>
                      )}
                    </span>
                  ) : "Boshlang'ich qarz (ixtiyoriy)"}
                </label>

                {/* Kurs ko'rsatish */}
                <div className="flex items-center gap-2 text-xs text-gray-500 bg-white rounded-lg px-3 py-1.5 border border-gray-200">
                  <span>Joriy kurs:</span>
                  <span className="font-semibold text-primary">1$ = {formatNumber(usdRate)} so'm</span>
                </div>

                {/* UZS qarz */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold">UZS</span>
                    So'm da qarz
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={debtAmountDisplay}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\s/g, '')
                      const num = parseFloat(raw) || 0
                      setDebtAmountDisplay(num > 0 ? formatInputNumber(num) : raw)
                      setValue('initial_debt_amount', num || undefined)
                    }}
                    onFocus={(e) => e.target.select()}
                    placeholder="0"
                    icon={<span className="text-xs font-bold text-green-600">so'm</span>}
                  />
                  {debtAmountDisplay && parseFloat(debtAmountDisplay.replace(/\s/g, '')) > 0 && (
                    <p className="text-xs text-green-700 font-medium pl-1">
                      ≈ ${formatNumber(parseFloat(debtAmountDisplay.replace(/\s/g, '')) / usdRate, 2)}
                    </p>
                  )}
                </div>

                {/* USD qarz */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">USD</span>
                    Dollar da qarz
                  </label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={debtAmountUsdDisplay}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d.]/g, '')
                      setDebtAmountUsdDisplay(raw)
                      const num = parseFloat(raw) || 0
                      setValue('initial_debt_amount_usd', num || undefined)
                    }}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    icon={<span className="text-xs font-bold text-blue-600">$</span>}
                  />
                  {debtAmountUsdDisplay && parseFloat(debtAmountUsdDisplay) > 0 && (
                    <p className="text-xs text-blue-700 font-medium pl-1">
                      ≈ {formatNumber(parseFloat(debtAmountUsdDisplay) * usdRate)} so'm
                    </p>
                  )}
                </div>

                {/* Jami ko'rsatish */}
                {((parseFloat(debtAmountDisplay?.replace(/\s/g, '') || '0') > 0) ||
                  (parseFloat(debtAmountUsdDisplay || '0') > 0)) && (
                  <div className="bg-white border-2 border-orange-300 rounded-xl p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Jami qarz:</p>
                    {parseFloat(debtAmountDisplay?.replace(/\s/g, '') || '0') > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 flex items-center gap-1">
                          <span className="px-1 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold">UZS</span>
                          So'm qarz:
                        </span>
                        <span className="font-bold text-orange-700">
                          {formatMoney(parseFloat(debtAmountDisplay.replace(/\s/g, '')))}
                        </span>
                      </div>
                    )}
                    {parseFloat(debtAmountUsdDisplay || '0') > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600 flex items-center gap-1">
                          <span className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">USD</span>
                          Dollar qarz:
                        </span>
                        <span className="font-bold text-orange-700">
                          ${parseFloat(debtAmountUsdDisplay || '0').toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-orange-200 pt-1.5 flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Umumiy (so'mda):</span>
                      <span className="font-bold text-lg text-red-600">
                        {formatMoney(
                          (parseFloat(debtAmountDisplay?.replace(/\s/g, '') || '0')) +
                          (parseFloat(debtAmountUsdDisplay || '0') * usdRate)
                        )}
                      </span>
                    </div>
                  </div>
                )}

                {/* Izoh */}
                <div className="space-y-1">
                  <label className="text-sm text-gray-600">
                    {editingCustomer ? "O'zgartirish sababi" : "Qarz izohi (ixtiyoriy)"}
                  </label>
                  <Input
                    {...register('initial_debt_note')}
                    placeholder={editingCustomer ? "Masalan: Direktor tomonidan tuzatildi" : "Masalan: Eski do'kondan qarz"}
                  />
                </div>

                {editingCustomer && (
                  <p className="text-xs text-red-500">⚠ Faqat direktor o'zgartira oladi. O'zgartirish tarixda saqlanadi.</p>
                )}
              </div>
            )}

            </div>
            {/* Fixed footer */}
            <div className="px-5 py-4 border-t border-border flex-shrink-0">
            <DialogFooter className="">
              <Button type="button" variant="outline" onClick={() => {
                setShowAddDialog(false)
                setEditingCustomer(null)
                setDebtAmountDisplay('')
                setDebtAmountUsdDisplay('')
                reset()
              }}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={createCustomer.isPending || updateCustomer.isPending}>
                {(createCustomer.isPending || updateCustomer.isPending) ? t('saving') : t('save')}
              </Button>
            </DialogFooter>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-danger">
              <AlertTriangle className="w-5 h-5" />
              {t('deleteCustomerTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('confirmDelete')} <strong>{selectedCustomer?.name}</strong> {t('confirmDeleteCustomer')}
              {selectedCustomer && selectedCustomer.current_debt > 0 && (
                <span className="block mt-2 text-danger">
                  {t('customerHasDebt')} ({formatMoney(selectedCustomer.current_debt)})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => selectedCustomer && deleteCustomer.mutate(selectedCustomer.id)}
              disabled={deleteCustomer.isPending}
            >
              {deleteCustomer.isPending ? t('deleting') : t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={(open) => {
        setShowPaymentDialog(open)
        if (!open) { setPaymentAmountDisplay(''); setPaymentCurrency('UZS'); setPaymentTargetDebt('UZS'); resetPayment() }
      }}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="pr-6">{t('acceptPayment')}</DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="bg-gradient-to-r from-red-50 to-orange-50 p-3 rounded-xl space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-full shadow-sm">
                  <User className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{selectedCustomer.name}</p>
                  <p className="text-xs text-gray-500">{formatPhone(selectedCustomer.phone)}</p>
                </div>
              </div>
              {/* Debt display — UZS and USD separately */}
              <div className="grid grid-cols-2 gap-2">
                {Number(selectedCustomer.current_debt) > 0 && (
                  <div className="bg-white rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>so'm qarz
                    </p>
                    <p className="text-sm font-bold text-red-600">{formatMoney(selectedCustomer.current_debt)}</p>
                  </div>
                )}
                {Number(selectedCustomer.current_debt_usd) > 0 && (
                  <div className="bg-white rounded-lg p-2 text-center">
                    <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>dollar qarz
                    </p>
                    <p className="text-sm font-bold text-blue-600">
                      ${Number(selectedCustomer.current_debt_usd).toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </p>
                  </div>
                )}
                {Number(selectedCustomer.current_debt) === 0 && Number(selectedCustomer.current_debt_usd) === 0 && (
                  <div className="col-span-2 bg-white rounded-lg p-2 text-center">
                    <p className="text-xs text-green-600 font-medium">✓ Qarz yo'q</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handlePaymentSubmit(onPaymentSubmit)} className="space-y-3">
            {/* Currency toggle */}
            <div>
              {/* Step 1: To'lov valyutasi */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  1. To'lov valyutasi
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setPaymentCurrency('UZS'); setPaymentAmountDisplay(''); setPaymentValue('amount', 0) }}
                    className={`p-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${
                      paymentCurrency === 'UZS'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <span className="block text-base mb-0.5">🇺🇿 So'm</span>
                    <span className="text-xs font-normal opacity-70">UZS da to'layman</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPaymentCurrency('USD'); setPaymentAmountDisplay(''); setPaymentValue('amount', 0) }}
                    className={`p-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${
                      paymentCurrency === 'USD'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <span className="block text-base mb-0.5">🇺🇸 Dollar</span>
                    <span className="text-xs font-normal opacity-70">$ da to'layman</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Qaysi qarzdan ayirish - show when both debts exist */}
              {(Number((selectedCustomer as any)?.current_debt_usd || 0) > 0 && Number(selectedCustomer?.current_debt || 0) > 0) && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    2. Qaysi qarzdan ayirish kerak?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentTargetDebt('UZS')}
                      className={`p-2.5 rounded-xl border-2 text-sm transition-all ${
                        paymentTargetDebt === 'UZS'
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <span className="block font-semibold">So'm qarzdan</span>
                      <span className="text-xs opacity-80">{formatMoney(selectedCustomer?.current_debt || 0)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentTargetDebt('USD')}
                      className={`p-2.5 rounded-xl border-2 text-sm transition-all ${
                        paymentTargetDebt === 'USD'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <span className="block font-semibold">Dollar qarzdan</span>
                      <span className="text-xs opacity-80">${Number((selectedCustomer as any)?.current_debt_usd || 0).toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
                    </button>
                  </div>
                  {/* Conversion hint */}
                  {paymentCurrency !== paymentTargetDebt && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                      {paymentCurrency === 'USD' && paymentTargetDebt === 'UZS' && (
                        <span>1$ = {formatNumber(usdRate)} so'm kursida so'm qarzdan ayiriladi</span>
                      )}
                      {paymentCurrency === 'UZS' && paymentTargetDebt === 'USD' && (
                        <span>1$ = {formatNumber(usdRate)} so'm kursida dollar qarzdan ayiriladi</span>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Auto-set target if only one debt type */}
              {(Number((selectedCustomer as any)?.current_debt_usd || 0) > 0 && !(Number(selectedCustomer?.current_debt || 0) > 0)) && (
                <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 text-center">
                  Faqat <strong>dollar qarz</strong> mavjud
                </div>
              )}
              {(Number(selectedCustomer?.current_debt || 0) > 0 && !(Number((selectedCustomer as any)?.current_debt_usd || 0) > 0)) && (
                <div className="p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 text-center">
                  Faqat <strong>so'm qarz</strong> mavjud
                </div>
              )}
            </div>

            {/* Amount input */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('paymentAmount')} *</label>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm ${
                  paymentCurrency === 'USD' ? 'text-blue-600' : 'text-green-600'
                }`}>
                  {paymentCurrency === 'USD' ? '$' : 'UZS'}
                </span>
                <input
                  type="text"
                  inputMode={paymentCurrency === 'USD' ? 'decimal' : 'numeric'}
                  value={paymentAmountDisplay}
                  onChange={(e) => {
                    const raw = e.target.value.replace(paymentCurrency === 'USD' ? /[^\d.]/g : /\s/g, '')
                    const num = parseFloat(raw) || 0
                    if (paymentCurrency === 'USD') {
                      setPaymentAmountDisplay(raw)
                    } else {
                      setPaymentAmountDisplay(num > 0 ? formatInputNumber(num) : '')
                    }
                    setPaymentValue('amount', num)
                  }}
                  placeholder={paymentCurrency === 'USD' ? '0.00' : '0'}
                  className={`w-full h-12 pl-12 pr-3 text-base font-bold text-center border-2 rounded-xl outline-none transition-colors ${
                    paymentCurrency === 'USD'
                      ? 'border-blue-200 focus:border-blue-500 bg-blue-50/30'
                      : 'border-green-200 focus:border-green-500 bg-green-50/30'
                  }`}
                />
              </div>
              {/* Equivalent hint */}
              {paymentAmountDisplay && parseFloat(paymentAmountDisplay.replace(/\s/g, '')) > 0 && (
                <p className="text-xs text-gray-500 text-center">
                  {paymentCurrency === 'USD'
                    ? `≈ ${formatMoney(parseFloat(paymentAmountDisplay || '0') * usdRate)} so'm`
                    : `≈ $${formatNumber(parseFloat(paymentAmountDisplay.replace(/\s/g, '')) / usdRate, 2)}`
                  }
                </p>
              )}
            </div>

            {/* Payment type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('paymentType')}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'CASH', label: t('cash'), icon: Banknote },
                  { value: 'CARD', label: t('card'), icon: CreditCard },
                  { value: 'TRANSFER', label: t('transfer'), icon: Building },
                ].map((pt) => (
                  <label key={pt.value} className="cursor-pointer">
                    <input type="radio" {...registerPayment('payment_type')} value={pt.value} className="sr-only peer" />
                    <div className="flex flex-col items-center gap-1 p-2 border-2 border-gray-200 rounded-lg peer-checked:border-blue-500 peer-checked:bg-blue-50 transition-colors">
                      <pt.icon className="w-4 h-4" />
                      <span className="text-xs">{pt.label}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('notesLabel')}</label>
              <Input {...registerPayment('description')} placeholder={t('optionalNote')} className="text-sm" />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowPaymentDialog(false); setPaymentCurrency('UZS'); setPaymentTargetDebt('UZS') }}
                className="flex-1 h-11 border-2 border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={payDebt.isPending}
                className={`flex-1 h-11 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                  paymentCurrency === 'USD'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {payDebt.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                {t('accept')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Debt Dialog */}
      <Dialog open={showAddDebtDialog} onOpenChange={setShowAddDebtDialog}>
        <DialogContent className="max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="pr-6 text-orange-600">Qarz qo'shish</DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="bg-gradient-to-r from-orange-50 to-yellow-50 p-3 rounded-lg mb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white rounded-full">
                  <User className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{selectedCustomer.name}</p>
                  <p className="text-xs text-gray-500">{formatPhone(selectedCustomer.phone)}</p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {Number(selectedCustomer.current_debt) > 0 && (
                  <div className="p-2 bg-white rounded-lg text-center">
                    <p className="text-xs text-gray-500">So'm qarz:</p>
                    <p className="text-sm font-bold text-red-600">{formatMoney(selectedCustomer.current_debt)}</p>
                  </div>
                )}
                {Number(selectedCustomer.current_debt_usd) > 0 && (
                  <div className="p-2 bg-white rounded-lg text-center">
                    <p className="text-xs text-gray-500">Dollar qarz:</p>
                    <p className="text-sm font-bold text-blue-600">${Number(selectedCustomer.current_debt_usd).toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
                  </div>
                )}
                {Number(selectedCustomer.current_debt) === 0 && Number(selectedCustomer.current_debt_usd) === 0 && (
                  <div className="col-span-2 p-2 bg-white rounded-lg text-center">
                    <p className="text-xs text-green-600 font-medium">✓ Qarz yo'q</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleAddDebtSubmit(onAddDebtSubmit)} className="space-y-3">
            {/* Currency toggle */}
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Qarz valyutasi</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => { setAddDebtCurrency('UZS'); setAddDebtAmountDisplay(''); setAddDebtValue('amount', 0) }}
                  className={`p-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${
                    addDebtCurrency === 'UZS' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  <span className="block">🇺🇿 So'm</span>
                  <span className="text-xs font-normal opacity-70">UZS da qarz</span>
                </button>
                <button type="button"
                  onClick={() => { setAddDebtCurrency('USD'); setAddDebtAmountDisplay(''); setAddDebtValue('amount', 0) }}
                  className={`p-2.5 rounded-xl border-2 font-semibold text-sm transition-all ${
                    addDebtCurrency === 'USD' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  <span className="block">🇺🇸 Dollar</span>
                  <span className="text-xs font-normal opacity-70">$ da qarz</span>
                </button>
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Qarz summasi *</label>
              <div className="relative">
                <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm ${
                  addDebtCurrency === 'USD' ? 'text-blue-600' : 'text-orange-600'
                }`}>{addDebtCurrency === 'USD' ? '$' : 'UZS'}</span>
                <input
                  type="text"
                  inputMode={addDebtCurrency === 'USD' ? 'decimal' : 'numeric'}
                  value={addDebtAmountDisplay}
                  onChange={(e) => {
                    const raw = e.target.value.replace(addDebtCurrency === 'USD' ? /[^\d.]/g : /\s/g, '')
                    const num = parseFloat(raw) || 0
                    setAddDebtAmountDisplay(addDebtCurrency === 'USD' ? raw : (num > 0 ? formatInputNumber(num) : ''))
                    setAddDebtValue('amount', num)
                  }}
                  placeholder={addDebtCurrency === 'USD' ? '0.00' : '0'}
                  className={`w-full h-11 pl-12 pr-3 text-base font-bold text-center border-2 rounded-xl outline-none transition-colors ${
                    addDebtCurrency === 'USD' ? 'border-blue-200 focus:border-blue-500 bg-blue-50/30' : 'border-orange-200 focus:border-orange-500 bg-orange-50/30'
                  }`}
                />
              </div>
              {addDebtAmountDisplay && parseFloat(addDebtAmountDisplay.replace(/\s/g,'')) > 0 && (
                <p className="text-xs text-gray-500 text-center">
                  {addDebtCurrency === 'USD'
                    ? `≈ ${formatMoney(parseFloat(addDebtAmountDisplay||'0') * usdRate)} so'm`
                    : `≈ $${formatNumber(parseFloat(addDebtAmountDisplay.replace(/\s/g,'')) / usdRate, 2)}`
                  }
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Izoh (sabab)</label>
              <textarea
                {...registerAddDebt('description')}
                placeholder="Qarz sababi yoki izohi..."
                rows={2}
                className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-xl focus:border-orange-500 outline-none resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button type="button"
                onClick={() => { setShowAddDebtDialog(false); setAddDebtCurrency('UZS') }}
                className="flex-1 h-11 border-2 border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >Bekor qilish</button>
              <button type="submit" disabled={addDebtMutation.isPending}
                className={`flex-1 h-11 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                  addDebtCurrency === 'USD' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {addDebtMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Qarz qo'shish
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Customer Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-xl">
          {/* ── Fixed header ── */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border">
            <DialogHeader>
              <DialogTitle className="text-base">{t('customerDetails')}</DialogTitle>
            </DialogHeader>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto">
          {selectedCustomer && (
            <div className="space-y-4 p-4">

              {/* ── Customer card ── */}
              <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-4 space-y-3">
                {/* Name + badges */}
                <div className="flex items-start gap-3">
                  <div className="p-3 bg-white rounded-full shadow-sm flex-shrink-0">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold leading-tight">{selectedCustomer.name}</h3>
                      {getTypeBadge(selectedCustomer.customer_type)}
                      {(selectedCustomer as any).category_name && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: (selectedCustomer as any).category_color || '#6366f1' }}>
                          {(selectedCustomer as any).category_name}
                        </span>
                      )}
                    </div>
                    {/* Contact info */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-text-secondary">
                      <a href={`tel:${selectedCustomer.phone}`} className="flex items-center gap-1 text-primary font-medium">
                        <Phone className="w-3.5 h-3.5" />{formatPhone(selectedCustomer.phone)}
                      </a>
                      {selectedCustomer.company_name && (
                        <span className="flex items-center gap-1"><Building className="w-3.5 h-3.5" />{selectedCustomer.company_name}</span>
                      )}
                      {selectedCustomer.address && (
                        <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{selectedCustomer.address}</span>
                      )}
                    </div>
                    {/* Category select */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <Tag className="w-3 h-3 text-purple-500 flex-shrink-0" />
                      <select
                        className="text-xs border border-purple-200 rounded-lg px-2 py-1 bg-white text-purple-700 flex-1 max-w-[180px]"
                        value={(selectedCustomer as any).category_id || ''}
                        onChange={(e) => handleAssignCategory(selectedCustomer.id, e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">— Kategoriya yo'q —</option>
                        {categories.map((cat: any) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Debt summary chips */}
                <div className="flex flex-wrap gap-2">
                  {Number(selectedCustomer.current_debt) > 0 && (
                    <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span>
                      <span className="text-xs text-red-700 font-semibold">{formatMoney(selectedCustomer.current_debt)}</span>
                    </div>
                  )}
                  {Number(selectedCustomer.current_debt_usd) > 0 && (
                    <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></span>
                      <span className="text-xs text-blue-700 font-semibold">
                        ${Number(selectedCustomer.current_debt_usd).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </span>
                    </div>
                  )}
                  {Number(selectedCustomer.advance_balance) > 0 && (
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></span>
                      <span className="text-xs text-green-700 font-semibold">Avans: {formatMoney(selectedCustomer.advance_balance)}</span>
                    </div>
                  )}
                  {Number(selectedCustomer.current_debt) === 0 && Number(selectedCustomer.current_debt_usd) === 0 && (
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5">
                      <span className="text-xs text-green-700 font-semibold">✓ Qarz yo'q</span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  {(selectedCustomer.current_debt > 0 || Number(selectedCustomer.current_debt_usd) > 0) && (
                    <Button variant="success" size="sm" className="flex-1" onClick={() => {
                      setShowDetailDialog(false)
                      setTimeout(() => handlePayClick(selectedCustomer), 100)
                    }}>
                      <Banknote className="w-4 h-4 mr-1.5" />To'lov
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="flex-1 text-orange-600 border-orange-300" onClick={() => {
                    setShowDetailDialog(false)
                    setTimeout(() => handleAddDebtClick(selectedCustomer), 100)
                  }}>
                    <Plus className="w-4 h-4 mr-1.5" />Qarz qo'shish
                  </Button>
                </div>
              </div>

              {/* Stats Grid - 2x2 on mobile, 4 col on desktop */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
                  <p className="text-xs text-blue-600 mb-0.5">Jami xarid</p>
                  <p className="text-sm font-bold text-blue-800 truncate">{formatMoney(selectedCustomer.total_purchases)}</p>
                </div>
                <div className={`rounded-2xl p-3 text-center border ${Number(selectedCustomer.advance_balance) > 0 ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
                  <p className="text-xs text-gray-500 mb-0.5">Avans</p>
                  <p className="text-sm font-bold text-green-600 truncate">{formatMoney(selectedCustomer.advance_balance)}</p>
                </div>
                <div className={`rounded-2xl p-3 text-center border ${Number(selectedCustomer.current_debt) > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                  <p className="text-xs text-gray-500 mb-0.5 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>Qarz (so'm)
                  </p>
                  <p className={`text-sm font-bold truncate ${Number(selectedCustomer.current_debt) > 0 ? 'text-danger' : 'text-success'}`}>
                    {Number(selectedCustomer.current_debt) > 0 ? formatMoney(selectedCustomer.current_debt) : "0 so'm"}
                  </p>
                </div>
                <div className={`rounded-2xl p-3 text-center border ${Number(selectedCustomer.current_debt_usd) > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'}`}>
                  <p className="text-xs text-gray-500 mb-0.5 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>Qarz ($)
                  </p>
                  <p className={`text-sm font-bold truncate ${Number(selectedCustomer.current_debt_usd) > 0 ? 'text-blue-600' : 'text-success'}`}>
                    ${Number(selectedCustomer.current_debt_usd || 0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </p>
                </div>
              </div>
              {Number(selectedCustomer.credit_limit) > 0 && (
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-xl border border-border text-sm">
                  <span className="text-text-secondary">{t('creditLimit')}</span>
                  <span className="font-semibold">{formatMoney(selectedCustomer.credit_limit)}</span>
                </div>
              )}

              {/* Professional Excel Export Button */}
              <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-pos p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-green-600" />
                      {t('downloadFullReport')}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {t('allSalesProductsDebtInExcel')}
                    </p>
                  </div>
                  <Button
                    variant="success"
                    onClick={exportCustomerDataToExcel}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {t('downloadExcel')}
                  </Button>
                </div>
              </div>

              {/* Sales History */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    {t('salesHistory')} ({customerSales?.data?.length || 0})
                  </h4>
                </div>
                {loadingSales ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : customerSales?.data && customerSales.data.length > 0 ? (
                  <div className="border border-border rounded-pos overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="w-10"></th>
                          <th className="px-4 py-3 text-left text-sm font-medium">{t('date')}</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">{t('receiptNo')}</th>
                          <th className="px-4 py-3 text-center text-sm font-medium">{t('products')}</th>
                          <th className="px-4 py-3 text-right text-sm font-medium">{t('amount')}</th>
                          <th className="px-4 py-3 text-right text-sm font-medium">{t('paidAmount')}</th>
                          <th className="px-4 py-3 text-right text-sm font-medium">{t('debtAmount')}</th>
                          <th className="px-4 py-3 text-center text-sm font-medium">{t('status')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {customerSales.data.map((sale: Sale) => (
                          <React.Fragment key={sale.id}>
                            <tr
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => loadSaleItems(sale.id)}
                            >
                              <td className="px-2 py-3 text-center">
                                {loadingSaleItems === sale.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                                ) : expandedSaleId === sale.id ? (
                                  <ChevronDown className="w-4 h-4 mx-auto text-blue-600" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 mx-auto text-gray-400" />
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4 text-text-secondary" />
                                  {formatDateTashkent(sale.created_at)}
                                </div>
                                <div className="text-xs text-text-secondary ml-5">
                                  {formatTimeTashkent(sale.created_at)}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm font-medium">{sale.sale_number}</td>
                              <td className="px-4 py-3 text-sm text-center">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs">
                                  <Package className="w-3 h-3" />
                                  {sale.items_count || '?'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-semibold">{formatMoney(sale.total_amount)}</td>
                              <td className="px-4 py-3 text-sm text-right text-success">{formatMoney(sale.paid_amount)}</td>
                              <td className="px-4 py-3 text-sm text-right text-danger">
                                {sale.debt_amount > 0 ? formatMoney(sale.debt_amount) : '-'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge variant={
                                  sale.payment_status === 'PAID' ? 'success' :
                                  sale.payment_status === 'DEBT' ? 'danger' :
                                  sale.payment_status === 'PARTIAL' ? 'warning' : 'secondary'
                                }>
                                  {sale.payment_status === 'PAID' ? t('paid') :
                                   sale.payment_status === 'DEBT' ? t('onDebt') :
                                   sale.payment_status === 'PARTIAL' ? t('partial') : sale.payment_status}
                                </Badge>
                              </td>
                            </tr>
                            {/* Expanded items */}
                            {expandedSaleId === sale.id && saleItems[sale.id] && (
                              <tr key={`${sale.id}-items`}>
                                <td colSpan={8} className="p-0">
                                  <div className="bg-blue-50 p-4 border-t border-blue-200">
                                    <h5 className="font-medium text-sm mb-2 text-blue-800">{t('productsList')}:</h5>
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-gray-600">
                                          <th className="text-left py-1 px-2">{t('product')}</th>
                                          <th className="text-center py-1 px-2">{t('quantity')}</th>
                                          <th className="text-right py-1 px-2">{t('price')}</th>
                                          <th className="text-right py-1 px-2">{t('discount')}</th>
                                          <th className="text-right py-1 px-2">{t('total')}</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {saleItems[sale.id].map((item: SaleItem) => (
                                          <tr key={item.id} className="border-t border-blue-200">
                                            <td className="py-2 px-2 font-medium">{item.product_name}</td>
                                            <td className="py-2 px-2 text-center">{item.quantity} {item.uom_symbol}</td>
                                            <td className="py-2 px-2 text-right">{formatMoney(item.unit_price)}</td>
                                            <td className="py-2 px-2 text-right text-orange-600">
                                              {item.discount_amount > 0 ? `-${formatMoney(item.discount_amount)}` : '-'}
                                            </td>
                                            <td className="py-2 px-2 text-right font-semibold">{formatMoney(item.total_price)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-text-secondary bg-gray-50 rounded-pos">
                    <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>{t('noSalesFound')}</p>
                  </div>
                )}
              </div>

              {/* Payment/Debt History with Running Balance */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Banknote className="w-5 h-5" />
                    {t('debtPaymentHistory')} ({customerDebtHistory?.data?.length || 0})
                  </h4>
                </div>
                {customerDebtHistory?.data && customerDebtHistory.data.length > 0 ? (
                  <div className="border border-border rounded-pos overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium">{t('date')}</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">{t('movementType')}</th>
                          <th className="px-4 py-3 text-right text-sm font-medium">{t('amount')}</th>
                          <th className="px-4 py-3 text-right text-sm font-medium">{t('debtBefore')}</th>
                          <th className="px-4 py-3 text-right text-sm font-medium">{t('debtAfter')}</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">{t('notesLabel')}</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Kim tomonidan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {customerDebtHistory.data.map((record: DebtRecord) => {
                          const isPayment = record.transaction_type === 'PAYMENT' || record.transaction_type === 'DEBT_PAYMENT'
                          const isSale = record.transaction_type === 'SALE'
                          const isManual = record.reference_type === 'manual_adjustment' || record.reference_type === 'adjustment'
                          const isUsd = record.currency === 'USD'

                          return (
                            <tr key={record.id} className={cn("hover:bg-gray-50", isManual && "bg-orange-50/50")}>
                              <td className="px-4 py-3 text-sm">
                                <div>{formatDateTashkent(record.created_at)}</div>
                                <div className="text-xs text-text-secondary">{formatTimeTashkent(record.created_at)}</div>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                <Badge variant={isPayment ? 'success' : isSale ? 'warning' : isManual ? 'secondary' : 'secondary'}>
                                  {isPayment ? t('paymentTransaction') : isSale ? t('purchaseTransaction') : isManual ? '✏️ Qo\'shimcha qarz' : record.transaction_type}
                                  {isUsd && <span className="ml-1 text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-bold">$</span>}
                                </Badge>
                              </td>
                              <td className={cn(
                                "px-4 py-3 text-sm text-right font-semibold",
                                isPayment ? "text-green-600" : "text-red-600"
                              )}>
                                {record.currency === 'USD' ? (
                                  <span className="flex items-center justify-end gap-1 text-blue-600">
                                    {isPayment ? '−' : '+'}${Math.abs(Number(record.amount)).toLocaleString('ru-RU', {minimumFractionDigits:2,maximumFractionDigits:2})}
                                    <span className="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-bold">USD</span>
                                  </span>
                                ) : (
                                  <>{isPayment ? '-' : '+'}{formatMoney(Math.abs(Number(record.amount)))}</>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-gray-500">
                                {record.currency === 'USD'
                                  ? `$${Number(record.balance_before).toLocaleString('ru-RU', {minimumFractionDigits:2,maximumFractionDigits:2})}`
                                  : formatMoney(record.balance_before)
                                }
                              </td>
                              <td className={cn(
                                "px-4 py-3 text-sm text-right font-semibold",
                                record.balance_after > 0 ? "text-red-600" : "text-green-600"
                              )}>
                                {record.currency === 'USD'
                                  ? `$${Number(record.balance_after).toLocaleString('ru-RU', {minimumFractionDigits:2,maximumFractionDigits:2})}`
                                  : formatMoney(record.balance_after)
                                }
                              </td>
                              <td className="px-4 py-3 text-sm text-text-secondary max-w-[200px]">
                                <div className="truncate" title={record.description || '-'}>
                                  {record.description || '-'}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-text-secondary text-xs">
                                {record.created_by_name || '-'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-text-secondary bg-gray-50 rounded-pos">
                    <Banknote className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>{t('noHistoryFound')}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>{/* end scrollable body */}
        </DialogContent>
      </Dialog>

      {/* ══════════ CATEGORY MANAGER DIALOG ══════════ */}
      <Dialog open={showCategoryManager} onOpenChange={setShowCategoryManager}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-purple-600" />
              Mijoz kategoriyalari
            </DialogTitle>
            <DialogDescription>
              Kategoriya yarating, tahrirlang yoki o'chiring
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add/Edit form */}
            <div className="p-4 border-2 border-purple-100 rounded-xl bg-purple-50 space-y-3">
              <h4 className="font-semibold text-sm text-purple-800">
                {editingCategory ? 'Kategoriyani tahrirlash' : 'Yangi kategoriya'}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Nomi *</label>
                  <input
                    className="w-full px-3 py-2 border-2 border-border rounded-xl text-sm"
                    placeholder="Masalan: Qurilishchilar"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Rang</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="w-10 h-10 rounded-lg border-2 border-border cursor-pointer"
                      value={categoryForm.color}
                      onChange={(e) => setCategoryForm(f => ({ ...f, color: e.target.value }))}
                    />
                    <div className="flex gap-1 flex-wrap">
                      {['#6366f1','#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#14b8a6'].map(c => (
                        <button
                          key={c}
                          type="button"
                          className="w-6 h-6 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform"
                          style={{ backgroundColor: c, outline: categoryForm.color === c ? '2px solid #374151' : 'none', outlineOffset: '2px' }}
                          onClick={() => setCategoryForm(f => ({ ...f, color: c }))}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Tavsif (ixtiyoriy)</label>
                <input
                  className="w-full px-3 py-2 border-2 border-border rounded-xl text-sm"
                  placeholder="Bu kategoriya haqida qisqacha"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              {/* Preview */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">Ko'rinishi:</span>
                <span
                  className="px-3 py-1 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: categoryForm.color }}
                >
                  {categoryForm.name || 'Kategoriya nomi'}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveCategory}
                  disabled={categoryLoading || !categoryForm.name.trim()}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  size="sm"
                >
                  {categoryLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                  {editingCategory ? 'Saqlash' : 'Yaratish'}
                </Button>
                {editingCategory && (
                  <Button size="sm" variant="outline" onClick={() => { setEditingCategory(null); setCategoryForm({ name: '', description: '', color: '#6366f1' }) }}>
                    <X className="w-4 h-4 mr-1" />
                    Bekor
                  </Button>
                )}
              </div>
            </div>

            {/* Existing categories list */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Mavjud kategoriyalar ({categories.length})</h4>
              {categories.length === 0 ? (
                <div className="text-center py-8 text-text-secondary text-sm">
                  <Tag className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  Hali kategoriya yo'q
                </div>
              ) : (
                categories.map((cat: any) => (
                  <div key={cat.id} className="flex items-center justify-between p-3 border border-border rounded-xl hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      >
                        {cat.name.charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <p className="font-medium text-sm">{cat.name}</p>
                        <p className="text-xs text-text-secondary">
                          {cat.customer_count} ta mijoz
                          {cat.description && ` · ${cat.description}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingCategory(cat)
                          setCategoryForm({ name: cat.name, description: cat.description || '', color: cat.color || '#6366f1' })
                        }}
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-500 hover:text-red-700 hover:border-red-300"
                        onClick={() => handleDeleteCategory(cat.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryManager(false)}>Yopish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}