# Security Policy

## Reporting a Vulnerability

Do not open a public issue for security vulnerabilities.

For now, security issues should be reported privately to the repository owner.

## Security Principles

- Never commit secrets or credentials.
- Authentication and authorization must be enforced server-side.
- User input must be validated.
- Production security configuration must fail closed where required.
- Sensitive tokens, cookies, reset links, and verification secrets must not be logged.
- Dependencies should be reviewed and kept reasonably current.

This document will evolve as authentication, database, Redis, email, uploads, and real-time features are implemented.
