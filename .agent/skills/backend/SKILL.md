---
name: Backend Development
description: Guidelines for Server-side development using Modular Rest, Database schemas, and Business Logic.
---

# Backend Development Skill

## 1. Core Principles
- **Modularity**: Organize logic into distinct, independent modules. Each module should have a single responsibility.
- **Testing**: Write unit tests for core logic and services.
- **Documentation**: Use JSDoc for functions to document parameters and return values.
- **Workflow**: Always reference the ClickUp task ID in commit messages (e.g., `feat: #taskid message`).

## 2. Technology Stack
- **Framework**: Modular Rest Server (@modular-rest/server)
- **Database**: MongoDB (via `defineCollection`)

## 3. Documentation Reference
**You MUST read the following file for API details:**
- [Modular Rest Server Docs](./modular-rest_server.md)

## 4. Key Patterns
- **Database Models**: Use `defineCollection` in `db.ts` files within modules.
- **API Functions**: Use `defineFunction` in `functions.ts` files.
- **Routing**: Avoid manual router creation; let the framework handle it.

## 5. Directory Structure
Code should be written in `/Users/navid-shad/Projects/CodeBridger/learn-by-subtitle/dashboard-app/server`.
