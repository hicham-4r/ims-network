# Development Workflow

## Default Branch

The canonical default branch is:

    main

Direct work on main should remain small and controlled.

## Feature Branches

Use focused branch names such as:

    feat/<feature>
    fix/<issue>
    docs/<topic>
    test/<topic>
    refactor/<topic>

Examples:

    feat/member-directory
    fix/message-pagination
    docs/security-model

## Commit Messages

Use clear Conventional-Commit-style messages.

Examples:

    chore(repo): scaffold Next.js application
    feat(auth): add account approval state
    fix(chat): correct message pagination
    docs(adr): record Redis strategy
    test(auth): cover suspended account access

Avoid vague commit messages such as:

    update
    stuff
    works
    final
    fix

## Before Committing

Inspect the repository:

    git status --short

Run the relevant verification commands:

    npm run lint
    npm run typecheck
    npm run build

Review the diff before committing.

## Safety

Do not commit:

- .env.local
- credentials
- API keys
- database URLs
- tokens
- cookies
- private keys
- production data
- database dumps

Do not use git reset --hard as a casual recovery method.

Prefer focused restoration, git diff, and git revert where appropriate.
