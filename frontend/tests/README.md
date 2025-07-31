# Testing Guide

This project uses a comprehensive testing strategy with Vitest for unit/component testing and Playwright for E2E testing.

## Quick Start

### Run Unit Tests
```bash
# Run all unit tests
yarn test:unit

# Run tests in watch mode
yarn test:watch

# Run tests with UI
yarn test:ui

# Run tests with coverage
yarn test:coverage
```

### Run E2E Tests
```bash
# Run all E2E tests
yarn test:e2e

# Run E2E tests with UI
yarn test:e2e:ui

# Install Playwright browsers (first time only)
npx playwright install
```

## Test Structure

```
tests/
├── unit/                    # Unit tests
│   ├── components/          # Component tests
│   ├── composables/         # Composable tests
│   ├── utils/              # Utility function tests
│   └── stores/             # Pinia store tests
├── e2e/                    # E2E tests
│   ├── specs/              # Test specifications
│   ├── fixtures/           # Test data
│   └── utils/              # E2E test utilities
└── fixtures/               # Shared test data
```

## Writing Tests

### Unit Tests

Unit tests are for **non-component scripts only**:
- Utility functions (`utils/`)
- Composables (`composables/`)
- Pinia stores (`stores/`)
- API functions and services

**File Naming**: `*.test.ts` or `*.spec.ts`

**Example**: `utils/auth.test.ts`

### Component Tests

Component tests are for **Vue components only**:
- Vue components (`components/`)
- Page components (`pages/`)
- Layout components (`layouts/`)

**File Naming**: `ComponentName.test.ts`

**Example**: `components/bundle/DetailCard.test.ts`

### E2E Tests

E2E tests are for **critical user journeys**:
- Authentication flows
- Navigation
- Form submissions
- User interactions

**File Naming**: `*.spec.ts`

**Example**: `tests/e2e/specs/auth.spec.ts`

## Test Examples

### Utility Function Test
```typescript
import { describe, it, expect, vi } from 'vitest'
import { validateToken } from './auth'

describe('Auth Utils', () => {
  it('validates correct token format', () => {
    const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
    expect(validateToken(validToken)).toBe(true)
  })
})
```

### Component Test
```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import MyComponent from './MyComponent.vue'

describe('MyComponent', () => {
  it('renders correctly', () => {
    const wrapper = mount(MyComponent, {
      global: {
        plugins: [createTestingPinia()]
      }
    })
    
    expect(wrapper.text()).toContain('Expected Text')
  })
})
```

### Store Test
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMyStore } from './myStore'

describe('My Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with correct state', () => {
    const store = useMyStore()
    expect(store.items).toEqual([])
  })
})
```

### E2E Test
```typescript
import { test, expect } from '@playwright/test'

test('user can login successfully', async ({ page }) => {
  await page.goto('/auth/login')
  
  await page.fill('[data-testid="email-input"]', 'test@example.com')
  await page.fill('[data-testid="password-input"]', 'password123')
  await page.click('[data-testid="login-button"]')
  
  await expect(page).toHaveURL('/dashboard')
})
```

## Test Data

Use the factory functions in `tests/fixtures/` to create consistent test data:

```typescript
import { createBundle, createPhrase } from '~/tests/fixtures/bundleFactory'

const testBundle = createBundle({ title: 'Custom Title' })
const testPhrase = createPhrase({ phrase: 'Custom Phrase' })
```

## Best Practices

### 1. Test Organization
- Group related tests using `describe` blocks
- Use descriptive test names
- Follow AAA pattern: Arrange, Act, Assert

### 2. Component Testing
- Test component behavior, not implementation details
- Use `data-testid` attributes for reliable element selection
- Mock external dependencies

### 3. E2E Testing
- Test critical user journeys
- Focus on business value
- Use page objects for maintainable tests

### 4. Test Data
- Use factories for generating test data
- Keep test data minimal and focused
- Avoid hardcoded values

### 5. Assertions
- Make assertions specific and meaningful
- Test one thing per test case
- Use descriptive assertion messages

## Configuration

### Vitest Configuration
- `vitest.config.ts` - Main configuration
- `tests/setup.ts` - Global test setup

### Playwright Configuration
- `playwright.config.ts` - E2E test configuration

## Common Issues

### Component Not Rendering
- Check if all required props are provided
- Ensure all dependencies are mocked

### Async Operations
- Use `await` and `$nextTick()`
- Mock async functions properly

### Router Mocking
- Ensure router is properly mocked in setup
- Use `createTestingPinia` for store testing

## Debugging

### Unit Tests
```bash
# Run with verbose output
yarn test:unit --reporter=verbose

# Run specific test file
yarn test:unit utils/auth.test.ts
```

### E2E Tests
```bash
# Run with headed browser
yarn test:e2e --headed

# Run with debug mode
yarn test:e2e --debug
```

## Continuous Integration

The testing setup is configured for CI/CD with:
- Parallel test execution
- Coverage reporting
- Multiple browser testing for E2E
- Automatic retries for flaky tests

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vue Test Utils](https://test-utils.vuejs.org/)
- [Playwright Documentation](https://playwright.dev/)
- [Nuxt 3 Testing Guide](https://nuxt.com/docs/guide/concepts/testing) 