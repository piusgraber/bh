# Buchungshaltung (BH)

A SvelteKit-based accounting and document management application with AWS S3 integration.

## Features

- 📊 Buchungen (Bookings) management with Soll/Haben accounting
- 📁 Document management with S3 storage
- 🏷️ Sub-accounts for Kreditoren (2000/20xx) and Debitoren (1100/11xx)
- 📄 Document assignment to bookings
- 🔍 Filtering and search capabilities
- 📝 Import from Xfact and credit card statements

## Prerequisites

- Node.js 20.x or later
- AWS S3 bucket for document storage
- AWS IAM credentials with S3 access

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
```bash
cp .env.example .env
```

Edit `.env` with your AWS credentials:
```
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=eu-west-1
AWS_BUCKET_NAME=bucket-hergol
```

3. **Run development server:**
```bash
npm run dev

# or open in browser automatically
npm run dev -- --open
```

## Building

To create a production build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Deployment

This app is configured for Vercel deployment. See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

**Quick deploy to Vercel:**
```bash
npm install -g vercel
vercel
```

⚠️ **Important**: This app uses local JSON files for data storage, which is not persistent on Vercel's serverless platform. See [DEPLOYMENT.md](./DEPLOYMENT.md) for migration strategies to persistent storage (Vercel KV, PostgreSQL, or S3).

## Project Structure

```
/data/                    # JSON data files (buchungen, irrelevant docs)
/src/
  /lib/                   # Shared libraries and components
    /components/          # Svelte components
    konto.json           # Account definitions
  /routes/               # SvelteKit routes
    /api/                # API endpoints (serverless functions)
    /buchung/            # Bookings management
    /kb/                 # Kontoauszug (account statement)
    /docs/               # Document management
/static/                 # Static assets
```

## Tech Stack

- **Framework**: SvelteKit 5
- **Language**: TypeScript
- **Storage**: AWS S3 (documents) + JSON files (data)
- **Deployment**: Vercel (adapter-vercel)
- **Styling**: CSS (custom)

## License

Private project.
