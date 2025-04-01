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
	type: 'start' | 'trial' | 'goal';
	activity?: SummaryActivity;
}

export interface WorkoutColumn {
	originalX: number; // Calculated during processData based on full timescale (left edge)
	currentX: number; // Calculated in draw loop based on originalX and viewOffsetX
	y: number;
	width: number;
	height: number;
	activity: SummaryActivity;
	date: Date;
} 