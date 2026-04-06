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
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2"><Truck className="w-6 h-6 text-blue-600" />Ta'minotchilar</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-1">Umumiy qarz: <span className="font-bold text-red-600">{formatMoney(totalDebt)}</span> <span className="text-gray-400">({suppliers.length} ta)</span></p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportAllSuppliersExcel}><Download className="w-4 h-4 mr-1" />Excel</Button>
          <Button variant={showDebtOnly ? "primary" : "outline"} size="sm" onClick={() => { setShowDebtOnly(!showDebtOnly); setPage(1) }}><DollarSign className="w-4 h-4 mr-1" />{showDebtOnly ? 'Barchasi' : 'Qarzdorlar'}</Button>
          <Button size="sm" onClick={() => { setEditing(null); reset(); setInitDebtDisplay(''); setShowAdd(true) }}><Plus className="w-4 h-4 mr-1" />Qo'shish</Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Qidirish..." className="pl-10" />
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div> : (
        <div className="grid gap-3">
          {suppliers.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-gray-400"><Truck className="w-10 h-10 mx-auto mb-3 opacity-50" /><p>Ta'minotchilar topilmadi</p></CardContent></Card>
          ) : suppliers.map(s => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-3 md:p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="p-2 bg-blue-100 rounded-lg shrink-0 hidden sm:block"><Truck className="w-5 h-5 text-blue-600" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm md:text-base">{s.name}</h3>
                        {s.company_name && <span className="text-xs text-gray-400">({s.company_name})</span>}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-400">
                        {s.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                        {s.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{s.city}</span>}
                        {s.contact_person && <span className="flex items-center gap-1"><Building className="w-3 h-3" />{s.contact_person}</span>}
                      </div>
                      {s.notes && (
                        <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-100">
                          <p className="text-xs text-gray-600 leading-relaxed">{s.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0">
                    {s.current_debt > 0 && (
                      <div className="text-right">
                        <p className="text-[10px] text-gray-400 leading-none">Qarz:</p>
                        <p className="font-bold text-base md:text-lg text-red-600">{formatMoney(s.current_debt)}</p>
                      </div>
                    )}
                    <div className="flex gap-1">
                      {s.current_debt > 0 && <Button variant="success" size="sm" onClick={() => openPay(s)} className="h-8 text-xs"><Banknote className="w-3.5 h-3.5 mr-1" /><span className="hidden sm:inline">To'lov</span></Button>}
                      <Button variant="outline" size="sm" onClick={() => openDebt(s)} className="h-8 text-orange-600 border-orange-300"><Plus className="w-3.5 h-3.5" /></Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(s)} className="h-8"><Edit className="w-3.5 h-3.5" /></Button>
                      <Button variant="outline" size="sm" onClick={() => openDetail(s)} className="h-8"><Eye className="w-3.5 h-3.5" /></Button>
                      <Button variant="outline" size="sm" onClick={() => { if (confirm("Arxivlash?")) deleteMut.mutate(s.id) }} className="h-8 text-red-500"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Ta'minotchini tahrirlash" : "Yangi ta'minotchi"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Nomi *</label><Input {...register('name', { required: true })} /></div>
              <div><label className="text-sm font-medium">Kompaniya</label><Input {...register('company_name')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Kontakt shaxs</label><Input {...register('contact_person')} /></div>
              <div><label className="text-sm font-medium">Telefon</label><Input {...register('phone')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">2-Telefon</label><Input {...register('phone_secondary')} /></div>
              <div><label className="text-sm font-medium">Email</label><Input {...register('email')} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Manzil</label><Input {...register('address')} /></div>
              <div><label className="text-sm font-medium">Shahar</label><Input {...register('city')} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-sm font-medium">INN</label><Input {...register('inn')} /></div>
              <div><label className="text-sm font-medium">Bank hisob</label><Input {...register('bank_account')} /></div>
              <div><label className="text-sm font-medium">MFO</label><Input {...register('mfo')} /></div>
            </div>
            <div><label className="text-sm font-medium">Bank nomi</label><Input {...register('bank_name')} /></div>
            <div><label className="text-sm font-medium">Izoh</label><textarea {...register('notes')} rows={2} className="w-full px-3 py-2 text-sm border rounded-lg" /></div>

            {!editing && (
              <div className="border-t pt-3 space-y-3">
                <h4 className="text-sm font-semibold text-orange-600">Boshlang'ich qarz (ixtiyoriy)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Qarz summasi</label>
                    <input type="text" inputMode="numeric" value={initDebtDisplay}
                      onChange={e => { const n = parseFloat(e.target.value.replace(/\s/g, '')) || 0; setInitDebtDisplay(n > 0 ? formatInputNumber(n) : ''); setValue('initial_debt', n) }}
                      className="w-full h-10 px-3 border rounded-lg text-sm font-bold text-center text-orange-600" placeholder="0" />
                  </div>
                  <div><label className="text-sm font-medium">Qarz izohi</label><Input {...register('initial_debt_note')} placeholder="Eski qarz..." /></div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowAdd(false); setEditing(null) }}>Bekor qilish</Button>
              <Button type="submit" className="flex-1" disabled={createMut.isPending || updateMut.isPending}>
                {(createMut.isPending || updateMut.isPending) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editing ? 'Saqlash' : 'Yaratish'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Debt Dialog */}
      <Dialog open={showDebtDialog} onOpenChange={setShowDebtDialog}>
        <DialogContent className="max-w-[380px]">
          <DialogHeader><DialogTitle className="text-orange-600">Qarz qo'shish</DialogTitle></DialogHeader>
          {selected && <div className="bg-orange-50 p-3 rounded-lg mb-3 text-center">
            <p className="font-semibold">{selected.name}</p>
            <p className="text-xs text-gray-500">Joriy qarz: <span className="font-bold text-red-600">{formatMoney(selected.current_debt)}</span></p>
          </div>}
          <form onSubmit={hDebt(d => addDebtMut.mutate(d))} className="space-y-3">
            <div><label className="text-sm font-medium">Summa *</label>
              <input type="text" inputMode="numeric" value={debtDisplay}
                onChange={e => { const n = parseFloat(e.target.value.replace(/\s/g, '')) || 0; setDebtDisplay(n > 0 ? formatInputNumber(n) : ''); svDebt('amount', n) }}
                className="w-full h-11 px-3 text-lg font-bold text-center border-2 border-orange-200 rounded-lg focus:border-orange-500 outline-none" />
            </div>
            <div><label className="text-sm font-medium">Izoh *</label>
              <textarea {...regDebt('description', { required: true })} rows={2} className="w-full px-3 py-2 text-sm border rounded-lg" placeholder="Qarz sababi..." />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowDebtDialog(false)}>Bekor</Button>
              <button type="submit" disabled={addDebtMut.isPending} className="flex-1 h-10 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                {addDebtMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Qo'shish
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pay Debt Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="max-w-[380px]">
          <DialogHeader><DialogTitle className="text-green-600">To'lov qilish</DialogTitle></DialogHeader>
          {selected && <div className="bg-red-50 p-3 rounded-lg mb-3 text-center">
            <p className="font-semibold">{selected.name}</p>
            <p className="text-lg font-bold text-red-600">{formatMoney(selected.current_debt)}</p>
          </div>}
          <form onSubmit={hPay(d => payMut.mutate(d))} className="space-y-3">
            <div><label className="text-sm font-medium">Summa *</label>
              <input type="text" inputMode="numeric" value={payDisplay}
                onChange={e => { const n = parseFloat(e.target.value.replace(/\s/g, '')) || 0; setPayDisplay(n > 0 ? formatInputNumber(n) : ''); svPay('amount', n) }}
                className="w-full h-11 px-3 text-lg font-bold text-center border-2 border-green-200 rounded-lg focus:border-green-500 outline-none" />
            </div>
            <div><label className="text-sm font-medium">To'lov turi</label>
              <div className="grid grid-cols-3 gap-2">
                {[{ v: 'cash', l: 'Naqd', i: Banknote }, { v: 'card', l: 'Karta', i: CreditCard }, { v: 'transfer', l: "O'tkazma", i: Building }].map(pt => (
                  <label key={pt.v} className="cursor-pointer"><input type="radio" {...regPay('payment_type')} value={pt.v} className="sr-only peer" />
                    <div className="flex flex-col items-center gap-1 p-2 border-2 rounded-lg peer-checked:border-green-500 peer-checked:bg-green-50"><pt.i className="w-4 h-4" /><span className="text-xs">{pt.l}</span></div>
                  </label>
                ))}
              </div>
            </div>
            <div><label className="text-sm font-medium">Izoh</label><Input {...regPay('description')} placeholder="Izoh..." /></div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowPayDialog(false)}>Bekor</Button>
              <button type="submit" disabled={payMut.isPending} className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                {payMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}To'lash
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ta'minotchi ma'lumotlari</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100/50 p-3 md:p-4 rounded-lg">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-bold">{selected.name}</h3>
                    {selected.company_name && <p className="text-sm text-gray-600">{selected.company_name}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-sm">
                      {selected.phone && <div className="flex items-center gap-2 text-gray-600"><Phone className="w-4 h-4 text-gray-400" />{selected.phone}</div>}
                      {selected.phone_secondary && <div className="flex items-center gap-2 text-gray-600"><Phone className="w-4 h-4 text-gray-400" />{selected.phone_secondary}</div>}
                      {selected.contact_person && <div className="flex items-center gap-2 text-gray-600"><Building className="w-4 h-4 text-gray-400" />{selected.contact_person}</div>}
                      {selected.email && <div className="flex items-center gap-2 text-gray-600">📧 {selected.email}</div>}
                      {selected.address && <div className="flex items-center gap-2 text-gray-600"><MapPin className="w-4 h-4 text-gray-400" />{selected.address}{selected.city ? `, ${selected.city}` : ''}</div>}
                    </div>
                    {(selected.inn || selected.bank_account) && (
                      <div className="mt-3 p-2 bg-white/60 rounded-lg text-xs text-gray-500 space-y-1">
                        {selected.inn && <div><span className="font-medium">INN:</span> {selected.inn}</div>}
                        {selected.bank_account && <div><span className="font-medium">H/R:</span> {selected.bank_account}</div>}
                        {selected.bank_name && <div><span className="font-medium">Bank:</span> {selected.bank_name} {selected.mfo ? `(MFO: ${selected.mfo})` : ''}</div>}
                      </div>
                    )}
                    {selected.notes && (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-xs font-medium text-yellow-700 mb-1">📝 Izoh:</p>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selected.notes}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-2 shrink-0">
                    <div className="text-center md:text-right">
                      <p className="text-xs text-gray-500">Joriy qarz:</p>
                      <p className={cn("text-xl md:text-2xl font-bold", selected.current_debt > 0 ? "text-red-600" : "text-green-600")}>{formatMoney(selected.current_debt)}</p>
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      <Button size="sm" variant="success" onClick={() => { setShowDetail(false); setTimeout(() => openPay(selected), 100) }}><Banknote className="w-3 h-3 mr-1" />To'lov</Button>
                      <Button size="sm" variant="outline" className="text-orange-600 border-orange-300" onClick={() => { setShowDetail(false); setTimeout(() => openDebt(selected), 100) }}><Plus className="w-3 h-3 mr-1" />Qarz</Button>
                      <Button size="sm" variant="outline" onClick={() => exportSupplierExcel(selected)}><Download className="w-3 h-3 mr-1" />Excel</Button>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4" />Qarz va to'lovlar tarixi ({debtHistory?.data?.length || 0})
                </h4>
                {debtHistory?.data && debtHistory.data.length > 0 ? (
                  <>
                    {/* Mobile cards */}
                    <div className="md:hidden space-y-2">
                      {debtHistory.data.map((r: DebtRecord) => {
                        const isPay = r.transaction_type === 'DEBT_PAYMENT'
                        return (
                          <div key={r.id} className={cn("p-3 rounded-lg border", isPay ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200", r.is_deleted && "opacity-40")}>
                            <div className="flex justify-between items-start">
                              <div>
                                <Badge variant={isPay ? 'success' : 'warning'}>{isPay ? "To'lov" : r.reference_type === 'initial' ? "Boshlang'ich" : r.reference_type === 'stock_income' ? 'Kirim' : 'Qarz'}</Badge>
                                <p className="text-xs text-gray-400 mt-1">{formatDateTashkent(r.created_at)} {formatTimeTashkent(r.created_at)}</p>
                              </div>
                              <div className="text-right">
                                <p className={cn("font-bold text-base", isPay ? "text-green-600" : "text-red-600")}>{isPay ? '-' : '+'}{formatMoney(Math.abs(r.amount))}</p>
                                <p className="text-xs text-gray-500">Qarz: <span className="font-semibold">{formatMoney(r.balance_after)}</span></p>
                              </div>
                            </div>
                            {r.description && <p className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-200">{r.description}</p>}
                            {r.created_by_name && <p className="text-[10px] text-gray-400 mt-1">— {r.created_by_name}</p>}
                          </div>
                        )
                      })}
                    </div>
                    {/* Desktop table */}
                    <div className="hidden md:block border rounded-lg overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50"><tr>
                          <th className="px-3 py-2 text-left text-xs font-medium">Sana</th>
                          <th className="px-3 py-2 text-left text-xs font-medium">Turi</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">Summa</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">Oldin</th>
                          <th className="px-3 py-2 text-right text-xs font-medium">Keyin</th>
                          <th className="px-3 py-2 text-left text-xs font-medium">Izoh</th>
                          <th className="px-3 py-2 text-left text-xs font-medium">Kim</th>
                        </tr></thead>
                        <tbody className="divide-y">
                          {debtHistory.data.map((r: DebtRecord) => {
                            const isPay = r.transaction_type === 'DEBT_PAYMENT'
                            return (
                              <tr key={r.id} className={cn("hover:bg-gray-50", r.is_deleted && "opacity-50 line-through")}>
                                <td className="px-3 py-2 text-xs"><div>{formatDateTashkent(r.created_at)}</div><div className="text-gray-400">{formatTimeTashkent(r.created_at)}</div></td>
                                <td className="px-3 py-2"><Badge variant={isPay ? 'success' : 'warning'}>{isPay ? "To'lov" : r.reference_type === 'initial' ? "Boshlang'ich" : r.reference_type === 'stock_income' ? 'Kirim' : 'Qarz'}</Badge></td>
                                <td className={cn("px-3 py-2 text-right font-semibold text-sm", isPay ? "text-green-600" : "text-red-600")}>{isPay ? '-' : '+'}{formatMoney(Math.abs(r.amount))}</td>
                                <td className="px-3 py-2 text-right text-xs text-gray-400">{formatMoney(r.balance_before)}</td>
                                <td className={cn("px-3 py-2 text-right text-sm font-semibold", r.balance_after > 0 ? "text-red-600" : "text-green-600")}>{formatMoney(r.balance_after)}</td>
                                <td className="px-3 py-2 text-xs text-gray-500 max-w-[250px]"><div className="whitespace-pre-wrap">{r.description || '-'}</div></td>
                                <td className="px-3 py-2 text-xs text-gray-400">{r.created_by_name || '-'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : <p className="text-center text-gray-400 py-6">Tarix bo'sh</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
