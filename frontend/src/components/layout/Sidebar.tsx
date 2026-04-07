import { useState, useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Warehouse,
  FileText,
  Settings,
  LogOut,
  HelpCircle,
  X,
  Instagram,
  Send,
  UsersRound,
  Key,
  Receipt,
  ChevronDown,
  Wallet,
  Truck,
  ChevronRight,
  Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useLanguage } from '@/contexts/LanguageContext'
import api from '@/services/api'

interface NavItem {
  nameKey: 'dashboard' | 'pos' | 'sales' | 'products' | 'customers' | 'warehouse' | 'expenses' | 'suppliers' | 'reports' | 'users' | 'settings'
  href: string
  icon: React.ElementType
  permission?: string
}

const navItems: NavItem[] = [
  { nameKey: 'dashboard', href: '/', icon: LayoutDashboard },
  { nameKey: 'pos', href: '/pos', icon: ShoppingCart },
  { nameKey: 'sales', href: '/sales', icon: Receipt },
  { nameKey: 'products', href: '/products', icon: Package },
  { nameKey: 'customers', href: '/customers', icon: Users },
  { nameKey: 'warehouse', href: '/warehouse', icon: Warehouse },
  { nameKey: 'expenses', href: '/expenses', icon: Wallet },
  { nameKey: 'suppliers', href: '/suppliers', icon: Truck },
  { nameKey: 'reports', href: '/reports', icon: FileText, permission: 'REPORT_SALES' },
  { nameKey: 'users', href: '/users', icon: UsersRound, permission: 'USER_VIEW' },
  { nameKey: 'settings', href: '/settings', icon: Settings, permission: 'SETTINGS_VIEW' },
]

interface SidebarProps {
  isOpen: boolean        // mobile drawer open
  onClose: () => void
  collapsed: boolean     // desktop collapsed state
  onToggleCollapse: () => void
}

