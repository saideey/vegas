import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings as SettingsIcon, DollarSign, Save, RefreshCw, Loader2, Send, Plus, Trash2, CheckCircle, XCircle, Clock, MessageSquare, Users, Globe, Download, Database, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Input, Card, CardContent, Badge } from '@/components/ui'
import api from '@/services/api'
import { formatNumber, formatDateTimeTashkent } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import PrintersSettings from './PrintersSettings'
import ReceiptSettings from './ReceiptSettings'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { t, language } = useLanguage()
  const [usdRate, setUsdRate] = useState('')
  const [newDirectorId, setNewDirectorId] = useState('')
  const [testingId, setTestingId] = useState<string | null>(null)

  // Company phone settings
  const [companyPhone1, setCompanyPhone1] = useState('')
  const [companyPhone2, setCompanyPhone2] = useState('')

  // Telegram group settings state
  const [groupChatId, setGroupChatId] = useState('')
  const [reportTime, setReportTime] = useState('19:00')
  const [reportEnabled, setReportEnabled] = useState(false)
  const [sendingReport, setSendingReport] = useState(false)

  // Database backup state
  const [downloadingBackup, setDownloadingBackup] = useState(false)

  // Fetch exchange rate
  const { data: exchangeRateData, isLoading } = useQuery({
    queryKey: ['exchange-rate'],
    queryFn: async () => {
      const response = await api.get('/settings/exchange-rate')
      return response.data
    }
  })

  // Set USD rate when data loads
  useEffect(() => {
    if (exchangeRateData?.usd_rate) {
      setUsdRate(exchangeRateData.usd_rate.toString())
    }
  }, [exchangeRateData])

  // Fetch company phones
  const { data: companyPhonesData } = useQuery({
    queryKey: ['company-phones'],
    queryFn: async () => {
      const response = await api.get('/settings/company-phones')
      return response.data
    }
  })

  // Set company phones when data loads
  useEffect(() => {
    if (companyPhonesData?.data) {
      setCompanyPhone1(companyPhonesData.data.phone1 || '')
      setCompanyPhone2(companyPhonesData.data.phone2 || '')
    }
  }, [companyPhonesData])

  // Fetch director telegram IDs
  const { data: telegramData, isLoading: telegramLoading } = useQuery({
    queryKey: ['telegram-directors'],
    queryFn: async () => {
      const response = await api.get('/settings/telegram/directors')
      return response.data
    }
  })

  // Fetch telegram group settings
  const { data: groupSettingsData, isLoading: groupSettingsLoading, refetch: refetchGroupSettings } = useQuery({
    queryKey: ['telegram-group-settings'],
    queryFn: async () => {
      const response = await api.get('/settings/telegram/group-settings')
      return response.data
    },
    staleTime: 0, // Always fetch fresh data
    cacheTime: 0  // Don't cache
  })

  // Set group settings when data loads
  useEffect(() => {
    if (groupSettingsData?.data) {
      setGroupChatId(groupSettingsData.data.group_chat_id || '')
      setReportTime(groupSettingsData.data.report_time || '19:00')
      setReportEnabled(groupSettingsData.data.is_enabled || false)
    }
  }, [groupSettingsData])

  // Update telegram group settings mutation
  const updateGroupSettings = useMutation({
    mutationFn: async (data: { group_chat_id: string; report_time: string; is_enabled: boolean }) => {
      const response = await api.put('/settings/telegram/group-settings', data)
      return response.data
    },
    onSuccess: () => {
      toast.success('Guruh sozlamalari saqlandi!')
      // Refetch to ensure latest data
      refetchGroupSettings()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Xatolik yuz berdi')
    }
  })

  // Send daily report now mutation
  const sendDailyReport = useMutation({
    mutationFn: async () => {
      const response = await api.post('/settings/telegram/send-daily-report')
      return response.data
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Kunlik hisobot yuborildi!')
      } else {
        toast.error(data.message || 'Hisobot yuborilmadi')
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Xatolik yuz berdi')
    },
    onSettled: () => {
      setSendingReport(false)
    }
  })

  // Update company phones mutation
  const updateCompanyPhones = useMutation({
    mutationFn: async () => {
      const response = await api.put(`/settings/company-phones?phone1=${encodeURIComponent(companyPhone1)}&phone2=${encodeURIComponent(companyPhone2)}`)
      return response.data
    },
    onSuccess: () => {
      toast.success('Telefon raqamlari saqlandi!')
      queryClient.invalidateQueries({ queryKey: ['company-phones'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Xatolik yuz berdi')
    }
  })

  // Update director telegram IDs mutation
  const updateDirectorIds = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await api.put('/settings/telegram/directors', { telegram_ids: ids })
      return response.data
    },
    onSuccess: () => {
      toast.success('Direktor Telegram ID lari yangilandi!')
      queryClient.invalidateQueries({ queryKey: ['telegram-directors'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Xatolik yuz berdi')
    }
  })

  // Test telegram notification mutation
  const testTelegramNotification = useMutation({
    mutationFn: async (telegramId: string) => {
      const response = await api.post(`/settings/telegram/test?telegram_id=${telegramId}`)
      return response.data
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Test xabar yuborildi!')
      } else {
        toast.error(data.message || 'Xabar yuborilmadi')
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Xatolik yuz berdi')
    },
    onSettled: () => {
      setTestingId(null)
    }
  })

  const handleAddDirectorId = () => {
    if (!newDirectorId.trim()) {
      toast.error('Telegram ID kiriting')
      return
    }
    const currentIds = telegramData?.data?.telegram_ids || []
    if (currentIds.includes(newDirectorId.trim())) {
      toast.error('Bu ID allaqachon qo\'shilgan')
      return
    }
    updateDirectorIds.mutate([...currentIds, newDirectorId.trim()])
    setNewDirectorId('')
  }

  const handleRemoveDirectorId = (idToRemove: string) => {
    const currentIds = telegramData?.data?.telegram_ids || []
    updateDirectorIds.mutate(currentIds.filter((id: string) => id !== idToRemove))
  }

  const handleTestTelegram = (telegramId: string) => {
    setTestingId(telegramId)
    testTelegramNotification.mutate(telegramId)
  }

  // Update exchange rate mutation
  const updateExchangeRate = useMutation({
    mutationFn: async (rate: number) => {
      const response = await api.put('/settings/exchange-rate', { usd_rate: rate })
      return response.data
    },
    onSuccess: () => {
      toast.success('Dollar kursi yangilandi!')
      queryClient.invalidateQueries({ queryKey: ['exchange-rate'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Xatolik yuz berdi')
    }
  })

  const handleSaveExchangeRate = () => {
    const rate = parseFloat(usdRate)
    if (isNaN(rate) || rate <= 0) {
      toast.error('Noto\'g\'ri kurs qiymati')
      return
    }
    updateExchangeRate.mutate(rate)
  }

  // Quick rate buttons
  const quickRates = [12500, 12600, 12700, 12800, 12900, 13000]

  return (
    <div className="space-y-3">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold">{t('settings')}</h1>
      </div>

      <div className="space-y-3">

        {/* ── Dollar kursi ── */}
        <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-green-100 rounded-2xl"><DollarSign className="w-5 h-5 text-success" /></div>
            <div>
              <h2 className="text-sm font-bold">{t('usdRate')}</h2>
              <p className="text-xs text-gray-400">1 USD = ? UZS</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-3">
              {/* Current rate */}
              <div className="bg-green-50 border border-green-100 rounded-2xl p-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">{t('usdRate')}</span>
                <div className="text-right">
                  <p className="text-base font-bold text-success">1$ = {formatNumber(exchangeRateData?.usd_rate || 12800)}</p>
                  {exchangeRateData?.updated_at && (
                    <p className="text-xs text-gray-400">{formatDateTimeTashkent(exchangeRateData.updated_at)}</p>
                  )}
                </div>
              </div>
              {/* Input */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">Yangi kurs</label>
                <Input type="number" value={usdRate} onChange={(e) => setUsdRate(e.target.value)} placeholder="12800" className="h-12 text-base font-bold text-center" />
              </div>
              {/* Quick buttons */}
              <div className="grid grid-cols-3 gap-2">
                {quickRates.map((rate) => (
                  <button key={rate}
                    onClick={() => setUsdRate(rate.toString())}
                    className={`h-10 rounded-xl text-sm font-semibold transition-all active:scale-95 ${usdRate === rate.toString() ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {formatNumber(rate)}
                  </button>
                ))}
              </div>
              {/* Save */}
              <button onClick={handleSaveExchangeRate} disabled={updateExchangeRate.isPending}
                className="w-full h-12 rounded-2xl bg-success text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                {updateExchangeRate.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saqlanmoqda...</> : <><Save className="w-4 h-4" />{t('save')}</>}
              </button>
            </div>
          )}
        </div>

        {/* ── Kompaniya telefon ── */}
        <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-primary/10 rounded-2xl"><SettingsIcon className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="text-sm font-bold">{t('companyPhone')}</h2>
              <p className="text-xs text-gray-400">{t('receiptSettings')}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">{t('phone')} 1</label>
              <Input value={companyPhone1} onChange={(e) => setCompanyPhone1(e.target.value)} placeholder="+998 90 123 45 67" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700">{t('phone')} 2</label>
              <Input value={companyPhone2} onChange={(e) => setCompanyPhone2(e.target.value)} placeholder="+998 90 765 43 21" className="h-11" />
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700">{t('receiptSettings')}</div>
            <button onClick={() => updateCompanyPhones.mutate()} disabled={updateCompanyPhones.isPending}
              className="w-full h-12 rounded-2xl bg-primary text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
              {updateCompanyPhones.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saqlanmoqda...</> : <><Save className="w-4 h-4" />{t('save')}</>}
            </button>
          </div>
        </div>

        {/* ── Til ── */}
        <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-purple-100 rounded-2xl"><Globe className="w-5 h-5 text-purple-600" /></div>
            <div>
              <h2 className="text-sm font-bold">{t('language')}</h2>
              <p className="text-xs text-gray-400">{t('selectLanguage')}</p>
            </div>
          </div>
          <LanguageSwitcher variant="full" />
          <div className="mt-3 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2 text-xs text-purple-700">
            {language === 'ru'
              ? 'Выбранный язык будет сохранен в вашем профиле.'
              : language === 'uz_cyrl'
              ? 'Танланган тил профилингизда сақланади.'
              : "Tanlangan til profilingizda saqlanadi."}
          </div>
        </div>

        {/* ── Telegram Bot ── */}
        <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-blue-100 rounded-2xl"><Send className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="text-sm font-bold">{t('telegramBot')}</h2>
              <p className="text-xs text-gray-400">{t('telegramNotifications')}</p>
            </div>
          </div>

          {telegramLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-3">
              {/* Info */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">📱 {t('telegramBot')}</p>
                <p>• VIP mijozlar va to'lovlar uchun bildirishnomalar</p>
                <p>• Excel hisobotlarni bot orqali yuborish</p>
              </div>

              {/* IDs list */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">{t('telegramDirectorIds')}</label>
                {(telegramData?.data?.telegram_ids || []).length === 0 ? (
                  <div className="bg-gray-50 border border-border rounded-xl px-3 py-3 text-xs text-gray-400 text-center">
                    Hali ID qo'shilmagan
                  </div>
                ) : (
                  <div className="space-y-2">
                    {telegramData?.data?.telegram_ids.map((id: string) => (
                      <div key={id} className="flex items-center gap-2 bg-gray-50 border border-border rounded-xl px-3 py-2">
                        <code className="flex-1 text-sm font-mono">{id}</code>
                        <button onClick={() => handleTestTelegram(id)} disabled={testingId === id}
                          className="w-8 h-8 flex items-center justify-center rounded-xl border border-blue-200 text-blue-500 active:bg-blue-50 disabled:opacity-40">
                          {testingId === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => handleRemoveDirectorId(id)} disabled={updateDirectorIds.isPending}
                          className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-200 text-danger active:bg-red-50 disabled:opacity-40">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add ID */}
              <div className="flex gap-2">
                <Input value={newDirectorId} onChange={(e) => setNewDirectorId(e.target.value)}
                  placeholder="Telegram ID (masalan: 123456789)" className="flex-1 h-11" />
                <button onClick={handleAddDirectorId} disabled={updateDirectorIds.isPending}
                  className="w-11 h-11 flex items-center justify-center rounded-xl bg-primary text-white active:scale-95 disabled:opacity-50">
                  {updateDirectorIds.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>

              {/* Help */}
              <div className="bg-gray-50 border border-border rounded-xl px-3 py-2 text-xs text-gray-500 space-y-0.5">
                <p className="font-semibold text-gray-600">{t('telegramHowToFind')}</p>
                <p>1. @userinfobot botiga yozing</p>
                <p>2. /start bosing</p>
                <p>3. Chiqgan ID ni ko'chiring</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Kunlik hisobot (Telegram guruh) ── */}
        <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-green-100 rounded-2xl"><MessageSquare className="w-5 h-5 text-green-600" /></div>
            <div>
              <h2 className="text-sm font-bold">{t('dailyReport')}</h2>
              <p className="text-xs text-gray-400">{t('telegramGroupReport')}</p>
            </div>
          </div>

          {groupSettingsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            <div className="space-y-3">
              {/* Group Chat ID */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">{t('groupChatId')}</label>
                <Input type="text" value={groupChatId} onChange={(e) => setGroupChatId(e.target.value)}
                  placeholder="-1001234567890" className="h-11 font-mono" />
                <p className="text-xs text-gray-400">ID ni @RawDataBot orqali toping</p>
              </div>

              {/* Report Time */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />{t('reportTime')}
                </label>
                <div className="flex items-center gap-3 bg-gray-50 border border-border rounded-2xl px-4 py-3">
                  <select value={reportTime.split(':')[0] || '19'}
                    onChange={(e) => { const m = reportTime.split(':')[1] || '00'; setReportTime(`${e.target.value}:${m}`) }}
                    className="h-10 px-3 border border-border rounded-xl bg-white text-base font-bold text-center focus:outline-none focus:border-primary">
                    {Array.from({length: 24}, (_, i) => i).map(h => (
                      <option key={h} value={h.toString().padStart(2, '0')}>{h.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-xl font-bold text-gray-400">:</span>
                  <select value={reportTime.split(':')[1] || '00'}
                    onChange={(e) => { const h = reportTime.split(':')[0] || '19'; setReportTime(`${h}:${e.target.value}`) }}
                    className="h-10 px-3 border border-border rounded-xl bg-white text-base font-bold text-center focus:outline-none focus:border-primary">
                    {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <span className="text-xs text-gray-400 ml-1">{t('reportTimeHint')}</span>
                </div>
              </div>

              {/* Enable toggle */}
              <label className="flex items-center justify-between p-3 bg-gray-50 border border-border rounded-2xl cursor-pointer">
                <div>
                  <p className="text-sm font-semibold">{t('autoSend')}</p>
                  <p className="text-xs text-gray-400">{t('dailyAt')}</p>
                </div>
                <div className="relative">
                  <input type="checkbox" checked={reportEnabled} onChange={(e) => setReportEnabled(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                </div>
              </label>

              {/* Save */}
              <button onClick={() => {
                if (!groupChatId.trim()) { toast.error(t('enterGroupChatId')); return }
                updateGroupSettings.mutate({ group_chat_id: groupChatId.trim(), report_time: reportTime, is_enabled: reportEnabled })
              }} disabled={updateGroupSettings.isLoading}
                className="w-full h-12 rounded-2xl bg-primary text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                {updateGroupSettings.isLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Saqlanmoqda...</> : <><Save className="w-4 h-4" />{t('save')}</>}
              </button>

              {/* Send now */}
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500">{t('test')}</p>
                <button onClick={() => {
                  if (!groupChatId.trim()) { toast.error(t('enterGroupChatId')); return }
                  setSendingReport(true); sendDailyReport.mutate()
                }} disabled={sendingReport || !groupChatId.trim()}
                  className="w-full h-11 rounded-2xl bg-green-50 border border-green-300 text-green-700 text-sm font-semibold disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2">
                  {sendingReport ? <><Loader2 className="w-4 h-4 animate-spin" />Yuborilmoqda...</> : <><Send className="w-4 h-4" />{t('sendNow')}</>}
                </button>
              </div>

              {/* Info */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-blue-700 space-y-0.5">
                <p className="font-semibold">📊 {t('dailyReport')} o'z ichiga oladi:</p>
                <p>• {t('todaySales')} — naqd, karta, o'tkazma</p>
                <p>• {t('sellerReport')} va {t('debt')}</p>
                <p>• {t('lowStock')}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Tizim ma'lumotlari ── */}
        <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-gray-100 rounded-2xl"><SettingsIcon className="w-5 h-5 text-gray-500" /></div>
            <h2 className="text-sm font-bold">{t('generalSettings')}</h2>
          </div>
          <div className="space-y-2">
            {[
              { label: t('version'),  value: '1.0.0',      variant: 'bg-blue-100 text-blue-700' },
              { label: 'API',         value: t('active'),   variant: 'bg-green-100 text-green-700' },
              { label: t('database'), value: 'PostgreSQL',  variant: 'bg-green-100 text-green-700' },
              { label: t('warehouse'),value: t('warehouseName'), variant: 'bg-gray-100 text-gray-600' },
            ].map(({ label, value, variant }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-500">{label}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${variant}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Database Backup ── */}
        <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-green-100 rounded-2xl"><Database className="w-5 h-5 text-green-600" /></div>
            <div>
              <h2 className="text-sm font-bold">Ma'lumotlar bazasi</h2>
              <p className="text-xs text-gray-400">Backup yuklab olish</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-0.5">
              <p className="font-semibold">📦 Backup o'z ichiga oladi:</p>
              <p>• Tovarlar, sotuvlar, mijozlar, ombor</p>
              <p>• Foydalanuvchilar va sozlamalar</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 text-xs text-yellow-700">
              ⚠️ Har kuni ish yakunida backup oling va xavfsiz joyda saqlang.
            </div>
            <button
              onClick={async () => {
                setDownloadingBackup(true)
                try {
                  const response = await api.get('/settings/database/backup', { responseType: 'blob' })
                  const url = window.URL.createObjectURL(new Blob([response.data]))
                  const link = document.createElement('a')
                  link.href = url
                  const contentDisposition = response.headers['content-disposition']
                  let filename = `${new Date().toLocaleDateString('ru-RU').replace(/\//g, '.')}.sql`
                  if (contentDisposition) {
                    const match = contentDisposition.match(/filename=(.+)/)
                    if (match) filename = match[1]
                  }
                  link.setAttribute('download', filename)
                  document.body.appendChild(link); link.click(); link.remove()
                  window.URL.revokeObjectURL(url)
                  toast.success(`Backup yuklandi: ${filename}`)
                } catch (error: any) {
                  toast.error(error.response?.data?.detail || 'Backup yuklab olishda xatolik')
                } finally {
                  setDownloadingBackup(false)
                }
              }}
              disabled={downloadingBackup}
              className="w-full h-12 rounded-2xl bg-green-600 text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
              {downloadingBackup ? <><Loader2 className="w-4 h-4 animate-spin" />Yuklanmoqda...</> : <><Download className="w-4 h-4" />Backup Yuklab Olish</>}
            </button>
            <p className="text-xs text-center text-gray-400">
              Fayl: {new Date().toLocaleDateString('ru-RU').replace(/\//g, '.')}.sql
            </p>
          </div>
        </div>

        {/* ── Printers – to'liq kenglik ── */}
        <PrintersSettings />

        {/* ── Chek dizayn – to'liq kenglik ── */}
        <ReceiptSettings />

        {/* ── Sotuv sozlamalari ── */}
        <div className="bg-white rounded-2xl border border-border p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-orange-100 rounded-2xl"><Save className="w-5 h-5 text-orange-600" /></div>
            <h2 className="text-sm font-bold">{t('salesSettings')}</h2>
          </div>
          <div className="space-y-3">
            {/* Max discount */}
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-border rounded-2xl">
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-semibold">{t('maxDiscount')}</p>
                <p className="text-xs text-gray-400">{t('maxDiscountHint')}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Input type="number" defaultValue="20" className="w-16 h-9 text-center text-sm font-bold" />
                <span className="text-sm font-bold text-gray-500">%</span>
              </div>
            </div>
            {/* Qarzga sotish */}
            <label className="flex items-center justify-between p-3 bg-gray-50 border border-border rounded-2xl cursor-pointer">
              <div>
                <p className="text-sm font-semibold">{t('onCredit')}</p>
                <p className="text-xs text-gray-400">{t('allowDebtSales')}</p>
              </div>
              <div className="relative">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
              </div>
            </label>
            {/* Auto print */}
            <label className="flex items-center justify-between p-3 bg-gray-50 border border-border rounded-2xl cursor-pointer">
              <div>
                <p className="text-sm font-semibold">{t('print')}</p>
                <p className="text-xs text-gray-400">{t('autoPrintReceipt')}</p>
              </div>
              <div className="relative">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
              </div>
            </label>
            <Button variant="primary" className="w-full">
              <Save className="w-4 h-4 mr-2" />
              {t('save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}