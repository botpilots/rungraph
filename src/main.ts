import './style.css'
import p5 from 'p5'
import { GoalGraphRenderer } from './GoalGraphRenderer'
// Removed: import { fetchStravaActivities } from './stravaApi'
import { StartData, GoalData } from './types/common'
import { SummaryActivity } from './types/strava'; // Import needed types
import projectConfig from '../project.config.json'

// Main asynchronous function to initialize the application
async function initializeApp() {
	let activities: SummaryActivity[] = [];

	// Validate and convert dates from strings to Date objects
	const startData: StartData = {
		currentRaceTime: projectConfig.startData.currentRaceTime,
		date: new Date(projectConfig.startData.date)
	};

	const goalData: GoalData = {
		targetRaceTime: projectConfig.goalData.targetRaceTime,
		dateOfRace: new Date(projectConfig.goalData.dateOfRace)
	};

	// Validate time strings
	const validateTimeString = (timeStr: string): boolean => {
		return /^(\d{2}):(\d{2}):(\d{2})$/.test(timeStr);
	};

	if (!validateTimeString(startData.currentRaceTime)) {
		console.error(`Invalid time format for startData.currentRaceTime: ${startData.currentRaceTime}`);
	}

	if (!validateTimeString(goalData.targetRaceTime)) {
		console.error(`Invalid time format for goalData.targetRaceTime: ${goalData.targetRaceTime}`);
	}

	try {
		// Fetch activities from the URL in config
		console.log("Fetching activity data from configured URL...");
		const fetchUrl = projectConfig.fetchActivitiesUrl;

		// If the URL is a placeholder, fallback to local data
		if (fetchUrl === "localMode") {
			console.log("Using local activities data as fallback...");
			const dataUrl = `${import.meta.env.BASE_URL}data/activities.json`;
			console.log(`Attempting to fetch data from: ${dataUrl}`);

			const response = await fetch(dataUrl);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status} while fetching ${dataUrl}`);
			}
			activities = await response.json();
		} else {
			// Use the configured URL
			const response = await fetch(fetchUrl);
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status} while fetching ${fetchUrl}`);
			}
			activities = await response.json();
		}

		console.log(`Successfully loaded ${activities.length} activities`);

		// --- Initialize app with title and info button ---

		// Clear out any existing content and add containers
		document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
			<div id="title">${projectConfig.projectTitle}</div>
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
			<div id="info-button">Info</div>
			<div id="info-overlay">
				<div class="info-content">
					<h1>${projectConfig.projectTitle}</h1>
					${projectConfig.projectDesc.split('\n').map(paragraph => `<p>${paragraph}</p>`).join('')}
					<p>Regards,<br>${projectConfig.athlete.name}</p>
					<p><i>For information about the athlete <a href="${projectConfig.athlete.blogUrl}" target="_blank">click here.</a></i></p>
					<button id="close-info">Close</button>
				</div>
			</div>
		`;

		// Set up info button toggle functionality
		document.getElementById('info-button')?.addEventListener('click', () => {
			document.getElementById('info-overlay')!.style.display = 'block';
		});

		document.getElementById('close-info')?.addEventListener('click', () => {
			document.getElementById('info-overlay')!.style.display = 'none';
		});

		let renderer: GoalGraphRenderer;

		const sketch = (p: p5) => {
			p.setup = () => {
				p.textFont('Arial');
				// Pass the validated data to the renderer
				renderer = new GoalGraphRenderer(p, startData, goalData, activities, 'graph-container');
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
				}
			};

			p.windowResized = () => {
				if (renderer) {
					renderer.windowResized();
				}
			};
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
				<p>Make sure the data source is properly configured.</p>
			</div>
		`;
	}
}

// Start the application initialization
initializeApp();
