# 🎮 Gamified Learning App (Thesis Project)

A cross-platform mobile application designed to make learning engaging through gamification. Built with **React Native (Expo)** and powered by **Supabase** for secure backend authentication and database management.

This project is currently being developed as a university thesis.

## ✨ Features So Far
* **Sleek User Interface:** Custom dark-mode design with glowing neon accents.
* **Smooth Animations:** Utilizes React Native's `Animated` API for continuous, performant UI effects (e.g., pulsing backgrounds).
* **Secure Authentication:** Full email/password sign-up and log-in flows using Supabase Auth, including secure session management via `AsyncStorage`.
* **Cross-Platform:** Codebase compiles natively to both Android and iOS via the Expo framework.

## 🛠️ Tech Stack
* **Frontend:** React Native, Expo, React Navigation (Coming Soon)
* **Backend & Auth:** Supabase (PostgreSQL)
* **Storage:** `@react-native-async-storage/async-storage`
* **UI Assets:** `@expo/vector-icons`

## 🚀 How to Run Locally
1. Clone the repository: `git clone https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git`
2. Install dependencies: `npm install`
3. Start the Expo server: `npx expo start`
4. Press `a` to open on an Android emulator, or `i` for iOS.

*(Note: Requires a `.env` file or valid Supabase API keys in `supabase.js` to connect to the database).*
