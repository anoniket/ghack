# mrigAI Launch Guide

## Pre-Build Steps (Before building for App Store / Play Store)

### 1. Set Sentry Auth Token
Required for sourcemap uploads so crash reports show readable stack traces.

```bash
export SENTRY_AUTH_TOKEN=<your-sentry-org-auth-token>
```

For EAS builds, set as secret:
```bash
eas secret:create --name SENTRY_AUTH_TOKEN --value "<your-sentry-org-auth-token>"
```

Get the token from: Sentry → Settings → Developer Settings → Organization Tokens

### 2. Verify Environment Variables

**Frontend (.env)**
- `EXPO_PUBLIC_API_URL` — production backend URL
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk production key (pk_live_...)
- `EXPO_PUBLIC_SENTRY_DSN` — Sentry React Native DSN

**Backend (Railway)**
- `CLERK_PUBLISHABLE_KEY` — Clerk production key
- `CLERK_SECRET_KEY` — Clerk production secret
- `SENTRY_DSN` — Sentry Node.js DSN
- `GEMINI_API_KEYS` — comma-separated API keys
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- `S3_BUCKET`, `CLOUDFRONT_DOMAIN`, `DYNAMODB_TABLE`
- `DEMO_MODE` — set to `true` for App Store review, `false` for production
- `PORT` — 3000

### 3. Build Commands

**Local iOS build (Xcode):**
```bash
npx expo prebuild --clean
open ios/mrigAI.xcworkspace
# In Xcode: Product → Archive → Distribute App → App Store Connect
```

**Local iOS device testing:**
```bash
npx expo run:ios --device
```

**EAS Build (cloud):**
```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

### 4. Post-Build Checklist
- Verify Sentry receiving test events (throw a test error)
- Verify Railway backend has all env vars
- Set DEMO_MODE=true in Railway if submitting for App Store review
- After approval, set DEMO_MODE=false for live users

## Key Accounts & Dashboards
- **Clerk**: clerk.mrigai.com (production instance)
- **Sentry**: sentry.io/organizations/mrigai/
- **Railway**: backend deployment
- **Apple Developer**: developer.apple.com
- **Google Cloud Console**: OAuth credentials for Google Sign-In
