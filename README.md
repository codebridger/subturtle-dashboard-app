# SubTurtle Dashboard App

A full-stack dashboard application for managing Subturtle users content [Bundles, Practice, etc]

## 🌐 Environments

- Production: [https://subturtle.app/](https://subturtle.app/)
- Development: [https://subturtle-dashboard-app-dev-344321252651.europe-west4.run.app](https://subturtle-dashboard-app-dev-344321252651.europe-west4.run.app)

## 🏗️ Project Structure

```
dashboard-app/
├── frontend/          # Nuxt.js frontend application
├── server/           # Node.js/TypeScript backend server
├── docker-compose.yml # Docker compose configuration
└── Dockerfile        # Docker configuration
```

## 🚀 Technologies

### Frontend
- **Framework**: Nuxt.js (Vue.js)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Pinia (via stores directory)
- **Internationalization**: i18n
- **Development Tools**: ESLint, Prettier

### Backend
- **Runtime**: Node.js
- **Language**: TypeScript
- **Environment**: Docker containerized

## 🛠️ Setup & Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd dashboard-app
```

2. Install dependencies:
```bash
# Frontend dependencies
cd frontend
yarn install

# Backend dependencies
cd ../server
yarn install
```

3. Set up environment variables:
```bash
# Frontend
cp frontend/.npmrc.sample frontend/.npmrc
cp frontend/.env.example frontend/.env

# Backend
cp server/sample.env server/.env
```

4. Run the development environment:
```bash
# Using Docker
docker-compose up

# Or run separately
# Frontend
cd frontend
yarn dev

# Backend
cd server
yarn dev
```

## 🐳 Docker

The application is containerized using Docker. To build and run using Docker:

```bash
# Build and run all services
docker-compose up --build

# Run in detached mode
docker-compose up -d
```

## 🔧 Configuration

- Frontend configuration can be found in `frontend/nuxt.config.ts`
- Backend configuration is managed through environment variables (see `server/sample.env`)
- Docker configuration is defined in `docker-compose.yml` and `Dockerfile`

## 📝 Development Guidelines

1. Follow the established code style (ESLint & Prettier configurations)
2. Write clean, maintainable, and documented code
3. Use TypeScript types appropriately
4. Follow the Git workflow and commit message conventions

## 🚀 Deployment

The application is deployed using Google Cloud Run:
- Production deployments are automated through GitHub Actions
- Development deployments are triggered on merges to the development branch