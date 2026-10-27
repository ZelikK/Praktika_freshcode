// Zenith ToDo - Main Application Logic
class TodoApp {
  constructor() {
    this.tasks = [];
    this.categories = [];
    this.currentView = 'today'; // 'today' | 'starred' | 'upcoming' | 'all' | 'completed' | category name
    this.searchQuery = '';
    this.sortBy = 'date';
    this.selectedTaskId = null;
    this.soundEnabled = localStorage.getItem('zenith_sound') !== 'false';
    this.currentTheme = localStorage.getItem('zenith_theme') || 'light';

    this.audioCtx = null;

    this.init();
  }

  async init() {
    this.applyTheme(this.currentTheme);
    this.setupEventListeners();
    this.setupStorageListeners();
    await this.loadInitialData();
  }

  // --- Sound Effects using Web Audio API ---
  playCompletionSound() {
    if (!this.soundEnabled) return;
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      // Harmonic arpeggio (C6 -> G6)
      osc.frequency.setValueAtTime(1046.50, now);
      osc.frequency.exponentialRampToValueAtTime(1567.98, now + 0.12);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn('Audio not available:', e);
    }
  }

  // --- Theme ---
  applyTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('zenith_theme', theme);
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.innerHTML = theme === 'dark' ? Icons.sun : Icons.moon;
      themeBtn.title = theme === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему';
    }
  }

  toggleTheme() {
    this.applyTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    localStorage.setItem('zenith_sound', this.soundEnabled);
    const soundBtn = document.getElementById('sound-toggle-btn');
    if (soundBtn) {
      soundBtn.innerHTML = this.soundEnabled ? Icons.soundOn : Icons.soundOff;
      soundBtn.title = this.soundEnabled ? 'Вимкнути звук' : 'Увімкнути звук';
    }
    this.showToast(this.soundEnabled ? 'Звук увімкнено' : 'Звук вимкнено');
  }

  // --- Data Loading ---
  async loadInitialData() {
    this.categories = await window.storageService.getCategories();
    this.renderCategoriesList();
    this.populateCategorySelects();

    this.tasks = await window.storageService.getAllTasks();
    this.render();
    this.updateSidebarBadges();
  }

  setupStorageListeners() {
    window.storageService.onStatusChange((status, details) => {
      const dot = document.getElementById('sync-dot');
      const text = document.getElementById('sync-text');
      if (dot && text) {
        dot.className = `pulse-dot ${status}`;
        text.innerText = details || (status === 'synced' ? 'Синхронізовано' : 'Офлайн режим');
      }
    });
  }

  // --- Event Listeners ---
  setupEventListeners() {
    // Quick Add Form
    const quickAddForm = document.getElementById('quick-add-form');
    if (quickAddForm) {
      quickAddForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleAddTask();
      });
    }

    // Quick Add Enter Key
    const quickInput = document.getElementById('quick-task-title');
    if (quickInput) {
      quickInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleAddTask();
        }
      });
    }

    // Search Input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

    // Sort Select
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.render();
      });
    }

    // Theme & Sound toggles
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => this.toggleTheme());
    document.getElementById('sound-toggle-btn')?.addEventListener('click', () => this.toggleSound());

    // Manual Sync Button
    document.getElementById('manual-sync-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('manual-sync-btn');
      btn.style.transform = 'rotate(360deg)';
      this.showToast('Синхронізація з базою SQLite...');
      const res = await window.storageService.syncWithBackend();
      if (res && res.tasks) {
        this.tasks = res.tasks;
        this.render();
        this.updateSidebarBadges();
        this.showToast('Дані успішно синхронізовано!');
      }
      setTimeout(() => { btn.style.transform = ''; }, 600);
    });

    // Mobile Sidebar Toggle
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
      document.querySelector('.sidebar')?.classList.toggle('open');
    });

    // Sidebar navigation click
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.getAttribute('data-view');
        this.switchView(view);
        document.querySelector('.sidebar')?.classList.remove('open');
      });
    });

    // Modal Add Category
    document.getElementById('btn-add-category')?.addEventListener('click', () => {
      this.openCategoryModal();
    });
    document.getElementById('close-cat-modal')?.addEventListener('click', () => {
      this.closeCategoryModal();
    });
    document.getElementById('category-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleCreateCategory();
    });

    // Detail Drawer Close
    document.getElementById('close-drawer-btn')?.addEventListener('click', () => {
      this.closeDetailDrawer();
    });

    // Global Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
          this.closeDetailDrawer();
          this.closeCategoryModal();
        }
        return;
      }

      if (e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й') {
        e.preventDefault();
        document.getElementById('quick-task-title')?.focus();
      } else if (e.key === '/') {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
      } else if (e.key === 'Escape') {
        this.closeDetailDrawer();
        this.closeCategoryModal();
      }
    });

    // Close drawer when clicking outside on mobile
    window.addEventListener('click', (e) => {
      const drawer = document.getElementById('detail-drawer');
      const item = e.target.closest('.task-item');
      if (drawer && !drawer.classList.contains('hidden') && !drawer.contains(e.target) && !item) {
        if (window.innerWidth <= 900) {
          this.closeDetailDrawer();
        }
      }
    });
  }

  // --- View Switching ---
  switchView(view) {
    this.currentView = view;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // Highlight active nav item
    const activeNav = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (activeNav) {
      activeNav.classList.add('active');
    }

    // Update Header Title and Subtitle
    this.updateHeaderTitle();
    this.render();
  }

  updateHeaderTitle() {
    const titleEl = document.getElementById('current-view-title');
    const subtitleEl = document.getElementById('current-view-subtitle');
    const today = new Date();
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    const dateFormatted = today.toLocaleDateString('uk-UA', options);
    // Capitalize first letter
    const dateString = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);

    if (this.currentView === 'today') {
      titleEl.innerHTML = `${Icons.sun} Мій день`;
      subtitleEl.innerText = dateString;
    } else if (this.currentView === 'starred') {
      titleEl.innerHTML = `${Icons.starFilled} Важливі завдання`;
      subtitleEl.innerText = 'Завдання з найвищим пріоритетом';
    } else if (this.currentView === 'upcoming') {
      titleEl.innerHTML = `${Icons.calendarUpcoming} Заплановані`;
      subtitleEl.innerText = 'Завдання з призначеною датою виконання';
    } else if (this.currentView === 'all') {
      titleEl.innerHTML = `${Icons.all} Усі завдання`;
      subtitleEl.innerText = 'Повний перелік ваших завдань';
    } else if (this.currentView === 'completed') {
      titleEl.innerHTML = `${Icons.completed} Виконані завдання`;
      subtitleEl.innerText = 'Архів виконаних завдань';
    } else {
      // Category view
      const cat = this.categories.find(c => c.name === this.currentView || c.id === this.currentView);
      if (cat) {
        titleEl.innerHTML = `<span class="category-dot" style="background:${cat.color}"></span> ${cat.name}`;
        subtitleEl.innerText = `Список завдань категорії "${cat.name}"`;
      }
    }
  }

  // --- Category Management ---
  renderCategoriesList() {
    const container = document.getElementById('categories-list');
    if (!container) return;

    container.innerHTML = '';
    this.categories.forEach(cat => {
      const li = document.createElement('li');
      li.className = `nav-item ${this.currentView === cat.name ? 'active' : ''}`;
      li.setAttribute('data-view', cat.name);
      
      const count = this.tasks.filter(t => t.category === cat.name && !t.completed).length;

      li.innerHTML = `
        <div class="nav-item-left">
          <span class="category-dot" style="background: ${cat.color}"></span>
          <span>${cat.name}</span>
        </div>
        <span class="nav-badge">${count}</span>
      `;

      li.addEventListener('click', () => {
        this.switchView(cat.name);
        document.querySelector('.sidebar')?.classList.remove('open');
      });

      container.appendChild(li);
    });
  }

  populateCategorySelects() {
    const quickSelect = document.getElementById('quick-task-category');
    const drawerSelect = document.getElementById('drawer-category-select');

    const optionsHtml = this.categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    if (quickSelect) quickSelect.innerHTML = optionsHtml;
    if (drawerSelect) drawerSelect.innerHTML = optionsHtml;
  }

  openCategoryModal() {
    const modal = document.getElementById('category-modal');
    if (modal) {
      modal.classList.add('open');
      document.getElementById('new-cat-name')?.focus();
    }
  }

  closeCategoryModal() {
    document.getElementById('category-modal')?.classList.remove('open');
  }

  async handleCreateCategory() {
    const nameInput = document.getElementById('new-cat-name');
    const name = nameInput.value.trim();
    if (!name) return;

    const selectedColorEl = document.querySelector('.color-option.selected');
    const color = selectedColorEl ? selectedColorEl.getAttribute('data-color') : '#6366f1';

    const newCat = await window.storageService.createCategory(name, color);
    this.categories.push(newCat);
    nameInput.value = '';
    this.closeCategoryModal();

    this.renderCategoriesList();
    this.populateCategorySelects();
    this.showToast(`Список "${name}" створено`);
    this.switchView(name);
  }

  // --- Task Creation ---
  async handleAddTask() {
    const titleInput = document.getElementById('quick-task-title');
    const title = titleInput.value.trim();
    if (!title) return;

    const priority = document.getElementById('quick-task-priority')?.value || 'p4';
    const dueDate = document.getElementById('quick-task-date')?.value || '';
    const category = document.getElementById('quick-task-category')?.value || (this.isCustomCategoryView() ? this.currentView : 'Вхідні');

    const newTaskData = {
      title,
      priority,
      due_date: dueDate || (this.currentView === 'today' ? this.getTodayDateString() : ''),
      category: category,
      starred: this.currentView === 'starred'
    };

    titleInput.value = '';
    const created = await window.storageService.createTask(newTaskData);
    this.tasks.unshift(created);

    this.render();
    this.updateSidebarBadges();
    this.showToast('Завдання додано!');
  }

  isCustomCategoryView() {
    return !['today', 'starred', 'upcoming', 'all', 'completed'].includes(this.currentView);
  }

  getTodayDateString() {
    return new Date().toISOString().split('T')[0];
  }

  // --- Filtering & Sorting ---
  getFilteredTasks() {
    const todayStr = this.getTodayDateString();

    let list = this.tasks.filter(task => {
      // 1. Text Search Filter
      if (this.searchQuery) {
        const matchesTitle = task.title.toLowerCase().includes(this.searchQuery);
        const matchesDesc = (task.description || '').toLowerCase().includes(this.searchQuery);
        if (!matchesTitle && !matchesDesc) return false;
      }

      // 2. View Filter
      if (this.currentView === 'today') {
        return task.due_date === todayStr || (!task.due_date && task.created_at.startsWith(todayStr));
      } else if (this.currentView === 'starred') {
        return !!task.starred;
      } else if (this.currentView === 'upcoming') {
        return !!task.due_date;
      } else if (this.currentView === 'completed') {
        return !!task.completed;
      } else if (this.currentView === 'all') {
        return true;
      } else {
        // Category view
        return task.category === this.currentView;
      }
    });

    // 3. Sorting
    list.sort((a, b) => {
      // Completed items always sink to the bottom unless in "completed" view
      if (this.currentView !== 'completed' && a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      if (this.sortBy === 'priority') {
        const pOrder = { p1: 1, p2: 2, p3: 3, p4: 4 };
        return (pOrder[a.priority] || 4) - (pOrder[b.priority] || 4);
      } else if (this.sortBy === 'title') {
        return a.title.localeCompare(b.title);
      } else {
        // Default by date: tasks with due dates first, then created_at desc
        if (a.due_date && b.due_date) {
          return a.due_date.localeCompare(b.due_date);
        }
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      }
    });

    return list;
  }

  // --- Render Tasks ---
  render() {
    const container = document.getElementById('tasks-container');
    if (!container) return;

    const filtered = this.getFilteredTasks();

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${Icons.checkCircle}</div>
          <h3>Тут ще немає завдань</h3>
          <p>Додайте нове завдання вище або змініть фільтри пошуку.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    filtered.forEach(task => {
      const itemEl = this.createTaskElement(task);
      container.appendChild(itemEl);
    });
  }

  createTaskElement(task) {
    const el = document.createElement('div');
    el.className = `task-item priority-${task.priority || 'p4'} ${task.completed ? 'completed' : ''} ${this.selectedTaskId === task.id ? 'active-selected' : ''}`;
    el.setAttribute('data-id', task.id);

    // Due date chip formatting
    let dateChipHtml = '';
    if (task.due_date) {
      const todayStr = this.getTodayDateString();
      let dateClass = '';
      let dateLabel = task.due_date;

      if (task.due_date === todayStr) {
        dateClass = 'today';
        dateLabel = 'Сьогодні';
      } else if (task.due_date < todayStr && !task.completed) {
        dateClass = 'overdue';
        dateLabel = `Прострочено (${task.due_date})`;
      }

      dateChipHtml = `<span class="meta-chip due-date ${dateClass}">${Icons.calendar} ${dateLabel}</span>`;
    }

    // Category chip
    const catObj = this.categories.find(c => c.name === task.category);
    const catColor = catObj ? catObj.color : '#6366f1';
    const categoryChipHtml = `<span class="meta-chip"><span class="category-dot" style="background:${catColor}"></span>${task.category || 'Вхідні'}</span>`;

    // Subtasks badge
    let subtasksBadge = '';
    const subtasks = task.subtasks || [];
    if (subtasks.length > 0) {
      const doneCount = subtasks.filter(s => s.completed).length;
      subtasksBadge = `<span class="meta-chip subtask-badge">${Icons.check} ${doneCount}/${subtasks.length}</span>`;
    }

    el.innerHTML = `
      <div class="task-left">
        <div class="task-checkbox-wrap" title="${task.completed ? 'Позначити як невиконане' : 'Позначити як виконане'}">
          <div class="task-checkbox">
            ${Icons.check}
          </div>
        </div>
        <div class="task-info">
          <div class="task-title">${this.escapeHtml(task.title)}</div>
          <div class="task-meta">
            ${categoryChipHtml}
            ${dateChipHtml}
            ${subtasksBadge}
          </div>
        </div>
      </div>
      <div class="task-right">
        <button class="task-btn-star ${task.starred ? 'starred' : ''}" title="${task.starred ? 'Прибрати зірочку' : 'Позначити важливим'}">
          ${task.starred ? Icons.starFilled : Icons.star}
        </button>
        <button class="task-btn-delete" title="Видалити завдання">
          ${Icons.trash}
        </button>
      </div>
    `;

    // Click checkbox to toggle
    const checkboxWrap = el.querySelector('.task-checkbox-wrap');
    checkboxWrap.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleToggleTask(task.id);
    });

    // Click star to toggle
    const starBtn = el.querySelector('.task-btn-star');
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleToggleStar(task.id);
    });

    // Click delete
    const deleteBtn = el.querySelector('.task-btn-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleDeleteTask(task.id);
    });

    // Click item body to open detail drawer
    el.addEventListener('click', () => {
      this.openDetailDrawer(task.id);
    });

    return el;
  }

  // --- Toggle & Delete Actions ---
  async handleToggleTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    const willBeCompleted = !task.completed;
    if (willBeCompleted) {
      this.playCompletionSound();
    }

    await window.storageService.toggleTask(taskId);
    task.completed = willBeCompleted;

    this.render();
    this.updateSidebarBadges();

    // If open in drawer, update drawer checkbox too
    if (this.selectedTaskId === taskId) {
      this.populateDrawer(task);
    }
  }

  async handleToggleStar(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    await window.storageService.toggleStar(taskId);
    task.starred = !task.starred;

    this.render();
    this.updateSidebarBadges();

    if (this.selectedTaskId === taskId) {
      this.populateDrawer(task);
    }
  }

  async handleDeleteTask(taskId) {
    if (!confirm('Ви дійсно хочете видалити це завдання?')) return;

    await window.storageService.deleteTask(taskId);
    this.tasks = this.tasks.filter(t => t.id !== taskId);

    if (this.selectedTaskId === taskId) {
      this.closeDetailDrawer();
    }

    this.render();
    this.updateSidebarBadges();
    this.showToast('Завдання видалено');
  }

  // --- Detail Drawer (Microsoft To Do style) ---
  openDetailDrawer(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    this.selectedTaskId = taskId;
    const drawer = document.getElementById('detail-drawer');
    drawer.classList.remove('hidden');

    this.populateDrawer(task);

    // Highlight row in list
    document.querySelectorAll('.task-item').forEach(el => {
      el.classList.toggle('active-selected', el.getAttribute('data-id') === taskId);
    });
  }

  closeDetailDrawer() {
    this.selectedTaskId = null;
    const drawer = document.getElementById('detail-drawer');
    drawer.classList.add('hidden');
    document.querySelectorAll('.task-item').forEach(el => el.classList.remove('active-selected'));
  }

  populateDrawer(task) {
    const drawer = document.getElementById('detail-drawer');
    if (!drawer) return;

    // Checkbox & star in drawer header
    const chk = document.getElementById('drawer-task-checkbox');
    if (chk) {
      chk.className = `task-checkbox ${task.completed ? 'completed' : ''}`;
      chk.innerHTML = Icons.check;
      chk.onclick = () => this.handleToggleTask(task.id);
    }

    const starBtn = document.getElementById('drawer-star-btn');
    if (starBtn) {
      starBtn.className = `task-btn-star ${task.starred ? 'starred' : ''}`;
      starBtn.innerHTML = task.starred ? Icons.starFilled : Icons.star;
      starBtn.onclick = () => this.handleToggleStar(task.id);
    }

    // Title input
    const titleInput = document.getElementById('drawer-title-input');
    titleInput.value = task.title;
    titleInput.onblur = () => {
      if (titleInput.value.trim() && titleInput.value.trim() !== task.title) {
        task.title = titleInput.value.trim();
        window.storageService.updateTask(task);
        this.render();
      }
    };

    // Notes textarea
    const notesText = document.getElementById('drawer-notes-input');
    notesText.value = task.description || '';
    notesText.onblur = () => {
      if (notesText.value !== task.description) {
        task.description = notesText.value;
        window.storageService.updateTask(task);
      }
    };

    // Due Date
    const dateInput = document.getElementById('drawer-date-input');
    dateInput.value = task.due_date || '';
    dateInput.onchange = () => {
      task.due_date = dateInput.value;
      window.storageService.updateTask(task);
      this.render();
      this.updateSidebarBadges();
    };

    // Priority
    const prioritySelect = document.getElementById('drawer-priority-select');
    prioritySelect.value = task.priority || 'p4';
    prioritySelect.onchange = () => {
      task.priority = prioritySelect.value;
      window.storageService.updateTask(task);
      this.render();
    };

    // Category
    const categorySelect = document.getElementById('drawer-category-select');
    categorySelect.value = task.category || 'Вхідні';
    categorySelect.onchange = () => {
      task.category = categorySelect.value;
      window.storageService.updateTask(task);
      this.render();
      this.updateSidebarBadges();
    };

    // Subtasks
    this.renderDrawerSubtasks(task);

    // Add subtask input
    const subtaskForm = document.getElementById('drawer-add-subtask-form');
    const subtaskInput = document.getElementById('drawer-add-subtask-input');
    subtaskForm.onsubmit = (e) => {
      e.preventDefault();
      const val = subtaskInput.value.trim();
      if (!val) return;
      if (!task.subtasks) task.subtasks = [];
      task.subtasks.push({
        id: 'sub_' + Date.now(),
        title: val,
        completed: false
      });
      subtaskInput.value = '';
      window.storageService.updateTask(task);
      this.renderDrawerSubtasks(task);
      this.render();
    };

    // Meta creation date
    const metaDate = document.getElementById('drawer-meta-created');
    if (metaDate) {
      const d = new Date(task.created_at);
      metaDate.innerText = `Створено: ${d.toLocaleDateString('uk-UA')} ${d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // Delete button in drawer
    const deleteBtn = document.getElementById('drawer-delete-btn');
    if (deleteBtn) {
      deleteBtn.onclick = () => this.handleDeleteTask(task.id);
    }
  }

  renderDrawerSubtasks(task) {
    const list = document.getElementById('drawer-subtasks-list');
    if (!list) return;

    list.innerHTML = '';
    const subtasks = task.subtasks || [];

    subtasks.forEach(sub => {
      const li = document.createElement('li');
      li.className = `subtask-item ${sub.completed ? 'completed' : ''}`;

      li.innerHTML = `
        <div class="subtask-left">
          <input type="checkbox" ${sub.completed ? 'checked' : ''} style="cursor:pointer;" />
          <span>${this.escapeHtml(sub.title)}</span>
        </div>
        <button class="subtask-delete-btn" title="Видалити крок">${Icons.trash}</button>
      `;

      // Toggle checkbox
      const chk = li.querySelector('input[type="checkbox"]');
      chk.onchange = () => {
        sub.completed = chk.checked;
        window.storageService.updateTask(task);
        this.renderDrawerSubtasks(task);
        this.render();
      };

      // Delete subtask
      const delBtn = li.querySelector('.subtask-delete-btn');
      delBtn.onclick = () => {
        task.subtasks = task.subtasks.filter(s => s.id !== sub.id);
        window.storageService.updateTask(task);
        this.renderDrawerSubtasks(task);
        this.render();
      };

      list.appendChild(li);
    });
  }

  // --- Badges & Counters ---
  updateSidebarBadges() {
    const todayStr = this.getTodayDateString();

    const todayCount = this.tasks.filter(t => !t.completed && (t.due_date === todayStr || (!t.due_date && t.created_at.startsWith(todayStr)))).length;
    const starredCount = this.tasks.filter(t => !t.completed && t.starred).length;
    const upcomingCount = this.tasks.filter(t => !t.completed && t.due_date).length;
    const allCount = this.tasks.filter(t => !t.completed).length;
    const completedCount = this.tasks.filter(t => t.completed).length;

    const setBadge = (id, count) => {
      const el = document.getElementById(id);
      if (el) el.innerText = count;
    };

    setBadge('badge-today', todayCount);
    setBadge('badge-starred', starredCount);
    setBadge('badge-upcoming', upcomingCount);
    setBadge('badge-all', allCount);
    setBadge('badge-completed', completedCount);

    this.renderCategoriesList();
  }

  // --- UI Toast Helper ---
  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `${Icons.check} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Color picker in category modal
document.addEventListener('DOMContentLoaded', () => {
  window.app = new TodoApp();

  document.querySelectorAll('.color-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
});
