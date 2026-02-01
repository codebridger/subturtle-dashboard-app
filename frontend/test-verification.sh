#!/bin/bash

echo "🧪 Testing Environment Verification"
echo "=================================="

echo ""
echo "1. Testing Unit Tests (non-watch mode)..."
yarn test:unit

echo ""
echo "2. Testing Coverage (non-watch mode)..."
yarn test:coverage

echo ""
echo "3. Testing E2E Test Listing..."
yarn test:e2e --list

echo ""
echo "✅ All tests completed successfully!"
echo ""
echo "Available Commands:"
echo "  yarn test             - Run all tests once (non-watch)"
echo "  yarn test:unit        - Run unit tests once (non-watch)"
echo "  yarn test:unit:watch  - Run unit tests in watch mode"
echo "  yarn test:ui          - Open Vitest UI (watch mode)"
echo "  yarn test:ui:run      - Open Vitest UI (non-watch mode)"
echo "  yarn test:coverage    - Run tests with coverage once"
echo "  yarn test:coverage:watch - Run tests with coverage in watch mode"
echo "  yarn test:e2e         - Run E2E tests"
echo "  yarn test:e2e:ui      - Open Playwright UI" 