import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
    test('renders Google sign-in button', async ({ page }) => {
        await page.goto('/#/auth/login');
        await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
    });
});
