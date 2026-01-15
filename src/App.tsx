import { useState, useEffect, useRef, useMemo } from 'react'
import { Reorder } from 'framer-motion'
import confetti from 'canvas-confetti'
import { playPop, playSuccess, playDelete, playClick } from './utils/audio'

interface Task {
  id: string
  text: string
  description?: string // New field
  completed: boolean
  category: string
  priority: 'Low' | 'Medium' | 'High'
  dueDate?: number // New field
  createdAt: number
}

type SheetMode = 'ADD_TASK' | 'EDIT_TASK' | 'ADD_CATEGORY' | 'VIEW_TASK'

interface User {
  id: string
  username: string
  passwordHash: string
  createdAt: number
}

const DEFAULT_CATEGORIES: string[] = []
const PRIORITIES = ['Low', 'Medium', 'High']

// Helper for relative time
const getRelativeTime = (timestamp: number) => {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  const days = Math.floor(hours / 24)
  return rtf.format(-days, 'day')
}

// Stable Date Helpers
const startOfDay = (d: Date) => {
  const newDate = new Date(d)
  newDate.setHours(0, 0, 0, 0)
  return newDate
}

const getTomorrow = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return startOfDay(d).getTime()
}

const getWeekend = () => {
  const d = new Date()
  const day = d.getDay()
  const daysUntilWeekend = day === 6 ? 7 : (6 - day) // Next Saturday
  d.setDate(d.getDate() + daysUntilWeekend)
  return startOfDay(d).getTime()
}


