# Vercel + WorkOS deployment checklist

Use this after the app is deployed to Vercel and before you rely on browser sign-in.

## 1) Staging deployment

In Vercel, set these values for the staging environment:

- `WORKOS_CLIENT_ID` = the staging WorkOS client ID
- `WORKOS_COOKIE_PASSWORD` = the staging cookie secret (32+ chars)
- `WORKOS_AUTHKIT_DOMAIN` = the staging AuthKit domain, such as `https://prudent-picture-21-staging.authkit.app`
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI` = `https://<staging-vercel-url>/auth/callback`
- `WORKOS_API_KEY` = optional, only if you need management APIs or feature flags

Then in the WorkOS dashboard:

- Open the app / project
- Go to Redirects
- Add `https://<staging-vercel-url>/auth/callback`
- Save the change
- Confirm the app uses the same exact callback URL as the environment variable

## 2) Production deployment

In Vercel, set these values for the production environment:

- `WORKOS_CLIENT_ID` = the production WorkOS client ID
- `WORKOS_COOKIE_PASSWORD` = the production cookie secret
- `WORKOS_AUTHKIT_DOMAIN` = the production AuthKit domain
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI` = `https://<production-vercel-url>/auth/callback`
- `WORKOS_API_KEY` = optional, only if required in production

Then in the WorkOS dashboard:

- Open the production app configuration
- Go to Redirects
- Add `https://<production-vercel-url>/auth/callback`
- Save the change

## 3) Validation steps

After deployment, validate in the browser:

1. Open the deployed app at the staging URL
2. Visit `/login`
3. Confirm the browser redirects to the WorkOS sign-in screen
4. Sign in with a real staging user
5. Verify the callback lands on `/auth/callback` and then returns to the app
6. Repeat the same flow for the production URL after production values are in place

## 4) Common mismatch to avoid

The most common issue is a mismatch between:

- the Vercel env value `NEXT_PUBLIC_WORKOS_REDIRECT_URI`
- the callback route actually served by the app
- the callback URL registered in WorkOS

The three values must match exactly, including protocol, hostname, and path.

## 5) Default local development value

Local defaults are intentionally set to:

- `http://localhost:3000/auth/callback`

This keeps local work stable while staging and production are configured separately.
