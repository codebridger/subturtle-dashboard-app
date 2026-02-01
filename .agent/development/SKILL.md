---
name: CodeBridger Development Skill
description: Core development guidelines and documentation for the Subturtle/CodeBridger ecosystem. Triggered when working on dashboard-app or server.
---

# Development Guidelines

## General Principles

- **Modularity**: Prioritize modularity in all code changes. Organize logic into distinct modules (Server-side) or reusable components (Frontend).
- **ClickUp Integration**: 
    - Task management primarily relies on ClickUp.
    - Always reference the ClickUp task ID in commit messages. Format: `feat: #taskid message`.
- **Communication**: 
    - Favor answering questions and providing explanations over direct code modifications unless explicitly requested.
    - Ensure all explanations are clear and provide necessary context.

## Framework Documentation

Always refer to the official documentation for package-specific implementations:

### Server-Side (@modular-rest/server)
- **Primary Docs**: [modular-rest_server.md](./modular-rest_server.md)
- **Key Patterns**:
    - Use `defineCollection` in `db.ts` for database models.
    - Use `defineFunction` in `functions.ts` for API logic.
    - Avoid manual router creation unless necessary (`router.ts`).

### Frontend-Side (@modular-rest/client)
- **Primary Docs**: [modular-rest_client.md](./modular-rest_client.md)
- **Key Patterns**:
    - Reference the JS client for consuming services and calling server functions.

### UI Components (lib-vue-components)
- **Primary Docs**: [lib-vue-components.md](./lib-vue-components.md)
- **Key Patterns**:
    - Import components directly from `@codebridger/lib-vue-components` as needed (e.g., `import { Button } from '@codebridger/lib-vue-components'`).
    - Follow the design system guidelines for consistent aesthetics.


---

You must read the specific documentation files listed above before proposing or implementing any technical changes related to these packages.