function App() {
  // --- AUTH ---
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('chatdo_current_user')
    return saved ? JSON.parse(saved) : null
  })
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authError, setAuthError] = useState('')
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Simple hash function (NOT cryptographically secure, just for demo)
  const simpleHash = (str: string): string => {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return hash.toString(36)
  }

  const getUsers = (): User[] => {
    const saved = localStorage.getItem('chatdo_users')
    return saved ? JSON.parse(saved) : []
  }

  const handleSignup = () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError('Username and password required')
      return
    }
    if (authUsername.includes(' ')) {
      setAuthError('Username cannot contain spaces')
      return
    }
    if (authPassword.length < 4) {
      setAuthError('Password must be at least 4 characters')
      return
    }

    const users = getUsers()
    if (users.find(u => u.username.toLowerCase() === authUsername.toLowerCase())) {
      setAuthError('Username already exists')
      return
    }
    const newUser: User = {
      id: Date.now().toString(36),
      username: authUsername.trim(),
      passwordHash: simpleHash(authPassword),
      createdAt: Date.now()
    }
    localStorage.setItem('chatdo_users', JSON.stringify([...users, newUser]))
    localStorage.setItem('chatdo_current_user', JSON.stringify(newUser))
    setCurrentUser(newUser)
    setAuthUsername('')
    setAuthPassword('')
    setAuthError('')
  }

  const handleLogin = () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError('Username and password required')
      return
    }
    const users = getUsers()
    const user = users.find(u => u.username.toLowerCase() === authUsername.toLowerCase())
    if (!user || user.passwordHash !== simpleHash(authPassword)) {
      setAuthError('Invalid username or password')
      return
    }
    localStorage.setItem('chatdo_current_user', JSON.stringify(user))
    setCurrentUser(user)
    setAuthUsername('')
    setAuthPassword('')
    setAuthError('')
  }

  const handleLogout = () => {
    localStorage.removeItem('chatdo_current_user')
    setCurrentUser(null)
  }


  // --- PERSISTENCE HELPERS ---
  const getInitialTasks = (): Task[] => {
    if (!currentUser) return []
    const saved = localStorage.getItem(`todry_${currentUser.id}_tasks`)
    if (saved) return JSON.parse(saved)
    return []
  }

  const getInitialCategories = (): string[] => {
    if (!currentUser) return []
    const saved = localStorage.getItem(`todry_${currentUser.id}_categories`)
    if (saved) return JSON.parse(saved)
    return DEFAULT_CATEGORIES
  }

  const getArchivedTasks = (): Task[] => {
    if (!currentUser) return []
    const saved = localStorage.getItem(`todry_${currentUser.id}_archived_tasks`)
    if (saved) return JSON.parse(saved)
    return []
  }

  const getArchivedCategories = (): string[] => {
    if (!currentUser) return []
    const saved = localStorage.getItem(`todry_${currentUser.id}_archived_categories`)
    if (saved) return JSON.parse(saved)
    return []
  }



  // --- STATE ---
  const [tasks, setTasks] = useState<Task[]>(getInitialTasks)
  const [categories, setCategories] = useState<string[]>(getInitialCategories)
  const [archivedTasks, setArchivedTasks] = useState<Task[]>(getArchivedTasks)
  const [archivedCategories, setArchivedCategories] = useState<string[]>(getArchivedCategories)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [activeCategory, setActiveCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')

  // Creation/Editing State
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<SheetMode>('ADD_TASK')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [descriptionInput, setDescriptionInput] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Personal')
  const [selectedPriority, setSelectedPriority] = useState('Medium')
  const [selectedDueDate, setSelectedDueDate] = useState<number | undefined>(undefined)

  // UI State
  const [isToastActive, setIsToastActive] = useState(false)
  const [toastMessage, setToastMessage] = useState('Archived successfully')
  const [lastDeletedTask, setLastDeletedTask] = useState<Task | null>(null)
  const [lastDeletedCategory, setLastDeletedCategory] = useState<string | null>(null)
  const [activeDateTaskId, setActiveDateTaskId] = useState<string | null>(null)
  const [activeSlidTask, setActiveSlidTask] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Refs
  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const listDateInputRef = useRef<HTMLInputElement>(null)
  const toastTimeoutRef = useRef<any>(null)
  const [, setTick] = useState(0)

  // --- EFFECTS ---
  // Reload data when user changes
  useEffect(() => {
    if (currentUser) {
      setTasks(getInitialTasks())
      setCategories(getInitialCategories())
      setArchivedTasks(getArchivedTasks())
      setArchivedCategories(getArchivedCategories())
    } else {
      setTasks([])
      setCategories([])
      setArchivedTasks([])
      setArchivedCategories([])
    }
  }, [currentUser])

  useEffect(() => {
    const savedTheme = localStorage.getItem('todry_theme') as 'light' | 'dark'
    if (savedTheme) setTheme(savedTheme)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('todry_theme', theme)
  }, [theme])

  useEffect(() => {
    if (currentUser) localStorage.setItem(`todry_${currentUser.id}_tasks`, JSON.stringify(tasks))
  }, [tasks, currentUser])

  useEffect(() => {
    if (currentUser) localStorage.setItem(`todry_${currentUser.id}_categories`, JSON.stringify(categories))
  }, [categories, currentUser])

  useEffect(() => {
    if (currentUser) localStorage.setItem(`todry_${currentUser.id}_archived_tasks`, JSON.stringify(archivedTasks))
  }, [archivedTasks, currentUser])

  useEffect(() => {
    if (currentUser) localStorage.setItem(`todry_${currentUser.id}_archived_categories`, JSON.stringify(archivedCategories))
  }, [archivedCategories, currentUser])


  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSheetOpen) toggleSheet(false)
        else if (isToastActive) setIsToastActive(false)
        else if (searchQuery) setSearchQuery('')
      }
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'n' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        openAddSheet()
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && isSheetOpen) {
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSheetOpen, textInput, selectedCategory, selectedPriority, sheetMode, searchQuery, isToastActive])

  // --- COMPUTED DATA ---
  const categoryStats = useMemo(() => {
    return categories.map(cat => {
      const catTasks = tasks.filter(t => t.category === cat)
      const completed = catTasks.filter(t => t.completed).length
      const progress = catTasks.length === 0 ? 0 : (completed / catTasks.length) * 100
      return { name: cat, count: catTasks.length, progress }
    })
  }, [tasks, categories])

  const filteredTasks = useMemo(() => {
    let result = tasks.filter(t => {
      const matchesCategory = activeCategory === 'All' || t.category === activeCategory
      const matchesSearch = t.text.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesCategory && matchesSearch
    })
    return result
  }, [tasks, activeCategory, searchQuery])

  // --- LOGIC ---
  const toggleTheme = () => {
    playClick()
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  const toggleSheet = (show: boolean) => {
    setIsSheetOpen(show)
    if (!show) {
      setTimeout(() => {
        setEditingTaskId(null)
        setTextInput('')
        setDescriptionInput('')
        setSelectedDueDate(undefined)
      }, 300)
    } else {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const openAddSheet = () => {
    setSheetMode('ADD_TASK')
    setEditingTaskId(null)
    setTextInput('')
    setDescriptionInput('')
    setSelectedDueDate(undefined)
    setSelectedCategory(activeCategory === 'All' ? 'Personal' : activeCategory)
    setSelectedPriority('Medium')
    toggleSheet(true)
  }

  const openEditSheet = (task: Task, mode: 'EDIT_TASK' = 'EDIT_TASK') => {
    setSheetMode(mode)
    setEditingTaskId(task.id)
    setTextInput(task.text)
    setDescriptionInput(task.description || '')
    setSelectedDueDate(task.dueDate)
    setSelectedCategory(task.category)
    setSelectedPriority(task.priority)
    toggleSheet(true)
  }

  const openViewSheet = (task: Task) => {
    setSheetMode('VIEW_TASK')
    setEditingTaskId(task.id)
    setTextInput(task.text) // Used for display
    setDescriptionInput(task.description || '') // Used for display
    setSelectedDueDate(task.dueDate)
    setSelectedCategory(task.category)
    setSelectedPriority(task.priority)
    toggleSheet(true)
  }

  const openAddCategorySheet = () => {
    setSheetMode('ADD_CATEGORY')
    setTextInput('')
    toggleSheet(true)
  }

  const handleSave = () => {
    if (!textInput.trim()) return

    if (sheetMode === 'ADD_CATEGORY') {
      if (!categories.includes(textInput.trim())) {
        setCategories(prev => [...prev, textInput.trim()])
      }
    } else if (sheetMode === 'EDIT_TASK' && editingTaskId) {
      setTasks(prev => prev.map(t => t.id === editingTaskId ? {
        ...t,
        text: textInput.trim(),
        description: descriptionInput.trim(),
        category: selectedCategory,
        priority: selectedPriority as any,
        dueDate: selectedDueDate
      } : t))
    } else {
      const newTask: Task = {
        id: 'task_' + Date.now(),
        text: textInput.trim(),
        description: descriptionInput.trim(),
        completed: false,
        category: selectedCategory,
        priority: selectedPriority as any,
        dueDate: selectedDueDate,
        createdAt: Date.now()
      }
      setTasks(prev => [newTask, ...prev])
      playPop()
    }
    toggleSheet(false)
  }

  const toggleComplete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const task = tasks.find(t => t.id === id)
    if (!task) return

    if (!task.completed) {
      // Trigger joyful confetti
      playSuccess()
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      const x = (rect.left + rect.width / 2) / window.innerWidth
      const y = (rect.top + rect.height / 2) / window.innerHeight

      confetti({
        particleCount: 80,
        spread: 60,
        origin: { x, y },
        colors: ['#0061FF', '#3B82F6', '#60A5FA', '#FFFFFF'],
        disableForReducedMotion: true,
        zIndex: 2000
      })
    }

    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t))
  }

  const deleteTask = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    playDelete()
    const taskToDelete = tasks.find(t => t.id === id)
    if (taskToDelete) {
      setArchivedTasks(prev => [taskToDelete, ...prev])
      setTasks(prev => prev.filter(t => t.id !== id))
      setLastDeletedTask(taskToDelete)
      setToastMessage('Task archived')
      setIsToastActive(true)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = setTimeout(() => setIsToastActive(false), 4000)
    }
    setActiveSlidTask(null)
  }

  const undoDelete = () => {
    if (lastDeletedTask) {
      setArchivedTasks(prev => prev.filter(t => t.id !== lastDeletedTask.id))
      setTasks(prev => [lastDeletedTask, ...prev])
      setLastDeletedTask(null)
      setIsToastActive(false)
    } else if (lastDeletedCategory) {
      setArchivedCategories(prev => prev.filter(c => c !== lastDeletedCategory))
      setCategories(prev => [...prev, lastDeletedCategory])
      setLastDeletedCategory(null)
      setIsToastActive(false)
    }
  }

  const deleteCategory = (cat: string) => {
    // Move to archive
    setArchivedCategories(prev => [cat, ...prev])
    setLastDeletedCategory(cat)
    setCategories(prev => prev.filter(c => c !== cat))
    // Move tasks from this category to 'Uncategorized' or first available
    const fallbackCategory = categories.find(c => c !== cat) || 'General'
    setTasks(prev => prev.map(t => t.category === cat ? { ...t, category: fallbackCategory } : t))
    if (activeCategory === cat) setActiveCategory('All')

    setToastMessage(`'${cat}' archived`)
    setIsToastActive(true)
    setIsSidebarOpen(false)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setIsToastActive(false), 4000)
  }

  // Archive management
  const restoreTaskFromArchive = (task: Task) => {
    setArchivedTasks(prev => prev.filter(t => t.id !== task.id))
    setTasks(prev => [task, ...prev])
    setToastMessage('Task restored')
    setIsToastActive(true)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setIsToastActive(false), 3000)
  }

  const restoreCategoryFromArchive = (cat: string) => {
    setArchivedCategories(prev => prev.filter(c => c !== cat))
    setCategories(prev => [...prev, cat])
    setToastMessage(`'${cat}' restored`)
    setIsToastActive(true)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setIsToastActive(false), 3000)
  }

  const permanentlyDeleteTask = (id: string) => {
    setArchivedTasks(prev => prev.filter(t => t.id !== id))
    setToastMessage('Permanently deleted')
    setIsToastActive(true)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setIsToastActive(false), 3000)
  }

  const permanentlyDeleteCategory = (cat: string) => {
    setArchivedCategories(prev => prev.filter(c => c !== cat))
    setToastMessage('Permanently deleted')
    setIsToastActive(true)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setIsToastActive(false), 3000)
  }


  const updateTaskDate = (taskId: string, newDate: number) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, dueDate: newDate } : t
    ))
    setActiveDateTaskId(null)
  }

  const handleListDateClick = (task: Task) => {
    setActiveDateTaskId(task.id)
    setTimeout(() => {
      listDateInputRef.current?.showPicker ? listDateInputRef.current.showPicker() : listDateInputRef.current?.click()
    }, 0)
  }

  const handleTaskClick = (task: Task) => {
    openViewSheet(task)
  }

  // --- EXPORT / IMPORT ---
  const exportTasks = () => {
    const data = {
      tasks,
      categories,
      exportedAt: new Date().toISOString()
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `todry-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    setToastMessage('Backup saved!')
    setIsToastActive(true)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setIsToastActive(false), 3000)
  }

  const importTasks = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (data.tasks) setTasks(data.tasks)
        if (data.categories) setCategories(data.categories)
        setToastMessage('Backup restored!')
        setIsToastActive(true)
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
        toastTimeoutRef.current = setTimeout(() => setIsToastActive(false), 3000)
      } catch {
        setToastMessage('Invalid backup file')
        setIsToastActive(true)
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
        toastTimeoutRef.current = setTimeout(() => setIsToastActive(false), 3000)
      }
    }
    reader.readAsText(file)
  }

  // --- AUTH PAGE ---
  if (!currentUser) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-animation">
            <div className="glow-ring"></div>
            <div className="glow-ring ring-2"></div>
            <div className="core-orb"></div>
            <div className="orb orb-1"></div>
            <div className="orb orb-2"></div>
            <div className="orb orb-3"></div>
            <div className="orb orb-4"></div>
            <div className="orb orb-5"></div>
            <div className="orb orb-6"></div>
          </div>

          <h1 className="auth-title">Todry</h1>
          <p className="auth-subtitle">{authMode === 'login' ? 'Welcome back' : 'Create your account'}</p>

          {authError && <div className="auth-error">{authError}</div>}

          <div className="auth-form">
            <input
              type="text"
              className="auth-input"
              placeholder="Username"
              value={authUsername}
              onChange={(e) => { setAuthUsername(e.target.value); setAuthError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleSignup())}
            />
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                className="auth-input"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => { setAuthPassword(e.target.value); setAuthError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleSignup())}
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} title={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? (
                  <svg className="icon" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg className="icon" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>

            <button className="auth-btn" onClick={authMode === 'login' ? handleLogin : handleSignup}>
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </div>

          <p className="auth-toggle">
            {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <span onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}>
              {authMode === 'login' ? 'Sign up' : 'Sign in'}
            </span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">

      {/* MOBILE SIDEBAR OVERLAY */}
      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* LEFT PANE */}
      <div className={`left-pane custom-scroll ${isSidebarOpen ? 'open' : ''}`}>
        <div className="greeting-section">
          <div className="brand-logo">To<span className="brand-accent">dry</span></div>
          <div className="welcome-message">Welcome back, {currentUser.username}!</div>
        </div>




        <div className="sidebar-section">
          <div className="section-title">Personal Spaces</div>
          <button onClick={openAddCategorySheet} className="btn-add-space">
            <svg className="icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            New Space
          </button>

          <Reorder.Group axis="y" values={activeCategory === 'All' ? [] : [] /* Dummy for now as we don't reorder sidebar yet */} onReorder={() => { }} className="category-scroll custom-scroll" style={{ overflowX: 'hidden' }}>
            {categoryStats.map(stat => (
              <Reorder.Item
                key={stat.name}
                value={stat}
                drag="x"
                dragConstraints={{ left: -100, right: 0 }}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -80) {
                    deleteCategory(stat.name)
                  }
                }}
                style={{ position: 'relative', marginBottom: 12 }}
              >
                {/* Trash Icon Behind */}
                <div style={{
                  position: 'absolute', top: 0, bottom: 0, right: -100, width: 100,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--danger)', borderRadius: 20, zIndex: 0
                }}>
                  <svg className="icon" style={{ stroke: 'white' }} viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </div>

                <div
                  className={`category-card cursor-pointer transition-all ${activeCategory === stat.name ? 'scale-[1.02] ring-1 ring-white/10' : 'opacity-70 hover:opacity-100'}`}
                  style={{ background: 'var(--glass-card)', position: 'relative', zIndex: 1 }}
                  onClick={() => {
                    setActiveCategory(stat.name)
                    setIsSidebarOpen(false) // Auto-close on mobile selection
                  }}
                >
                  <div className="cat-count">{stat.count} items</div>
                  <div className="cat-name">{stat.name}</div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{
                      width: `${stat.progress}%`,
                      background: stat.name === 'Business' ? '#A855F7' : stat.name === 'Personal' ? '#3B82F6' : '#10B981'
                    }}></div>
                  </div>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </div>

        <div className="sidebar-bottom">
          <div className="profile-card">
            <div className="profile-avatar">{currentUser.username.charAt(0).toUpperCase()}</div>
            <div className="profile-info">
              <div className="profile-name">{currentUser.username}</div>
              <div className="profile-status">Active Now</div>
            </div>
            <div className="logout-btn" title="Logout" onClick={handleLogout}>
              <svg className="icon logout-icon" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </div>
          </div>

          {/* Export/Import Buttons */}
          <div className="backup-actions">
            <button className="backup-btn" onClick={exportTasks} title="Export Backup">
              <svg className="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export
            </button>
            <label className="backup-btn" title="Import Backup">
              <svg className="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              Import
              <input type="file" accept=".json" className="hidden-date-input" onChange={(e) => e.target.files?.[0] && importTasks(e.target.files[0])} />
            </label>
          </div>
        </div>

      </div>

      {/* RIGHT PANE */}
      <div className="right-pane custom-scroll">
        <div className="header-row">
          <div className="header-title-group">
            <div className="header-toolbar">
              <div className="icon-btn mobile-only" onClick={() => setIsSidebarOpen(true)} title="Menu">
                <svg className="icon" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </div>
              <div className="icon-btn" title="View All" onClick={() => { setActiveCategory('All'); setIsSidebarOpen(false); }}>
                <svg className="icon" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              </div>
              <div className="icon-btn" onClick={toggleTheme} title="Toggle Theme (Esc)">
                <svg className="icon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
              </div>
              <div className={`icon-btn ${activeCategory === 'Archive' ? 'active' : ''}`} onClick={() => setActiveCategory('Archive')} title="Archive">
                <svg className="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </div>
            </div>

            <div className="section-title-compact">{activeCategory === 'All' ? 'Todry' : activeCategory}</div>
          </div>

          <div className="search-container">
            <svg className="icon" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              ref={searchRef}
              type="text"
              placeholder="Find objective... (/)"
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <span className="kbd-hint" onClick={() => setSearchQuery('')} title="Clear search">ESC</span>
            )}
          </div>
        </div>

        {/* Archive View */}
        {activeCategory === 'Archive' ? (
          <div className="archive-page">
            <div className="archive-page-header">
              <h2 className="archive-page-title">Archive</h2>
              <p className="archive-page-subtitle">{archivedTasks.length + archivedCategories.length} items</p>
            </div>

            {archivedCategories.length > 0 && (
              <div className="archive-group">
                <div className="section-title">Spaces</div>
                {archivedCategories.map(cat => (
                  <div key={cat} className="archive-page-item">
                    <div className="archive-page-item-icon">
                      <svg className="icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                    <span className="archive-page-item-name">{cat}</span>
                    <div className="archive-page-item-actions">
                      <button className="archive-action-btn restore" onClick={() => restoreCategoryFromArchive(cat)}>
                        <svg className="icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        Restore
                      </button>
                      <button className="archive-action-btn delete" onClick={() => permanentlyDeleteCategory(cat)}>
                        <svg className="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {archivedTasks.length > 0 && (
              <div className="archive-group">
                <div className="section-title">Tasks</div>
                {archivedTasks.map(task => (
                  <div key={task.id} className="archive-page-item">
                    <div className="archive-page-item-icon">
                      <svg className="icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    </div>
                    <span className="archive-page-item-name">{task.text}</span>
                    <div className="archive-page-item-actions">
                      <button className="archive-action-btn restore" onClick={() => restoreTaskFromArchive(task)}>
                        <svg className="icon" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                        Restore
                      </button>
                      <button className="archive-action-btn delete" onClick={() => permanentlyDeleteTask(task.id)}>
                        <svg className="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {archivedTasks.length === 0 && archivedCategories.length === 0 && (
              <div className="empty-state">Archive is empty</div>
            )}
          </div>
        ) : (


          <Reorder.Group axis="y" values={filteredTasks} onReorder={(newOrder) => {
            // Reordering logic:
            // Since we might be viewing a filtered list, we need to be careful.
            // For simplicity in this version, we will only update the main tasks array's order
            // based on the reordered items if we assume they are contiguous or we re-construct.
            // A safer simple approach for now:
            // find the indices of these items in the main list?
            // Actually, let's just update `tasks` if activeCategory is 'All' and no search
            // If filtered, Drag & Drop might be visually weird if we don't handle it perfectly.
            // For now, let's allow reordering the filtered view which updates the main list sort order.

            if (activeCategory === 'All' && !searchQuery) {
              setTasks(newOrder)
            } else {
              // Complex reorder not implemented for filtered views yet to avoid data loss
              // or complex merging logic in this step.
              // We can just disable onReorder if not 'All' or just update internal order
            }
          }} className="task-list">
            {filteredTasks.length === 0 ? (
              <div className="empty-state">
                {searchQuery ? `Nothing matches "${searchQuery}"` : 'Your space is empty.'}
              </div>
            ) : filteredTasks.map(task => (
              <Reorder.Item
                key={task.id}
                value={task}
                className={`task-wrapper ${activeSlidTask === task.id ? 'slid-open' : ''}`}
                onClick={() => handleTaskClick(task)}
                whileDrag={{ scale: 1.02, zIndex: 10 }}
              >
                <div className="task-delete-bg" onClick={(e) => deleteTask(task.id, e)}>
                  <svg className="icon icon-trash" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </div>
                <div className={`task-card group ${task.completed ? 'completed' : ''}`}>
                  <div className="checkbox" onClick={(e) => toggleComplete(task.id, e)}>
                    <svg className="icon icon-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <div className="task-content">
                    <div className="task-title-row">
                      <span className="task-text">{task.text}</span>
                      <span className={`priority-pill ${task.priority.toLowerCase()}`}>
                        {task.priority}
                      </span>
                    </div>
                    {task.category && (
                      <div className="task-meta">
                        {task.category} • {getRelativeTime(task.createdAt)}
                      </div>
                    )}
                  </div>

                  {/* Direct Actions */}
                  <div className="action-group" onClick={(e) => e.stopPropagation()}>
                    {task.dueDate && (
                      <div className="date-action-btn" title="Change Due Date" onClick={() => handleListDateClick(task)}>
                        <svg className="icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </div>
                    )}
                    <div className="action-btn" title="Edit Objective" onClick={() => openEditSheet(task)}>
                      <svg className="icon icon-xs" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </div>
                  </div>

                  {/* Drag Handle included in slide-trigger area or implicitly whole card */}
                  <div className="slide-trigger" onClick={(e) => { e.stopPropagation(); setActiveSlidTask(activeSlidTask === task.id ? null : task.id); }}>
                    <svg className="icon icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                  </div>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </div>

      {/* FAB */}

      <button className="fab" onClick={openAddSheet} title="New Objective (N)">
        <svg className="icon icon-plus" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
      </button>

      {/* BOTTOM SHEET */}
      <div className={`bottom-sheet-overlay ${isSheetOpen ? 'active' : ''}`} onClick={() => toggleSheet(false)}></div>

      <div className={`bottom-sheet ${isSheetOpen ? 'active' : ''}`}>
        <div className="close-sheet-btn" onClick={() => toggleSheet(false)} title="Close (Esc)">
          <svg className="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>

        <div className="section-title">
          {sheetMode === 'ADD_CATEGORY' ? 'Initialise Space' :
            sheetMode === 'VIEW_TASK' ? 'Objective Details' :
              editingTaskId ? 'Modify Objective' : 'New Objective'}
        </div>

        {sheetMode === 'VIEW_TASK' ? (
          <div className="read-view">
            <div className="read-title">{textInput}</div>
            <div className="read-meta-row">
              <span className={`priority-pill ${selectedPriority.toLowerCase()}`}>{selectedPriority}</span>
              <span className="pill active" style={{ fontSize: '11px', padding: '4px 8px' }}>{selectedCategory}</span>
              {selectedDueDate && (
                <span className="due-date-pill">
                  <svg className="icon icon-xs" style={{ width: 12, height: 12 }} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  {new Date(selectedDueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>

            <div className="section-title" style={{ marginTop: 24 }}>Notes</div>
            <div className="read-description">
              {descriptionInput || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>No additional details.</span>}
            </div>

            <button className="btn-primary" style={{ marginTop: 32 }} onClick={() => setSheetMode('EDIT_TASK')}>
              <span>Edit Objective</span>
            </button>
          </div>
        ) : (
          <>
            <input
              ref={inputRef}
              type="text"
              className="sheet-input"
              placeholder={sheetMode === 'ADD_CATEGORY' ? 'Space Name...' : 'What needs to be done?'}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.ctrlKey && handleSave()}
            />

            {sheetMode !== 'ADD_CATEGORY' && (
              <>
                <div className="section-title">Assign Space</div>
                <div className="pill-row">
                  {categories.map(cat => (
                    <div
                      key={cat}
                      className={`pill ${selectedCategory === cat ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat}
                    </div>
                  ))}
                </div>

                <div className="section-title">Execution Level</div>
                <div className="pill-row">
                  {PRIORITIES.map(prio => (
                    <div
                      key={prio}
                      className={`pill ${selectedPriority === prio ? 'active' : ''}`}
                      onClick={() => setSelectedPriority(prio)}
                    >
                      {prio}
                    </div>
                  ))}
                </div>

                <div className="section-title">Due Date</div>
                <div className="pill-row">
                  <div className={`pill ${!selectedDueDate ? 'active' : ''}`} onClick={() => setSelectedDueDate(undefined)}>None</div>
                  <div className={`pill ${selectedDueDate === getTomorrow() ? 'active' : ''}`} onClick={() => setSelectedDueDate(getTomorrow())}>Tomorrow</div>
                  <div className={`pill ${selectedDueDate === getWeekend() ? 'active' : ''}`} onClick={() => setSelectedDueDate(getWeekend())}>Weekend</div>
                  <div className="pill" onClick={() => dateInputRef.current?.showPicker ? dateInputRef.current.showPicker() : dateInputRef.current?.click()}>
                    <svg className="icon icon-xs" style={{ marginRight: 6 }} viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    Pick Date
                  </div>
                  <input
                    ref={dateInputRef}
                    type="date"
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                    onChange={(e) => {
                      if (e.target.valueAsNumber) {
                        setSelectedDueDate(startOfDay(new Date(e.target.valueAsNumber)).getTime())
                      }
                    }}
                  />
                </div>

                <div className="section-title">Notes</div>
                <textarea
                  className="sheet-textarea"
                  placeholder="Add details..."
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                />
              </>
            )}

            <button className="btn-primary" onClick={handleSave}>
              <span>{sheetMode === 'ADD_CATEGORY' ? 'Confirm Space' : editingTaskId ? 'Update Details' : 'Launch Objective'}</span>
              <span className="opacity-30 text-[9px] font-black tracking-widest">CTRL+ENTER</span>
            </button>
          </>
        )}
      </div>

      {/* TOAST */}
      <div className={`top-toast ${isToastActive ? 'active' : ''}`}>
        <div className="close-sheet-btn" style={{ top: '12px', right: '12px', width: '24px', height: '24px' }} onClick={() => setIsToastActive(false)}>
          <svg className="icon" style={{ width: '12px', height: '12px' }} viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </div>
        <svg className="icon" style={{ stroke: 'var(--danger)' }} viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        <div style={{ flex: 1 }}>{toastMessage}</div>
        {(lastDeletedTask || lastDeletedCategory) && (
          <button className="undo-btn" onClick={undoDelete}>RESTORE</button>
        )}
      </div>

      {/* Shared List Date Picker */}
      <input
        ref={listDateInputRef}
        type="date"
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', bottom: 0, left: 0, zIndex: -1 }}
        onChange={(e) => {
          if (activeDateTaskId && e.target.valueAsNumber) {
            updateTaskDate(activeDateTaskId, startOfDay(new Date(e.target.valueAsNumber)).getTime())
          }
        }}
      />

    </div >
  )
}

export default App
