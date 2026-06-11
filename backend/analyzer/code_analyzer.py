import os
import ast
import re
import json
from sqlalchemy.orm import Session
from backend.models import Commit, Component, Dependency

# Regular expressions for JS/TS
JS_IMPORT_RE = re.compile(
    r'(?:import\s+(?:[\w\s{},*]+from\s+)?[\'"]([^\'"]+)[\'"])|'
    r'(?:require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\))'
)
JS_API_CALL_RE = re.compile(
    r'(?:fetch|axios(?:\.get|\.post|\.put|\.delete|\.patch)?)\s*\(\s*[\'"`]([^\'"`\s\?]+)'
)

class PythonFileAnalyzer(ast.NodeVisitor):
    def __init__(self, filepath: str, repo_root: str):
        self.filepath = filepath
        self.repo_root = repo_root
        self.imports = []
        self.api_endpoints = []
        self.db_access = False
        
        # Determine Python module name (e.g., backend.main)
        rel_path = os.path.relpath(filepath, repo_root)
        self.module_name = rel_path.replace(os.path.sep, ".").replace(".py", "")

    def visit_Import(self, node):
        for alias in node.names:
            self.imports.append(alias.name)
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module:
            module_name = node.module
            if node.level > 0:
                # Resolve relative import level
                parts = self.module_name.split('.')
                base = parts[:-node.level] if len(parts) >= node.level else []
                module_name = ".".join(base + [node.module])
            self.imports.append(module_name)
        self.generic_visit(node)

    def visit_Call(self, node):
        # Check for DB calls
        if isinstance(node.func, ast.Attribute):
            if node.func.attr in ['query', 'execute', 'commit', 'rollback', 'connect']:
                self.db_access = True
        elif isinstance(node.func, ast.Name):
            if node.func.id in ['execute', 'connect']:
                self.db_access = True
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        # Scan decorators for FastAPI / Flask routes
        for decorator in node.decorator_list:
            route_info = self._parse_decorator(decorator)
            if route_info:
                self.api_endpoints.append(route_info)
        self.generic_visit(node)

    def _parse_decorator(self, decorator):
        if isinstance(decorator, ast.Call):
            func = decorator.func
            if isinstance(func, ast.Attribute):
                if func.attr in ['get', 'post', 'put', 'delete', 'patch', 'route']:
                    method = func.attr.upper()
                    if method == 'ROUTE':
                        method = 'GET'
                    
                    path = "/"
                    if decorator.args:
                        arg0 = decorator.args[0]
                        if isinstance(arg0, ast.Constant):
                            path = arg0.value
                        elif isinstance(arg0, ast.Str): # support older python
                            path = arg0.s
                    return {"method": method, "path": path}
        return None

