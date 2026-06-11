from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from backend.database import Base

class Repository(Base):
    __tablename__ = "repositories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    path_or_url = Column(String, nullable=False)
    status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

    commits = relationship("Commit", back_populates="repository", cascade="all, delete-orphan")

class Commit(Base):
    __tablename__ = "commits"

    id = Column(Integer, primary_key=True, index=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    hash = Column(String, nullable=False)
    author = Column(String, nullable=True)
    message = Column(Text, nullable=True)
    timestamp = Column(DateTime, nullable=False)

    repository = relationship("Repository", back_populates="commits")
    components = relationship("Component", back_populates="commit", cascade="all, delete-orphan")
    dependencies = relationship("Dependency", back_populates="commit", cascade="all, delete-orphan", foreign_keys="[Dependency.commit_id]")

class Component(Base):
    __tablename__ = "components"

    id = Column(Integer, primary_key=True, index=True)
    commit_id = Column(Integer, ForeignKey("commits.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False) # e.g. "backend/main.py", "GET /api/users", "postgres_db"
    type = Column(String, nullable=False) # e.g. "module", "api_endpoint", "database", "external_service"
    filepath = Column(String, nullable=True)
    metadata_json = Column(Text, nullable=True) # JSON string with dynamic properties (imports, lines of code, methods)

    commit = relationship("Commit", back_populates="components")
    
    # Relationships to dependencies
    outgoing_dependencies = relationship(
        "Dependency",
        foreign_keys="[Dependency.source_id]",
        back_populates="source_component",
        cascade="all, delete-orphan"
    )
    incoming_dependencies = relationship(
        "Dependency",
        foreign_keys="[Dependency.target_id]",
        back_populates="target_component",
        cascade="all, delete-orphan"
    )

class Dependency(Base):
    __tablename__ = "dependencies"

    id = Column(Integer, primary_key=True, index=True)
    commit_id = Column(Integer, ForeignKey("commits.id", ondelete="CASCADE"), nullable=False)
    source_id = Column(Integer, ForeignKey("components.id", ondelete="CASCADE"), nullable=False)
    target_id = Column(Integer, ForeignKey("components.id", ondelete="CASCADE"), nullable=False)
    dependency_type = Column(String, default="import") # e.g., "import", "api_call", "db_access"

    commit = relationship("Commit", back_populates="dependencies", foreign_keys=[commit_id])
    source_component = relationship("Component", foreign_keys=[source_id], back_populates="outgoing_dependencies")
    target_component = relationship("Component", foreign_keys=[target_id], back_populates="incoming_dependencies")
