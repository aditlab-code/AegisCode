# 0007. Non-Destructive Shadow Migration of Legacy Configurations

We decided that when the v2 Core Server detects legacy v1 artifacts (`../AegisCode/data/settings.json`, `.aegis/auth.json`, or `aegis.db`), it performs a non-destructive read-only import into `~/.aegis/data/aegis.db`. The legacy files are never deleted or modified in-place, ensuring 100% data safety and painless rollbacks.
