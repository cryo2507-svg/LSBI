import React from 'react';
import { GitBranch, Activity, LayoutGrid, Compass, GitMerge, Trash2 } from 'lucide-react';

export default function Header({ 
  repositories, 
  activeRepo, 
  setActiveRepo, 
  activeTab, 
  setActiveTab 
}) {
  return (
    <header className="app-header">
      <div className="logo-container">
        <Compass size={24} className="logo-icon" />
        <h1 className="logo-title" style={{ fontSize: '1.25rem', margin: 0 }}>Living Software Blueprint</h1>
      </div>

      {activeRepo && (
        <div className="nav-tabs">
          <button 
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutGrid size={16} />
            Dashboard
          </button>
          <button 
            className={`nav-tab ${activeTab === 'architecture' ? 'active' : ''}`}
            onClick={() => setActiveTab('architecture')}
          >
            <Activity size={16} />
            Architecture Map
          </button>
          <button 
            className={`nav-tab ${activeTab === 'evolution' ? 'active' : ''}`}
            onClick={() => setActiveTab('evolution')}
          >
            <GitBranch size={16} />
            Evolution
          </button>
          <button 
            className={`nav-tab ${activeTab === 'drift' ? 'active' : ''}`}
            onClick={() => setActiveTab('drift')}
          >
            <GitMerge size={16} />
            Drift Detector
          </button>
        </div>
      )}

      <div className="header-actions">
        {repositories.length > 0 && (
          <div className="repo-select-container">
            <GitBranch size={16} style={{ color: '#3b82f6' }} />
            <select 
              className="repo-select"
              value={activeRepo ? activeRepo.id : ''}
              onChange={(e) => {
                const selected = repositories.find(r => r.id === parseInt(e.target.value));
                if (selected) {
                  setActiveRepo(selected);
                  if (activeTab === 'dashboard') {
                    setActiveTab('architecture'); // auto navigate to visual map
                  }
                }
              }}
            >
              {!activeRepo && <option value="">Select Repository...</option>}
              {repositories.map(repo => (
                <option key={repo.id} value={repo.id}>
                  {repo.name} ({repo.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </header>
  );
}
