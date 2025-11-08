# Vercel Deployment Guide

## Overview
This SvelteKit application is configured for deployment on Vercel with AWS S3 integration for document storage.

## Prerequisites
- Vercel account
- AWS S3 bucket configured (currently: `bucket-hergol`)
- AWS IAM credentials with S3 access

## Important: Data Persistence

⚠️ **Critical Information about JSON Data Files**

This application stores data in local JSON files (`data/buchungen.json`, `data/irrelevant-docs.json`, `src/lib/konto.json`). 

**On Vercel's serverless platform:**
- File system writes are **ephemeral** and **not persistent** across function invocations
- Each serverless function has a **temporary** filesystem that is cleared after execution
- Data written to JSON files will be **lost** when the function restarts

### Recommended Solutions:

1. **Use Vercel KV (Recommended)**
   - Replace JSON file storage with Vercel KV (Redis)
   - Install: `npm install @vercel/kv`
   - Migrate buchungen and irrelevant-docs data to KV storage

2. **Use PostgreSQL/Supabase**
   - Set up a PostgreSQL database (e.g., Vercel Postgres, Supabase)
   - Migrate JSON data to database tables
   - More robust for production

3. **Store JSON files in S3**
   - Move buchungen.json and irrelevant-docs.json to S3 bucket
   - Read/write directly from S3 instead of local filesystem
   - Slower but works with existing S3 setup

4. **Use Vercel Blob Storage**
   - Store JSON files in Vercel Blob
   - Install: `npm install @vercel/blob`
   - Good for file-based storage

## Deployment Steps

### 1. Install Vercel CLI (Optional)
```bash
npm install -g vercel
```

### 2. Configure Environment Variables

Go to your Vercel project settings and add these environment variables:

**AWS S3 Configuration:**
```
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=eu-west-1
AWS_BUCKET_NAME=bucket-hergol
```

To add via Vercel Dashboard:
1. Go to your project on vercel.com
2. Navigate to Settings → Environment Variables
3. Add each variable for Production, Preview, and Development environments

To add via CLI:
```bash
vercel env add AWS_ACCESS_KEY_ID
vercel env add AWS_SECRET_ACCESS_KEY
vercel env add AWS_REGION
vercel env add AWS_BUCKET_NAME
```

### 3. Deploy to Vercel

**Option A: Via GitHub (Recommended)**
1. Push your code to GitHub
2. Import the repository in Vercel dashboard
3. Vercel will auto-detect SvelteKit and deploy
4. Add environment variables in project settings

**Option B: Via Vercel CLI**
```bash
# First time deployment
vercel

# Production deployment
vercel --prod
```

### 4. Configure Domain (Optional)
In Vercel dashboard, go to Settings → Domains to add a custom domain.

## Build Configuration

The project is configured with:
- **Adapter**: `@sveltejs/adapter-vercel`
- **Runtime**: Node.js 20.x
- **Region**: Frankfurt (fra1) - EU data residency
- **Max Duration**: 10 seconds per serverless function
- **Framework**: Auto-detected as SvelteKit

## File Structure

```
/data/
  buchungen.json         # ⚠️ Not persistent on Vercel
  irrelevant-docs.json   # ⚠️ Not persistent on Vercel

/src/lib/
  konto.json            # ✅ Read-only, bundled with app
  buchungen.json        # ⚠️ Not persistent on Vercel (if used)
  
/src/routes/api/       # API endpoints (serverless functions)
```

## Testing Before Deployment

```bash
# Test build locally (Note: May fail on Windows due to symlink permissions)
npm run build

# Preview the production build
npm run preview
```

**Windows Users Note:** The build may fail locally with an `EPERM: operation not permitted, symlink` error. This is a known Windows limitation with the Vercel adapter and does **not** affect deployment to Vercel (which runs on Linux). The app will build and deploy successfully on Vercel's platform.

## Monitoring

After deployment:
1. Check the Vercel deployment logs
2. Monitor function execution times
3. Watch for errors in Vercel dashboard → Logs
4. Test all API endpoints thoroughly

## Troubleshooting

### Issue: Data not persisting
- **Cause**: Vercel's serverless filesystem is ephemeral
- **Solution**: Migrate to Vercel KV, database, or S3 storage (see above)

### Issue: Function timeout
- **Cause**: S3 operations taking too long
- **Solution**: Increase `maxDuration` in `svelte.config.js` (max 60s on Pro plan)

### Issue: Environment variables not working
- **Cause**: Variables not set in Vercel dashboard
- **Solution**: Add all variables for Production, Preview, and Development

### Issue: Build fails
- **Cause**: Missing dependencies or TypeScript errors
- **Solution**: Run `npm run build` locally to debug

## Local Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your AWS credentials

# Run development server
npm run dev
```

## Security Notes

- ✅ Never commit `.env` files to git
- ✅ Rotate AWS credentials periodically
- ✅ Use IAM roles with minimal S3 permissions
- ✅ Enable CORS on S3 bucket for web access
- ✅ Use signed URLs for document access (already implemented)

## Next Steps After Deployment

1. **Migrate to persistent storage** (Vercel KV or Database)
2. Test all document upload/download functionality
3. Verify buchungen CRUD operations work correctly
4. Set up monitoring and alerts
5. Configure custom domain
6. Set up preview deployments for testing

## Support

- Vercel Docs: https://vercel.com/docs
- SvelteKit Docs: https://kit.svelte.dev
- Vercel KV: https://vercel.com/docs/storage/vercel-kv
