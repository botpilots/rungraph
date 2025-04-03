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