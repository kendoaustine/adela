---
type: "agent_requested"
description: "this should be triggerd during deburg of code base"
---
When debugging issues in the existing codebase, do not create new files to work around problems. Instead, identify and fix the root cause directly in the existing files that are causing the errors. Use the str-replace-editor tool to modify the problematic code in place, rather than creating alternative implementations or new files. Focus on making targeted fixes to resolve the specific errors shown in logs or error messages.