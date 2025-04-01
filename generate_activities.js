import fs from 'fs';
import path from 'path';

// --- Configuration ---
const startDate = new Date('2025-03-31T00:00:00Z');
const endDate = new Date('2025-05-17T23:59:59Z');
const outputFilePath = path.join('data', 'activities.json');
const athleteId = 135151962; // Use the same athlete ID as in activities.json
const gearId = "g19030882"; // Use a gear ID, e.g., from existing data

// --- Helper Functions ---

// Get a random integer between min (inclusive) and max (inclusive)
function getRandomInt(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Get a random float between min (inclusive) and max (exclusive)
function getRandomFloat(min, max) {
	return Math.random() * (max - min) + min;
}

// Add days to a date
function addDays(date, days) {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

// Format date to ISO string (YYYY-MM-DDTHH:mm:ssZ)
function formatDateISO(date) {
	return date.toISOString();
}

// Format date to local string (e.g., "2025-03-31T18:31:09Z") - simplified
function formatDateLocal(date) {
	// This is a simplified local date representation. Strava's format is more complex.
	// Assuming GMT+2 for Stockholm summer based on timezone string "(GMT+01:00) Europe/Stockholm" which uses DST.
	// Be mindful that DST start/end dates vary. For simplicity, we assume +2 offset.
	const localDate = new Date(date.getTime() + 2 * 60 * 60 * 1000); // Apply +2 hour offset
	return localDate.toISOString().replace(/\.\d{3}Z$/, 'Z'); // Format as YYYY-MM-DDTHH:mm:ssZ
}

// Generate a unique ID (simple timestamp-based for this example)
function generateId() {
	// Using high-resolution time and random number for better uniqueness chance
	const time = process.hrtime.bigint(); // Nanoseconds
	return Number(time / 1000n) + Math.floor(Math.random() * 1000); // Microseconds + random offset
}

// --- Main Logic ---

const activities = [];
let currentDate = new Date(startDate);
let activityIdCounter = generateId(); // Start with a base ID

while (currentDate <= endDate) {
	const weekStartDate = new Date(currentDate); // Keep track of the start of the week
	const weekEndDate = addDays(currentDate, 6);
	const activitiesThisWeek = getRandomInt(3, 7); // Generate 3 to 7 activities per week
	const raceDayOffset = getRandomInt(0, 6); // Day of the week for the race (0=Monday, 6=Sunday)
	const raceDate = addDays(currentDate, raceDayOffset);
	let raceGeneratedThisWeek = false; // Track if the race for this week was generated

	console.log(`Generating for week starting: ${weekStartDate.toISOString().slice(0, 10)} to ${weekEndDate.toISOString().slice(0, 10)} (Race on day ${raceDayOffset})`);


	for (let i = 0; i < activitiesThisWeek; i++) {
		// Pick a random day within the current week
		const activityDateBase = addDays(weekStartDate, getRandomInt(0, 6));

		// Ensure activity date doesn't exceed the overall end date
		if (activityDateBase > endDate) continue;

		// Clone the date to avoid modifying the base date
		const activityDate = new Date(activityDateBase);

		// Add random time to the activity date
		activityDate.setUTCHours(getRandomInt(6, 20)); // Activities between 6 AM and 8 PM UTC
		activityDate.setUTCMinutes(getRandomInt(0, 59));
		activityDate.setUTCSeconds(getRandomInt(0, 59));


		const isRaceDay = activityDate.toDateString() === raceDate.toDateString();
		const isTheActualRace = isRaceDay && !raceGeneratedThisWeek;

		// Determine workout type: 1 for the first race encounter this week, 0 otherwise
		const workoutType = isTheActualRace ? 1 : 0;

		if (isTheActualRace) {
			raceGeneratedThisWeek = true; // Mark race as generated for this week
			console.log(`  -> Generated RACE activity for ${activityDate.toISOString().slice(0, 10)}`);
		} else if (isRaceDay) {
			console.log(`  -> Generated non-race activity for race day ${activityDate.toISOString().slice(0, 10)}`);
		}

		// Generate plausible run data
		const distance = workoutType === 1
			? getRandomFloat(10000, 21100) // Race distance (10k to half-marathon)
			: getRandomFloat(3000, 15000); // Training distance (3k to 15k)
		const averageSpeed = workoutType === 1
			? getRandomFloat(3.8, 4.5) // Faster average speed for races (m/s)
			: getRandomFloat(2.8, 4.0); // Normal average speed for training (m/s)
		const movingTime = Math.round(distance / averageSpeed); // seconds
		const elapsedTime = movingTime + getRandomInt(5, 120); // Add some stopped time
		const totalElevationGain = getRandomFloat(10, 150);

		const activityName = workoutType === 1
			? `Race Day! - ${activityDate.toLocaleDateString('sv-SE')}` // Use Swedish locale for date
			: `${['Morning', 'Lunch', 'Afternoon', 'Evening'][getRandomInt(0, 3)]} Run`;


		const activity = {
			resource_state: 2,
			athlete: { id: athleteId, resource_state: 1 },
			name: activityName,
			distance: parseFloat(distance.toFixed(1)),
			moving_time: movingTime,
			elapsed_time: elapsedTime,
			total_elevation_gain: parseFloat(totalElevationGain.toFixed(1)),
			type: "Run",
			sport_type: "Run",
			workout_type: workoutType,
			id: activityIdCounter++,
			start_date: formatDateISO(activityDate),
			start_date_local: formatDateLocal(activityDate), // Use refined local date function
			timezone: "(GMT+01:00) Europe/Stockholm", // Assuming Stockholm
			utc_offset: 7200.0, // Assuming +2 offset for summer DST
			location_city: null,
			location_state: null,
			location_country: null,
			achievement_count: getRandomInt(0, 15),
			kudos_count: getRandomInt(0, 5),
			comment_count: getRandomInt(0, 2),
			athlete_count: 1,
			photo_count: 0,
			map: { // Basic map structure, polyline omitted for simplicity
				id: `a${activityIdCounter - 1}`, // Match ID
				summary_polyline: "", // Omitted
				resource_state: 2
			},
			trainer: false,
			commute: false,
			manual: false,
			private: false,
			visibility: "everyone",
			flagged: false,
			gear_id: gearId,
			start_latlng: [], // Omitted
			end_latlng: [], // Omitted
			average_speed: parseFloat(averageSpeed.toFixed(3)),
			max_speed: parseFloat((averageSpeed * getRandomFloat(1.2, 1.8)).toFixed(3)), // Guess max speed
			has_heartrate: false, // Assuming no heartrate data
			heartrate_opt_out: false,
			display_hide_heartrate_option: false,
			elev_high: parseFloat((totalElevationGain + getRandomFloat(5, 20)).toFixed(1)), // Guess elev high
			elev_low: parseFloat(getRandomFloat(1, 5).toFixed(1)), // Guess elev low
			upload_id: null, // Not applicable for generated data
			upload_id_str: null,
			external_id: null,
			from_accepted_tag: false,
			pr_count: workoutType === 1 ? getRandomInt(1, 5) : getRandomInt(0, 3), // More PRs in races
			total_photo_count: 0,
			has_kudoed: false
		};

		// Add the activity (no need for duplicate time check anymore as time is randomized)
		activities.push(activity);

	}
	// Move to the next week
	currentDate = addDays(weekStartDate, 7); // Move based on the actual start of the processed week
}

// Sort activities by date
activities.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

// Ensure the data directory exists
const outputDir = path.dirname(outputFilePath);
if (!fs.existsSync(outputDir)) {
	console.log(`Creating directory: ${outputDir}`);
	fs.mkdirSync(outputDir, { recursive: true });
}

// Write the data to the JSON file
try {
	fs.writeFileSync(outputFilePath, JSON.stringify(activities, null, 2));
	console.log(`Successfully generated ${activities.length} activities in ${outputFilePath}`);
} catch (err) {
	console.error(`Error writing file ${outputFilePath}:`, err);
} 