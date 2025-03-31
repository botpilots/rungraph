import './style.css'
import p5 from 'p5'
import { GoalGraphRenderer } from './GoalGraphRenderer'
import { generateSampleData } from './utils'
import { fetchStravaActivities, StravaSummaryActivity } from './stravaApi' // Import the new function and type

// --- Configuration ---
const useLiveData = true; // Switch between test data and live Strava data
// IMPORTANT: Replace with your actual Strava Access Token obtained via OAuth
// You'll need to implement the OAuth flow separately to get this token dynamically.
// See: https://developers.strava.com/docs/authentication/
const STRAVA_ACCESS_TOKEN = '1d5f746520344484ff17e38a2a5fdf11c39f4d33'; // <--- PUT YOUR TOKEN HERE (or manage securely)
const WEEKS_TO_FETCH = 3; // How many weeks of data to fetch for live mode (adjust as needed)
// --- End Configuration ---

// Function to adapt Strava activities to the format expected by GoalGraphRenderer (if needed)
// For now, we assume GoalGraphRenderer expects something similar to StravaSummaryActivity or the sample data structure.
// You might need to adjust this function based on GoalGraphRenderer's requirements.
function adaptStravaData(stravaActivities: StravaSummaryActivity[]): any[] {
	console.log("Adapting Strava data...", stravaActivities);
	// Example adaptation: Ensure date format, potentially calculate required fields
	// This is a placeholder - adjust based on what GoalGraphRenderer needs vs what Strava provides
	return stravaActivities.map(activity => ({
		...activity, // Keep original fields
		date: activity.start_date_local.split('T')[0], // Extract YYYY-MM-DD
		// Add any other transformations needed by GoalGraphRenderer
		// e.g., convert units if necessary
	}));
}


// Main asynchronous function to initialize the application
async function initializeApp() {
	let activities: any[]; // Use 'any[]' for flexibility or a more specific type if defined

	// Update type definitions to match what GoalGraphRenderer expects
	interface StartData {
		currentRaceTime: string;
		date: Date;
	}

	interface GoalData {
		targetRaceTime: string;
		dateOfRace: Date;
	}

	let start: StartData;
	let goal: GoalData;

	try {
		if (useLiveData) {
			if (!STRAVA_ACCESS_TOKEN || STRAVA_ACCESS_TOKEN === 'YOUR_STRAVA_ACCESS_TOKEN_HERE') {
				console.error("Strava Access Token is missing or not replaced. Please add it to main.ts.");
				alert("Strava Access Token is missing. Please configure it in main.ts to use live data.");
				// Fallback to sample data or stop execution
				const sampleData = generateSampleData();
				activities = sampleData.activities;
				start = sampleData.start;
				goal = sampleData.goal;
				console.warn("Falling back to sample data due to missing Strava token.");
			} else {
				console.log("Fetching live data from Strava...");
				const now = new Date();
				const afterTimestamp = Math.floor(now.setDate(now.getDate() - WEEKS_TO_FETCH * 7) / 1000);

				// Fetch activities from the last N weeks
				const rawStravaActivities = await fetchStravaActivities(
					STRAVA_ACCESS_TOKEN,
					undefined, // 'before' timestamp - not needed if fetching recent data
					afterTimestamp, // 'after' timestamp - fetch activities since N weeks ago
					1, // page number
					200 // Fetch up to 200 activities per page (max allowed)
				);
				activities = adaptStravaData(rawStravaActivities);

				// TODO: Determine 'start' and 'goal' based on live data or keep static ones
				// For now, using static start/goal from sample data generation context
				const sampleData = generateSampleData(); // Use this just for start/goal for now
				start = sampleData.start;
				goal = sampleData.goal;
				console.log("Live Strava data fetched and adapted.");
			}
		} else {
			console.log("Using generated sample data.");
			const sampleData = generateSampleData();
			activities = sampleData.activities;
			start = sampleData.start;
			goal = sampleData.goal;
		}

		// --- Initialize p5 Sketch AFTER data is ready ---

		// Clear out any existing content and add containers
		document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
          <div id="info-box"></div>
          <div id="graph-container"></div>
          <div class="view-toggle-container">
            <span>3 Weeks</span>
            <label class="switch">
              <input type="checkbox" id="view-toggle-checkbox" checked>
              <span class="slider round"></span>
            </label>
            <span>Full</span>
          </div>
        `;

		let renderer: GoalGraphRenderer;

		const sketch = (p: p5) => {
			p.setup = () => {
				p.textFont('Arial');
				// Pass the fetched/generated data to the renderer
				renderer = new GoalGraphRenderer(p, start, goal, activities, 'graph-container', 'sunday');
				if (renderer) {
					renderer.windowResized();
				} else {
					console.error("Renderer instantiation failed in setup!");
				}
			};

			p.draw = () => {
				if (renderer) {
					try {
						renderer.draw();
					} catch (e) {
						console.error("Error calling renderer.draw():", e);
						p.noLoop();
					}
				} else {
					// console.warn("Renderer not ready in draw loop"); // Can be noisy
				}
			};

			p.windowResized = () => {
				if (renderer) {
					renderer.windowResized();
				}
			};
			// Mouse events handled by renderer
		};

		// Initialize p5.js
		new p5(sketch);

	} catch (error) {
		console.error("Failed to initialize the application:", error);
		// Display error to the user
		document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
            <div style="color: red; padding: 20px;">
                <h2>Error Initializing Application</h2>
                <p>Could not load activity data. Please check the console for details.</p>
                <pre>${error instanceof Error ? error.message : String(error)}</pre>
                ${useLiveData ? '<p>If using live data, ensure your Strava Access Token is correct and you have an internet connection.</p>' : ''}
            </div>
        `;
	}
}

// Start the application initialization
initializeApp();
