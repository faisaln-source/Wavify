---
name: Always Push Changes
description: Always automatically push code changes to the repository after completing tasks.
---

# Always Push Changes

When you complete a significant chunk of work or make bug fixes, you MUST automatically run the git add, commit, and push sequence without waiting for the user to explicitly ask you to do so.

- Use a descriptive commit message based on the changes you made.
- Always use `git add .`, `git commit -m "..."`, and `git push` via terminal commands.
- If using powershell on Windows, use `git add .; git commit -m "..."; git push` since `&&` may not be supported.
