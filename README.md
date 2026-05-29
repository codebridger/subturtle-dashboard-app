# SubTurtle Dashboard App

## Overview

SubTurtle Dashboard App is a comprehensive full-stack application designed for managing SubTurtle user content, including Bundles, Practice sessions, and other related features. This dashboard provides an intuitive interface for content management and user interaction.

## 🌐 Environments

| Environment | URL                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Production  | [https://subturtle.app/](https://subturtle.app/)                                                                                               |
| Development | [https://subturtle-dashboard-app-dev-344321252651.europe-west4.run.app](https://subturtle-dashboard-app-dev-344321252651.europe-west4.run.app) |

## 🏗️ Project Structure

```
subturtle-dashboard-app/
├── frontend/          # Nuxt.js frontend application
├── server/            # Node.js/TypeScript backend server
├── docker-compose.yml # Docker compose configuration
└── Dockerfile         # Docker configuration
```

## 🚀 Technology Stack

### Frontend

| Category             | Technology                   |
| -------------------- | ---------------------------- |
| Framework            | Nuxt.js (Vue.js)             |
| Language             | TypeScript                   |
| Styling              | Tailwind CSS                 |
| State Management     | Pinia (via stores directory) |
| Internationalization | i18n                         |
| Development Tools    | ESLint, Prettier             |

### Backend

| Category    | Technology           |
| ----------- | -------------------- |
| Runtime     | Node.js              |
| Language    | TypeScript           |
| Environment | Docker containerized |

## 🛠️ Setup & Installation

### Prerequisites

- Git
- Node.js and Yarn
- Docker and Docker Compose (for containerized setup)

### Installation Steps

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd subturtle-dashboard-app
   ```

2. **Install dependencies**

   ```bash
   # Frontend dependencies
   cp frontend/.npmrc.sample frontend/.npmrc
   cd frontend
   yarn install

   # Backend dependencies
   cd ../server
   yarn install
   ```

3. **Set up environment variables**

   ```bash
   # Frontend
   cp frontend/.env.example frontend/.env

   # Backend
   cp server/sample.env server/.env
   ```

4. **Run the development environment**

   Using Docker:

   ```bash
   docker-compose up
   ```

   Or run services separately:

   ```bash
   # Frontend
   cd frontend
   yarn dev

   # Backend
   cd server
   yarn dev
   ```

## 🐳 Docker Configuration

The application is containerized using Docker for consistent development and deployment environments.

### Docker Commands

```bash
# Build and run all services
docker-compose up --build

# Run in detached mode
docker-compose up -d

# Stop all services
docker-compose down
```

## 🔧 Configuration Options

| Component | Configuration Location                          |
| --------- | ----------------------------------------------- |
| Frontend  | `frontend/nuxt.config.ts`                       |
| Backend   | Environment variables (see `server/sample.env`) |
| Docker    | `docker-compose.yml` and `Dockerfile`           |

## 📝 Development Guidelines

1. **Code Quality**

   - Follow the established code style (ESLint & Prettier configurations)
   - Write clean, maintainable, and documented code

2. **TypeScript Usage**

   - Use TypeScript types appropriately
   - Leverage type safety features

3. **Version Control**

   - Follow the Git workflow
   - Adhere to commit message conventions

4. **Testing**
   - Write tests for new features
   - Ensure existing tests pass before submitting changes

## 🚀 Deployment Process

The application is deployed using Google Cloud Run with the following workflow:

- **Production**: Automated deployments through GitHub Actions
- **Development**: Deployments triggered on merges to the development branch

### Stripe pricing setup

Subscription tiers (names, prices, caps, copy) are **Stripe-driven** — the server
reads them from Stripe at runtime, so pricing changes are made in the Stripe
Dashboard, not in code. Seeding the Stripe products is a manual migration
(`yarn setup:stripe`, run from `server/`). Full procedure — when/where to run it,
dry-run, the LIVE guard, and commands — is in the gateway module README:
[`server/src/modules/gateway/README.md`](server/src/modules/gateway/README.md).

## 📚 Additional Resources

- [Nuxt.js Documentation](https://nuxtjs.org/docs/get-started/installation)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Pinia Documentation](https://pinia.vuejs.org/)
- [Docker Documentation](https://docs.docker.com/)
