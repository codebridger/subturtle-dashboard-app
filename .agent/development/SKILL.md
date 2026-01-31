---
name: CodeBridger Development Skill
description: Core development guidelines and documentation for the Subturtle/CodeBridger ecosystem. Triggered when working on dashboard-app or server.
---

# Development Guidelines

## General Principles

- **Modularity**: Prioritize modularity and separation of concerns. Organize logic into distinct, independent modules (Server-side) or reusable components (Frontend). Each module should have a single responsibility and a clear interface.
- **Testing**: 
    - Write unit tests for core logic and services.
    - Implement integration tests for API endpoints and complex component interactions.
    - Ensure tests are easy to run and provide clear feedback.
- **Human-friendly Documentation**:
    - Write code that is self-documenting through clear naming conventions.
    - Use JSDoc for functions and classes to document parameters, return values, and behavior.
    - Add context-rich inline comments for complex logic, explaining the "why" rather than just the "what".
    - Maintain up-to-date documentation within the `.agent/development` directory.
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
    - **Extensive Usage**: Prioritize and extensively use components from `@codebridger/lib-vue-components`.
    - **Custom Components**: Only create custom components if no equivalent exists within the library.
    - **Direct Imports**: Import components directly from `@codebridger/lib-vue-components` as needed (e.g., `import { Button } from '@codebridger/lib-vue-components'`).
    - **Design Consistency**: Strictly follow the design system guidelines for consistent aesthetics.

## E2E Testing and Navigation

### Prerequisites
1. **Server**: Ensure the server is running (usually on port 8080).
2. **Frontend**: Ensure the frontend is running (usually on port 3000).

### Authentication Flow
The application uses hash-based routing. To authenticate via token:
1. **Initial Navigation**: Open the website with the expected path (e.g., `http://localhost:3000/#/settings`).
2. **Manual Login (if needed)**: If you face the login page, use browser tools to store the token in the browser's local storage with the key `token` (e.g., `localStorage.setItem('token', 'YOUR_TOKEN')`).
3. **Re-navigate**: Enter the expected path again or reload the page to access the authenticated route.

### Navigation Structure
- Home/Overview: `/#/`
- Board (Learning System): `/#/board`
- Statistic: `/#/statistic`
- Sessions: `/#/sessions`
- Settings: `/#/settings`

### Troubleshooting
- **Blank Page**: Check browser console for authentication errors.
- **Login Redirect**: If redirected to `/#/auth/login`, the token might be invalid, expired, or not correctly set in local storage.
- **Missing Hash**: Always ensure the URL contains `/#/` after the origin due to `hashMode: true`.


---

You must read the specific documentation files listed above before proposing or implementing any technical changes related to these packages.