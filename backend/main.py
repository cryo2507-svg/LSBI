import os
import json
import shutil
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

from backend.database import engine, Base, get_db
from backend.models import Repository, Commit, Component, Dependency
from backend.schemas import (
    RepositoryCreate, RepositoryOut, CommitOut, 
    ArchitectureGraph, DriftReport, ComponentOut, DependencyOut
)
from backend.analyzer.git_manager import GitRepositoryManager
from backend.analyzer.code_analyzer import RepositoryAnalyzer, save_analysis_results

# Create DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Living Software Blueprint API")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

git_manager = GitRepositoryManager()

def background_repo_indexing(repo_id: int, db_session: Session):
    db = db_session
    try:
        repo_db = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo_db:
            return
        
        # Clone or open the repo
        repo = git_manager.clone_or_open(repo_db.path_or_url, repo_db.name)
        
        # Extract commits
        commits = git_manager.get_commits(repo)
        
        for c in commits:
            # Check if commit already exists
            existing = db.query(Commit).filter(Commit.repository_id == repo_id, Commit.hash == c["hash"]).first()
            if not existing:
                new_commit = Commit(
                    repository_id=repo_id,
                    hash=c["hash"],
                    author=c["author"],
                    message=c["message"],
                    timestamp=c["timestamp"]
                )
                db.add(new_commit)
        
        repo_db.status = "indexed"
        db.commit()
        
        # Pre-analyze the latest commit (head)
        latest_commit = db.query(Commit).filter(Commit.repository_id == repo_id).order_by(Commit.timestamp.desc()).first()
        if latest_commit:
            analyze_commit_sync(repo_db, latest_commit, db)
            
    except Exception as e:
        print(f"Failed indexing repo {repo_id}: {e}")
        repo_db = db.query(Repository).filter(Repository.id == repo_id).first()
        if repo_db:
            repo_db.status = f"failed: {str(e)}"
            db.commit()

def analyze_commit_sync(repo_db: Repository, commit_db: Commit, db: Session):
    try:
        # Check if already analyzed
        count = db.query(Component).filter(Component.commit_id == commit_db.id).count()
        if count > 0:
            return # Already analyzed
        
        repo = git_manager.clone_or_open(repo_db.path_or_url, repo_db.name)
        
        # Checkout the commit
        git_manager.checkout(repo, commit_db.hash)
        
        # Run static analysis
        local_path = git_manager.get_local_path(repo_db.name)
        analyzer = RepositoryAnalyzer(local_path)
        analyzer.scan_codebase()
        
        # Save results
        save_analysis_results(db, commit_db.id, analyzer)
        
        # Restore git head to master/main if possible, or just leave it
        try:
            # Default fallback to master or main
            if "main" in repo.branches:
                repo.git.checkout("main")
            elif "master" in repo.branches:
                repo.git.checkout("master")
        except Exception:
            pass
            
    except Exception as e:
        db.rollback()
        raise e

