from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict

# Base schemas
class RepositoryBase(BaseModel):
    name: str
    path_or_url: str

class RepositoryCreate(RepositoryBase):
    pass

class RepositoryOut(RepositoryBase):
    id: int
    status: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class CommitOut(BaseModel):
    id: int
    repository_id: int
    hash: str
    author: Optional[str] = None
    message: Optional[str] = None
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)

class ComponentOut(BaseModel):
    id: int
    commit_id: int
    name: str
    type: str
    filepath: Optional[str] = None
    metadata_json: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class DependencyOut(BaseModel):
    id: int
    commit_id: int
    source_id: int
    target_id: int
    dependency_type: str

    model_config = ConfigDict(from_attributes=True)

class ArchitectureGraph(BaseModel):
    nodes: List[ComponentOut]
    edges: List[DependencyOut]

class DriftReport(BaseModel):
    added_nodes: List[ComponentOut]
    removed_nodes: List[ComponentOut]
    modified_nodes: List[ComponentOut]
    added_edges: List[DependencyOut]
    removed_edges: List[DependencyOut]
