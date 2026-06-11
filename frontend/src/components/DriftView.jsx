import React, { useState, useEffect } from 'react';
import { GitMerge, PlusCircle, MinusCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchDrift, fetchGraph } from '../utils/api';
import GraphView from './GraphView';

export default function DriftView({ activeRepo, commits }) {
  const [baseCommit, setBaseCommit] = useState('');
  const [targetCommit, setTargetCommit] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [driftReport, setDriftReport] = useState(null);
  
  // combined nodes and edges for D3 GraphView
  const [combinedNodes, setCombinedNodes] = useState([]);
  const [combinedEdges, setCombinedEdges] = useState([]);

  // Initialize dropdowns with first/last commits
  useEffect(() => {
    if (commits && commits.length >= 2) {
      setBaseCommit(commits[0].hash);
      setTargetCommit(commits[commits.length - 1].hash);
    } else if (commits && commits.length > 0) {
      setBaseCommit(commits[0].hash);
      setTargetCommit(commits[0].hash);
    }
  }, [commits]);

  const triggerDriftAnalysis = async () => {
    if (!baseCommit || !targetCommit) return;
    
    setLoading(true);
    setError('');
    setDriftReport(null);
    try {
      // 1. Fetch drift analysis delta
      const report = await fetchDrift(activeRepo.id, baseCommit, targetCommit);
      // 2. Fetch full graph of target commit to obtain unchanged nodes
      const targetGraph = await fetchGraph(activeRepo.id, targetCommit);
      // 3. Fetch full graph of base commit to help resolve names for removed nodes/edges
      const baseGraph = await fetchGraph(activeRepo.id, baseCommit);
      
      setDriftReport(report);

      // --- MERGE LOGIC ---
      // We will create a unified list of nodes.
      // Every node will have a 'driftStatus': 'added' | 'removed' | 'modified' | 'unchanged'
      const driftNodes = [];
      const nodeMapByName = new Map(); // name -> node in driftNodes

      const addedNames = new Set(report.added_nodes.map(n => n.name));
      const modifiedNames = new Set(report.modified_nodes.map(n => n.name));
      const removedNames = new Set(report.removed_nodes.map(n => n.name));

      // Add all nodes present in target commit
      targetGraph.nodes.forEach(node => {
        let status = 'unchanged';
        if (addedNames.has(node.name)) {
          status = 'added';
        } else if (modifiedNames.has(node.name)) {
          status = 'modified';
        }
        
        const newNode = { ...node, driftStatus: status };
        driftNodes.push(newNode);
        nodeMapByName.set(node.name, newNode);
      });

      // Add nodes that were removed (present in base but not target)
      report.removed_nodes.forEach(node => {
        const newNode = { ...node, driftStatus: 'removed' };
        driftNodes.push(newNode);
        nodeMapByName.set(node.name, newNode);
      });

      // Recalculate node IDs inside driftNodes to guarantee uniqueness and stability
      // Map name -> new ID
      const newIdMap = new Map();
      driftNodes.forEach((node, index) => {
        const oldId = node.id;
        node.id = index + 1; // Assign stable integer IDs
        newIdMap.set(node.name, node.id);
      });

      // Helper to resolve name from ID in target/base graphs
      const getTargetNodeName = (id) => targetGraph.nodes.find(n => n.id === id)?.name;
      const getBaseNodeName = (id) => baseGraph.nodes.find(n => n.id === id)?.name;

      // Map edges
      const driftEdges = [];
      const addedEdgeKeys = new Set(report.added_edges.map(e => {
        const src = targetGraph.nodes.find(n => n.id === e.source_id)?.name;
        const tgt = targetGraph.nodes.find(n => n.id === e.target_id)?.name;
        return `${src}->${tgt}`;
      }));

      // Map target commit edges (either added or unchanged)
      targetGraph.edges.forEach((edge, idx) => {
        const srcName = getTargetNodeName(edge.source_id);
        const tgtName = getTargetNodeName(edge.target_id);
        
        if (srcName && tgtName) {
          const key = `${srcName}->${tgtName}`;
          const isAdded = addedEdgeKeys.has(key);
          
          driftEdges.push({
            id: `target-edge-${idx}`,
            commit_id: edge.commit_id,
            source_id: newIdMap.get(srcName),
            target_id: newIdMap.get(tgtName),
            dependency_type: edge.dependency_type,
            driftStatus: isAdded ? 'added' : 'unchanged'
          });
        }
      });

      // Map removed edges (present in base, but deleted in target)
      report.removed_edges.forEach((edge, idx) => {
        const srcName = getBaseNodeName(edge.source_id);
        const tgtName = getBaseNodeName(edge.target_id);

        if (srcName && tgtName) {
          const srcDriftId = newIdMap.get(srcName);
          const tgtDriftId = newIdMap.get(tgtName);

          if (srcDriftId && tgtDriftId) {
            driftEdges.push({
              id: `removed-edge-${idx}`,
              commit_id: edge.commit_id,
              source_id: srcDriftId,
              target_id: tgtDriftId,
              dependency_type: edge.dependency_type,
              driftStatus: 'removed'
            });
          }
        }
      });

      setCombinedNodes(driftNodes);
      setCombinedEdges(driftEdges);

    } catch (err) {
      setError(err.message || 'Failed to compare commits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (baseCommit && targetCommit) {
      triggerDriftAnalysis();
    }
  }, [baseCommit, targetCommit]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div className="drift-controls">
        <div className="drift-select-group">
          <GitMerge size={20} style={{ color: 'var(--accent-blue)' }} />
          <div>
            <label className="input-label" style={{ margin: 0, fontSize: '0.75rem' }}>Base Version</label>
            <select 
              value={baseCommit} 
              onChange={e => setBaseCommit(e.target.value)}
              className="drift-select"
            >
              {commits.map(c => (
                <option key={c.hash} value={c.hash}>
                  {c.hash.substring(0, 8)} - {c.message.split('\n')[0]}
                </option>
              ))}
            </select>
          </div>

          <span style={{ color: 'var(--text-muted)', fontSize: '1.25rem', marginTop: '1rem' }}>→</span>

          <div>
            <label className="input-label" style={{ margin: 0, fontSize: '0.75rem' }}>Compare Version</label>
            <select 
              value={targetCommit} 
              onChange={e => setTargetCommit(e.target.value)}
              className="drift-select"
            >
              {commits.map(c => (
                <option key={c.hash} value={c.hash}>
                  {c.hash.substring(0, 8)} - {c.message.split('\n')[0]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {driftReport && (
          <div className="drift-meta-stats">
            <div className="stat-badge stat-add">
              <PlusCircle size={14} />
              <span>+{driftReport.added_nodes.length} Components</span>
            </div>
            <div className="stat-badge stat-remove">
              <MinusCircle size={14} />
              <span>-{driftReport.removed_nodes.length} Components</span>
            </div>
            <div className="stat-badge stat-modify">
              <AlertCircle size={14} />
              <span>{driftReport.modified_nodes.length} Modified</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
        {loading ? (
          <div style={{ margin: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <RefreshCw size={24} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} />
            Analyzing Architecture Drift...
          </div>
        ) : error ? (
          <div style={{ margin: 'auto', color: 'var(--accent-red)' }}>{error}</div>
        ) : (
          <GraphView nodes={combinedNodes} edges={combinedEdges} isDrift={true} />
        )}
      </div>
    </div>
  );
}
