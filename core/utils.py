import logging
import shutil
import decimal
from pathlib import Path
from config import PORTFOLIOS_DIR

logger = logging.getLogger(__name__)

def tax_round(value, places=2) -> float:
    """Round value for tax purposes using ROUND_HALF_UP logic."""
    if value is None:
        return 0.0
    try:
        # Convert to string first to avoid floating point precision issues during Decimal initialization
        val_str = str(value)
        # Use decimal to do proper ROUND_HALF_UP
        quantizer = decimal.Decimal(10) ** -places
        rounded = decimal.Decimal(val_str).quantize(quantizer, rounding=decimal.ROUND_HALF_UP)
        return float(rounded)
    except (decimal.InvalidOperation, ValueError, TypeError):
        return float(value) if value else 0.0

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
