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

## Data Fetching

This project fetches data from another repository `strava-data-fetcher` which uses a GitHub Actions workflow to fetch data from Strava and commit it to a `data/activities.json` file. 

For more information see [strava-data-fetcher](https://github.com/botpilots/strava-data-fetcher).

## Deployment

1.  **`deploy.yml`:**
    *   **Trigger:** Runs automatically whenever changes are pushed to the `master` branch.
    *   **Purpose:** Builds the Vite/p5.js frontend application (`npm run build`) and deploys the resulting static files (from the `./dist` directory) to GitHub Pages.

## Configuration

- The Vite configuration in `vite.config.js` includes the base path for GitHub Pages deployment (`/rungraph/`)
- Environment variables used in the client-side application must be prefixed with `VITE_` (defined in `.env`).
- Access environment variables in code using: `import.meta.env.VITE_VARIABLE_NAME` (not recommended for sensitive data)