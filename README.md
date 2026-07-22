# SPOTC WEB — Step 2 Firebase Fix

This package replaces the Step 1 placeholder logic with live Firebase initialization and Firestore reads.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open:
- http://localhost:3000/offers
- http://localhost:3000/shop
- http://localhost:3000/spots

The included `.env.local` uses the Firebase web configuration from the uploaded FlutterFlow source.

## Changes
- Initializes Firebase from `.env.local`.
- Reads `BusinessListings` for Offers.
- Reads `BusinessProducts` for Shop.
- Reads the correct singular `Spot` collection for Spots.
- Avoids composite-index requirements during this connection step.
- Displays the real Firebase error instead of incorrectly saying the config is missing.
