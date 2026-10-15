# RULES GIT


## COMMIT 
> Single Branch 'Main'

1. Commit Perubahan 
2. EXCEPT 

```git
node_modules/

dist/
/dist-server/
/bin/
server/bin/
build/

server/internal/web/dist/*
!server/internal/web/dist/index.html

.env
.env.*
!.env.example

.cache/
.vite/
*.tsbuildinfo
.tmp-*
*.tmp

logs/
*.log
*-debug.log*

.DS_Store
**/.DS_Store
Thumbs.db
ehthumbs.db

server/server
*.test
__debug_bin*
**/__debug_bin*

/.plugins/
/.opencode-skills/
.claude-replay.*
.codegraph/
.codegraph

# WAJIB
AGENTS.md
README.md
ROOT docs : .md LISENCE, NOTICE, ROADMAP, GLOSSARY, RELEASE_NOTE, SECURITY
/task
/test

```

## PUSH REMOTE

EXCEPT semua
GIT_RULES.md

/docs/internal
/task
/.sratch

Agents : github, gemini, claude, copilot, opencode, etc

## MANDATORY
> CONSTRAINT : PATH HARDCODE
> ALWAYS CHECK : syncs Remote file. apakah terpush sebelumnya? jika terpush hapus remote dulu, baru ikuti rules push