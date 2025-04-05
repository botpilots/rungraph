# RunGraph

A visualization tool for running activities data, built with Vite, TypeScript, and p5.js.

## Development Setup

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/rungraph.git
   cd rungraph
   ```

2. Install dependencies
   ```bash
   npm install
   ```

4. Start the development server
   ```bash
   npm run dev
   ```


## Automated Strava Data Fetching

This repository includes a GitHub Actions workflow located at `.github/workflows/fetch_strava_data.yml` to automatically fetch your latest Strava activities every 6 hours and commit the data to the `data/activities.json` file. It also logs fetch activity to `data/fetch_log.txt`.

### Setup

To enable this workflow, you need to add the following secrets to your GitHub repository:

1.  Go to your repository on GitHub.
2.  Navigate to `Settings` > `Secrets and variables` > `Actions`.
3.  Click `New repository secret` for each of the following:
    *   `STRAVA_CLIENT_ID`: Your Strava application's Client ID.
    *   `STRAVA_CLIENT_SECRET`: Your Strava application's Client Secret.
    *   `STRAVA_REFRESH_TOKEN`: Your Strava Refresh Token (obtained initially as described below).

**Obtaining Your Initial Refresh Token (Using Helper Script):**

The workflow requires a long-lived `refresh_token` to operate. You need to perform the initial Strava OAuth2 authorization flow *once* manually to get this token.

1.  **Authorization:**
    *   Construct and visit an authorization URL like this in your browser (replace `YOUR_CLIENT_ID` and ensure `redirect_uri` matches your Strava app configuration - `http://localhost` is usually fine for this manual step):
      ```
      https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost&response_type=code&approval_prompt=auto&scope=activity:read
      ```
    *   Log in to Strava (if needed) and click "Authorize".
    *   Your browser will be redirected to your `redirect_uri` (e.g., `http://localhost/?state=&code=YOUR_CODE_HERE&scope=read,activity:read`). Copy the value of the `code` parameter from the URL in your browser's address bar.

2.  **Exchange Code using Script:**
    *  Run this curl with your values, AUTHORIZATIONCODE is the code you copied from the browser.
      ```bash
        curl -X POST https://www.strava.com/oauth/token \
        -F client_id=YOURCLIENTID \
        -F client_secret=YOURCLIENTSECRET \
        -F code=AUTHORIZATIONCODE \
        -F grant_type=authorization_code
      ```

3.  **Update GitHub Secret:**
    *   Copy the new `refresh_token` and `access_token` values sent back in the response.
    *   Go back to your GitHub repository secrets (`Settings` > `Secrets and variables` > `Actions`) and paste these values into the `STRAVA_REFRESH_TOKEN` and `STRAVA_ACCESS_TOKEN` secrets.

**Important Note on Refresh Token Lifespan:**
Strava refresh tokens are long-lived and don't have a fixed expiration date like the 6-hour access tokens. However, a refresh token **will become invalid** if:
*   A new refresh token is issued during a token refresh request (the GitHub Actions workflow *might* receive a new one but currently doesn't automatically update the secret).
*   You manually revoke the application's access in your Strava settings.

If the workflow starts failing with authorization errors, you may need to repeat the manual authorization flow to get at new valid refresh token and update the GitHub secret.

Once the secrets are configured correctly, the workflow will run automatically on its schedule or can be triggered manually.

## Data Fetching

This project fetches data from another repository `strava-data-fetcher` which uses a GitHub Actions workflow to fetch data from Strava and commit it to a `data/activities.json` file. For more information see that repository's README.

## Deployment

1.  **`deploy.yml`:**
    *   **Trigger:** Runs automatically whenever changes are pushed to the `master` branch.
    *   **Purpose:** Builds the Vite/p5.js frontend application (`npm run build`) and deploys the resulting static files (from the `./dist` directory) to GitHub Pages.

## Configuration

- The Vite configuration in `vite.config.js` includes the base path for GitHub Pages deployment (`/rungraph/`)
- Environment variables used in the client-side application must be prefixed with `VITE_` (defined in `.env`).
- Access environment variables in code using: `import.meta.env.VITE_VARIABLE_NAME` (not recommended for sensitive data)