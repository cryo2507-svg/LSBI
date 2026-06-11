import os
import git
from datetime import datetime

class GitRepositoryManager:
    def __init__(self, workspace_dir: str = None):
        if workspace_dir is None:
            # Default to a folder inside backend workspace
            current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            workspace_dir = os.path.join(current_dir, "cloned_repos")
        
        self.workspace_dir = os.path.abspath(workspace_dir)
        if not os.path.exists(self.workspace_dir):
            os.makedirs(self.workspace_dir)

    def get_local_path(self, repo_name: str) -> str:
        # Sanitize name
        safe_name = "".join([c if c.isalnum() or c in "-_" else "_" for c in repo_name])
        return os.path.join(self.workspace_dir, safe_name)

    def clone_or_open(self, path_or_url: str, name: str) -> git.Repo:
        local_path = self.get_local_path(name)
        
        if os.path.exists(local_path) and os.path.exists(os.path.join(local_path, ".git")):
            repo = git.Repo(local_path)
            try:
                # If there's an origin remote, try fetching latest updates
                if repo.remotes:
                    repo.remotes.origin.fetch()
            except Exception:
                pass
            return repo
        else:
            # Clone repo. GitPython handles local directories as paths, and remote URLs automatically.
            repo = git.Repo.clone_from(path_or_url, local_path)
            return repo

    def get_commits(self, repo: git.Repo):
        commits_data = []
        try:
            # Get all commits in the current branch history
            for commit in repo.iter_commits():
                commits_data.append({
                    "hash": commit.hexsha,
                    "author": f"{commit.author.name} <{commit.author.email}>" if commit.author else "Unknown",
                    "message": commit.message,
                    "timestamp": datetime.fromtimestamp(commit.committed_date)
                })
        except Exception as e:
            print(f"Error fetching commits: {e}")
        return commits_data

    def checkout(self, repo: git.Repo, commit_hash: str):
        # Detach HEAD and check out to specific commit for analysis
        repo.git.checkout(commit_hash, force=True)
