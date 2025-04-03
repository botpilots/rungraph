import './style.css'
import p5 from 'p5'
import { GoalGraphRenderer } from './GoalGraphRenderer'
// Removed: import { fetchStravaActivities } from './stravaApi'
import { StartData, GoalData } from './types/common'
import { SummaryActivity } from './types/strava'; // Import needed types

// Main asynchronous function to initialize the application
async function initializeApp() {
	let activities: SummaryActivity[]; // Use the specific type from Strava types
	let start: StartData;
	let goal: GoalData;

	// --- Start and goal configuration ---
	start = {
		date: new Date('2025-03-31'), // Start date
		currentRaceTime: "01:31:00", // Example 10k race time (mm:ss)
	};

	goal = {
		dateOfRace: new Date('2025-05-17'), // Date of goal race
		targetRaceTime: "01:10:00", // Example target 10k race time (mm:ss)
	};
	// --- End start and goal configuration ---

	try {
		console.log("Fetching activity data from static file...");
		// Construct the URL using Vite's base URL environment variable
		// This ensures the correct path in both development (/) and production (/rungraph/)
		const dataUrl = `${import.meta.env.BASE_URL}data/activities.json`;
		console.log(`Attempting to fetch data from: ${dataUrl}`)

		const response = await fetch(dataUrl);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status} while fetching ${dataUrl}`);
		}
		activities = await response.json();
		console.log(`Successfully loaded ${activities.length} activities from ${dataUrl}`);


		// TODO: Determine 'start' and 'goal' properly.
		// Using sample data generation just for start/goal for now:
		// const sampleData = generateSampleData(); // Removed sample data generation
		// start = sampleData.start; // Use static config above
		// goal = sampleData.goal; // Use static config above

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
				renderer = new GoalGraphRenderer(p, start, goal, activities, 'graph-container');
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
                <p>Ensure the file 'data/activities.json' exists and is accessible.</p>
            </div>
        `;
	}
}

// Start the application initialization
initializeApp();
