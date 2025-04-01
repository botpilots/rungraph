import './style.css'
import p5 from 'p5'
import { GoalGraphRenderer } from './GoalGraphRenderer'
import { generateSampleData } from './utils'
// Removed: import { fetchStravaActivities } from './stravaApi'
import { StartData, GoalData } from './types/common'
import { SummaryActivity, SportType, ActivityType } from './types/strava'; // Import needed types

// --- Configuration ---
const useLiveData = false; // Default to using mock data for easier local dev
// --- End Configuration ---

// --- Mock Data Definition ---
// Create a few mock activities adhering to the SummaryActivity structure
const mockActivities: SummaryActivity[] = [
	{
		id: 1,
		external_id: "mock-1",
		upload_id: 101,
		athlete: { id: 12345 },
		name: "Morning Mock Run",
		distance: 5035, // meters
		moving_time: 1812, // seconds (30:12)
		elapsed_time: 1850,
		total_elevation_gain: 55,
		elev_high: 100,
		elev_low: 45,
		type: ActivityType.Run, // Deprecated, but use for consistency if needed
		sport_type: SportType.Run,
		start_date: new Date("2024-05-01T07:00:00Z"),
		start_date_local: new Date("2024-05-01T09:00:00"), // Example local time
		timezone: "(GMT+01:00) Europe/London",
		start_latlng: [51.5, -0.1],
		end_latlng: [51.5, -0.12],
		achievement_count: 2,
		kudos_count: 5,
		comment_count: 0,
		athlete_count: 1,
		photo_count: 0,
		total_photo_count: 0,
		map: { id: "map1", polyline: "", summary_polyline: "_p~iF~ps|U_..." }, // Add placeholder polyline
		trainer: false,
		commute: false,
		manual: false,
		private: false,
		flagged: false,
		workout_type: 0, // 0: Default run, 1: Race, 2: Long Run, 3: Workout
		upload_id_str: "101",
		average_speed: 2.77, // m/s
		max_speed: 3.5,
		has_kudoed: false,
		hide_from_home: false,
		gear_id: "g123",
		kilojoules: 0,
		average_watts: 0,
		device_watts: false,
		max_watts: 0,
		weighted_average_watts: 0
	},
	{
		id: 2,
		external_id: "mock-2",
		upload_id: 102,
		athlete: { id: 12345 },
		name: "Lunchtime Walk",
		distance: 2100,
		moving_time: 1500, // seconds (25:00)
		elapsed_time: 1520,
		total_elevation_gain: 15,
		elev_high: 60,
		elev_low: 45,
		type: ActivityType.Walk,
		sport_type: SportType.Walk,
		start_date: new Date("2024-05-03T12:30:00Z"),
		start_date_local: new Date("2024-05-03T13:30:00"),
		timezone: "(GMT+01:00) Europe/London",
		start_latlng: [51.51, -0.11],
		end_latlng: [51.51, -0.1],
		achievement_count: 0,
		kudos_count: 2,
		comment_count: 1,
		athlete_count: 1,
		photo_count: 0,
		total_photo_count: 0,
		map: { id: "map2", polyline: "", summary_polyline: "_p~iF~ps|V_..." },
		trainer: false,
		commute: true,
		manual: false,
		private: false,
		flagged: false,
		workout_type: 0, // Workout type might be null in API, but type expects number. Use 0 for default.
		upload_id_str: "102",
		average_speed: 1.4,
		max_speed: 1.8,
		has_kudoed: true,
		hide_from_home: false,
		gear_id: "", // Gear ID might be null in API, but type expects string. Use "" for none.
		kilojoules: 0,
		average_watts: 0,
		device_watts: false,
		max_watts: 0,
		weighted_average_watts: 0
	},
	// Add more mock activities as needed...
];
// --- End Mock Data ---

// Main asynchronous function to initialize the application
async function initializeApp() {
	let activities: SummaryActivity[]; // Use the specific type from Strava types

	let start: StartData;
	let goal: GoalData;

	try {
		if (useLiveData) {
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
		} else {
			console.log("Using mock activity data.");
			activities = mockActivities;
		}

		// TODO: Determine 'start' and 'goal' properly.
		// Using sample data generation just for start/goal for now:
		const sampleData = generateSampleData();
		start = sampleData.start;
		goal = sampleData.goal;

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
                ${useLiveData
				? "<p>Ensure the file 'data/activities.json' exists and is accessible.</p>"
				: "<p>Error occurred while using mock data.</p>"
			}
            </div>
        `;
	}
}

// Start the application initialization
initializeApp();
