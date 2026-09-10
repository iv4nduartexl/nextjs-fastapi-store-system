# Plan: Implement Approval Flow for Chat Tool Operations

## Goal
Implement an "approve-first" approach for sensitive operations (create, update, delete) invoked via chat tools to prevent unintended state changes.

## Context
- The current implementation in `fastapi_backend/app/routes/chat.py` automatically executes all tool calls returned by the LLM.
- The frontend already has basic support for displaying an `Approve` button for tool calls.
- Sensitive tools (modifying state) need to be intercepted.

## Implementation Steps

### 1. Identify Sensitive Tools
- Determine a mechanism to identify tools that modify state (e.g., `POST`, `PATCH`, `PUT`, `DELETE` operations).
- In `fastapi_backend/app/routes/chat.py`, inspect tool metadata or naming conventions to flag these operations.

### 2. Update Backend Chat Logic
- Modify the `chat_with_mcp` function in `fastapi_backend/app/routes/chat.py`.
- Within the tool-calling loop:
    - Determine if the suggested `tool_call` corresponds to a sensitive operation.
    - If sensitive:
        - Pause the loop.
        - Construct a response for the frontend indicating that approval is required, including the `toolCall` details (`name` and `arguments`).
        - Do not execute the tool.
    - If safe (read-only):
        - Continue with existing automatic execution logic.

### 3. Update Frontend Integration
- Ensure `sendMessage` in `nextjs-frontend/components/actions/chat-action.ts` correctly handles and propagates the "needs approval" response from the backend.
- Enhance the UI in `nextjs-frontend/app/[locale]/(main)/chat/page.tsx` to clearly present the tool call details (e.g., show arguments) to the user before they click "Approve".

### 4. Validation
- Test a sensitive operation (e.g., "Create a new item").
- Verify that the tool is NOT executed immediately.
- Verify the UI shows the tool call request with an "Approve" button.
- Verify that clicking "Approve" executes the tool and updates the state.
- Test a safe operation (e.g., "List items").
- Verify that it still works automatically.

## Risks and Mitigation
- **Tool Identification**: If the identification logic is too restrictive or too permissive, it may impact user experience. *Mitigation: Start with strict identification based on operation types.*
- **Frontend/Backend Sync**: Ensure the `approveTool` flow in the frontend remains consistent with the new backend behavior.

## Open Questions
- Is there a standardized way provided by `fastapi_mcp` to mark tools as requiring approval? (I will assume I need to handle this manually based on the current setup).