@app.post("/api/repositories", response_model=RepositoryOut)
def create_repository(repo_in: RepositoryCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # Create the repository DB entry
    db_repo = Repository(
        name=repo_in.name,
        path_or_url=repo_in.path_or_url,
        status="indexing"
    )
    db.add(db_repo)
    db.commit()
    db.refresh(db_repo)
    
    # Process commits & run initial analysis in background
    background_tasks.add_task(background_repo_indexing, db_repo.id, db)
    
    return db_repo

@app.get("/api/repositories", response_model=List[RepositoryOut])
def list_repositories(db: Session = Depends(get_db)):
    return db.query(Repository).all()

@app.delete("/api/repositories/{repo_id}")
def delete_repository(repo_id: int, db: Session = Depends(get_db)):
    repo_db = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo_db:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    # Delete local folder
    local_path = git_manager.get_local_path(repo_db.name)
    if os.path.exists(local_path):
        try:
            # Remove read-only files if Git has them (common on Windows)
            def remove_readonly(func, path, excinfo):
                os.chmod(path, 0o777)
                func(path)
            shutil.rmtree(local_path, onerror=remove_readonly)
        except Exception as e:
            print(f"Error removing repo folder: {e}")
            
    db.delete(repo_db)
    db.commit()
    return {"detail": "Repository deleted successfully"}

@app.get("/api/repositories/{repo_id}/commits", response_model=List[CommitOut])
def get_repository_commits(repo_id: int, db: Session = Depends(get_db)):
    # Order commits chronologically (oldest to newest) to make timeline slider sequential
    return db.query(Commit).filter(Commit.repository_id == repo_id).order_by(Commit.timestamp.asc()).all()

@app.get("/api/repositories/{repo_id}/commits/{commit_hash}/graph", response_model=ArchitectureGraph)
def get_architecture_graph(repo_id: int, commit_hash: str, db: Session = Depends(get_db)):
    repo_db = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo_db:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    commit_db = db.query(Commit).filter(Commit.repository_id == repo_id, Commit.hash == commit_hash).first()
    if not commit_db:
        raise HTTPException(status_code=404, detail="Commit not found")
        
    # Analyze dynamically if not already analyzed
    components_count = db.query(Component).filter(Component.commit_id == commit_db.id).count()
    if components_count == 0:
        try:
            analyze_commit_sync(repo_db, commit_db, db)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to analyze repository: {str(e)}")
            
    nodes = db.query(Component).filter(Component.commit_id == commit_db.id).all()
    edges = db.query(Dependency).filter(Dependency.commit_id == commit_db.id).all()
    
    return {
        "nodes": [ComponentOut.model_validate(n) for n in nodes],
        "edges": [DependencyOut.model_validate(e) for e in edges]
    }

@app.get("/api/repositories/{repo_id}/drift", response_model=DriftReport)
def get_architecture_drift(repo_id: int, base_commit: str, target_commit: str, db: Session = Depends(get_db)):
    repo_db = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo_db:
        raise HTTPException(status_code=404, detail="Repository not found")
        
    base_commit_db = db.query(Commit).filter(Commit.repository_id == repo_id, Commit.hash == base_commit).first()
    target_commit_db = db.query(Commit).filter(Commit.repository_id == repo_id, Commit.hash == target_commit).first()
    
    if not base_commit_db or not target_commit_db:
        raise HTTPException(status_code=404, detail="One or both commits not found")
        
    # Ensure both commits are analyzed
    for c_db in [base_commit_db, target_commit_db]:
        count = db.query(Component).filter(Component.commit_id == c_db.id).count()
        if count == 0:
            try:
                analyze_commit_sync(repo_db, c_db, db)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Analysis of commit {c_db.hash[:8]} failed: {e}")
                
    base_components = db.query(Component).filter(Component.commit_id == base_commit_db.id).all()
    base_dependencies = db.query(Dependency).filter(Dependency.commit_id == base_commit_db.id).all()
    
    target_components = db.query(Component).filter(Component.commit_id == target_commit_db.id).all()
    target_dependencies = db.query(Dependency).filter(Dependency.commit_id == target_commit_db.id).all()
    
    # Compute Drift
    base_nodes_map = {c.name: c for c in base_components}
    target_nodes_map = {c.name: c for c in target_components}
    
    added_nodes = []
    removed_nodes = []
    modified_nodes = []
    
    for name, comp in target_nodes_map.items():
        if name not in base_nodes_map:
            added_nodes.append(comp)
        else:
            base_meta = json.loads(base_nodes_map[name].metadata_json) if base_nodes_map[name].metadata_json else {}
            target_meta = json.loads(comp.metadata_json) if comp.metadata_json else {}
            if base_meta != target_meta:
                modified_nodes.append(comp)
                
    for name, comp in base_nodes_map.items():
        if name not in target_nodes_map:
            removed_nodes.append(comp)
            
    # Map dependencies by names for base
    base_edges_set = set()
    base_edges_map = {}
    for d in base_dependencies:
        src = next((c.name for c in base_components if c.id == d.source_id), None)
        tgt = next((c.name for c in base_components if c.id == d.target_id), None)
        if src and tgt:
            edge_key = (src, tgt, d.dependency_type)
            base_edges_set.add(edge_key)
            base_edges_map[edge_key] = d

    # Map dependencies by names for target
    target_edges_set = set()
    target_edges_map = {}
    for d in target_dependencies:
        src = next((c.name for c in target_components if c.id == d.source_id), None)
        tgt = next((c.name for c in target_components if c.id == d.target_id), None)
        if src and tgt:
            edge_key = (src, tgt, d.dependency_type)
            target_edges_set.add(edge_key)
            target_edges_map[edge_key] = d

    added_edges_keys = target_edges_set - base_edges_set
    removed_edges_keys = base_edges_set - target_edges_set

    added_edges = [target_edges_map[key] for key in added_edges_keys]
    removed_edges = [base_edges_map[key] for key in removed_edges_keys]

    return {
        "added_nodes": [ComponentOut.model_validate(n) for n in added_nodes],
        "removed_nodes": [ComponentOut.model_validate(n) for n in removed_nodes],
        "modified_nodes": [ComponentOut.model_validate(n) for n in modified_nodes],
        "added_edges": [DependencyOut.model_validate(e) for e in added_edges],
        "removed_edges": [DependencyOut.model_validate(e) for e in removed_edges]
    }
