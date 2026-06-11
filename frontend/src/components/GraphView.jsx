import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ZoomIn, ZoomOut, Maximize2, X, Terminal, FileCode, Database, Server } from 'lucide-react';

export default function GraphView({ nodes, edges, isDrift = false }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    if (!nodes || nodes.length === 0 || !svgRef.current || !containerRef.current) return;

    // Clear SVG
    d3.select(svgRef.current).selectAll('*').remove();

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Filter nodes if type is specified (only in non-drift mode, or generic filter)
    let filteredNodes = [...nodes];
    if (filterType !== 'all') {
      filteredNodes = nodes.filter(n => n.type === filterType);
    }
    const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
    
    // Filter edges to match remaining nodes
    const filteredEdges = edges.filter(e => 
      filteredNodeIds.has(e.source_id) && filteredNodeIds.has(e.target_id)
    );

    // Deep copy nodes and edges for D3 simulation
    const d3Nodes = filteredNodes.map(n => ({ ...n }));
    const d3Links = filteredEdges.map(e => ({
      ...e,
      source: e.source_id,
      target: e.target_id
    }));

    const svg = d3.select(svgRef.current)
      .attr('viewBox', [0, 0, containerWidth, containerHeight])
      .attr('width', '100%')
      .attr('height', '100%');

    // Create shadow filter for glow effect
    const defs = svg.append('defs');
    
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
      
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '6')
      .attr('result', 'coloredBlur');
      
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Add marker arrows for links
    const createMarker = (id, color) => {
      defs.append('svg:marker')
        .attr('id', id)
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 22) // Position marker relative to node radius
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('svg:path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', color);
    };

    createMarker('arrow-default', 'rgba(255,255,255,0.2)');
    createMarker('arrow-added', '#10b981');
    createMarker('arrow-removed', '#ef4444');

    // Create SVG Group to support zoom & pan
    const mainGroup = svg.append('g').attr('class', 'main-group');

    // Setup zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.15, 4])
      .on('zoom', (event) => {
        mainGroup.attr('transform', event.transform);
      });

    svg.call(zoom);

    // D3 Force Simulation
    const simulation = d3.forceSimulation(d3Nodes)
      .force('link', d3.forceLink(d3Links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(containerWidth / 2, containerHeight / 2))
      .force('collide', d3.forceCollide().radius(40));

    // Draw lines (links)
    const link = mainGroup.append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(d3Links)
      .join('path')
      .attr('class', 'd3-link')
      .attr('stroke', d => {
        if (isDrift) {
          if (d.driftStatus === 'added') return '#10b981';
          if (d.driftStatus === 'removed') return '#ef4444';
          return 'rgba(255,255,255,0.15)';
        }
        if (d.dependency_type === 'api_call') return '#10b981';
        if (d.dependency_type === 'db_access') return '#f59e0b';
        return 'rgba(255,255,255,0.2)';
      })
      .attr('stroke-dasharray', d => d.dependency_type === 'api_call' || d.driftStatus === 'removed' ? '4,4' : 'none')
      .attr('marker-end', d => {
        if (isDrift) {
          if (d.driftStatus === 'added') return 'url(#arrow-added)';
          if (d.driftStatus === 'removed') return 'url(#arrow-removed)';
        }
        return 'url(#arrow-default)';
      });

    // Draw nodes
    const node = mainGroup.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(d3Nodes)
      .join('g')
      .attr('class', 'd3-node')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      )
      .on('click', (event, d) => {
        // Prevent click when dragging
        if (event.defaultPrevented) return;
        setSelectedNode(d);
      });

    // Node outer circle (border / glow)
    node.append('circle')
      .attr('r', 16)
      .attr('fill', d => {
        if (isDrift) {
          if (d.driftStatus === 'added') return '#10b981';
          if (d.driftStatus === 'removed') return '#ef4444';
          if (d.driftStatus === 'modified') return '#f59e0b';
          return '#374151'; // Unchanged
        }
        // Normal Node colors
        if (d.type === 'module') return '#3b82f6';
        if (d.type === 'api_endpoint') return '#10b981';
        if (d.type === 'database') return '#f59e0b';
        return '#ec4899'; // External / Utility
      })
      .style('filter', d => {
        // Apply glow to important components
        if (isDrift && d.driftStatus !== 'unchanged') return 'url(#glow)';
        if (!isDrift && (d.type === 'api_endpoint' || d.type === 'database')) return 'url(#glow)';
        return 'none';
      })
      .attr('stroke', '#ffffff')
      .attr('stroke-width', d => isDrift && d.driftStatus === 'removed' ? '1.5' : '1')
      .attr('stroke-dasharray', d => isDrift && d.driftStatus === 'removed' ? '3,3' : 'none');

    // Inner icon symbol or text representation
    node.append('circle')
      .attr('r', 10)
      .attr('fill', '#0a0c10')
      .attr('opacity', 0.85);

    // Label texts
    node.append('text')
      .text(d => {
        // Show basename for modules to avoid long paths overloading the UI
        if (d.type === 'module' && d.name.includes('/')) {
          return d.name.split('/').pop();
        }
        return d.name;
      })
      .attr('x', 0)
      .attr('y', 26)
      .attr('text-anchor', 'middle')
      .attr('fill', 'var(--text-primary)')
      .style('font-size', '10px')
      .style('font-weight', '500')
      .style('pointer-events', 'none')
      .style('text-shadow', '0 2px 4px rgba(0,0,0,0.8)');

    // Link hover highlight interactions
    node.on('mouseover', function(event, d) {
      link.classed('highlighted', l => l.source.id === d.id || l.target.id === d.id);
      node.style('opacity', n => (n.id === d.id || d3Links.some(l => (l.source.id === d.id && l.target.id === n.id) || (l.target.id === d.id && l.source.id === n.id))) ? 1.0 : 0.25);
      link.style('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1.0 : 0.05);
    }).on('mouseout', function() {
      link.classed('highlighted', false);
      node.style('opacity', 1);
      link.style('opacity', 1);
    });

    // Update positions on tick
    simulation.on('tick', () => {
      link.attr('d', d => {
        // Direct link lines
        return `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`;
      });

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // D3 Drag handlers
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Save functions for zoom controls
    svgRef.current.zoomIn = () => svg.transition().duration(200).call(zoom.scaleBy, 1.3);
    svgRef.current.zoomOut = () => svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.3);
    svgRef.current.resetZoom = () => {
      svg.transition().duration(300).call(
        zoom.transform,
        d3.zoomIdentity.translate(0, 0).scale(1)
      );
    };

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, filterType]);

  const getMetadata = (node) => {
    if (!node.metadata_json) return {};
    try {
      return JSON.parse(node.metadata_json);
    } catch {
      return {};
    }
  };

  const nodeMeta = selectedNode ? getMetadata(selectedNode) : {};

  return (
    <div ref={containerRef} className="canvas-area">
      {/* Legend overlay */}
      <div className="legend">
        <h4 style={{ fontSize: '0.8rem', marginBottom: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.2rem' }}>
          {isDrift ? 'Drift Status' : 'Component Types'}
        </h4>
        {isDrift ? (
          <>
            <div className="legend-item"><div className="legend-color" style={{ background: '#10b981' }}></div>Added</div>
            <div className="legend-item"><div className="legend-color" style={{ background: '#ef4444' }}></div>Removed</div>
            <div className="legend-item"><div className="legend-color" style={{ background: '#f59e0b' }}></div>Modified</div>
            <div className="legend-item"><div className="legend-color" style={{ background: '#374151' }}></div>Unchanged</div>
          </>
        ) : (
          <>
            <div className="legend-item"><div className="legend-color" style={{ background: '#3b82f6' }}></div>Code Module</div>
            <div className="legend-item"><div className="legend-color" style={{ background: '#10b981' }}></div>API Route</div>
            <div className="legend-item"><div className="legend-color" style={{ background: '#f59e0b' }}></div>Database</div>
            <div className="legend-item"><div className="legend-color" style={{ background: '#ec4899' }}></div>External Service</div>
          </>
        )}

        {!isDrift && (
          <div style={{ marginTop: '0.5rem' }}>
            <select 
              value={filterType} 
              onChange={e => setFilterType(e.target.value)}
              className="drift-select"
              style={{ fontSize: '0.7rem', width: '100%' }}
            >
              <option value="all">Filter: All</option>
              <option value="module">Modules Only</option>
              <option value="api_endpoint">API Routes Only</option>
              <option value="database">Databases Only</option>
            </select>
          </div>
        )}
      </div>

      {/* D3 Canvas */}
      <svg ref={svgRef} className="d3-svg" />

      {/* Detail Overlay Panel */}
      {selectedNode && (
        <div className="detail-panel">
          <div className="detail-header">
            <div>
              <h3 className="detail-title">{selectedNode.name}</h3>
              <span 
                className="detail-type-badge" 
                style={{ 
                  background: selectedNode.type === 'module' ? 'rgba(59, 130, 246, 0.15)' : selectedNode.type === 'api_endpoint' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: selectedNode.type === 'module' ? 'var(--accent-blue)' : selectedNode.type === 'api_endpoint' ? 'var(--accent-green)' : 'var(--accent-amber)'
                }}
              >
                {selectedNode.type}
              </span>
            </div>
            <button className="detail-close" onClick={() => setSelectedNode(null)}>
              <X size={18} />
            </button>
          </div>

          <div className="detail-body">
            {selectedNode.filepath && (
              <>
                <div className="detail-label">File Path</div>
                <div className="detail-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  {selectedNode.filepath}
                </div>
              </>
            )}

            {isDrift && selectedNode.driftStatus && (
              <>
                <div className="detail-label">Architectural Drift State</div>
                <div className="detail-value" style={{ 
                  color: selectedNode.driftStatus === 'added' ? 'var(--accent-green)' : selectedNode.driftStatus === 'removed' ? 'var(--accent-red)' : 'var(--accent-amber)',
                  fontWeight: 'bold',
                  textTransform: 'uppercase'
                }}>
                  {selectedNode.driftStatus}
                </div>
              </>
            )}

            {nodeMeta.lines_of_code && (
              <>
                <div className="detail-label">Lines of Code</div>
                <div className="detail-value">{nodeMeta.lines_of_code}</div>
              </>
            )}

            {nodeMeta.language && (
              <>
                <div className="detail-label">Language</div>
                <div className="detail-value">{nodeMeta.language}</div>
              </>
            )}

            {nodeMeta.db_access !== undefined && (
              <>
                <div className="detail-label">Database Interactions</div>
                <div className="detail-value">{nodeMeta.db_access ? 'Yes (Queries Executed)' : 'No direct queries'}</div>
              </>
            )}

            {nodeMeta.imports && nodeMeta.imports.length > 0 && (
              <>
                <div className="detail-label">Import Dependencies ({nodeMeta.imports.length})</div>
                <div className="detail-value" style={{ maxHeight: '100px', overflowY: 'auto' }}>
                  <ul style={{ paddingLeft: '1.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {nodeMeta.imports.map((imp, idx) => (
                      <li key={idx} style={{ wordBreak: 'break-all' }}>{imp}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {selectedNode.type === 'api_endpoint' && selectedNode.metadata_json && (
              <>
                <div className="detail-label">API Endpoints Configuration</div>
                <pre className="detail-code">
                  {JSON.stringify(nodeMeta, null, 2)}
                </pre>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating HUD controls */}
      <div className="hud-controls">
        <button className="hud-btn" title="Zoom In" onClick={() => svgRef.current?.zoomIn()}>
          <ZoomIn size={18} />
        </button>
        <button className="hud-btn" title="Zoom Out" onClick={() => svgRef.current?.zoomOut()}>
          <ZoomOut size={18} />
        </button>
        <button className="hud-btn" title="Fit Canvas" onClick={() => svgRef.current?.resetZoom()}>
          <Maximize2 size={18} />
        </button>
      </div>
    </div>
  );
}
