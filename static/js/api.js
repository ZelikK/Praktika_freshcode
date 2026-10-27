// Zenith ToDo - Dual Storage & API Synchronization Manager
class StorageService {
  constructor() {
    this.STORAGE_KEY_TASKS = 'zenith_tasks_v1';
    this.STORAGE_KEY_CATEGORIES = 'zenith_categories_v1';
    this.API_BASE = '/api';
    this.isOnline = navigator.onLine;
    this.syncStatus = 'synced'; // 'synced' | 'offline' | 'syncing' | 'error'
    this.listeners = [];

    // Listen to network status
    window.addEventListener('online', () => this.handleNetworkChange(true));
    window.addEventListener('offline', () => this.handleNetworkChange(false));
  }

  onStatusChange(fn) {
    this.listeners.push(fn);
  }

  notifyStatus(status, details = '') {
    this.syncStatus = status;
    this.listeners.forEach(fn => fn(status, details));
  }

  async handleNetworkChange(online) {
    this.isOnline = online;
    if (online) {
      this.notifyStatus('syncing', 'Відновлено зв’язок, синхронізація...');
      await this.syncWithBackend();
    } else {
      this.notifyStatus('offline', 'Офлайн режим (збережено у localStorage)');
    }
  }

  // --- Local Storage Helpers ---
  getLocalTasks() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_TASKS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Помилка читання localStorage:', e);
      return [];
    }
  }

  setLocalTasks(tasks) {
    try {
      localStorage.setItem(this.STORAGE_KEY_TASKS, JSON.stringify(tasks));
    } catch (e) {
      console.error('Помилка запису в localStorage:', e);
    }
  }

  getLocalCategories() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_CATEGORIES);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Помилка читання категорій з localStorage:', e);
    }
    // Default categories if nothing in localStorage
    return [
      { id: 'cat-inbox', name: 'Вхідні', color: '#6366f1', icon: 'inbox' },
      { id: 'cat-work', name: 'Робота', color: '#ef4444', icon: 'briefcase' },
      { id: 'cat-personal', name: 'Особисте', color: '#10b981', icon: 'user' },
      { id: 'cat-study', name: 'Навчання', color: '#f59e0b', icon: 'book-open' },
      { id: 'cat-shopping', name: 'Покупки', color: '#8b5cf6', icon: 'shopping-cart' }
    ];
  }

  setLocalCategories(cats) {
    try {
      localStorage.setItem(this.STORAGE_KEY_CATEGORIES, JSON.stringify(cats));
    } catch (e) {
      console.error('Помилка запису категорій:', e);
    }
  }

  // Generate unique task ID
  generateId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // --- Core CRUD operations with dual persistence ---

  async getAllTasks() {
    // 1. First return localStorage instantly for 0ms lag
    const localTasks = this.getLocalTasks();
    
    // 2. In background or async, sync with backend if online
    try {
      const resp = await fetch(`${this.API_BASE}/todos`, { signal: AbortSignal.timeout(3500) });
      if (resp.ok) {
        const data = await resp.json();
        const serverTasks = data.tasks || [];
        
        // Merge server tasks and local tasks
        const merged = this.mergeTasks(localTasks, serverTasks);
        this.setLocalTasks(merged);
        this.notifyStatus('synced', 'Синхронізовано з сервером (SQLite + JSON)');
        return merged;
      }
    } catch (err) {
      this.notifyStatus('offline', 'Офлайн режим (дані з localStorage)');
    }
    
    return localTasks;
  }

  async createTask(taskData) {
    const now = new Date().toISOString();
    const newTask = {
      id: taskData.id || this.generateId(),
      title: taskData.title.trim(),
      description: taskData.description || '',
      completed: false,
      starred: !!taskData.starred,
      priority: taskData.priority || 'p4',
      due_date: taskData.due_date || '',
      category: taskData.category || 'Вхідні',
      subtasks: taskData.subtasks || [],
      created_at: now,
      updated_at: now,
      deleted: false
    };

    // 1. Save to localStorage immediately
    const localTasks = this.getLocalTasks();
    localTasks.unshift(newTask);
    this.setLocalTasks(localTasks);

    // 2. Persist to server
    try {
      const resp = await fetch(`${this.API_BASE}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) {
        const result = await resp.json();
        this.notifyStatus('synced', 'Збережено на сервері та в браузері');
        return result.task || newTask;
      }
    } catch (err) {
      this.notifyStatus('offline', 'Збережено локально (очікує синхронізації)');
    }

    return newTask;
  }

  async updateTask(task) {
    task.updated_at = new Date().toISOString();

    // 1. Update localStorage
    const localTasks = this.getLocalTasks();
    const idx = localTasks.findIndex(t => t.id === task.id);
    if (idx !== -1) {
      localTasks[idx] = { ...localTasks[idx], ...task };
      this.setLocalTasks(localTasks);
    }

    // 2. Update backend
    try {
      const resp = await fetch(`${this.API_BASE}/todos/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) {
        const result = await resp.json();
        this.notifyStatus('synced', 'Оновлено на сервері');
        return result.task || task;
      }
    } catch (err) {
      this.notifyStatus('offline', 'Оновлено в localStorage');
    }

    return task;
  }

  async toggleTask(taskId) {
    const localTasks = this.getLocalTasks();
    const task = localTasks.find(t => t.id === taskId);
    if (!task) return null;

    task.completed = !task.completed;
    task.updated_at = new Date().toISOString();
    this.setLocalTasks(localTasks);

    try {
      const resp = await fetch(`${this.API_BASE}/todos/${taskId}/toggle`, {
        method: 'PATCH',
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) {
        this.notifyStatus('synced', 'Статус збережено');
      }
    } catch (err) {
      this.notifyStatus('offline', 'Офлайн: статус змінено локально');
    }

    return task;
  }

  async toggleStar(taskId) {
    const localTasks = this.getLocalTasks();
    const task = localTasks.find(t => t.id === taskId);
    if (!task) return null;

    task.starred = !task.starred;
    task.updated_at = new Date().toISOString();
    this.setLocalTasks(localTasks);

    try {
      const resp = await fetch(`${this.API_BASE}/todos/${taskId}/star`, {
        method: 'PATCH',
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) {
        this.notifyStatus('synced', 'Важливість оновлено');
      }
    } catch (err) {
      this.notifyStatus('offline', 'Офлайн: важливість змінено локально');
    }

    return task;
  }

  async deleteTask(taskId) {
    // 1. Remove from localStorage
    let localTasks = this.getLocalTasks();
    localTasks = localTasks.filter(t => t.id !== taskId);
    this.setLocalTasks(localTasks);

    // 2. Remove from backend
    try {
      const resp = await fetch(`${this.API_BASE}/todos/${taskId}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) {
        this.notifyStatus('synced', 'Завдання видалено з бази даних');
        return true;
      }
    } catch (err) {
      this.notifyStatus('offline', 'Видалено з локального сховища');
    }

    return true;
  }

  async getCategories() {
    const localCats = this.getLocalCategories();
    try {
      const resp = await fetch(`${this.API_BASE}/categories`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        const data = await resp.json();
        if (data.categories && data.categories.length) {
          this.setLocalCategories(data.categories);
          return data.categories;
        }
      }
    } catch (err) {
      // Return local
    }
    return localCats;
  }

  async createCategory(name, color = '#6366f1', icon = 'list') {
    const localCats = this.getLocalCategories();
    const newCat = {
      id: 'cat-' + Date.now().toString(36),
      name,
      color,
      icon
    };
    localCats.push(newCat);
    this.setLocalCategories(localCats);

    try {
      const resp = await fetch(`${this.API_BASE}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color, icon }),
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.category || newCat;
      }
    } catch (err) {
      // Handled locally
    }

    return newCat;
  }

  async syncWithBackend() {
    this.notifyStatus('syncing', 'Синхронізація з сервером...');
    const localTasks = this.getLocalTasks();

    try {
      const resp = await fetch(`${this.API_BASE}/todos/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: localTasks }),
        signal: AbortSignal.timeout(5000)
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.tasks) {
          this.setLocalTasks(data.tasks);
        }
        if (data.categories) {
          this.setLocalCategories(data.categories);
        }
        this.notifyStatus('synced', 'Повна синхронізація завершена (SQLite + localStorage)');
        return { success: true, tasks: data.tasks, categories: data.categories };
      }
    } catch (err) {
      console.warn('Sync failed:', err);
      this.notifyStatus('offline', 'Сервер недоступний. Працюємо офлайн');
      return { success: false, tasks: localTasks, categories: this.getLocalCategories() };
    }
  }

  mergeTasks(localList, serverList) {
    const map = new Map();
    // Insert server items
    for (const t of serverList) {
      map.set(t.id, t);
    }
    // Merge or update with local items if newer
    for (const lt of localList) {
      if (!map.has(lt.id)) {
        map.set(lt.id, lt);
      } else {
        const st = map.get(lt.id);
        const lTime = new Date(lt.updated_at || 0).getTime();
        const sTime = new Date(st.updated_at || 0).getTime();
        if (lTime > sTime) {
          map.set(lt.id, lt);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

window.storageService = new StorageService();
