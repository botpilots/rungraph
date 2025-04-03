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

1.  **Prerequisites:**
    *   Ensure you have created the `.secrets` file in the repository root with your `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET`.
    *   Ensure the `.env` file exists in the repository root (it needs the `VITE_STRAVA_ACCESS_TOKEN=` line).
    *   Install `jq` (a command-line JSON processor): `brew install jq` (macOS) or `sudo apt-get install jq` (Debian/Ubuntu).
    *   Make the helper script executable: `chmod +x scripts/exchange_strava_code.sh`

2.  **Authorization Flow:**
    *   Construct and visit an authorization URL like this in your browser (replace `YOUR_CLIENT_ID` and ensure `redirect_uri` matches your Strava app configuration - `http://localhost` is usually fine for this manual step):
      ```
      https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost&response_type=code&approval_prompt=auto&scope=activity:read
      ```
    *   Log in to Strava (if needed) and click "Authorize".
    *   Your browser will be redirected to your `redirect_uri` (e.g., `http://localhost/?state=&code=YOUR_CODE_HERE&scope=read,activity:read`). Copy the value of the `code` parameter from the URL in your browser's address bar.

3.  **Exchange Code using Script:**
    *   Run the helper script from your repository root in the terminal, passing the copied code as an argument:
      ```bash
      ./scripts/exchange_strava_code.sh COPIED_CODE_HERE
      ```
      (Replace `COPIED_CODE_HERE` with the actual code).
    *   The script will perform the token exchange with Strava, then automatically update `VITE_STRAVA_ACCESS_TOKEN` in your `.env` file and `STRAVA_REFRESH_TOKEN` in your `.secrets` file.

4.  **Update GitHub Secret:**
    *   Copy the new `refresh_token` value printed by the script (or from the updated `.secrets` file).
    *   Go back to your GitHub repository secrets (`Settings` > `Secrets and variables` > `Actions`) and paste this value into the `STRAVA_REFRESH_TOKEN` secret.

**Important Note on Refresh Token Lifespan:**
Strava refresh tokens are long-lived and don't have a fixed expiration date like the 6-hour access tokens. However, a refresh token **will become invalid** if:
*   A new refresh token is issued during a token refresh request (the GitHub Actions workflow *might* receive a new one but currently doesn't automatically update the secret).
*   You manually revoke the application's access in your Strava settings.

If the workflow starts failing with authorization errors, you may need to repeat the manual authorization flow using the helper script (Steps 2-4 above) to get a new valid refresh token and update the GitHub secret.

Once the secrets are configured correctly, the workflow will run automatically on its schedule or can be triggered manually.

### Local Development and Testing (Workflow Simulation)

You can test the `fetch_strava_data.yml` workflow locally before committing changes using a tool like [`act`](https://github.com/nektos/act). This simulates how the workflow would run on GitHub Actions runners using Docker.

1.  **Install `act`:** Follow the installation instructions on the [`act` repository](https://github.com/nektos/act#installation). You also need Docker installed and running.
2.  **Ensure `.secrets` File is Ready:** Make sure your `.secrets` file exists in the repository root and contains valid `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `STRAVA_REFRESH_TOKEN` (you can populate the refresh token using the helper script described above).
3.  **Run the Workflow:** Execute `act` from the root of your repository. To specifically run the fetch job and provide the secrets:
    ```bash
    act -j fetch --secret-file .secrets
    ```
    `act` will download the necessary Docker image and execute the steps. Check the output for success or errors. Note that `act` simulates the workflow run but does *not* perform the actual push to your GitHub repository.
4.  **Limitations:** The local environment simulated by `act` might not be identical to the GitHub Actions environment. Always verify the final workflow behavior on GitHub Actions.

## Workflow Interaction: Data Fetching and Deployment

This project utilizes two separate GitHub Actions workflows found in `.github/workflows/`:

1.  **`fetch_strava_data.yml` (Data Fetching):**
    *   **Trigger:** Runs on a schedule (e.g., every 6 hours) and can be manually triggered.
    *   **Purpose:** Uses your Strava API credentials (via GitHub Secrets) to fetch recent activities.
    *   **Output:** Commits the fetched activity data directly into the repository as `data/activities.json`. It also maintains a log (`data/fetch_log.txt`) and checksum file (`data/last_checksum.txt`).

2.  **`deploy.yml` (Application Deployment):**
    *   **Trigger:** Runs automatically whenever changes are pushed to the `main` branch.
    *   **Purpose:** Builds the Vite/p5.js frontend application (`npm run build`) and deploys the resulting static files (from the `./dist` directory) to GitHub Pages.
    *   **Data Usage:** When this workflow runs, it builds the application using the code and data files *currently present* in the `main` branch. This includes the `data/activities.json` file that was previously committed by the `fetch_strava_data.yml` workflow.

**How they work together:**

The data fetching workflow ensures the `data/activities.json` file in your repository is kept up-to-date with recent Strava activities. When you push code changes (or when the data fetch workflow pushes data updates) to the `main` branch, the deployment workflow rebuilds and redeploys your frontend application. The deployed application should be configured to simply read the static `data/activities.json` file included in its build, rather than making live calls to the Strava API itself.
ð
## Configuration

- The Vite configuration in `vite.config.js` includes the base path for GitHub Pages deployment (`/rungraph/`)
- Environment variables used in the client-side application must be prefixed with `VITE_` (defined in `.env`).
- Access environment variables in code using: `import.meta.env.VITE_VARIABLE_NAME` (not recommended for sensitive data)