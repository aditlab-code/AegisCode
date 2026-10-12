# Issue 04: Agent Multi-File Review Card in Chat

Status: resolved
Role: Chat UI & Navigation

## Description
Provide a seamless navigation gate when an AI agent directly modifies files in the workspace via tool calls.

## Requirements
1. In `src/components/layout/chat/ChatMessageList.tsx`:
   - Inspect completed tool calls for file writing/replacing actions (`write_to_file`, `replace_file_content`, or workspace file writes).
   - Collect unique affected file paths.
   - If files were modified by the message's tool calls, render a review card at the bottom of the message:
     - Git branch/diff icon.
     - Label: `Modified N file(s): <file1>, <file2>...`
     - Button: `[Review in Source Control]`.
   - On click: call `setActiveActivity("Source Control")` and `setSidebarOpen(true)`.
