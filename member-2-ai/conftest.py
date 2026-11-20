import sys
from pathlib import Path

# Add member-2-ai to sys.path so 'import ml' resolves cleanly in any test runner
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
