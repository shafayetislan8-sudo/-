# Mess Manager Pro — Android APK Build & Firebase Guide

All Android APK installations connect to the single shared Firebase project configured in `firebase-applet-config.json` (`gen-lang-client-0047498127`).

## Prerequisites
- Node.js 20+
- JDK 17
- Android Studio / Android SDK (API 34+)

## Step 1: Build the Web Bundle
```bash
npm install
npm run build
```

## Step 2: Add & Sync Capacitor Android Project
```bash
npx cap add android
npx cap sync android
```

## Step 3: Add Firebase Android Configuration (for native FCM Push)
1. Open Firebase Console for project `gen-lang-client-0047498127`.
2. Add an Android app with package name `com.messmanager.pro`.
3. Download `google-services.json` and place it at `android/app/google-services.json`.

## Step 4: Build Debug APK
```bash
cd android
./gradlew assembleDebug
```
Output: `android/app/build/outputs/apk/debug/app-debug.apk`

## Step 5: Build Signed Release APK
1. Create a release keystore:
   ```bash
   keytool -genkey -v -keystore mess-manager-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias messmanager
   ```
2. Configure `signingConfigs.release` in `android/app/build.gradle` (keep keystore passwords in environment variables or `keystore.properties`, never commit them).
3. Run:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
Output: `android/app/build/outputs/apk/release/app-release.apk`

## Step 6: Automated GitHub Actions APK Build
Push to `main` or manually trigger **Build Android APKs (Debug & Release)** in GitHub Actions. Optionally add `GOOGLE_SERVICES_JSON_BASE64` in repository Secrets.
