import logging
import shutil
from pathlib import Path
from config import PORTFOLIOS_DIR

logger = logging.getLogger(__name__)

def init_user_storage():
    """Migrate any loose portfolio files to a Default user directory."""
    default_dir = PORTFOLIOS_DIR / "Default"
    
    # Check for legacy files in root of PORTFOLIOS_DIR
    legacy_files = list(PORTFOLIOS_DIR.glob("portfolio_CY*.json"))
    if legacy_files:
        default_dir.mkdir(exist_ok=True)
        for f in legacy_files:
            try:
                shutil.move(str(f), str(default_dir / f.name))
                logger.info(f"Migrated legacy portfolio {f.name} to Default user")
            except Exception as e:
                logger.error(f"Failed to migrate {f.name}: {e}")

def get_user_dir(username):
    """Get or create directory for user."""
    if not username:
        username = "Default"
    # Basic sanitization
    safe_name = "".join(c for c in username if c.isalnum() or c in (' ', '-', '_')).strip()
    if not safe_name:
        safe_name = "Default"
    user_dir = PORTFOLIOS_DIR / safe_name
    user_dir.mkdir(exist_ok=True)
    return user_dir, safe_name