export function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const location = useLocation()
  const { user, logout, hasPermission } = useAuthStore()
  const { t } = useLanguage()
  const [showHelp, setShowHelp] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' })
  const [showPasswords, setShowPasswords] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  const handleChangePassword = async () => {
    if (!passwordData.current || !passwordData.new || !passwordData.confirm) {
      alert(t('required'))
      return
    }
    if (passwordData.new !== passwordData.confirm) {
      alert(t('passwordMismatch'))
      return
    }
    if (passwordData.new.length < 6) {
      alert(t('minLength').replace('{min}', '6'))
      return
    }
    setChangingPassword(true)
    try {
      const response = await api.post('/users/change-password', {
        current_password: passwordData.current,
        new_password: passwordData.new
      })
      if (response.data) {
        alert(t('passwordChanged'))
        setShowChangePassword(false)
        setPasswordData({ current: '', new: '', confirm: '' })
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || t('errorOccurred'))
    } finally {
      setChangingPassword(false)
    }
  }

  const filteredNavItems = navItems.filter(
    (item) => !item.permission || hasPermission(item.permission)
  )

  // Sidebar inner content (shared between mobile drawer and desktop)
  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Logo + toggle */}
      <div className={cn(
        'border-b border-border flex items-center',
        collapsed && !isMobile ? 'justify-center p-3' : 'justify-between p-4'
      )}>
        {(!collapsed || isMobile) && (
          <img
            src="/logo.png"
            alt="Vegas"
            className="h-14 w-auto object-contain"
          />
        )}
        {isMobile ? (
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-6 h-6" />
          </button>
        ) : (
          <button
            onClick={onToggleCollapse}
            className={cn(
              'p-2 rounded-lg hover:bg-gray-100 transition-colors text-text-secondary',
              collapsed && 'mx-auto'
            )}
            title={collapsed ? 'Kengaytirish' : 'Yig\'ish'}
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronRight className="w-5 h-5 rotate-180" />}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href))
          return (
            <NavLink
              key={item.href}
              to={item.href}
              onClick={isMobile ? onClose : undefined}
              title={collapsed && !isMobile ? t(item.nameKey) : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-3 rounded-xl font-medium transition-all group relative',
                'hover:bg-gray-100 active:scale-[0.98]',
                isActive && 'bg-primary text-white hover:bg-primary/90',
                collapsed && !isMobile && 'justify-center px-2'
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {(!collapsed || isMobile) && (
                <span className="truncate text-sm font-medium">{t(item.nameKey)}</span>
              )}
              {/* Tooltip when collapsed */}
              {collapsed && !isMobile && (
                <div className="absolute left-full ml-3 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg
                                opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap
                                transition-opacity duration-150 z-50 shadow-lg">
                  {t(item.nameKey)}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                </div>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Help */}
      <div className={cn('px-2 py-1 border-t border-border')}>
        <button
          onClick={() => setShowHelp(true)}
          title={collapsed && !isMobile ? t('help') : undefined}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-3 rounded-xl font-medium hover:bg-gray-100 transition-colors text-text-secondary group relative',
            collapsed && !isMobile && 'justify-center px-2'
          )}
        >
          <HelpCircle className="h-5 w-5 flex-shrink-0" />
          {(!collapsed || isMobile) && <span className="text-sm">{t('help')}</span>}
          {collapsed && !isMobile && (
            <div className="absolute left-full ml-3 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg
                            opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap
                            transition-opacity duration-150 z-50 shadow-lg">
              {t('help')}
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
            </div>
          )}
        </button>
      </div>

      {/* User menu */}
      <div className={cn('p-2 border-t border-border relative')} ref={userMenuRef}>
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          title={collapsed && !isMobile ? `${user?.first_name} ${user?.last_name}` : undefined}
          className={cn(
            'flex items-center w-full px-3 py-2.5 rounded-xl hover:bg-gray-100 transition-colors group relative',
            collapsed && !isMobile ? 'justify-center px-2' : 'justify-between'
          )}
        >
          {/* Avatar circle */}
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
            {user?.first_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          {(!collapsed || isMobile) && (
            <div className="flex-1 text-left ml-2 min-w-0">
              <p className="font-semibold text-sm text-text-primary truncate">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-xs text-text-secondary truncate">{user?.role_name}</p>
            </div>
          )}
          {(!collapsed || isMobile) && (
            <ChevronDown className={cn('w-4 h-4 text-text-secondary transition-transform flex-shrink-0 ml-1', showUserMenu && 'rotate-180')} />
          )}
          {/* Tooltip */}
          {collapsed && !isMobile && (
            <div className="absolute left-full ml-3 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg
                            opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap
                            transition-opacity duration-150 z-50 shadow-lg">
              {user?.first_name} {user?.last_name}
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
            </div>
          )}
        </button>

        {showUserMenu && (
          <div className={cn(
            'absolute bottom-full mb-2 bg-white rounded-xl shadow-lg border border-border overflow-hidden z-50',
            collapsed && !isMobile ? 'left-full ml-2 w-48' : 'left-2 right-2'
          )}>
            <button
              onClick={() => { setShowChangePassword(true); setShowUserMenu(false) }}
              className="flex items-center gap-3 w-full px-4 py-3 hover:bg-yellow-50 text-yellow-600 transition-colors border-b border-border"
            >
              <Key className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium text-sm">{t('changePassword')}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 hover:bg-red-50 text-red-600 transition-colors"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium text-sm">{t('logout')}</span>
            </button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* ── MOBILE: overlay drawer ── */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside className={cn(
        'fixed left-0 top-0 h-screen w-72 bg-surface border-r border-border flex flex-col z-50',
        'transition-transform duration-300 ease-in-out lg:hidden',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent isMobile />
      </aside>

      {/* ── DESKTOP: collapsible sidebar ── */}
      <aside className={cn(
        'hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-surface border-r border-border z-30',
        'transition-all duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-64'
      )}>
        <SidebarContent />
      </aside>

      {/* ── Help Modal ── */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">XLAB</h2>
                  <p className="text-blue-100 text-sm">IT Solutions & Development</p>
                </div>
                <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-gray-600 text-center text-sm">{t('helpText')}</p>
              <div className="space-y-3">
                <a href="https://www.instagram.com/xlabuz/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl hover:opacity-90 transition-opacity">
                  <div className="p-2 bg-white/20 rounded-lg"><Instagram className="w-5 h-5" /></div>
                  <div><p className="font-semibold">Instagram</p><p className="text-sm text-white/80">@xlabuz</p></div>
                </a>
                <a href="https://t.me/xlab_uz" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-400 to-blue-600 text-white rounded-xl hover:opacity-90 transition-opacity">
                  <div className="p-2 bg-white/20 rounded-lg"><Send className="w-5 h-5" /></div>
                  <div><p className="font-semibold">Telegram</p><p className="text-sm text-white/80">@xlab_uz</p></div>
                </a>
              </div>
              <div className="pt-4 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400">© 2026 XLAB. {t('allRightsReserved')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Password Modal ── */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-yellow-500 to-orange-500 p-5 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{t('changePassword')}</h2>
                  <p className="text-yellow-100 text-sm">{t('updatePasswordHint')}</p>
                </div>
                <button onClick={() => { setShowChangePassword(false); setPasswordData({ current: '', new: '', confirm: '' }) }}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t('currentPassword')}</label>
                <input type={showPasswords ? 'text' : 'password'} value={passwordData.current}
                  onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('newPassword')}</label>
                <input type={showPasswords ? 'text' : 'password'} value={passwordData.new}
                  onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('confirmPassword')}</label>
                <input type={showPasswords ? 'text' : 'password'} value={passwordData.confirm}
                  onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-base focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-600">{t('showPasswords')}</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowChangePassword(false); setPasswordData({ current: '', new: '', confirm: '' }) }}
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 font-medium transition-colors">
                  {t('cancel')}
                </button>
                <button onClick={handleChangePassword} disabled={changingPassword}
                  className="flex-1 px-4 py-3 bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 font-medium transition-colors disabled:opacity-50">
                  {changingPassword ? t('loading') : t('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
