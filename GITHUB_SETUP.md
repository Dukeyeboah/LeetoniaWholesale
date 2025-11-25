# GitHub Setup Instructions

This guide will help you push your Leetonia Wholesale project to GitHub.

## Step 1: Create a GitHub Repository

1. Go to [GitHub](https://github.com) and sign in
2. Click the "+" icon in the top right corner
3. Select "New repository"
4. Name it: `LeetoniaWholesale` (or your preferred name)
5. Choose **Private** (recommended for business projects)
6. **DO NOT** initialize with README, .gitignore, or license (we already have these)
7. Click "Create repository"

## Step 2: Connect Local Repository to GitHub

After creating the repository on GitHub, you'll see instructions. Run these commands in your terminal:

```bash
cd /Users/duke/Documents/GitHub/LeetoniaWholesale

# Add the remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/LeetoniaWholesale.git

# Or if you prefer SSH:
# git remote add origin git@github.com:YOUR_USERNAME/LeetoniaWholesale.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 3: Verify

Visit your repository on GitHub to confirm all files are uploaded.

## Step 4: Set Up Environment Variables (Optional)

If you want to use Firebase in production:

1. Go to your GitHub repository
2. Click **Settings** > **Secrets and variables** > **Actions** (for CI/CD) or use **Settings** > **Secrets** for deployment platforms
3. Add your Firebase environment variables as secrets

For local development, create a `.env.local` file (this is already in .gitignore):

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

## Future Commits

After the initial setup, you can commit and push changes normally:

```bash
git add .
git commit -m "Your commit message"
git push
```

