---
name: e2e
description: End-to-end navigation and testing guide for Subturtle Dashboard
---

This skill provides specific instructions for navigating and testing the Subturtle Dashboard application using browser tools.

## Prerequisites
1. **Server**: Ensure the server is running (usually on port 8080).
2. **Frontend**: Ensure the frontend is running (usually on port 3000).

## Authentication Flow
The application uses hash-based routing (`hashMode: true` in Nuxt config). To authenticate via token, you MUST include the `#` character in the URL.

**Correct URL Template:**
`http://localhost:3000/#/auth/login_with_token?token={YOUR_TOKEN}`

### Steps for Browser Agents:
1. **Navigate**: Use the `open_browser_url` tool with the correct hash-based login URL.
2. **Wait for Redirect**: The `login_with_token` page is a redirection page. Wait at least 3 seconds for the `onMounted` hook to process the token and redirect to the dashboard.
3. **Verify Dashboard**: After redirection, verify you are on `/#/` or another authenticated route. Use `capture_browser_screenshot` to confirm the UI has loaded.
4. **Inspect UI**: Once logged in, use the navigation menu or direct hash-links to find the specific page.

## Navigation Structure
- Home/Overview: `/#/`
- Board (Learning System): `/#/board`
- Statistic: `/#/statistic`
- Sessions: `/#/sessions`
- Settings: `/#/settings`

## Troubleshooting
- **Blank Page**: Check browser console for authentication errors.
- **Login Redirect**: If redirected to `/#/auth/login`, the token might be invalid or expired.
- **Missing Hash**: Always ensure the URL contains `/#/` after the origin.
- **Login Issue**: If you are not logged in, try to store the token in the browser's local storage `token={YOUR_TOKEN}` and then navigate to the dashboard.