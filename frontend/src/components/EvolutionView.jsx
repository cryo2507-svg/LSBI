import React, { useState, useEffect } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Calendar, User } from 'lucide-react';

export default function EvolutionView({ commits, activeCommit, onCommitChange }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const activeIndex = commits.findIndex(c => c.hash === activeCommit?.hash);

  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        if (activeIndex < commits.length - 1) {
          onCommitChange(commits[activeIndex + 1]);
        } else {
          setIsPlaying(false); // Stop at the end
        }
      }, 2500); // Transition every 2.5 seconds
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isPlaying, activeIndex, commits, onCommitChange]);

  if (commits.length === 0 || !activeCommit) {
    return null;
  }

  const handlePrev = () => {
    if (activeIndex > 0) {
      onCommitChange(commits[activeIndex - 1]);
    }
  };

  const handleNext = () => {
    if (activeIndex < commits.length - 1) {
      onCommitChange(commits[activeIndex + 1]);
    }
  };

  const formatDate = (dateStr) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="timeline-panel">
      <button 
        className="timeline-play-btn" 
        onClick={() => setIsPlaying(!isPlaying)}
        title={isPlaying ? 'Pause Simulation' : 'Play Simulation'}
      >
        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: '2px' }} />}
      </button>

      <div style={{ display: 'flex', gap: '0.25rem' }}>
        <button 
          className="hud-btn" 
          onClick={handlePrev} 
          disabled={activeIndex === 0}
          title="Previous Commit"
        >
          <ChevronLeft size={20} />
        </button>
        <button 
          className="hud-btn" 
          onClick={handleNext} 
          disabled={activeIndex === commits.length - 1}
          title="Next Commit"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="timeline-slider-container">
        <input 
          type="range" 
          min="0" 
          max={commits.length - 1} 
          value={activeIndex} 
          onChange={(e) => {
            setIsPlaying(false);
            onCommitChange(commits[parseInt(e.target.value)]);
          }}
          className="timeline-slider"
        />
      </div>

      <div className="timeline-info">
        <div className="timeline-commit-hash">
          Commit: {activeCommit.hash.substring(0, 8)}
        </div>
        <div className="timeline-commit-msg" title={activeCommit.message}>
          {activeCommit.message ? activeCommit.message.split('\n')[0] : 'No commit message'}
        </div>
        <div className="timeline-commit-meta" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <User size={10} />
            {activeCommit.author ? activeCommit.author.split(' ')[0] : 'Unknown'}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
            <Calendar size={10} />
            {formatDate(activeCommit.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}
