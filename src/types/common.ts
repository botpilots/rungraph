/**
 * Common Type Definitions
 */

export interface StartData {
	currentRaceTime: string; // hh:mm:ss
	date: Date; // YYYY-MM-DD
}

export interface GoalData {
	targetRaceTime: string; // hh:mm:ss
	dateOfRace: Date; // YYYY-MM-DD
}
export interface Project {
	projectTitle: string;
	projectStrategy: string;
	distanceM: number; // in meters
	startData: StartData;
	goalData: GoalData;
	athlete: {
		name: string;
		stravaId: number; // 9-digit number
		weightKg: number;
		heightCm: number;
		gender: 'male' | 'female';
		birthday: string; // YYYY-MM-DD
	};
	fetchActivitiesUrl: string;
	fetchAthleteImageUrl: string;
}
