import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Plus, Search, Truck, Trash2, Edit, Loader2, Phone, Building, Eye,
  Banknote, CreditCard, DollarSign, X, MapPin, FileText, ChevronDown, ChevronUp, Download
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Button, Input, Card, CardContent, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui'
import api from '@/services/api'
import { formatMoney, formatInputNumber, formatPhone, cn, formatDateTashkent, formatTimeTashkent } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'

interface SupplierData {
  id: number; name: string; company_name?: string; contact_person?: string
  phone?: string; phone_secondary?: string; email?: string; address?: string
  city?: string; inn?: string; bank_account?: string; bank_name?: string; mfo?: string
  current_debt: number; advance_balance: number; notes?: string; is_active: boolean
  created_at?: string
}
interface DebtRecord {
  id: number; transaction_type: string; amount: number; balance_before: number
  balance_after: number; payment_type?: string; reference_type?: string
  description?: string; created_by_name?: string; is_deleted: boolean; created_at: string
}
interface SupplierForm {
  name: string; company_name?: string; contact_person?: string; phone?: string
  phone_secondary?: string; email?: string; address?: string; city?: string
  inn?: string; bank_account?: string; bank_name?: string; mfo?: string; notes?: string
  initial_debt?: number; initial_debt_note?: string
}
interface DebtForm { amount: number; description?: string }
interface PayForm { amount: number; payment_type: string; description?: string }