class RepositoryAnalyzer:
    def __init__(self, repo_path: str):
        self.repo_path = os.path.abspath(repo_path)
        self.components = {} # path/name -> Component record details
        self.dependencies = [] # list of (source, target, type)

    def scan_codebase(self):
        # Walk directories, ignoring standard build/vcs folders
        ignore_dirs = {'.git', 'node_modules', 'venv', 'env', '__pycache__', 'dist', 'build', '.vite'}
        
        for root, dirs, files in os.walk(self.repo_path):
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for file in files:
                filepath = os.path.join(root, file)
                rel_path = os.path.relpath(filepath, self.repo_path).replace(os.path.sep, '/')
                
                # Analyze Python files
                if file.endswith('.py'):
                    self._analyze_python_file(filepath, rel_path)
                # Analyze JS/TS files
                elif file.endswith(('.js', '.jsx', '.ts', '.tsx')):
                    self._analyze_js_file(filepath, rel_path)

        # After scanning, match JS API calls to Python endpoints and resolve local file dependencies
        self._resolve_dependencies()

    def _analyze_python_file(self, filepath: str, rel_path: str):
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            tree = ast.parse(content)
            analyzer = PythonFileAnalyzer(filepath, self.repo_path)
            analyzer.visit(tree)
            
            # Record module component
            self.components[rel_path] = {
                "name": rel_path,
                "type": "module",
                "filepath": rel_path,
                "metadata": {
                    "language": "python",
                    "imports": analyzer.imports,
                    "db_access": analyzer.db_access,
                    "lines_of_code": len(content.splitlines())
                }
            }
            
            # Record database access if present
            if analyzer.db_access:
                db_name = "Database (SQL)"
                if db_name not in self.components:
                    self.components[db_name] = {
                        "name": db_name,
                        "type": "database",
                        "filepath": None,
                        "metadata": {"type": "relational"}
                    }
                self.dependencies.append((rel_path, db_name, "db_access"))

            # Record API endpoints
            for endpoint in analyzer.api_endpoints:
                endpoint_name = f"{endpoint['method']} {endpoint['path']}"
                self.components[endpoint_name] = {
                    "name": endpoint_name,
                    "type": "api_endpoint",
                    "filepath": rel_path,
                    "metadata": {
                        "method": endpoint['method'],
                        "path": endpoint['path']
                    }
                }
                # Connect module to the API endpoint it implements
                self.dependencies.append((rel_path, endpoint_name, "implements"))
                
        except Exception as e:
            print(f"Failed to analyze python file {rel_path}: {e}")

    def _analyze_js_file(self, filepath: str, rel_path: str):
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()

            lines = content.splitlines()
            imports = []
            api_calls = []

            for line in lines:
                # Scan for imports
                for m in JS_IMPORT_RE.finditer(line):
                    imp = m.group(1) or m.group(2)
                    if imp:
                        imports.append(imp)
                
                # Scan for fetch/axios calls
                for m in JS_API_CALL_RE.finditer(line):
                    api_calls.append(m.group(1))

            self.components[rel_path] = {
                "name": rel_path,
                "type": "module",
                "filepath": rel_path,
                "metadata": {
                    "language": "javascript",
                    "imports": imports,
                    "api_calls": api_calls,
                    "lines_of_code": len(lines)
                }
            }

        except Exception as e:
            print(f"Failed to analyze JS/TS file {rel_path}: {e}")

    def _resolve_dependencies(self):
        # Resolve imports for Python
        for comp_name, comp in list(self.components.items()):
            if comp["type"] != "module" or comp["metadata"].get("language") != "python":
                continue
            
            for imp in comp["metadata"].get("imports", []):
                # Try to map Python module path to file
                resolved_rel_path = self._resolve_python_import(imp)
                if resolved_rel_path and resolved_rel_path in self.components:
                    self.dependencies.append((comp_name, resolved_rel_path, "import"))

        # Resolve imports for JS/TS and match JS API calls to API endpoints
        for comp_name, comp in list(self.components.items()):
            if comp["type"] != "module" or comp["metadata"].get("language") != "javascript":
                continue
            
            # Resolve file imports
            for imp in comp["metadata"].get("imports", []):
                resolved_rel_path = self._resolve_js_import(comp_name, imp)
                if resolved_rel_path and resolved_rel_path in self.components:
                    self.dependencies.append((comp_name, resolved_rel_path, "import"))

            # Connect JS API calls to Python endpoints
            for api_call in comp["metadata"].get("api_calls", []):
                # Clean API path: remove prefix variables or local server URLs if needed
                clean_path = api_call.replace('${API_URL}', '').replace('http://localhost:8000', '')
                if not clean_path.startswith('/'):
                    clean_path = '/' + clean_path
                
                # Match against registered api_endpoints
                matched = False
                for other_name, other_comp in self.components.items():
                    if other_comp["type"] == "api_endpoint":
                        # Check if API endpoint path matches
                        endpoint_path = other_comp["metadata"].get("path", "")
                        # Simple match: if the endpoint path is in the JS call, or vice versa
                        if endpoint_path and (endpoint_path == clean_path or clean_path.startswith(endpoint_path)):
                            self.dependencies.append((comp_name, other_name, "api_call"))
                            matched = True
                            break
                
                if not matched:
                    # Create placeholder/external API endpoint if not matched
                    ext_endpoint = f"EXTERNAL {clean_path}"
                    if ext_endpoint not in self.components:
                        self.components[ext_endpoint] = {
                            "name": ext_endpoint,
                            "type": "api_endpoint",
                            "filepath": None,
                            "metadata": {"external": True, "path": clean_path}
                        }
                    self.dependencies.append((comp_name, ext_endpoint, "api_call"))

    def _resolve_python_import(self, import_name: str) -> str:
        # e.g., "backend.database"
        parts = import_name.split('.')
        # Try finding a file backend/database.py
        path_attempt = "/".join(parts) + ".py"
        if os.path.exists(os.path.join(self.repo_path, path_attempt)):
            return path_attempt
        # Try backend/database/__init__.py
        path_attempt_init = "/".join(parts) + "/__init__.py"
        if os.path.exists(os.path.join(self.repo_path, path_attempt_init)):
            return path_attempt_init
        return None

    def _resolve_js_import(self, source_file: str, import_path: str) -> str:
        # e.g., source_file = "frontend/src/App.jsx", import_path = "./components/Header"
        if not import_path.startswith('.'):
            return None # Skip external npm modules for file mapping
        
        source_dir = os.path.dirname(source_file)
        joined = os.path.normpath(os.path.join(source_dir, import_path)).replace(os.path.sep, '/')
        
        # Extensions to try
        for ext in ['.js', '.jsx', '.ts', '.tsx']:
            if os.path.exists(os.path.join(self.repo_path, joined + ext)):
                return joined + ext
            # Index paths
            if os.path.exists(os.path.join(self.repo_path, joined + '/index' + ext)):
                return joined + '/index' + ext
        return None

def save_analysis_results(db: Session, commit_id: int, analyzer: RepositoryAnalyzer):
    # Map from analyzer name key to Database Component ID
    db_components = {}
    
    # Write components
    for comp_key, comp_val in analyzer.components.items():
        db_comp = Component(
            commit_id=commit_id,
            name=comp_val["name"],
            type=comp_val["type"],
            filepath=comp_val["filepath"],
            metadata_json=json.dumps(comp_val["metadata"])
        )
        db.add(db_comp)
        db.flush() # Populate ID
        db_components[comp_key] = db_comp.id

    # Write dependencies
    for source, target, dep_type in analyzer.dependencies:
        # Make sure both source and target were saved
        if source in db_components and target in db_components:
            db_dep = Dependency(
                commit_id=commit_id,
                source_id=db_components[source],
                target_id=db_components[target],
                dependency_type=dep_type
            )
            db.add(db_dep)
            
    db.commit()
