# Voice Bot — Web App

A React + Vite application for configuring and operating the Voice Bot platform.

## Prerequisites

- Node.js (v18 or higher recommended)
- yarn

## Setup

### 1. Install Dependencies

```bash
yarn install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

Key variables:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key
- `VITE_WEBHOOK_SERVER_URL` - Webhook server URL

### 3. Run the Application

```bash
yarn dev
```

Open your browser to: **http://localhost:5173**

## Project Structure

```
web/
├── src/
│   ├── components/
│   │   ├── admin/        # Admin setup components
│   │   ├── auth/         # Authentication components
│   │   ├── dashboard/    # Dashboard and metrics
│   │   └── forms/        # Reusable form components
│   ├── contexts/         # React contexts (Auth)
│   ├── services/         # API and Supabase services
│   └── types/            # TypeScript type definitions
├── supabase/             # Supabase migrations and config
└── package.json
```

## Available Scripts

- `yarn dev` - Start development server
- `yarn build` - Build for production
- `yarn preview` - Preview production build
- `yarn test` - Run tests
- `yarn lint` - Run ESLint

## Tech Stack

- **Frontend:** React 19, Vite, React Router, TypeScript
- **State:** Jotai
- **Forms:** React Hook Form + Zod
- **Backend:** Supabase (Auth, Database, RLS)
- **Testing:** Vitest, Testing Library