export default function SuppliersPage() {
  const qc = useQueryClient()
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const [showDebtOnly, setShowDebtOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<SupplierData | null>(null)
  const [selected, setSelected] = useState<SupplierData | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showDebtDialog, setShowDebtDialog] = useState(false)
  const [showPayDialog, setShowPayDialog] = useState(false)
  const [debtDisplay, setDebtDisplay] = useState('')
  const [payDisplay, setPayDisplay] = useState('')
  const [initDebtDisplay, setInitDebtDisplay] = useState('')

  const { register, handleSubmit, reset, setValue } = useForm<SupplierForm>()
  const { register: regDebt, handleSubmit: hDebt, reset: rDebt, setValue: svDebt } = useForm<DebtForm>()
  const { register: regPay, handleSubmit: hPay, reset: rPay, setValue: svPay } = useForm<PayForm>({ defaultValues: { payment_type: 'cash' } })

  const { data: suppData, isLoading } = useQuery({
    queryKey: ['suppliers', search, showDebtOnly, page],
    queryFn: async () => {
      const p = new URLSearchParams({ page: String(page), per_page: '50' })
      if (search) p.set('q', search)
      if (showDebtOnly) p.set('has_debt', 'true')
      const res = await api.get(`/suppliers?${p}`)
      return res.data || { data: [], total: 0, total_debt: 0 }
    }
  })

  const { data: debtHistory } = useQuery({
    queryKey: ['supplier-debt-history', selected?.id],
    queryFn: async () => (await api.get(`/suppliers/${selected!.id}/debt-history?per_page=100`)).data,
    enabled: !!selected && showDetail
  })

  const suppliers: SupplierData[] = suppData?.data || []
  const totalDebt = suppData?.total_debt || 0

  const inv = () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); qc.invalidateQueries({ queryKey: ['supplier-debt-history'] }) }
  const errMsg = (e: any) => { const d = e.response?.data?.detail; return typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join(', ') : 'Xatolik' }

  const createMut = useMutation({
    mutationFn: (d: SupplierForm) => api.post('/suppliers', d).then(r => r.data),
    onSuccess: () => { toast.success("Ta'minotchi yaratildi!"); inv(); setShowAdd(false); reset(); setInitDebtDisplay('') },
    onError: (e: any) => toast.error(errMsg(e))
  })
  const updateMut = useMutation({
    mutationFn: (d: SupplierForm & { id: number }) => { const { id, ...rest } = d; return api.put(`/suppliers/${id}`, rest).then(r => r.data) },
    onSuccess: () => { toast.success("Yangilandi!"); inv(); setShowAdd(false); setEditing(null); reset() },
    onError: (e: any) => toast.error(errMsg(e))
  })
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/suppliers/${id}`).then(r => r.data),
    onSuccess: () => { toast.success("Arxivlandi!"); inv() },
    onError: (e: any) => toast.error(errMsg(e))
  })
  const addDebtMut = useMutation({
    mutationFn: (d: DebtForm) => api.post(`/suppliers/${selected!.id}/add-debt`, d).then(r => r.data),
    onSuccess: (d) => { toast.success(`Qarz qo'shildi! Joriy: ${formatMoney(d.current_debt)}`); inv(); setShowDebtDialog(false); rDebt(); setDebtDisplay('') },
    onError: (e: any) => toast.error(errMsg(e))
  })
  const payMut = useMutation({
    mutationFn: (d: PayForm) => api.post(`/suppliers/${selected!.id}/pay-debt`, d).then(r => r.data),
    onSuccess: (d) => { toast.success(`To'lov qabul qilindi! Qolgan: ${formatMoney(d.current_debt)}`); inv(); setShowPayDialog(false); rPay(); setPayDisplay('') },
    onError: (e: any) => toast.error(errMsg(e))
  })

  const onSubmit = (d: SupplierForm) => editing ? updateMut.mutate({ ...d, id: editing.id }) : createMut.mutate(d)

  // ===== EXCEL EXPORT =====
  const exportSupplierExcel = async (supplier: SupplierData) => {
    try {
      toast.loading("Excel tayyorlanmoqda...")
      const historyRes = await api.get(`/suppliers/${supplier.id}/debt-history?per_page=200`)
      const records: DebtRecord[] = historyRes.data?.data || []
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.default.Workbook()
      const ws = wb.addWorksheet(supplier.name.substring(0, 30))
      ws.mergeCells('A1:G1')
      ws.getCell('A1').value = `TA'MINOTCHI: ${supplier.name}`
      ws.getCell('A1').font = { bold: true, size: 14 }; ws.getCell('A1').alignment = { horizontal: 'center' }
      const info = [
        ['Kompaniya:', supplier.company_name || '-', '', 'Telefon:', supplier.phone || '-'],
        ['Kontakt:', supplier.contact_person || '-', '', 'Manzil:', supplier.address || '-'],
        ['INN:', supplier.inn || '-', '', 'Bank:', supplier.bank_name || '-'],
      ]
      info.forEach((row, i) => { row.forEach((val, j) => { ws.getCell(i + 3, j + 1).value = val }) })
      ws.getCell('A7').value = 'JORIY QARZ:'; ws.getCell('A7').font = { bold: true, size: 13 }
      ws.getCell('C7').value = supplier.current_debt; ws.getCell('C7').numFmt = '#,##0'
      ws.getCell('C7').font = { bold: true, size: 13, color: { argb: supplier.current_debt > 0 ? 'FFDC143C' : 'FF228B22' } }
      if (supplier.notes) { ws.getCell('A8').value = `Izoh: ${supplier.notes}`; ws.getCell('A8').font = { italic: true, color: { argb: 'FF666666' } } }
      const ts = 10
      ws.getCell(`A${ts}`).value = `TARIX (${records.length})`; ws.getCell(`A${ts}`).font = { bold: true, size: 12 }
      const hdr = ['Sana', 'Turi', 'Summa', 'Oldin', 'Keyin', 'Izoh', 'Kim']
      hdr.forEach((h, i) => { const c = ws.getCell(ts + 1, i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } } })
      records.forEach((r, i) => {
        const isPay = r.transaction_type === 'DEBT_PAYMENT'; const row = ts + 2 + i
        ws.getCell(row, 1).value = r.created_at ? new Date(r.created_at).toLocaleString('uz') : ''
        ws.getCell(row, 2).value = isPay ? "To'lov" : 'Qarz'
        ws.getCell(row, 3).value = isPay ? -Math.abs(r.amount) : r.amount; ws.getCell(row, 3).numFmt = '#,##0'
        ws.getCell(row, 3).font = { bold: true, color: { argb: isPay ? 'FF228B22' : 'FFDC143C' } }
        ws.getCell(row, 4).value = r.balance_before; ws.getCell(row, 4).numFmt = '#,##0'
        ws.getCell(row, 5).value = r.balance_after; ws.getCell(row, 5).numFmt = '#,##0'
        ws.getCell(row, 5).font = { bold: true, color: { argb: r.balance_after > 0 ? 'FFDC143C' : 'FF228B22' } }
        ws.getCell(row, 6).value = r.description || '-'
        ws.getCell(row, 7).value = r.created_by_name || '-'
      })
      ws.columns = [{ width: 20 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 40 }, { width: 18 }]
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `taminotchi_${supplier.name.replace(/\s/g, '_')}.xlsx`; a.click()
      toast.dismiss(); toast.success('Excel yuklab olindi!')
    } catch { toast.dismiss(); toast.error('Xatolik') }
  }

  const exportAllSuppliersExcel = async () => {
    try {
      toast.loading("Umumiy hisobot tayyorlanmoqda...")
      const allRes = await api.get('/suppliers?per_page=200')
      const allSuppliers: SupplierData[] = allRes.data?.data || []
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.default.Workbook()
      const ws1 = wb.addWorksheet("Umumiy")
      ws1.mergeCells('A1:F1')
      ws1.getCell('A1').value = "TA'MINOTCHILAR UMUMIY HISOBOTI"; ws1.getCell('A1').font = { bold: true, size: 14 }; ws1.getCell('A1').alignment = { horizontal: 'center' }
      ws1.getCell('A2').value = `Sana: ${new Date().toLocaleDateString('uz')} | Jami: ${allSuppliers.length} | Umumiy qarz: ${formatMoney(totalDebt)}`
      ws1.getCell('A2').font = { bold: true }
      const h1 = ["Ta'minotchi", 'Kompaniya', 'Telefon', 'Qarz', 'Izoh']
      h1.forEach((h, i) => { const c = ws1.getCell(4, i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } } })
      allSuppliers.forEach((s, i) => {
        ws1.getCell(5 + i, 1).value = s.name; ws1.getCell(5 + i, 2).value = s.company_name || '-'
        ws1.getCell(5 + i, 3).value = s.phone || '-'; ws1.getCell(5 + i, 4).value = s.current_debt; ws1.getCell(5 + i, 4).numFmt = '#,##0'
        ws1.getCell(5 + i, 4).font = { bold: true, color: { argb: s.current_debt > 0 ? 'FFDC143C' : 'FF228B22' } }
        ws1.getCell(5 + i, 5).value = s.notes || '-'
      })
      ws1.columns = [{ width: 30 }, { width: 25 }, { width: 18 }, { width: 20 }, { width: 40 }]
      for (const s of allSuppliers.filter(x => x.current_debt > 0)) {
        try {
          const hRes = await api.get(`/suppliers/${s.id}/debt-history?per_page=200`)
          const records: DebtRecord[] = hRes.data?.data || []
          if (!records.length) continue
          const ws = wb.addWorksheet(s.name.substring(0, 28))
          ws.getCell('A1').value = s.name; ws.getCell('A1').font = { bold: true, size: 12 }
          ws.getCell('A2').value = `Qarz: ${formatMoney(s.current_debt)}`; ws.getCell('A2').font = { bold: true, color: { argb: 'FFDC143C' } }
          const hs = ['Sana', 'Turi', 'Summa', 'Qarz', 'Izoh']
          hs.forEach((h, i) => { ws.getCell(4, i + 1).value = h; ws.getCell(4, i + 1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getCell(4, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } } })
          records.forEach((r, i) => { const isPay = r.transaction_type === 'DEBT_PAYMENT'
            ws.getCell(5 + i, 1).value = r.created_at ? new Date(r.created_at).toLocaleString('uz') : ''
            ws.getCell(5 + i, 2).value = isPay ? "To'lov" : 'Qarz'
            ws.getCell(5 + i, 3).value = isPay ? -Math.abs(r.amount) : r.amount; ws.getCell(5 + i, 3).numFmt = '#,##0'
            ws.getCell(5 + i, 4).value = r.balance_after; ws.getCell(5 + i, 4).numFmt = '#,##0'
            ws.getCell(5 + i, 5).value = r.description || '-'
          })
          ws.columns = [{ width: 20 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 40 }]
        } catch { /* skip */ }
      }
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `taminotchilar_${new Date().toISOString().split('T')[0]}.xlsx`; a.click()
      toast.dismiss(); toast.success('Umumiy hisobot yuklab olindi!')
    } catch { toast.dismiss(); toast.error('Xatolik') }
  }
  const openEdit = (s: SupplierData) => {
    setEditing(s); Object.entries(s).forEach(([k, v]) => { if (v !== null && v !== undefined) setValue(k as any, v) })
    setShowAdd(true)
  }
  const openDetail = (s: SupplierData) => { setSelected(s); setShowDetail(true) }
  const openDebt = (s: SupplierData) => { setSelected(s); rDebt(); setDebtDisplay(''); setShowDebtDialog(true) }
  const openPay = (s: SupplierData) => { setSelected(s); rPay(); setPayDisplay(''); svPay('amount', s.current_debt); setPayDisplay(formatInputNumber(s.current_debt)); setShowPayDialog(true) }

  return (
    <div className="space-y-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            Ta'minotchilar
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Qarz: <span className="font-bold text-red-600">{formatMoney(totalDebt)}</span>
            <span className="text-gray-400 ml-1">({suppliers.length} ta)</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportAllSuppliersExcel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-green-400 text-green-700 text-sm font-semibold active:scale-95 transition-all">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            onClick={() => { setShowDebtOnly(!showDebtOnly); setPage(1) }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold active:scale-95 transition-all",
              showDebtOnly
                ? "bg-danger text-white"
                : "border border-border text-gray-600"
            )}>
            <DollarSign className="w-4 h-4" />
            <span className="hidden sm:inline">{showDebtOnly ? "Barchasi" : "Qarzdorlar"}</span>
          </button>
          <button
            onClick={() => { setEditing(null); reset(); setInitDebtDisplay(''); setShowAdd(true) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold active:scale-95 transition-all">
            <Plus className="w-4 h-4" />
            Qo'shish
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Ta'minotchi qidirish..."
          className="w-full pl-9 pr-4 h-11 border border-border rounded-2xl text-sm focus:outline-none focus:border-primary bg-white shadow-sm"
        />
      </div>

      {/* ── Supplier cards ── */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Truck className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">Ta'minotchilar topilmadi</p>
        </div>
      ) : (
        <div className="space-y-2">
          {suppliers.map(s => (
            <div key={s.id}
              className={cn(
                "bg-white rounded-2xl border shadow-sm p-3 transition-all",
                s.current_debt > 0 ? "border-l-4 border-l-danger border-border" : "border-border"
              )}>
              {/* Row 1: name + debt + actions */}
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{s.name}</span>
                    {s.company_name && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-lg">{s.company_name}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {s.phone && (
                      <a href={`tel:${s.phone}`}
                        className="flex items-center gap-1 text-xs text-blue-600">
                        <Phone className="w-3 h-3" />{s.phone}
                      </a>
                    )}
                    {s.city && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <MapPin className="w-3 h-3" />{s.city}
                      </span>
                    )}
                    {s.contact_person && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Building className="w-3 h-3" />{s.contact_person}
                      </span>
                    )}
                  </div>
                  {s.notes && (
                    <p className="text-xs text-gray-500 mt-1.5 bg-yellow-50 border border-yellow-100 rounded-xl px-2 py-1 leading-relaxed line-clamp-2">
                      {s.notes}
                    </p>
                  )}
                </div>
                {/* Debt badge */}
                {s.current_debt > 0 && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-gray-400">Qarz</p>
                    <p className="font-bold text-sm text-red-600 whitespace-nowrap">{formatMoney(s.current_debt)}</p>
                  </div>
                )}
              </div>

              {/* Row 2: action buttons */}
              <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
                {s.current_debt > 0 && (
                  <button onClick={() => openPay(s)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-success text-white text-xs font-semibold active:scale-95">
                    <Banknote className="w-3.5 h-3.5" /> To'lov
                  </button>
                )}
                <button onClick={() => openDebt(s)}
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-orange-300 text-orange-600 text-xs font-semibold active:scale-95">
                  <Plus className="w-3.5 h-3.5" /> Qarz
                </button>
                <button onClick={() => openDetail(s)}
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border text-gray-600 text-xs font-semibold active:scale-95">
                  <Eye className="w-3.5 h-3.5" /> Ko'rish
                </button>
                <button onClick={() => openEdit(s)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-border text-gray-500 active:bg-gray-100">
                  <Edit className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => { if (confirm("Arxivlash?")) deleteMut.mutate(s.id) }}
                  className="w-9 h-9 flex items-center justify-center rounded-xl border border-red-200 text-danger active:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-2xl">
          {/* Header */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-2xl">
                <Truck className="w-4 h-4 text-blue-600" />
              </div>
              <h2 className="text-base font-bold">
                {editing ? "Ta'minotchini tahrirlash" : "Yangi ta'minotchi"}
              </h2>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

              {/* Asosiy ma'lumotlar */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Asosiy</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Nomi *</label>
                  <Input {...register('name', { required: true })} placeholder="Ta'minotchi nomi" className="h-11" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">Kompaniya</label>
                    <Input {...register('company_name')} placeholder="OOO, MChJ..." className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">Kontakt shaxs</label>
                    <Input {...register('contact_person')} placeholder="F.I.O" className="h-11" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">Telefon</label>
                    <Input {...register('phone')} placeholder="+998..." className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">2-Telefon</label>
                    <Input {...register('phone_secondary')} placeholder="+998..." className="h-11" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">Shahar</label>
                    <Input {...register('city')} placeholder="Toshkent" className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">Email</label>
                    <Input {...register('email')} placeholder="email@..." className="h-11" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Manzil</label>
                  <Input {...register('address')} placeholder="Ko'cha, uy..." className="h-11" />
                </div>
              </div>

              {/* Bank ma'lumotlari */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bank</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">INN</label>
                    <Input {...register('inn')} placeholder="123456789" className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">MFO</label>
                    <Input {...register('mfo')} placeholder="01234" className="h-11" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Hisob raqam</label>
                  <Input {...register('bank_account')} placeholder="2020800..." className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">Bank nomi</label>
                  <Input {...register('bank_name')} placeholder="Kapitalbank, Ipak yuli..." className="h-11" />
                </div>
              </div>

              {/* Izoh */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Izoh</label>
                <textarea {...register('notes')} rows={2}
                  className="w-full px-3 py-2.5 text-sm border border-border rounded-2xl focus:outline-none focus:border-primary resize-none"
                  placeholder="Qo'shimcha ma'lumot..." />
              </div>

              {/* Boshlang'ich qarz — faqat yangi ta'minotchi uchun */}
              {!editing && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
                  <p className="text-sm font-semibold text-orange-700">Boshlang'ich qarz (ixtiyoriy)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">Qarz summasi</label>
                      <input type="text" inputMode="numeric" value={initDebtDisplay}
                        onChange={e => {
                          const n = parseFloat(e.target.value.replace(/\s/g, '')) || 0
                          setInitDebtDisplay(n > 0 ? formatInputNumber(n) : '')
                          setValue('initial_debt', n)
                        }}
                        className="w-full h-11 px-3 border border-orange-300 rounded-xl text-sm font-bold text-center text-orange-600 focus:outline-none focus:border-orange-500 bg-white"
                        placeholder="0" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">Izoh</label>
                      <Input {...register('initial_debt_note')} placeholder="Eski qarz sababi..." className="h-11" />
                    </div>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-1 pb-2">
                <button type="button"
                  onClick={() => { setShowAdd(false); setEditing(null) }}
                  className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
                  Bekor
                </button>
                <button type="submit"
                  disabled={createMut.isPending || updateMut.isPending}
                  className="flex-1 h-12 rounded-2xl bg-primary text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                  {(createMut.isPending || updateMut.isPending)
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Saqlanmoqda...</>
                    : editing ? "Saqlash" : "Yaratish"}
                </button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Debt Dialog */}
      <Dialog open={showDebtDialog} onOpenChange={setShowDebtDialog}>
        <DialogContent className="w-full max-w-sm p-0 gap-0 rounded-2xl overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-orange-100 rounded-2xl">
                <Plus className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-base">Qarz qo'shish</h3>
                {selected && <p className="text-xs text-gray-500">{selected.name}</p>}
              </div>
            </div>

            {/* Current debt info */}
            {selected && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">Joriy qarz:</span>
                <span className="font-bold text-red-600">{formatMoney(selected.current_debt)}</span>
              </div>
            )}

            <form onSubmit={hDebt(d => addDebtMut.mutate(d))} className="space-y-3">
              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Summa *</label>
                <input type="text" inputMode="numeric" value={debtDisplay}
                  onChange={e => {
                    const n = parseFloat(e.target.value.replace(/\s/g, '')) || 0
                    setDebtDisplay(n > 0 ? formatInputNumber(n) : '')
                    svDebt('amount', n)
                  }}
                  className="w-full h-14 px-4 text-2xl font-bold text-center border-2 border-orange-200 rounded-2xl focus:border-orange-500 outline-none text-orange-600 bg-orange-50"
                  placeholder="0" />
              </div>
              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Sabab *</label>
                <textarea {...regDebt('description', { required: true })} rows={2}
                  className="w-full px-3 py-2.5 text-sm border border-border rounded-2xl focus:outline-none focus:border-orange-400 resize-none"
                  placeholder="Qarz sababi..." />
              </div>
              {/* Buttons */}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowDebtDialog(false)}
                  className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
                  Bekor
                </button>
                <button type="submit" disabled={addDebtMut.isPending}
                  className="flex-1 h-12 rounded-2xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                  {addDebtMut.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Qo'shilmoqda...</>
                    : <><Plus className="w-4 h-4" />Qo'shish</>}
                </button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay Debt Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="w-full max-w-sm p-0 gap-0 rounded-2xl overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-green-100 rounded-2xl">
                <Banknote className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-base">To'lov qilish</h3>
                {selected && <p className="text-xs text-gray-500">{selected.name}</p>}
              </div>
            </div>

            {/* Current debt */}
            {selected && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">Qarz:</span>
                <span className="text-lg font-bold text-red-600">{formatMoney(selected.current_debt)}</span>
              </div>
            )}

            <form onSubmit={hPay(d => payMut.mutate(d))} className="space-y-3">
              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Summa *</label>
                <input type="text" inputMode="numeric" value={payDisplay}
                  onChange={e => {
                    const n = parseFloat(e.target.value.replace(/\s/g, '')) || 0
                    setPayDisplay(n > 0 ? formatInputNumber(n) : '')
                    svPay('amount', n)
                  }}
                  className="w-full h-14 px-4 text-2xl font-bold text-center border-2 border-green-200 rounded-2xl focus:border-green-500 outline-none text-green-700 bg-green-50"
                  placeholder="0" />
              </div>
              {/* Payment type */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">To'lov turi</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 'cash', l: "Naqd", i: Banknote },
                    { v: 'card', l: "Karta", i: CreditCard },
                    { v: 'transfer', l: "O'tkazma", i: Building }
                  ].map(pt => (
                    <label key={pt.v} className="cursor-pointer">
                      <input type="radio" {...regPay('payment_type')} value={pt.v} className="sr-only peer" />
                      <div className="flex flex-col items-center gap-1.5 p-3 border-2 border-border rounded-2xl peer-checked:border-green-500 peer-checked:bg-green-50 transition-all active:scale-95">
                        <pt.i className="w-5 h-5" />
                        <span className="text-xs font-medium">{pt.l}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {/* Note */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Izoh</label>
                <Input {...regPay('description')} placeholder="Izoh..." className="h-11" />
              </div>
              {/* Buttons */}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowPayDialog(false)}
                  className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
                  Bekor
                </button>
                <button type="submit" disabled={payMut.isPending}
                  className="flex-1 h-12 rounded-2xl bg-success text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                  {payMut.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />To'lanmoqda...</>
                    : <><Banknote className="w-4 h-4" />To'lash</>}
                </button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 gap-0 rounded-none sm:rounded-2xl">

          {/* Fixed header */}
          <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-border">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">{selected?.name}</h2>
                {selected?.company_name && (
                  <p className="text-xs text-gray-500 mt-0.5">{selected.company_name}</p>
                )}
              </div>
              {selected && (
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-400">Joriy qarz</p>
                  <p className={cn("text-lg font-bold", selected.current_debt > 0 ? "text-red-600" : "text-success")}>
                    {formatMoney(selected.current_debt)}
                  </p>
                </div>
              )}
            </div>
            {/* Action buttons */}
            {selected && (
              <div className="flex gap-2 mt-3">
                {selected.current_debt > 0 && (
                  <button onClick={() => { setShowDetail(false); setTimeout(() => openPay(selected), 100) }}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl bg-success text-white text-xs font-semibold active:scale-95">
                    <Banknote className="w-3.5 h-3.5" /> To'lov
                  </button>
                )}
                <button onClick={() => { setShowDetail(false); setTimeout(() => openDebt(selected), 100) }}
                  className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-orange-300 text-orange-600 text-xs font-semibold active:scale-95">
                  <Plus className="w-3.5 h-3.5" /> Qarz
                </button>
                <button onClick={() => exportSupplierExcel(selected)}
                  className="flex items-center justify-center gap-1.5 px-3 h-9 rounded-xl border border-border text-gray-600 text-xs font-semibold active:scale-95">
                  <Download className="w-3.5 h-3.5" /> Excel
                </button>
              </div>
            )}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {selected && (
              <>
                {/* Contact info chips */}
                <div className="grid grid-cols-2 gap-2">
                  {selected.phone && (
                    <a href={`tel:${selected.phone}`}
                      className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-2xl">
                      <Phone className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-blue-700 truncate">{selected.phone}</span>
                    </a>
                  )}
                  {selected.phone_secondary && (
                    <a href={`tel:${selected.phone_secondary}`}
                      className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-2xl">
                      <Phone className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-blue-700 truncate">{selected.phone_secondary}</span>
                    </a>
                  )}
                  {selected.contact_person && (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 border border-border rounded-2xl">
                      <Building className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate">{selected.contact_person}</span>
                    </div>
                  )}
                  {selected.email && (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 border border-border rounded-2xl">
                      <span className="text-sm">📧</span>
                      <span className="text-sm text-gray-700 truncate">{selected.email}</span>
                    </div>
                  )}
                  {(selected.address || selected.city) && (
                    <div className="col-span-2 flex items-center gap-2 p-3 bg-gray-50 border border-border rounded-2xl">
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700">
                        {selected.address}{selected.city ? `, ${selected.city}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bank info */}
                {(selected.inn || selected.bank_account || selected.bank_name) && (
                  <div className="bg-gray-50 border border-border rounded-2xl p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Bank</p>
                    {selected.inn && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">INN:</span>
                        <span className="font-medium">{selected.inn}</span>
                      </div>
                    )}
                    {selected.bank_account && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">H/R:</span>
                        <span className="font-medium font-mono text-xs">{selected.bank_account}</span>
                      </div>
                    )}
                    {selected.bank_name && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Bank:</span>
                        <span className="font-medium">{selected.bank_name} {selected.mfo ? `(${selected.mfo})` : ''}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {selected.notes && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3">
                    <p className="text-xs font-semibold text-yellow-700 mb-1">📝 Izoh</p>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{selected.notes}</p>
                  </div>
                )}

                {/* Debt history */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />
                    Tarix ({debtHistory?.data?.length || 0})
                  </p>
                  {debtHistory?.data && debtHistory.data.length > 0 ? (
                    <div className="space-y-2">
                      {debtHistory.data.map((r: DebtRecord) => {
                        const isPay = r.transaction_type === 'DEBT_PAYMENT'
                        const typeLabel = isPay ? "To'lov"
                          : r.reference_type === 'initial' ? "Boshlang'ich"
                          : r.reference_type === 'stock_income' ? 'Kirim'
                          : 'Qarz'
                        return (
                          <div key={r.id}
                            className={cn(
                              "rounded-2xl border p-3 transition-opacity",
                              isPay ? "bg-green-50 border-green-200 border-l-4 border-l-success"
                                    : "bg-red-50 border-red-200 border-l-4 border-l-danger",
                              r.is_deleted && "opacity-40 line-through"
                            )}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className={cn(
                                  "text-xs font-semibold px-2 py-0.5 rounded-lg",
                                  isPay ? "bg-green-100 text-success" : "bg-red-100 text-danger"
                                )}>
                                  {typeLabel}
                                </span>
                                <p className="text-xs text-gray-400 mt-1">
                                  {formatDateTashkent(r.created_at)} · {formatTimeTashkent(r.created_at)}
                                </p>
                                {r.created_by_name && (
                                  <p className="text-xs text-gray-400">{r.created_by_name}</p>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className={cn("font-bold text-base", isPay ? "text-success" : "text-danger")}>
                                  {isPay ? '−' : '+'}{formatMoney(Math.abs(r.amount))}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Qoldi: <span className={cn("font-semibold", r.balance_after > 0 ? "text-danger" : "text-success")}>
                                    {formatMoney(r.balance_after)}
                                  </span>
                                </p>
                              </div>
                            </div>
                            {r.description && (
                              <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-200/60 leading-relaxed">
                                {r.description}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-center text-gray-400 text-sm py-6">Tarix bo'sh</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Fixed footer */}
          <div className="flex-shrink-0 px-4 pb-5 pt-3 border-t border-border">
            <button onClick={() => setShowDetail(false)}
              className="w-full h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
              Yopish
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
