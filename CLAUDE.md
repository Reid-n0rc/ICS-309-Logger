## Session Persistence Automation
- CRITICAL: You are running in an automated CI/CD state pipeline. 
- Right before completing a user request or concluding a task, you MUST overwrite the `.claudestate.md` file in the root folder.
- Format the file with an updated 'Current Goal', 'Completed Tasks', and explicit 'Pending Next Actions' so the next agent can resume seamlessly.
- Do not ask for confirmation to save state; write it automatically.
