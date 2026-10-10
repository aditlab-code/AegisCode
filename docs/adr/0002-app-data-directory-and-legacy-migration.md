# 0002. App Data Directory and Legacy Configuration Migration

We decided to isolate all system state, embedded SQLite database (`aegis.db`), and chat session histories inside the OS user profile (`~/.aegis/data/`), completely outside active project repositories. Additionally, a startup Legacy Migration Adapter will safely detect and import existing v1 configurations (`data/settings.json`, `.aegis/auth.json`, and legacy `aegis.db` tables) into the v2 structure without altering user workspace folders.
