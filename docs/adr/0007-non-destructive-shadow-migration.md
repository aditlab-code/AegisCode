# 0007. Non-Destructive Shadow Migration of Legacy Configurations

We decided that when the v2 Core Server detects legacy v1 artifacts (`data/settings.json`, `.aegis/auth.json`, or legacy databases), it performs a non-destructive read-only shadow import into `~/.aegis/config.json`. The legacy source files are never deleted or modified in-place, ensuring 100% data safety, zero project workspace pollution, and seamless rollbacks.
