# IMS Network

IMS Network is a modern student and alumni networking application being rebuilt from scratch with a Vercel-native TypeScript architecture.

The project is currently in early development.

## Current Status

Implemented and verified:

- Next.js 16 App Router
- React
- TypeScript
- Tailwind CSS
- ESLint
- npm
- Windows 11 terminal-first workflow
- Git repository using the main branch
- GitHub private repository
- lint verification
- TypeScript type checking
- production build verification
- initial security and architecture documentation

Not yet implemented:

- database
- authentication
- member profiles
- member directory
- messaging
- Redis
- WebSockets
- email
- admin tools
- audit logging
- production deployment

Planned features are not considered complete until they are implemented and verified in the repository.

## Development Environment

Primary development environment:

- Windows 11
- Windows Terminal
- PowerShell
- Node.js 26.13.0
- npm
- Git
- GitHub CLI

The project does not require a specific IDE.

## Local Development

Install dependencies:

    npm install

Start the development server:

    npm run dev

Run lint:

    npm run lint

Run TypeScript validation:

    npm run typecheck

Create a production build:

    npm run build

## Target Architecture

The planned application stack includes:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Neon PostgreSQL
- Drizzle ORM
- Better Auth
- Upstash Redis
- Vercel WebSockets
- Resend
- Vercel Blob
- Zod
- Vitest
- Playwright
- GitHub Actions
- Vercel

PostgreSQL will remain the durable source of truth.

Redis will be used only for appropriate caching, rate limiting, ephemeral coordination, and real-time relay.

## Project Goals

The project aims to provide:

- secure account registration and approval
- member profiles
- member search and directory
- direct messaging
- real-time message delivery
- correct unread/read state
- admin tooling
- auditability
- responsive and accessible UI
- security-focused server authorization
- cost-aware Vercel Hobby deployment
- approximately 100 concurrent users under a representative tested workload

## Security

Security is treated as a continuous project requirement.

Important principles include:

- never commit secrets
- validate untrusted input server-side
- enforce authorization on the server
- do not store primary authentication tokens in localStorage
- do not expose authentication tokens in WebSocket URLs
- do not log passwords, session cookies, reset secrets, or verification secrets
- use reviewed migrations for database changes
- audit important administrative actions

See [SECURITY.md](./SECURITY.md).

## Architecture Documentation

Architecture documentation is maintained under:

    docs/

Important architecture decisions are recorded under:

    docs/adr/

## Development Philosophy

The project intentionally avoids unnecessary infrastructure.

The goal is not to maximize the number of technologies used. The goal is to build a coherent, secure, maintainable, performant, and portfolio-quality application.

Features such as Kubernetes, Kafka, microservices, GraphQL, and Elasticsearch are not part of the baseline architecture.

## License

A license has not been selected yet.
