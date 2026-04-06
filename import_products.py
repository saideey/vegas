"""
Vegas do'koni uchun mahsulotlarni Excel fayldan import qilish skripti.

Ishlatish:
  1. Skriptni vegas/API/ papkasi ichida serverda ishga tushiring
     yoki docker exec orqali API konteynerida:

  docker exec -it vegas_api python /app/import_products.py \
      --file /app/import_data.xlsx \
      --warehouse-id 1 \
      --dry-run        # avval tekshirib ko'rish uchun

  2. Haqiqiy import:
  docker exec -it vegas_api python /app/import_products.py \
      --file /app/import_data.xlsx \
      --warehouse-id 1

  3. Excel faylni konteynerga nusxalash:
  docker cp Остатка_Вегас.xlsx vegas_api:/app/import_data.xlsx
"""

import sys
import os
import argparse
import logging
from decimal import Decimal

# Django-style sys.path setup (API papkasidan ishga tushiriladi)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)

try:
    from openpyxl import load_workbook
except ImportError:
    log.error("openpyxl o'rnatilmagan: pip install openpyxl")
    sys.exit(1)


# ─────────────────────────────────────────────
# Excel ustunlari (0-indexed)
# ─────────────────────────────────────────────
COL_NUM        = 0   # №
COL_NAME