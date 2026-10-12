# AegisCode Domain

A lightweight, local-first modern IDE combining a responsive UI shell, a local core orchestrator, and isolated out-of-process workers.

## Language

### Core Components

**Core Server**:
The central local backend orchestrator written in Go that manages workspace state, coordinates workers, and serves the UI shell.
_Avoid_: Backend microservice, API gateway, monolith

**Process Supervisor**:
The sub-module within the Core Server that monitors worker processes with a fail-fast policy, isolating crashes and triggering clean restarts without freezing the IDE.
_Avoid_: Init system, daemon manager

**UI Shell**:
The client presentation layer rendered in the browser or desktop window that visualizes the IDE workbench.
_Avoid_: Frontend monolith, web app

**Worker Process**:
An independent operating system subprocess spawned by the Core Server to execute volatile or resource-heavy workloads.
_Avoid_: Microservice, container, cloud function

**Agent Runtime**:
The isolated out-of-process engine that manages AI interaction, context collection, prompt streaming, and autonomous tool execution.
_Avoid_: Chatbot backend, external AI service

### Storage & Environment

**Workspace**:
The active directory on the user's host filesystem containing their project code and configuration.
_Avoid_: Project folder, code repository

**App Data Directory**:
The persistent storage directory located in the user's operating system profile (`~/.aegis/`), outside the active workspace, used for system metadata and embedded database storage.
_Avoid_: Development folder, workspace database

**Metadata Store**:
The single embedded SQLite database located in the App Data Directory used to persist user preferences, chat history, and cache.
_Avoid_: Service database, distributed database

**Legacy Migration Adapter**:
An automated startup routine that detects, reads, and migrates v1 configuration files (e.g. `settings.json`, `auth.json`, historical sessions) into the v2 Metadata Store.
_Avoid_: Manual import script, database patcher

### Communication & Security

**Event Stream**:
A unidirectional, real-time push connection using Server-Sent Events (SSE) or Unix sockets to deliver asynchronous updates to the UI Shell.
_Avoid_: WebSocket mesh, message queue

**Ephemeral Session Token**:
A short-lived secret generated in memory at Core Server launch to authenticate local IPC and loopback communication.
_Avoid_: JWT, API key, auth certificate

**Unix Domain Socket (UDS)**:
A local inter-process communication socket file created at `~/.aegis/run/agent.sock` with user-restricted file permissions (`0600`) used for fast and secure data exchange between the Core Server and Agent Runtime.
_Avoid_: Network TCP socket, loopback port

**Typed Contract**:
Auto-generated TypeScript interface declarations compiled directly from backend Go structs to guarantee end-to-end type safety without manual duplication.
_Avoid_: Manual type sync, untyped JSON payload

### Debugging & DAP

**DAP Proxy**:
The lightweight communication bridge inside the Core Server that translates AegisCode REST and SSE debug requests into Debug Adapter Protocol (DAP) JSON-RPC transactions and streams state updates to the UI Shell.
_Avoid_: Debugger daemon, heavy IDE backend, custom debug protocol

**Delve Runner**:
The supervised worker process running `dlv dap` that compiles, attaches to, or launches the user's Go binary under test in an isolated process group.
_Avoid_: Embedded compiler, debugger container, background daemon

**Breakpoint Registry**:
The synchronized in-memory table of source file lines, conditions, and verification states maintained across the UI Shell and DAP Proxy.
_Avoid_: Hardcoded breakpoint list, IDE hook

