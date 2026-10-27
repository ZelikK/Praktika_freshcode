import os
import sys

# Ensure UTF-8 output encoding on Windows consoles
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

from flask import Flask, jsonify, request, render_template, send_from_directory
from flask_cors import CORS
from datetime import datetime, date
import database as db

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

# Initialize database tables and initial categories on startup
db.init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/health', methods=['GET'])
def health():
    tasks = db.get_all_tasks()
    return jsonify({
        'status': 'healthy',
        'server_time': datetime.now().isoformat(),
        'storage': {
            'sqlite_db': os.path.exists(db.DB_PATH),
            'json_backup': os.path.exists(db.BACKUP_JSON_PATH)
        },
        'tasks_count': len(tasks)
    })

@app.route('/api/todos', methods=['GET'])
def get_todos():
    category = request.args.get('category')
    filter_type = request.args.get('filter') # today, starred, completed, all
    tasks = db.get_all_tasks()
    
    today_str = date.today().isoformat()
    
    if category:
        tasks = [t for t in tasks if t.get('category') == category]
        
    if filter_type == 'today':
        tasks = [t for t in tasks if t.get('due_date') == today_str]
    elif filter_type == 'starred':
        tasks = [t for t in tasks if t.get('starred')]
    elif filter_type == 'completed':
        tasks = [t for t in tasks if t.get('completed')]
    elif filter_type == 'active':
        tasks = [t for t in tasks if not t.get('completed')]
        
    return jsonify({'tasks': tasks})

@app.route('/api/todos', methods=['POST'])
def create_todo():
    data = request.get_json() or {}
    title = data.get('title', '').strip()
    if not title:
        return jsonify({'error': 'Назва завдання є обов’язковою'}), 400
        
    task = db.save_task(data)
    return jsonify({'task': task}), 201

@app.route('/api/todos/<task_id>', methods=['GET'])
def get_todo(task_id):
    task = db.get_task_by_id(task_id)
    if not task:
        return jsonify({'error': 'Завдання не знайдено'}), 404
    return jsonify({'task': task})

@app.route('/api/todos/<task_id>', methods=['PUT'])
def update_todo(task_id):
    data = request.get_json() or {}
    data['id'] = task_id
    updated = db.save_task(data)
    return jsonify({'task': updated})

@app.route('/api/todos/<task_id>/toggle', methods=['PATCH'])
def toggle_todo(task_id):
    updated = db.toggle_task(task_id)
    if not updated:
        return jsonify({'error': 'Завдання не знайдено'}), 404
    return jsonify({'task': updated})

@app.route('/api/todos/<task_id>/star', methods=['PATCH'])
def toggle_star(task_id):
    task = db.get_task_by_id(task_id)
    if not task:
        return jsonify({'error': 'Завдання не знайдено'}), 404
    task['starred'] = not task.get('starred', False)
    updated = db.save_task(task)
    return jsonify({'task': updated})

@app.route('/api/todos/<task_id>', methods=['DELETE'])
def delete_todo(task_id):
    success = db.delete_task(task_id)
    if not success:
        return jsonify({'error': 'Завдання не знайдено'}), 404
    return jsonify({'success': True, 'id': task_id})

@app.route('/api/todos/sync', methods=['POST'])
def sync_todos():
    payload = request.get_json() or {}
    client_tasks = payload.get('tasks', [])
    result = db.sync_tasks(client_tasks)
    return jsonify(result)

@app.route('/api/categories', methods=['GET'])
def get_categories():
    categories = db.get_categories()
    return jsonify({'categories': categories})

@app.route('/api/categories', methods=['POST'])
def create_category():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Назва списку є обов’язковою'}), 400
    color = data.get('color', '#6366f1')
    icon = data.get('icon', 'list')
    cat = db.add_category(name, color, icon)
    return jsonify({'category': cat}), 201

@app.route('/api/stats', methods=['GET'])
def get_stats():
    tasks = db.get_all_tasks()
    today_str = date.today().isoformat()
    
    total = len(tasks)
    completed = sum(1 for t in tasks if t.get('completed'))
    active = total - completed
    starred = sum(1 for t in tasks if t.get('starred'))
    due_today = sum(1 for t in tasks if t.get('due_date') == today_str and not t.get('completed'))
    
    return jsonify({
        'total': total,
        'completed': completed,
        'active': active,
        'starred': starred,
        'due_today': due_today
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("==================================================")
    print(">> Zenith ToDo Server running!")
    print(f">> Open in browser: http://127.0.0.1:{port}")
    print(">> SQLite DB: data/todos.db")
    print(">> JSON backup: data/todos_backup.json")
    print("==================================================")
    app.run(host='0.0.0.0', port=port, debug=False)
