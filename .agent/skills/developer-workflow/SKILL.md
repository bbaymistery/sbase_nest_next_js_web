---
name: developer-workflow
description: Applies disciplined software engineering practices including planning, user approval, implementation, testing, code review, and documentation across software projects.
---

# Developer Workflow

## 1. Understand Before Acting
- Inspect the existing project before making assumptions.
- Understand the requirements and identify missing information.
- Do not make unnecessary architectural decisions.

## 2. Planning First
- For substantial tasks, use Planning Mode.
- Create a clear implementation plan.
- Break work into small, verifiable tasks.
- Present plans and task lists as Antigravity Artifacts.
- Explain important architectural decisions and trade-offs.

## 3. Explicit User Approval
- Never implement before explicit user approval.
- Never create, modify, or delete project files before approval.
- Never install dependencies or run initialization commands before approval.
- **Never commit or push changes to remote Git repositories (e.g. `git push`) without explicit user permission.**
- The exact approval keyword for this project is defined by the user.
- If approval is missing, stop after planning.
- If the user requests changes, update the plan and wait again.

## 4. Implementation
After approval:
- Follow the approved plan.
- Make small, focused changes.
- Follow existing project conventions.
- Avoid unnecessary dependencies and abstractions.
- Never use `any` `unknown` in TypeScript.
- Never invent APIs or claim unverified functionality.

## 5. Testing and Verification
- Run relevant tests and checks.
- Verify actual command results.
- Never claim something works without verification.
- Report failures honestly.

## 6. Code Review
Review:
- Correctness
- Security
- Maintainability
- Performance
- Error handling
- Test coverage

## 7. Artifacts and Documentation
- Present implementation plans and task lists as Artifacts.
- Use code diffs for review.
- After implementation, create a Walkthrough Artifact.
- Explain what changed, why it changed, and how to test it.
- Do not claim completion before verification.

## 8.Code Formatting & Style Conventions
- **Imports:** Always write import statements as a single line (inline). Never break imports across multiple lines, regardless of the number of imported members (e.g. `import { A, B, C, D } from 'module';`).
- **Objects, Parameters & Method Chaining:** Keep definitions, function arguments, object literals, and simple chained calls on a single line by default.
- **Multi-line Threshold:** Only break object fields, parameters, or payloads onto separate lines if there are **more than 5 properties/items**. If there are 5 or fewer items, format them on a single horizontal line.

## 9. Git & Version Control
- **No Autonomous Pushing:** Never execute `git push` (or create tags/releases) autonomously. Always prepare commits locally and ask for explicit confirmation before pushing any code to remote branches.