# Roadmap FRONT END ONLY (Historical Draft)

> **Archive Notice**: This document contains the initial scratchpad design notes for AegisCode phases 1–5. It is preserved strictly as a historical artifact. For the actual active roadmap, see [`roadmap.md`](./roadmap.md).

# AEGISCODE 

> Objective : IDE lightwight, Local Server

- Arsitektur Microservice
- DONT Over Engiinering

## Constrain Frontend
1. Reuse token color tailwind
2. Reuse Component design 

## Constrain backend
1. DO NOT Try catch Silent, If error Is Break the function
2. DO NOT Add Spaggeti try catch, 1 function is true 
3. DO NOT Add const, if necessary. check any possible 

### Phase 1

Layout kolom 
    1. sidebarleft
        1. Explorer
        2. Source Control Git
        3. Search/replace
        4. settings
    2. text editor
        1. workbench text
        2. bottom bar: terminal SSE - problem 
    3. appdrawer
        1. AEGIS chat
    4. statusbar
        1. info line, programming languange, syntax lints
        2. status source control git
    5. header bar
        1. Branding AEGIS, search bar, dan icon layout

### Phase 2 Text editor

    1. Lints syntaxMemiliki lints syntax programming languange https://github.com/collections/clean-code-linters: minimal python, javacript, C++, json, dan typescript 
    2. Memiliki search - replace berbasis regex untuk repository
    3. Memiliki fitur multi window, atau split text editor
    4. functional terminal SSEmemiliki terminal yang menjalankan runner native zsh atau bash, memiliki source cut keyboard copy, paste, terminate 
    5. functional problem lintsMenampilan error syntax sesuai programming languange 

### Phase 3 Sidebar : Explorer

1. Layout Vscode
    1. Memiliki fitur CRUD folder atau file
    2. Memiliki fitur klik kanan untuk full path, relative path, copy, paste
    3. Memiliki fitur untuk membaca hidden file atau folder by default 
2. Source Control Git
    1. Memiliki fitur control git lengkap: pull, push, commit
    2. memiliki grafik branch
    3. memiliki repositories aktif controller
    4. memiliki subtab: changes, staged changes
3. Search and replace
    1. Memiliki fitur searching berbasis regex untuk repositori / folder root yang aktif
    2. memiliki fitur replace label, untuk setiap file atau satuan file
4. Settings 
    1. Modal overlay
    2. Minimalist like Vscode
    3. search bar regex 

### Phase 4 Status bar
1. Memiliki info line error - problem syntax
2. git branch aktif
3. Notifications

### phase 5 appdrawer
1. Agents chatbot
2. selain untuk bertanya atau asking, nanti akan ada mekanisme editting file sesuai sesuai dengan root folder yang aktif
3. memikiki fitur agentic olympus