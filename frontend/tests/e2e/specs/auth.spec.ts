import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the login page before each test
        await page.goto('/auth/login');
    });

    test('should display login form', async ({ page }) => {
        // Check if login form elements are visible
        await expect(page.locator('input[type="email"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should show validation errors for empty form submission', async ({ page }) => {
        // Try to submit empty form
        await page.click('button[type="submit"]');

        // Should show validation errors
        await expect(page.locator('.error-message')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
        // Fill in invalid credentials
        await page.fill('input[type="email"]', 'invalid@example.com');
        await page.fill('input[type="password"]', 'wrongpassword');
        await page.click('button[type="submit"]');

        // Should show error message
        await expect(page.locator('.error-message')).toBeVisible();
        await expect(page.locator('.error-message')).toContainText('Invalid credentials');
    });

    test('should redirect to dashboard after successful login', async ({ page }) => {
        // Mock successful login response
        await page.route('**/auth/login', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    token: 'mock-token',
                    user: { id: 'test-user', email: 'test@example.com' },
                }),
            });
        });

        // Fill in valid credentials
        await page.fill('input[type="email"]', 'test@example.com');
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');

        // Should redirect to dashboard
        await expect(page).toHaveURL('/dashboard');
    });

    test('should persist login state after page reload', async ({ page }) => {
        // Mock successful login and set token in localStorage
        await page.addInitScript(() => {
            localStorage.setItem('auth-token', 'mock-token');
        });

        // Navigate to dashboard
        await page.goto('/dashboard');

        // Should stay on dashboard (not redirect to login)
        await expect(page).toHaveURL('/dashboard');
    });

    test('should logout successfully', async ({ page }) => {
        // Mock logged in state
        await page.addInitScript(() => {
            localStorage.setItem('auth-token', 'mock-token');
        });

        // Navigate to dashboard
        await page.goto('/dashboard');

        // Click logout button
        await page.click('[data-testid="user-menu"]');
        await page.click('[data-testid="logout-button"]');

        // Should redirect to login page
        await expect(page).toHaveURL('/auth/login');
    });
});
