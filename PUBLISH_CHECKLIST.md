# mrigAI — Pre-Publish Checklist

Run through this EVERY time before building an APK/AAB for distribution.

## 1. Environment Variables

- [ ] `eas.json` → every build profile has `"environment"` set (e.g. `"environment": "preview"`)
- [ ] `eas env:list --environment preview` → verify `EXPO_PUBLIC_API_URL` points to Railway (NOT localhost)
- [ ] `eas env:list --environment preview` → verify `EXPO_PUBLIC_APP_SECRET` is set
- [ ] Railway dashboard → verify `JWT_SECRET` is set
- [ ] Railway dashboard → verify `APP_SECRET` matches client's `EXPO_PUBLIC_APP_SECRET`
- [ ] Railway dashboard → verify `GEMINI_API_KEY` is set
- [ ] Railway dashboard → verify AWS creds (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `CLOUDFRONT_DOMAIN`, `DYNAMODB_TABLE`)
- [ ] `constants.ts` fallback is `localhost:3000` — this is fine, it's only used when env var is missing

## 2. Backend Health

- [ ] Hit `https://<railway-url>/health` — should return `{ "status": "ok" }`
- [ ] Check Railway logs for startup warnings (missing secrets = dev mode)

## 3. Build Config

- [ ] `app.json` → `android.package` is correct (`com.mrigai.app`)
- [ ] `app.json` → `version` bumped if needed
- [ ] `app.json` → no invalid plugins (only plugins that have actual Expo config plugin support)
- [ ] `tsconfig.json` → `"exclude": ["backend"]` is present (prevents build parse errors)
- [ ] `eas.json` → `production` profile has `"environment": "production"` when ready

## 4. Code Safety

- [ ] No API keys hardcoded in client code (grep for `AIza`, `AKIA`, `sk-`)
- [ ] No `console.log` with sensitive data
- [ ] `services/api.ts` → uses `API_URL` from constants (not hardcoded URL)

## 5. Build & Test

- [ ] Local build: `ANDROID_HOME=$HOME/Library/Android/sdk eas build --platform android --profile preview --local`
- [ ] Cloud build: `eas build --platform android --profile preview`
- [ ] Install APK → open app → check chat works (means backend connection is live)
- [ ] Try on a product → image appears (means Gemini + S3 + CDN working)
- [ ] Check Saved tab → history loads (means DynamoDB working)

## 6. Play Store Submission

- [ ] Switch to `production` profile: `eas build --platform android --profile production`
- [ ] Builds `.aab` not `.apk`
- [ ] Upload to Play Console or: `eas submit --platform android`
