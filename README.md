# TryOnAI - Universal Virtual Try-On Shopping Assistant

A universal virtual try-on shopping experience that works on **any e-commerce website** in the world. Chat with an AI shopping assistant in any language, browse real e-commerce sites in an in-app WebView, and try on any product on yourself with one tap.

## What Makes This Different

Unlike Myntra/Amazon's built-in try-on that only works in their app, TryOnAI works on **every e-commerce site** with zero retailer integration.

## Features

- **Multilingual AI Shopping Assistant** - Chat in any language (Hindi, English, Japanese, Hinglish, etc.)
- **Universal WebView Browser** - Browse any e-commerce site inside the app
- **Smart Product Detection** - Automatically detects product cards and injects "Try On" buttons
- **AI Virtual Try-On** - See yourself wearing any product using Gemini image generation
- **Save & Gallery** - Save your try-on results for later
- **Deep Linking** - AI finds specific category/search URLs, not just homepages

## Tech Stack

- **Framework**: Expo (React Native) with expo-router
- **AI**: Google Gemini API via `@google/genai`
  - `gemini-2.5-flash` - Chat, reasoning, Google Search grounding
  - `gemini-2.5-flash-image` - Try-on image generation
- **State**: Zustand
- **WebView**: react-native-webview with JS injection for product detection

## Setup

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app on your phone (iOS/Android)
- Google Gemini API key

### Installation

```bash
# Clone the repo
git clone https://github.com/anoniket/ghack.git
cd ghack/tryonai

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your Gemini API key

# Start the development server
npx expo start
```

Scan the QR code with Expo Go to run on your device.

## Project Structure

```
app/
  _layout.tsx              # Root layout with dark theme
  (tabs)/
    _layout.tsx            # Tab navigation (Shop, Saved, Profile)
    index.tsx              # Main screen - chat or webview
    saved.tsx              # Saved try-ons gallery
    profile.tsx            # Settings, selfie management
components/
    ChatInterface.tsx      # Full chat UI with AI assistant
    ChatBubble.tsx         # Floating chat bubble over webview
    WebViewBrowser.tsx     # In-app browser with product detection
    TryOnModal.tsx         # Try-on result display
    OnboardingCamera.tsx   # First-launch selfie capture
services/
    gemini.ts              # Gemini API client (chat + image gen)
    productDetector.js     # JS injected into WebView for detection
    store.ts               # Zustand state management
utils/
    constants.ts           # Models, prompts, config
    imageUtils.ts          # Image handling, storage
```

## How It Works

1. **Onboarding** - Take/upload a selfie (used for all try-ons)
2. **Chat** - Tell the AI what you want to shop for in any language
3. **Browse** - AI opens the right website in the in-app browser
4. **Try On** - Tap the "Try On" button on any detected product
5. **Save** - Save results to your gallery

## Hackathon Tracks

- **Consumer** - Shopping assistant app
- **Multilinguality** - Chat in any language, browse sites in any language
- **Localization** - Works on local sites, local pricing, local fashion
