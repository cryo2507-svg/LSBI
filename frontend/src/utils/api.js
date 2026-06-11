const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export async function fetchRepositories() {
    const res = await fetch(`${API_BASE}/repositories`);
    if (!res.ok) throw new Error('Failed to fetch repositories');
    return res.json();
}

export async function createRepository(name, pathOrUrl) {
    const res = await fetch(`${API_BASE}/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path_or_url: pathOrUrl })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create repository');
    }
    return res.json();
}

export async function deleteRepository(id) {
    const res = await fetch(`${API_BASE}/repositories/${id}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete repository');
    return res.json();
}

export async function fetchCommits(repoId) {
    const res = await fetch(`${API_BASE}/repositories/${repoId}/commits`);
    if (!res.ok) throw new Error('Failed to fetch commits');
    return res.json();
}

export async function fetchGraph(repoId, commitHash) {
    const res = await fetch(`${API_BASE}/repositories/${repoId}/commits/${commitHash}/graph`);
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to fetch architecture graph');
    }
    return res.json();
}

export async function fetchDrift(repoId, baseCommit, targetCommit) {
    const res = await fetch(`${API_BASE}/repositories/${repoId}/drift?base_commit=${baseCommit}&target_commit=${targetCommit}`);
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to fetch drift report');
    }
    return res.json();
}
