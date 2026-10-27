import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DB_PATH = os.path.join(DB_DIR, 'todos.db')
BACKUP_JSON_PATH = os.path.join(DB_DIR, 'todos_backup.json')

def ensure_dirs():
    os.makedirs(DB_DIR, exist_ok=True)

def get_connection():
    ensure_dirs()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    ensure_dirs()
    conn = get_connection()
    cursor = conn.cursor()
    
    # Tasks table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            completed INTEGER DEFAULT 0,
            starred INTEGER DEFAULT 0,
            priority TEXT DEFAULT 'p4',
            due_date TEXT DEFAULT '',
            category TEXT DEFAULT 'Вхідні',
            subtasks TEXT DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted INTEGER DEFAULT 0
        )
    ''')
    
    # Categories / Lists table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT DEFAULT '#4A90E2',
            icon TEXT DEFAULT 'list'
        )
    ''')
    
    # Insert default categories if none exist
    cursor.execute('SELECT COUNT(*) FROM categories')
    if cursor.fetchone()[0] == 0:
        default_categories = [
            ('cat-inbox', 'Вхідні', '#6366f1', 'inbox'),
            ('cat-work', 'Робота', '#ef4444', 'briefcase'),
            ('cat-personal', 'Особисте', '#10b981', 'user'),
            ('cat-study', 'Навчання', '#f59e0b', 'book-open'),
            ('cat-shopping', 'Покупки', '#8b5cf6', 'shopping-cart')
        ]
        cursor.executemany(
            'INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)',
            default_categories
        )

    # Insert helpful sample tasks if table is empty
    cursor.execute('SELECT COUNT(*) FROM tasks')
    if cursor.fetchone()[0] == 0:
        now = datetime.now().isoformat()
        today = datetime.now().strftime('%Y-%m-%d')
        sample_tasks = [
            (
                'task-welcome-1',
                'Підготувати звіт для практики Freshcode',
                'Розробити сучасний ToDo веб-додаток з повною синхронізацією Frontend (localStorage) та Backend (SQLite + JSON).',
                0,
                1,
                'p1',
                today,
                'Робота',
                json.dumps([
                    {'id': 'step-1', 'title': 'Створити REST API на Python/Flask', 'completed': True},
                    {'id': 'step-2', 'title': 'Налаштувати зв’язок з базою SQLite', 'completed': True},
                    {'id': 'step-3', 'title': 'Реалізувати дизайн у стилі Todoist & MS To Do', 'completed': True},
                    {'id': 'step-4', 'title': 'Додати синхронізацію з localStorage', 'completed': True}
                ]),
                now,
                now,
                0
            ),
            (
                'task-welcome-2',
                'Ознайомитися з інтерфейсом Zenith ToDo',
                'Натисніть на зірочку, щоб закріпити завдання у важливих. Клікніть на рядок, щоб відкрити бічну панель редагування.',
                0,
                1,
                'p2',
                today,
                'Навчання',
                json.dumps([
                    {'id': 'step-2-1', 'title': 'Спробувати гарячу клавішу Q для швидкого додавання', 'completed': False},
                    {'id': 'step-2-2', 'title': 'Перемкнути темну / світлу тему у верхньому лівому кутку', 'completed': False}
                ]),
                now,
                now,
                0
            ),
            (
                'task-welcome-3',
                'Спробувати відмітити завдання як виконане',
                'При виконанні завдання відтворюється мелодійний звуковий ефект успіху (Web Audio API), а завдання закреслюється.',
                1,
                0,
                'p3',
                '',
                'Особисте',
                '[]',
                now,
                now,
                0
            )
        ]
        cursor.executemany('''
            INSERT INTO tasks (id, title, description, completed, starred, priority, due_date, category, subtasks, created_at, updated_at, deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', sample_tasks)
    
    conn.commit()
    conn.close()
    
    # Create or update JSON backup
    export_to_json()

def export_to_json():
    """Back up all tasks to a JSON file in the server file system."""
    try:
        tasks = get_all_tasks(include_deleted=True)
        categories = get_categories()
        backup_data = {
            'exported_at': datetime.now().isoformat(),
            'categories': categories,
            'tasks': tasks
        }
        with open(BACKUP_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[Warning] Failed to export JSON backup: {e}")

def task_row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    task = dict(row)
    task['completed'] = bool(task['completed'])
    task['starred'] = bool(task['starred'])
    task['deleted'] = bool(task['deleted'])
    try:
        task['subtasks'] = json.loads(task['subtasks']) if task['subtasks'] else []
    except Exception:
        task['subtasks'] = []
    return task

def get_all_tasks(include_deleted: bool = False) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    if include_deleted:
        cursor.execute('SELECT * FROM tasks ORDER BY created_at DESC')
    else:
        cursor.execute('SELECT * FROM tasks WHERE deleted = 0 ORDER BY created_at DESC')
    rows = cursor.fetchall()
    tasks = [task_row_to_dict(r) for r in rows]
    conn.close()
    return tasks

def get_task_by_id(task_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM tasks WHERE id = ?', (task_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return task_row_to_dict(row)
    return None

def save_task(task_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create or update a task"""
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    
    task_id = task_data.get('id')
    if not task_id:
        import uuid
        task_id = str(uuid.uuid4())
        
    title = task_data.get('title', '').strip()
    description = task_data.get('description', '')
    completed = 1 if task_data.get('completed') else 0
    starred = 1 if task_data.get('starred') else 0
    priority = task_data.get('priority', 'p4')
    due_date = task_data.get('due_date', '')
    category = task_data.get('category', 'Вхідні')
    subtasks = json.dumps(task_data.get('subtasks', []))
    created_at = task_data.get('created_at', now)
    updated_at = now
    deleted = 1 if task_data.get('deleted') else 0
    
    cursor.execute('''
        INSERT INTO tasks (id, title, description, completed, starred, priority, due_date, category, subtasks, created_at, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            description = excluded.description,
            completed = excluded.completed,
            starred = excluded.starred,
            priority = excluded.priority,
            due_date = excluded.due_date,
            category = excluded.category,
            subtasks = excluded.subtasks,
            updated_at = excluded.updated_at,
            deleted = excluded.deleted
    ''', (task_id, title, description, completed, starred, priority, due_date, category, subtasks, created_at, updated_at, deleted))
    
    conn.commit()
    conn.close()
    
    export_to_json()
    return get_task_by_id(task_id)

def toggle_task(task_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    
    cursor.execute('SELECT completed FROM tasks WHERE id = ?', (task_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
        
    new_state = 0 if row['completed'] else 1
    cursor.execute('UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?', (new_state, now, task_id))
    conn.commit()
    conn.close()
    
    export_to_json()
    return get_task_by_id(task_id)

def delete_task(task_id: str, soft: bool = False) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    
    if soft:
        cursor.execute('UPDATE tasks SET deleted = 1, updated_at = ? WHERE id = ?', (now, task_id))
    else:
        cursor.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
        
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    
    export_to_json()
    return affected > 0

def get_categories() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM categories')
    rows = cursor.fetchall()
    categories = [dict(r) for r in rows]
    conn.close()
    return categories

def add_category(name: str, color: str = '#6366f1', icon: str = 'list') -> Dict[str, Any]:
    import uuid
    cat_id = 'cat-' + str(uuid.uuid4())[:8]
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT OR IGNORE INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)',
        (cat_id, name, color, icon)
    )
    conn.commit()
    cursor.execute('SELECT * FROM categories WHERE name = ?', (name,))
    row = cursor.fetchone()
    conn.close()
    export_to_json()
    return dict(row)

def sync_tasks(client_tasks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Sync client localStorage tasks with server tasks.
    Takes client tasks array, applies newer client updates to database,
    and returns full updated list of server tasks.
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    for c_task in client_tasks:
        c_id = c_task.get('id')
        if not c_id:
            continue
            
        cursor.execute('SELECT updated_at FROM tasks WHERE id = ?', (c_id,))
        existing = cursor.fetchone()
        
        c_updated = c_task.get('updated_at', '')
        if not existing or (c_updated and c_updated >= existing['updated_at']):
            # Client is newer or task doesn't exist on server
            subtasks_json = json.dumps(c_task.get('subtasks', []))
            cursor.execute('''
                INSERT INTO tasks (id, title, description, completed, starred, priority, due_date, category, subtasks, created_at, updated_at, deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    completed = excluded.completed,
                    starred = excluded.starred,
                    priority = excluded.priority,
                    due_date = excluded.due_date,
                    category = excluded.category,
                    subtasks = excluded.subtasks,
                    updated_at = excluded.updated_at,
                    deleted = excluded.deleted
            ''', (
                c_id,
                c_task.get('title', ''),
                c_task.get('description', ''),
                1 if c_task.get('completed') else 0,
                1 if c_task.get('starred') else 0,
                c_task.get('priority', 'p4'),
                c_task.get('due_date', ''),
                c_task.get('category', 'Вхідні'),
                subtasks_json,
                c_task.get('created_at', datetime.now().isoformat()),
                c_updated or datetime.now().isoformat(),
                1 if c_task.get('deleted') else 0
            ))
            
    conn.commit()
    conn.close()
    
    export_to_json()
    return {
        'tasks': get_all_tasks(include_deleted=False),
        'categories': get_categories(),
        'server_time': datetime.now().isoformat()
    }
