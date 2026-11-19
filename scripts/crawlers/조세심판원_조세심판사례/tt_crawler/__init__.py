# -*- coding: utf-8 -*-
"""Tax Tribunal decision-case collector.

Source site : https://tt.go.kr  (path prefix /mUser/...)
Scope       : Customs tax category (semok=90) decision cases only
Output      : New tables (tb_tt_*) inside the existing SQLite DB
              D:\\SQLiteDB\\smart_law_ai.db
"""

__version__ = "1.2"
SCHEMA_VERSION = "1.0"