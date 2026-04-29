# Nomad Lights Dynamic Photography App

This is a real React + Firebase web app, not a static HTML site.

## Included

- Public portfolio website
- Private admin login
- Drag-and-drop image uploads
- Firebase Storage for photos
- Firestore for gallery data
- Firebase Authentication so visitors cannot edit the site

## What still needs to be connected

Firebase must be connected before uploads work.

## Setup

1. Create a Firebase project.
2. Enable Authentication > Email/Password.
3. Create your admin user.
4. Enable Firestore Database.
5. Enable Storage.
6. Copy `.env.example` and rename it to `.env`.
7. Paste your Firebase web app config into `.env`.

## Run locally

```bash
npm install
npm run dev
```

## Admin dashboard

Go to:

```text
#/admin
```

Example:

```text
http://localhost:5173/#/admin
```

## Firestore Rules

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /gallery/{imageId} {
      allow read: if true;
      allow create, update, delete: if request.auth != null;
    }
  }
}
```

## Storage Rules

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /gallery/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```
