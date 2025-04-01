import { SummaryActivity } from './types/strava';

// --- Time/Date Helper Functions ---

/** Parses "HH:MM:SS" or "MM:SS" string into total seconds */
export const parseTimeToSeconds = (timeStr: string): number => {
	const parts = timeStr.split(' ')[0].split(':').map(Number); // Handle optional text like " HM"
	if (parts.length === 3) {
		return parts[0] * 3600 + parts[1] * 60 + parts[2];
	} else if (parts.length === 2) {
		return parts[0] * 60 + parts[1];
	}
	console.warn(`Could not parse time: ${timeStr}`);
	return 0;
};

/** Formats total seconds into "HH:MM:SS" */
export const formatSecondsToTime = (totalSeconds: number): string => {
	if (isNaN(totalSeconds) || totalSeconds < 0) return "00:00:00";
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = Math.floor(totalSeconds % 60);
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/** Gets the day name (lowercase) from a Date object */
export const getDayOfWeek = (date: Date): string => {
	const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
	return days[date.getDay()];
};

/** Calculates the start of the week (Monday) for a given date */
export const getStartOfWeek = (d: Date): Date => {
	const date = new Date(d);
	const day = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
	const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
	const monday = new Date(date.setDate(diff));
	monday.setHours(0, 0, 0, 0); // Normalize time
	return monday;
};

/** Checks if date1 is in the week immediately preceding the week of date2 (Mon-Sun weeks) */
export const isDateInPreviousWeek = (date1: Date, date2: Date): boolean => {
	const weekStart1 = getStartOfWeek(date1);
	const weekStart2 = getStartOfWeek(date2);
	// Check if weekStart1 is exactly 7 days before weekStart2
	return weekStart2.getTime() - weekStart1.getTime() === 7 * 24 * 60 * 60 * 1000;
};

/** Checks if two dates fall within the same week (Mon-Sun) */
export const areDatesInSameWeek = (date1: Date, date2: Date): boolean => {
	return getStartOfWeek(date1).getTime() === getStartOfWeek(date2).getTime();
};

// --- Sample Data Generation ---

let activityIdCounter = 0;

/** Generates a sample SummaryActivity object with defaults */
export const generateSampleActivity = (
	overrides: Partial<SummaryActivity> & { start_date_local: string; moving_time: number } // Ensure required fields are passed
): SummaryActivity => {
	activityIdCounter++;
	return {
		id: activityIdCounter,
		name: `Sample Activity ${activityIdCounter}`,
		distance: 10000, // Default distance 10km
		type: 'Run',
		average_heartrate: 150,
		suffer_score: 50,
		...overrides, // Apply overrides, ensuring required fields are present
	};
};

/** Generates sample start, goal, and activities based on the provided image */
export const generateSampleData = (year: number = 2025) => { // Assuming 2025 based on Sunday dates
	const start = {
		currentRaceTime: "01:25:00",
		date: new Date(`${year}-03-30T08:00:00Z`), // Sun 30 March
	};

	const goal = {
		targetRaceTime: "01:10:00",
		dateOfRace: new Date(`${year}-05-17T09:00:00Z`), // Sat 17 May (guessing race day is Sat)
	};

	const activities: SummaryActivity[] = [];

	// Trial Points (Sundays from image)
	const trials = [
		{ date: `${year}-04-06`, time: "01:23:00" }, // Sun 6 April
		{ date: `${year}-04-13`, time: "01:22:00" }, // Sun 13 April
		{ date: `${year}-04-20`, time: "01:21:00" }, // Sun 20 April
		{ date: `${year}-04-27`, time: "01:18:00" }, // Sun 27 April
		{ date: `${year}-05-04`, time: "01:16:00" }, // Sun 4 May
		{ date: `${year}-05-11`, time: "01:13:00" }, // Sun 11 May
	];

	trials.forEach((trial, index) => {
		activities.push(generateSampleActivity({
			name: `Trial Run ${index + 1}`,
			start_date_local: `${trial.date}T08:00:00Z`,
			moving_time: parseTimeToSeconds(trial.time),
			distance: 21097.5, // Assuming HM distance for trials
			type: 'Race', // Maybe mark as race?
		}));
	});

	// Workout Columns (approximated distribution and duration from image)
	const workoutDates = [
		// Week 1 (Mar 31 - Apr 6)
		`${year}-04-01`, `${year}-04-03`, `${year}-04-05`,
		// Week 2 (Apr 7 - Apr 13)
		`${year}-04-08`, `${year}-04-10`, `${year}-04-12`,
		// Week 3 (Apr 14 - Apr 20) - taller bar
		`${year}-04-15`, `${year}-04-17`, `${year}-04-19`, `${year}-04-16`,
		// Week 4 (Apr 21 - Apr 27)
		`${year}-04-22`, `${year}-04-24`, `${year}-04-26`,
		// Week 5 (Apr 28 - May 4)
		`${year}-04-29`, `${year}-05-01`, `${year}-05-03`,
		// Week 6 (May 5 - May 11)
		`${year}-05-06`, `${year}-05-08`, `${year}-05-10`,
		// Week 7 (May 12 - May 18)
		`${year}-05-13`, `${year}-05-15`,
	];

	// Approximate durations based on visual height (relative)
	const workoutDurations = [
		3000, 2800, 3200, // Week 1
		3100, 3300, 2900, // Week 2
		3500, 4500, 3300, 3000, // Week 3 (added one for taller bar)
		3000, 2700, 3400, // Week 4
		3200, 2800, 3600, // Week 5
		3100, 3000, 3300, // Week 6
		2500, 2200 // Week 7 (Taper?)
	];

	workoutDates.forEach((date, index) => {
		activities.push(generateSampleActivity({
			start_date_local: `${date}T18:00:00Z`, // Assume evening workouts
			moving_time: workoutDurations[index % workoutDurations.length] ?? 3000, // Cycle through durations or default
			distance: (workoutDurations[index % workoutDurations.length] ?? 3000) / (5 * 60) * 1000, // Approx distance based on 5 min/km pace
		}));
	});

	// Sort all activities by date just in case
	activities.sort((a, b) => new Date(a.start_date_local).getTime() - new Date(b.start_date_local).getTime());

	return { start, goal, activities };
};