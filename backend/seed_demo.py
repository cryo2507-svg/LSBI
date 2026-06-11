import os
import shutil
import git
import sys
import json
from datetime import datetime, timedelta

# Adjust sys.path to resolve backend imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(current_dir))

from backend.database import SessionLocal, Base, engine
from backend.models import Repository, Commit, Component, Dependency
from backend.analyzer.git_manager import GitRepositoryManager
from backend.analyzer.code_analyzer import RepositoryAnalyzer, save_analysis_results

MOCK_REPO_DIR = os.path.join(os.path.dirname(current_dir), "mock_demo_repo")

def setup_git_user(repo: git.Repo):
    # Set Git author config locally for this mock repo to prevent git commits from failing if global config is missing
    with repo.config_writer() as cw:
        cw.set_value("user", "name", "Blueprint Architect")
        cw.set_value("user", "email", "architect@softwareblueprint.dev")

def build_mock_repository():
    # Clean old mock repository if it exists
    if os.path.exists(MOCK_REPO_DIR):
        try:
            def remove_readonly(func, path, excinfo):
                os.chmod(path, 0o777)
                func(path)
            shutil.rmtree(MOCK_REPO_DIR, onerror=remove_readonly)
        except Exception as e:
            print(f"Warning: Could not remove old mock repo directory: {e}")

    os.makedirs(MOCK_REPO_DIR)
    repo = git.Repo.init(MOCK_REPO_DIR)
    setup_git_user(repo)

    # Let's write history in reverse order, starting from 4 days ago
    base_time = datetime.now() - timedelta(days=4)

    # ----------------------------------------------------
    # COMMIT 1: Initial Setup
    # ----------------------------------------------------
    os.makedirs(os.path.join(MOCK_REPO_DIR, "backend"), exist_ok=True)
    os.makedirs(os.path.join(MOCK_REPO_DIR, "frontend", "src", "components"), exist_ok=True)

    # Write backend/main.py
    main_py_v1 = """from fastapi import FastAPI

app = FastAPI()

@app.get("/api/status")
def get_status():
    return {"status": "healthy"}
"""
    with open(os.path.join(MOCK_REPO_DIR, "backend", "main.py"), "w") as f:
        f.write(main_py_v1)

    # Write frontend/src/components/Header.jsx
    header_v1 = """import React from 'react';

export default function Header() {
    return (
        <header className="header">
            <h1>App Title</h1>
        </header>
    );
}
"""
    with open(os.path.join(MOCK_REPO_DIR, "frontend", "src", "components", "Header.jsx"), "w") as f:
        f.write(header_v1)

    # Write frontend/src/App.jsx
    app_jsx_v1 = """import React from 'react';
import Header from './components/Header';

function App() {
    React.useEffect(() => {
        fetch('/api/status');
    }, []);

    return (
        <div className="app">
            <Header />
            <p>Welcome to Blueprint</p>
        </div>
    );
}

export default App;
"""
    with open(os.path.join(MOCK_REPO_DIR, "frontend", "src", "App.jsx"), "w") as f:
        f.write(app_jsx_v1)

    # Commit 1
    repo.index.add(["backend/main.py", "frontend/src/components/Header.jsx", "frontend/src/App.jsx"])
    commit_date_1 = (base_time + timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S')
    os.environ['GIT_AUTHOR_DATE'] = commit_date_1
    os.environ['GIT_COMMITTER_DATE'] = commit_date_1
    repo.index.commit("Initial setup of frontend and backend modules")

    # ----------------------------------------------------
    # COMMIT 2: Database Connection & User Creation API
    # ----------------------------------------------------
    # Add database helper
    db_py = """import sqlite3
from sqlalchemy import create_engine

DATABASE_URL = "sqlite:///./demo_data.db"
engine = create_engine(DATABASE_URL)

def get_db_connection():
    conn = sqlite3.connect("demo_data.db")
    return conn
"""
    with open(os.path.join(MOCK_REPO_DIR, "backend", "database.py"), "w") as f:
        f.write(db_py)

    # Update backend/main.py
    main_py_v2 = """from fastapi import FastAPI
from backend.database import get_db_connection

app = FastAPI()

@app.get("/api/status")
def get_status():
    return {"status": "healthy"}

@app.post("/api/users")
def create_user(username: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO users (username) VALUES (?)", (username,))
    conn.commit()
    conn.close()
    return {"message": "user created"}
"""
    with open(os.path.join(MOCK_REPO_DIR, "backend", "main.py"), "w") as f:
        f.write(main_py_v2)

    # Commit 2
    repo.index.add(["backend/database.py", "backend/main.py"])
    commit_date_2 = (base_time + timedelta(days=1, hours=4)).strftime('%Y-%m-%d %H:%M:%S')
    os.environ['GIT_AUTHOR_DATE'] = commit_date_2
    os.environ['GIT_COMMITTER_DATE'] = commit_date_2
    repo.index.commit("Add database connection and user registration API")

    # ----------------------------------------------------
    # COMMIT 3: User Dashboard Component Integration
    # ----------------------------------------------------
    # Create frontend/src/components/Dashboard.jsx
    dashboard_v1 = """import React from 'react';

export default function Dashboard() {
    const createUser = () => {
        fetch('/api/users', { method: 'POST' });
    };
    return (
        <div className="dashboard">
            <button onClick={createUser}>Register User</button>
        </div>
    );
}
"""
    with open(os.path.join(MOCK_REPO_DIR, "frontend", "src", "components", "Dashboard.jsx"), "w") as f:
        f.write(dashboard_v1)

    # Update frontend/src/App.jsx
    app_jsx_v2 = """import React from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';

function App() {
    React.useEffect(() => {
        fetch('/api/status');
    }, []);

    return (
        <div className="app">
            <Header />
            <Dashboard />
        </div>
    );
}

export default App;
"""
    with open(os.path.join(MOCK_REPO_DIR, "frontend", "src", "App.jsx"), "w") as f:
        f.write(app_jsx_v2)

    # Commit 3
    repo.index.add(["frontend/src/components/Dashboard.jsx", "frontend/src/App.jsx"])
    commit_date_3 = (base_time + timedelta(days=2, hours=6)).strftime('%Y-%m-%d %H:%M:%S')
    os.environ['GIT_AUTHOR_DATE'] = commit_date_3
    os.environ['GIT_COMMITTER_DATE'] = commit_date_3
    repo.index.commit("Connect frontend to new users API and add user dashboard component")

    # ----------------------------------------------------
    # COMMIT 4: Refactor Backend with Utils Helper
    # ----------------------------------------------------
    # Add backend/utils.py
    utils_py = """def sanitize_input(val: str) -> str:
    return val.strip().replace("'", "")
"""
    with open(os.path.join(MOCK_REPO_DIR, "backend", "utils.py"), "w") as f:
        f.write(utils_py)

    # Update backend/main.py
    main_py_v3 = """from fastapi import FastAPI
from backend.database import get_db_connection
from backend.utils import sanitize_input

app = FastAPI()

@app.get("/api/status")
def get_status():
    return {"status": "healthy"}

@app.post("/api/users")
def create_user(username: str):
    clean_username = sanitize_input(username)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO users (username) VALUES (?)", (clean_username,))
    conn.commit()
    conn.close()
    return {"message": "user created"}
"""
    with open(os.path.join(MOCK_REPO_DIR, "backend", "main.py"), "w") as f:
        f.write(main_py_v3)

    # Commit 4
    repo.index.add(["backend/utils.py", "backend/main.py"])
    commit_date_4 = (base_time + timedelta(days=3, hours=8)).strftime('%Y-%m-%d %H:%M:%S')
    os.environ['GIT_AUTHOR_DATE'] = commit_date_4
    os.environ['GIT_COMMITTER_DATE'] = commit_date_4
    repo.index.commit("Refactor backend structure and clean up helper scripts")

    # Restore environment variables
    os.environ.pop('GIT_AUTHOR_DATE', None)
    os.environ.pop('GIT_COMMITTER_DATE', None)
    
    print("Mock Git repository constructed successfully at:", MOCK_REPO_DIR)
    return MOCK_REPO_DIR

def seed_database():
    # Initialise the DB schemas
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        # Check if Mock Repo already exists in DB
        repo_name = "Mock-Demo-App"
        existing_repo = db.query(Repository).filter(Repository.name == repo_name).first()
        if existing_repo:
            db.delete(existing_repo)
            db.commit()
            
        # Register new Repository
        repo_db = Repository(
            name=repo_name,
            path_or_url=MOCK_REPO_DIR,
            status="indexing"
        )
        db.add(repo_db)
        db.commit()
        db.refresh(repo_db)
        
        # Git Manager open
        git_manager = GitRepositoryManager()
        repo = git_manager.clone_or_open(repo_db.path_or_url, repo_db.name)
        
        # Write Commits
        commits = git_manager.get_commits(repo)
        db_commits = []
        for c in commits:
            new_commit = Commit(
                repository_id=repo_db.id,
                hash=c["hash"],
                author=c["author"],
                message=c["message"],
                timestamp=c["timestamp"]
            )
            db.add(new_commit)
            db.flush()
            db_commits.append(new_commit)
            
        repo_db.status = "indexed"
        db.commit()
        
        # Analyze each commit in chronological order to pre-seed the graphs
        print("Analyzing mock commits...")
        for commit_db in reversed(db_commits):
            print(f" -> Analyzing Commit: {commit_db.hash[:8]} - {commit_db.message.splitlines()[0]}")
            git_manager.checkout(repo, commit_db.hash)
            
            local_path = git_manager.get_local_path(repo_db.name)
            analyzer = RepositoryAnalyzer(local_path)
            analyzer.scan_codebase()
            
            save_analysis_results(db, commit_db.id, analyzer)
            
        # Reset HEAD
        try:
            repo.git.checkout("master")
        except Exception:
            pass
            
        print("Database seeded with mock repository and architectural graphs for all 4 commits!")
        
    except Exception as e:
        db.rollback()
        print(f"Seeding failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    build_mock_repository()
    seed_database()
