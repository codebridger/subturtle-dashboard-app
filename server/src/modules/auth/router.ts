import Router from "koa-router";
import { reply, userManager } from "@modular-rest/server";
import { google } from "googleapis";
import { updateUserProfile } from "../profile/service";

const name = "auth";
const auth = new Router();

const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_ID_EXTENSION = process.env.GOOGLE_OAUTH_CLIENT_ID_EXTENSION;

// Note: The redirect uri is the callback route for the web app
// This route will be called after the user has logged in to google
// This route will then exchange the code for a token
const REDIRECT_URI = process.env.API_BASE_URL + "/auth/google/code-login";

const REDIRECT_URI_DASHBOARD =
  process.env.DASHBOARD_BASE_URL + "/#/auth/login_with_token";

const SCOPE =
  "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

auth.get("/google", async (ctx) => {
  // Note: This is the login for the web app
  // This will redirect to the google login page
  // After login, the user will be redirected to the /google/code-login route

  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPE,
    // Pass through the redirect parameter as state to preserve it through OAuth flow
    state: ctx.query.redirect
      ? JSON.stringify({ redirect: ctx.query.redirect })
      : undefined,
  });

  ctx.response.redirect(url);
});

auth.get("/google/code-login", async (ctx) => {
  // Note: This is the callback route for the web app
  // This route will be called after the user has logged in to google
  // This route will then exchange the code for a token
  // The token will be used to get the user's email
  // The email will be used to verify the identity of the user
  // If the user is not registered, the user will be registered
  // After registration, the user will be issued a token
  // The token will be sent back to the client

  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );

  const oauth2Api = google.oauth2({
    auth: oauth2Client,
    version: "v2",
  });

  if (!ctx.query.code) {
    ctx.throw(400, "Unsuccessful login, please try again.");
    return;
  }

  // Extract redirect URL from state parameter if present
  let redirectUrl: string | null = null;
  if (ctx.query.state) {
    try {
      const state = JSON.parse(ctx.query.state as string);
      redirectUrl = state.redirect;
    } catch (error) {
      // Invalid state, continue without redirect
    }
  }

  const { tokens } = await oauth2Client.getToken(ctx.query.code as string);

  if (!tokens) {
    ctx.throw(500, "Invalid tokens");
    return;
  }

  oauth2Client.setCredentials(tokens);

  const googleUser = await oauth2Api.userinfo.get();
  const { picture, name, email } = googleUser.data;

  if (!email) {
    ctx.throw(400, "Invalid email");
    return;
  }

  let userId: string | null = null;
  const registeredUser = await userManager
    .getUserByIdentity(email, "email")
    .catch((e) => null);

  if (!registeredUser) {
    try {
      userId = await userManager.registerUser({ email });
    } catch (error) {
      ctx.throw(
        500,
        error instanceof Error ? error.message : "Registration failed"
      );
      return;
    }
  } else {
    userId = registeredUser.id;
  }

  // update user profile
  await updateUserProfile(
    {
      refId: userId as string,
      gPicture: picture as string,
      name: name as string,
    },
    false
  );

  const token = await userManager.issueTokenForUser(email);

  // Build redirect URL with token and optional redirect parameter
  let finalRedirectUrl = `${REDIRECT_URI_DASHBOARD}?token=${token}`;
  if (redirectUrl) {
    finalRedirectUrl += `&redirect=${encodeURIComponent(redirectUrl)}`;
  }

  ctx.response.redirect(finalRedirectUrl);
});

auth.get("/google/access-token-login", async (ctx) => {
  // Note: Token refers to the token issued by the google chrome extension from its active user
  // This token is used to verify the identity of the user

  const chromeUserToken = ctx.query.access_token;
  if (!chromeUserToken || typeof chromeUserToken !== "string") {
    ctx.throw(400, "Invalid access token");
    return;
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID_EXTENSION);
  const payload = await oauth2Client.getTokenInfo(chromeUserToken);

  if (!payload.email) {
    ctx.throw(400, "Invalid email from token");
    return;
  }

  const googleEmail = payload.email;
  const registeredUser = await userManager
    .getUserByIdentity(googleEmail, "email")
    .catch((e) => null);

  if (!registeredUser) {
    try {
      await userManager.registerUser({ email: googleEmail });
    } catch (error) {
      ctx.throw(
        500,
        error instanceof Error ? error.message : "Registration failed"
      );
      return;
    }
  }

  const token = await userManager.issueTokenForUser(googleEmail);

  ctx.body = reply.create("s", { token });
});

export { name };
export const main = auth;
