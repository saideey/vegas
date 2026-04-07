import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

const COLLAPSED_KEY = 'sidebar_collapsed'

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === 'true' } catch { return false }
  })
  const location = useLocation()

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false) }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  const handleToggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(COLLAPSED_KEY, String(next)) } catch {}
      return next
    })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-surface border-b border-border z-30 flex items-center px-3 gap-3">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors active:scale-95"
          aria-label="Menyu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <img src="/logo.png" alt="Vegas" className="h-10 w-auto object-contain" />
      </header>

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      {/* Main content */}
      <main className={cn(
        'min-h-screen pt-14 lg:pt-0',
        'transition-all duration-300 ease-in-out',
        // Desktop: shift by sidebar width
        collapsed ? 'lg:ml-16' : 'lg:ml-64'
      )}>
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
