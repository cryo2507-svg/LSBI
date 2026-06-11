import React, { useState, useEffect } from 'react';
import { fetchRepositories, fetchCommits, fetchGraph } from './utils/api';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import GraphView from './components/GraphView';
import EvolutionView from './components/EvolutionView';
import DriftView from './components/DriftView';
import { GitCommit, Info, RefreshCw } from 'lucide-react';

export default function App() {
  const [repositories, setRepositories] = useState([]);
  const [activeRepo, setActiveRepo] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [commits, setCommits] = useState([]);
  const [activeCommit, setActiveCommit] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  
  const [loading, setLoading] = useState(false);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [graphError, setGraphError] = useState('');

  // 1. Fetch repositories on mount
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const data = await fetchRepositories();
        setRepositories(data);
        if (data.length > 0) {
          // Default to the first indexed repository
          const readyRepo = data.find(r => r.status === 'indexed') || data[0];
          setActiveRepo(readyRepo);
          setActiveTab('architecture');
        } else {
          setActiveTab('dashboard');
        }
      } catch (err) {
        console.error("Failed loading repos", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // 2. Fetch commits when active repository changes
  useEffect(() => {
    if (!activeRepo) {
      setCommits([]);
      setActiveCommit(null);
      return;
    }

    async function loadCommits() {
      try {
        const data = await fetchCommits(activeRepo.id);
        setCommits(data);
        if (data.length > 0) {
          // Default to the latest commit (last in chronological order)
          setActiveCommit(data[data.length - 1]);
        } else {
          setActiveCommit(null);
        }
      } catch (err) {
        console.error("Failed loading commits", err);
      }
    }
    loadCommits();
  }, [activeRepo]);

  // 3. Fetch graph when active commit or tab changes (only for architecture/evolution)
  useEffect(() => {
    if (!activeRepo || !activeCommit) {
      setGraphData({ nodes: [], edges: [] });
      return;
    }

    if (activeTab !== 'architecture' && activeTab !== 'evolution') {
      return;
    }

    async function loadGraph() {
      setLoadingGraph(true);
      setGraphError('');
      try {
        const data = await fetchGraph(activeRepo.id, activeCommit.hash);
        setGraphData(data);
      } catch (err) {
        setGraphError(err.message || 'Failed to fetch graph data');
      } finally {
        setLoadingGraph(false);
      }
    }
    loadGraph();
  }, [activeRepo, activeCommit, activeTab]);

  const handleRepoCreated = (newRepo) => {
    setRepositories(prev => [...prev, newRepo]);
    setActiveRepo(newRepo);
    setActiveTab('architecture');
  };

  const handleRepoDeleted = (deletedId) => {
    setRepositories(prev => prev.filter(r => r.id !== deletedId));
    if (activeRepo && activeRepo.id === deletedId) {
      setActiveRepo(null);
      setActiveTab('dashboard');
    }
  };

  return (
    <div className="app-container">
      {/* Visual background decorations */}
      <div className="ambient-bg">
        <div className="ambient-glow-1"></div>
        <div className="ambient-glow-2"></div>
      </div>

      <Header 
        repositories={repositories} 
        activeRepo={activeRepo} 
        setActiveRepo={setActiveRepo}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <div className="main-content">
        {activeTab !== 'dashboard' && activeRepo && (
          <aside className="sidebar">
            <div className="sidebar-section">
              <h4 className="sidebar-title">Selected Repository</h4>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{activeRepo.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '0.2rem' }}>
                {activeRepo.path_or_url}
              </div>
            </div>

            <div className="sidebar-section" style={{ flex: 1, overflowY: 'auto' }}>
              <h4 className="sidebar-title">Commits History ({commits.length})</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {commits.map((commit, idx) => {
                  const isActive = activeCommit && activeCommit.hash === commit.hash;
                  return (
                    <div 
                      key={commit.hash}
                      onClick={() => {
                        if (activeTab === 'drift') {
                          // Ignore timeline clicks when in drift comparison to avoid breaking selection
                          return;
                        }
                        setActiveCommit(commit);
                      }}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '6px',
                        background: isActive ? 'var(--bg-tertiary)' : 'rgba(255,255,255,0.02)',
                        border: isActive ? '1px solid var(--accent-blue)' : '1px solid transparent',
                        cursor: activeTab === 'drift' ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                        opacity: activeTab === 'drift' ? 0.6 : 1
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ 
                          fontFamily: 'var(--font-mono)', 
                          fontSize: '0.75rem', 
                          fontWeight: 600,
                          color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)'
                        }}>
                          {commit.hash.substring(0, 8)}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          {idx === commits.length - 1 ? 'Latest' : idx === 0 ? 'Initial' : `v${idx + 1}`}
                        </span>
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: 'var(--text-primary)', 
                        marginTop: '0.25rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {commit.message ? commit.message.split('\n')[0] : 'No message'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="sidebar-section">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: '1.4' }}>
                <Info size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  {activeTab === 'drift' 
                    ? 'Use compare controls at the top to select custom commits to visualize architecture drift.'
                    : 'Click a commit node to explore the repository architecture at that commit.'
                  }
                </span>
              </div>
            </div>
          </aside>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeTab === 'dashboard' && (
            <Dashboard 
              repositories={repositories} 
              onRepoCreated={handleRepoCreated}
              onRepoDeleted={handleRepoDeleted}
              setActiveRepo={setActiveRepo}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'architecture' && (
            <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
              {loadingGraph ? (
                <div style={{ margin: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} />
                  Extracting Graph...
                </div>
              ) : graphError ? (
                <div style={{ margin: 'auto', color: 'var(--accent-red)' }}>{graphError}</div>
              ) : (
                <GraphView nodes={graphData.nodes} edges={graphData.edges} />
              )}
            </div>
          )}

          {activeTab === 'evolution' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
                {loadingGraph ? (
                  <div style={{ margin: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} />
                    Analyzing codebase snapshot...
                  </div>
                ) : graphError ? (
                  <div style={{ margin: 'auto', color: 'var(--accent-red)' }}>{graphError}</div>
                ) : (
                  <GraphView nodes={graphData.nodes} edges={graphData.edges} />
                )}
              </div>
              <EvolutionView 
                commits={commits} 
                activeCommit={activeCommit} 
                onCommitChange={setActiveCommit} 
              />
            </div>
          )}

          {activeTab === 'drift' && (
            <DriftView activeRepo={activeRepo} commits={commits} />
          )}
        </div>
      </div>
    </div>
  );
}
