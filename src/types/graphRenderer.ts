import { SummaryActivity } from './strava';

/**
 * Graph Renderer Type Definitions
 */

export interface Point {
	originalX: number; // Calculated during processData based on full timescale
	currentX: number; // Calculated in draw loop based on originalX and viewOffsetX
	y: number;
	date: Date;
	timeSeconds: number;
	displayTime: string;
	type: 'start' | 'trial' | 'goal'; // NOTE: Used as a type discriminator.
	activity?: SummaryActivity;
}

export interface WorkoutColumn {
	originalX: number; // Calculated during processData based on full timescale (left edge)
	currentX: number; // Calculated in draw loop based on originalX and viewOffsetX
	y: number;
	width: number;
	height: number; // NOTE: Used as a type discriminator.
	activity: SummaryActivity;
	date: Date;
}

// Added WeekMarker Interface
export interface WeekMarker {
	originalX: number; // Calculated during processData based on full timescale
	currentX: number; // Calculated in draw loop based on originalX and viewOffsetX
	date: Date;
	weekNumber: number; // NOTE: Used as a type discriminator.
}
