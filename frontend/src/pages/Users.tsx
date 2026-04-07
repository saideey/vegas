import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Users as UsersIcon,
  Plus,
  Search,
  Edit,
  Trash2,
  Key,
  Loader2,
  Shield,
  UserCheck,
  UserX,
  Eye,
  EyeOff,
  X,
  Phone,
  Mail,
  Calendar,
  Clock
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button, Input, Card, CardContent, Badge } from '@/components/ui'
import usersService, { User, Role, CreateUserData, UpdateUserData } from '@/services/usersService'
import { formatDateTimeTashkent, cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useLanguage } from '@/contexts/LanguageContext'

export default function UsersPage() {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuthStore()
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<number | ''>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // Fetch users
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users', search, filterRole, filterStatus],
    queryFn: () => usersService.getUsers({
      search: search || undefined,
      role_id: filterRole || undefined,
      is_active: filterStatus === '' ? undefined : filterStatus === 'active'
    })
  })

  // Fetch roles
  const { data: rolesData } = useQuery({
    queryKey: ['roles'],
    queryFn: usersService.getRoles
  })

  const users: User[] = usersData?.data || []
  const roles: Role[] = rolesData?.data || []

  // Create user form
  const createForm = useForm<CreateUserData>({
    defaultValues: {
      username: '',
      password: '',
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      role_id: 0
    }
  })

  // Edit user form
  const editForm = useForm<UpdateUserData>()

  // Reset password form
  const resetPasswordForm = useForm<{ new_password: string; confirm_password: string }>()

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: usersService.createUser,
    onSuccess: () => {
      toast.success(t('savedSuccess'))
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowCreateModal(false)
      createForm.reset()
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      if (Array.isArray(detail)) {
        // Pydantic validation error
        const messages = detail.map((err: any) => err.msg || err.message).join(', ')
        toast.error(messages || t('errorOccurred'))
      } else if (typeof detail === 'string') {
        toast.error(detail)
      } else {
        toast.error(t('errorOccurred'))
      }
    }
  })

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserData }) => 
      usersService.updateUser(id, data),
    onSuccess: () => {
      toast.success(t('updatedSuccess'))
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowEditModal(false)
      setSelectedUser(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('errorOccurred'))
    }
  })

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: usersService.deleteUser,
    onSuccess: () => {
      toast.success(t('deletedSuccess'))
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setShowDeleteConfirm(false)
      setSelectedUser(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('errorOccurred'))
    }
  })

  // Toggle user status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: usersService.toggleUserStatus,
    onSuccess: () => {
      toast.success(t('updatedSuccess'))
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('errorOccurred'))
    }
  })

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: number; password: string }) =>
      usersService.resetUserPassword(userId, password),
    onSuccess: () => {
      toast.success(t('passwordChanged'))
      setShowResetPasswordModal(false)
      setSelectedUser(null)
      resetPasswordForm.reset()
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      if (Array.isArray(detail)) {
        const messages = detail.map((err: any) => err.msg || err.message).join(', ')
        toast.error(messages || t('errorOccurred'))
      } else if (typeof detail === 'string') {
        toast.error(detail)
      } else {
        toast.error(t('errorOccurred'))
      }
    }
  })

  // Handlers
  const handleCreate = (data: CreateUserData) => {
    if (!data.role_id) {
      toast.error(t('required'))
      return
    }
    createUserMutation.mutate(data)
  }

  const handleEdit = (user: User) => {
    setSelectedUser(user)
    editForm.reset({
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      email: user.email || '',
      role_id: user.role_id,
      is_active: user.is_active
    })
    setShowEditModal(true)
  }

  const handleUpdate = (data: UpdateUserData) => {
    if (selectedUser) {
      updateUserMutation.mutate({ id: selectedUser.id, data })
    }
  }

  const handleDelete = (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error(t('accessDenied'))
      return
    }
    setSelectedUser(user)
    setShowDeleteConfirm(true)
  }

  const handleResetPassword = (user: User) => {
    setSelectedUser(user)
    resetPasswordForm.reset()
    setShowResetPasswordModal(true)
  }

  const submitResetPassword = (data: { new_password: string; confirm_password: string }) => {
    if (data.new_password !== data.confirm_password) {
      toast.error(t('passwordMismatch'))
      return
    }
    if (data.new_password.length < 6) {
      toast.error(t('minLength'))
      return
    }
    if (selectedUser) {
      resetPasswordMutation.mutate({ userId: selectedUser.id, password: data.new_password })
    }
  }

  const getRoleBadgeColor = (roleType: string) => {
    switch (roleType) {
      case 'admin': return 'bg-red-100 text-red-800'
      case 'manager': return 'bg-blue-100 text-blue-800'
      case 'cashier': return 'bg-green-100 text-green-800'
      case 'warehouse': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleDisplayName = (roleName: string) => {
    const roleMap: Record<string, string> = {
      'Admin': t('director'),
      'ADMIN': t('director'),
      'admin': t('director'),
      'Manager': t('warehouseManager'),
      'MANAGER': t('warehouseManager'),
      'manager': t('warehouseManager'),
      'Cashier': t('seller2'),
      'CASHIER': t('seller2'),
      'cashier': t('seller2'),
      'Warehouse': t('warehouseManager'),
      'WAREHOUSE': t('warehouseManager'),
      'warehouse': t('warehouseManager'),
    }
    return roleMap[roleName] || roleName
  }

  return (
    <div className="space-y-3">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UsersIcon className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold">{t('users')}</h1>
            <p className="text-xs text-gray-400">{t('total')}: {users.length}</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-sm font-semibold active:scale-95 transition-all">
          <Plus className="w-4 h-4" />
          {t('addUser')}
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-border p-3 shadow-sm space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('search') + '...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 h-10 border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value ? Number(e.target.value) : '')}
            className="h-10 px-3 border border-border rounded-xl text-sm bg-white focus:outline-none focus:border-primary"
          >
            <option value="">{t('all')} rollar</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>{getRoleDisplayName(role.name)}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="h-10 px-3 border border-border rounded-xl text-sm bg-white focus:outline-none focus:border-primary"
          >
            <option value="">{t('all')} statuslar</option>
            <option value="active">{t('active')}</option>
            <option value="inactive">{t('blocked')}</option>
          </select>
        </div>
      </div>

      {/* ── Users list ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <UsersIcon className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">{t('noData')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => {
            const isMe = user.id === currentUser?.id
            return (
              <div key={user.id}
                className={cn(
                  "bg-white rounded-2xl border shadow-sm p-3 transition-all",
                  user.is_active ? "border-border" : "border-red-200 opacity-70",
                  isMe && "border-l-4 border-l-primary"
                )}>
                {/* Row 1: avatar + info + status toggle */}
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm flex-shrink-0",
                    user.is_active ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-400"
                  )}>
                    {user.first_name[0]}{user.last_name[0]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{user.first_name} {user.last_name}</span>
                      {isMe && <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded-lg font-medium">Men</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-lg">@{user.username}</code>
                      <span className={cn("text-xs px-2 py-0.5 rounded-lg font-medium flex items-center gap-0.5", getRoleBadgeColor(user.role_name?.toLowerCase() || ''))}>
                        <Shield className="w-2.5 h-2.5" />
                        {getRoleDisplayName(user.role_name || '')}
                      </span>
                    </div>
                    {user.phone && (
                      <a href={`tel:${user.phone}`} className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />{user.phone}
                      </a>
                    )}
                    {user.last_login && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Oxirgi: {formatDateTimeTashkent(user.last_login)}
                      </p>
                    )}
                  </div>

                  {/* Status toggle */}
                  <button
                    onClick={() => toggleStatusMutation.mutate(user.id)}
                    disabled={isMe}
                    className={cn(
                      "w-9 h-9 flex items-center justify-center rounded-xl transition-all flex-shrink-0",
                      user.is_active
                        ? "bg-green-100 text-green-600 active:bg-green-200"
                        : "bg-red-100 text-red-500 active:bg-red-200",
                      isMe && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    {user.is_active ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                  </button>
                </div>

                {/* Row 2: action buttons */}
                <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
                  <button onClick={() => handleEdit(user)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-blue-200 text-blue-600 text-xs font-semibold active:bg-blue-50">
                    <Edit className="w-3.5 h-3.5" /> {t('edit')}
                  </button>
                  <button onClick={() => handleResetPassword(user)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl border border-yellow-300 text-yellow-600 text-xs font-semibold active:bg-yellow-50">
                    <Key className="w-3.5 h-3.5" /> Parol
                  </button>
                  <button
                    onClick={() => handleDelete(user)}
                    disabled={isMe}
                    className={cn(
                      "w-9 h-9 flex items-center justify-center rounded-xl border border-red-200 text-danger active:bg-red-50",
                      isMe && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-lg h-[95dvh] sm:h-auto sm:max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-2xl">
                  <UsersIcon className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-base font-bold">{t('addUser')}</h2>
              </div>
              <button onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl border border-border text-gray-400 active:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-4">
              <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">

                {/* Ism */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Shaxsiy ma'lumot</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-gray-700">{t('firstName')} *</label>
                      <Input {...createForm.register('first_name', { required: true })}
                        placeholder="Ism" className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-gray-700">{t('lastName')} *</label>
                      <Input {...createForm.register('last_name', { required: true })}
                        placeholder="Familiya" className="h-11" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">{t('phone')} *</label>
                    <Input {...createForm.register('phone', { required: true })}
                      placeholder="+998901234567" className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">{t('email')}</label>
                    <Input {...createForm.register('email')} type="email"
                      placeholder="email@example.com" className="h-11" />
                  </div>
                </div>

                {/* Kirish */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Kirish ma'lumoti</p>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">{t('username')} *</label>
                    <Input {...createForm.register('username', { required: true, minLength: 3 })}
                      placeholder="login_nomi" className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">{t('password')} *</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        {...createForm.register('password', { required: true, minLength: 6 })}
                        placeholder="Kamida 6 ta belgi"
                        className="h-11 pr-11"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-700">{t('role')} *</label>
                    <select
                      {...createForm.register('role_id', { required: true, valueAsNumber: true })}
                      className="w-full h-11 px-3 border border-border rounded-xl text-sm bg-white focus:outline-none focus:border-primary"
                    >
                      <option value={0}>Rol tanlang...</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>{getRoleDisplayName(role.name)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-1 pb-2">
                  <button type="button" onClick={() => setShowCreateModal(false)}
                    className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
                    Bekor
                  </button>
                  <button type="submit" disabled={createUserMutation.isPending}
                    className="flex-1 h-12 rounded-2xl bg-primary text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                    {createUserMutation.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Saqlanmoqda...</>
                      : t('save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-2xl flex items-center justify-center font-bold text-primary text-sm">
                  {selectedUser.first_name[0]}{selectedUser.last_name[0]}
                </div>
                <div>
                  <h2 className="text-base font-bold">{t('editUser')}</h2>
                  <p className="text-xs text-gray-500">@{selectedUser.username}</p>
                </div>
              </div>
              <button onClick={() => setShowEditModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl border border-border text-gray-400 active:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={editForm.handleSubmit(handleUpdate)} className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">{t('firstName')}</label>
                  <Input {...editForm.register('first_name')} placeholder="Ism" className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-gray-700">{t('lastName')}</label>
                  <Input {...editForm.register('last_name')} placeholder="Familiya" className="h-11" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">{t('phone')}</label>
                <Input {...editForm.register('phone')} placeholder="+998901234567" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">{t('email')}</label>
                <Input {...editForm.register('email')} type="email" placeholder="email@example.com" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">{t('role')}</label>
                <select
                  {...editForm.register('role_id', { valueAsNumber: true })}
                  className="w-full h-11 px-3 border border-border rounded-xl text-sm bg-white focus:outline-none focus:border-primary disabled:opacity-50"
                  disabled={selectedUser.id === currentUser?.id}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{getRoleDisplayName(role.name)}</option>
                  ))}
                </select>
                {selectedUser.id === currentUser?.id && (
                  <p className="text-xs text-gray-400">{t('accessDenied')}</p>
                )}
              </div>
              <div className="flex gap-3 pt-1 pb-2">
                <button type="button" onClick={() => setShowEditModal(false)}
                  className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
                  Bekor
                </button>
                <button type="submit" disabled={updateUserMutation.isPending}
                  className="flex-1 h-12 rounded-2xl bg-primary text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                  {updateUserMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Saqlanmoqda...</>
                    : t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && selectedUser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-2xl">
                  <Key className="w-4 h-4 text-yellow-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold">{t('changePassword')}</h2>
                  <p className="text-xs text-gray-500">{selectedUser.first_name} {selectedUser.last_name}</p>
                </div>
              </div>
              <button onClick={() => setShowResetPasswordModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl border border-border text-gray-400 active:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={resetPasswordForm.handleSubmit(submitResetPassword)} className="p-4 space-y-3">
              {/* User info */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-9 h-9 bg-yellow-100 rounded-xl flex items-center justify-center font-bold text-yellow-700 text-sm flex-shrink-0">
                  {selectedUser.first_name[0]}{selectedUser.last_name[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold">{selectedUser.first_name} {selectedUser.last_name}</p>
                  <p className="text-xs text-gray-500">@{selectedUser.username}</p>
                </div>
              </div>

              {/* New password */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">{t('newPassword')} *</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    {...resetPasswordForm.register('new_password', { required: true, minLength: 6 })}
                    placeholder="Kamida 6 ta belgi"
                    className="h-11 pr-11"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-700">{t('confirmPassword')} *</label>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  {...resetPasswordForm.register('confirm_password', { required: true })}
                  placeholder="Parolni takrorlang"
                  className="h-11"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1 pb-2">
                <button type="button" onClick={() => setShowResetPasswordModal(false)}
                  className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
                  Bekor
                </button>
                <button type="submit" disabled={resetPasswordMutation.isPending}
                  className="flex-1 h-12 rounded-2xl bg-yellow-500 text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                  {resetPasswordMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Saqlanmoqda...</>
                    : <><Key className="w-4 h-4" />O'zgartirish</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedUser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-red-100 rounded-2xl">
                <Trash2 className="w-5 h-5 text-danger" />
              </div>
              <div>
                <h3 className="text-base font-bold">Foydalanuvchini o'chirish</h3>
                <p className="text-xs text-gray-500">{selectedUser.first_name} {selectedUser.last_name}</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-4">
              <p className="text-xs text-red-800">
                <strong>@{selectedUser.username}</strong> — ushbu foydalanuvchi tizimdan o'chiriladi.
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 h-12 rounded-2xl border-2 border-border text-sm font-semibold text-gray-600 active:bg-gray-50">
                Bekor
              </button>
              <button
                onClick={() => deleteUserMutation.mutate(selectedUser.id)}
                disabled={deleteUserMutation.isPending}
                className="flex-1 h-12 rounded-2xl bg-danger text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] flex items-center justify-center gap-2">
                {deleteUserMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" />O'chirilmoqda...</>
                  : <><Trash2 className="w-4 h-4" />O'chirish</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
