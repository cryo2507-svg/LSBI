import React, { useState } from 'react';
import { Plus, Trash2, FolderGit2, Play, AlertCircle } from 'lucide-react';
import { createRepository, deleteRepository } from '../utils/api';

export default function Dashboard({ 
  repositories, 
  onRepoCreated, 
  onRepoDeleted,
  setActiveRepo,
  setActiveTab 
}) {
  const [name, setName] = useState('');
  const [pathOrUrl, setPathOrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !pathOrUrl.trim()) return;
    
    setLoading(true);
    setError('');
    try {
      const data = await createRepository(name, pathOrUrl);
      onRepoCreated(data);
      setName('');
      setPathOrUrl('');
    } catch (err) {
      setError(err.message || 'Failed to add repository');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to remove this repository and all its analyzed data?")) return;
    try {
      await deleteRepository(id);
      onRepoDeleted(id);
    } catch (err) {
      alert("Failed to delete repository");
    }
  };

  return (
    <div className="dashboard-container">
      <h2>Architectural Discovery Hub</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Register local codebases or remote git repositories to automatically analyze their structure, track dependencies, and watch their design evolve.
      </p>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h3>Tracked Repositories</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {repositories.length} Total
            </span>
          </div>

          <div className="repo-list">
            {repositories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <FolderGit2 size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>No repositories tracked yet. Register one on the right to get started.</p>
              </div>
            ) : (
              repositories.map((repo) => (
                <div key={repo.id} className="repo-item">
                  <div>
                    <div className="repo-name">{repo.name}</div>
                    <div className="repo-path">{repo.path_or_url}</div>
                  </div>

                  <div className="repo-meta">
                    <span className={`status-badge status-${repo.status.split(':')[0]}`}>
                      {repo.status}
                    </span>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      onClick={() => {
                        setActiveRepo(repo);
                        setActiveTab('architecture');
                      }}
                      disabled={repo.status === 'indexing'}
                    >
                      <Play size={14} /> Explore
                    </button>
                    <button 
                      className="btn" 
                      style={{ 
                        padding: '0.4rem', 
                        background: 'transparent', 
                        border: 'none', 
                        color: 'var(--text-muted)' 
                      }}
                      onClick={(e) => handleDelete(repo.id, e)}
                    >
                      <Trash2 size={16} className="trash-icon" style={{ color: 'var(--accent-red)' }} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-header">
            <h3>Register New Repository</h3>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ 
                background: 'rgba(239, 68, 68, 0.1)', 
                color: 'var(--accent-red)', 
                padding: '0.75rem', 
                borderRadius: '8px', 
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem'
              }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="input-group">
              <label className="input-label">Project Name</label>
              <input 
                type="text" 
                className="input-text" 
                placeholder="e.g. My-Web-App"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">Repository Path or Git URL</label>
              <input 
                type="text" 
                className="input-text" 
                placeholder="e.g. C:/Projects/App or https://github.com/..."
                value={pathOrUrl}
                onChange={e => setPathOrUrl(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              <Plus size={16} /> {loading ? 'Registering & Cloning...' : 'Register Repository'}
            </button>
          </form>
          
          <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            <strong>💡 Pro Tip:</strong>
            <p style={{ marginTop: '0.5rem' }}>
              We've created a mock repository with 4 commits to test the platform. Click on the <strong>Explore</strong> button for the seeded repository above, or add a path to one of your own projects!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
