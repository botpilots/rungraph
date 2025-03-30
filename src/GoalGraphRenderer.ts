import p5 from 'p5';
import { StravaActivity } from './types/strava';
import {
	parseTimeToSeconds,
	formatSecondsToTime,
	getDayOfWeek,
	getStartOfWeek,
	isDateInPreviousWeek,
	areDatesInSameWeek
} from './utils'; // Import helpers

// --- Data Interfaces (adapted from React component) ---

interface Point {
	x: number;
	y: number;
	date: Date;
	timeSeconds: number;
	displayTime: string;
	type: 'start' | 'trial' | 'goal';
	activity?: StravaActivity; // Link back to original activity for trials
}

interface WorkoutColumn {
	x: number;
	y: number;
	width: number;
	height: number;
	activity: StravaActivity;
	date: Date;
}

// --- Renderer Class ---

export class GoalGraphRenderer {
	private p: p5;
	private startData: { currentRaceTime: string; date: Date };
	private goalData: { targetRaceTime: string; dateOfRace: Date };
	private activities: StravaActivity[];
	private trialDay: string;

	// Canvas and layout properties
	private canvasWidth = 800;
	private canvasHeight = 500;
	private padding = { top: 50, right: 20, bottom: 120, left: 20 };
	private graphWidth = this.canvasWidth - this.padding.left - this.padding.right;
	private graphHeight = this.canvasHeight - this.padding.top - this.padding.bottom;

	// Data structures for drawing
	private points: Point[] = [];
	private workoutColumns: WorkoutColumn[] = [];
	private yMin = 0;
	private yMax = 1;
	private maxDuration = 1; // Max duration for workout columns

	// Interaction state
	private sliderX: number | null = null;
	private hoveredPoint: Point | null = null;
	private hoveredColumn: WorkoutColumn | null = null;
	private isDraggingSlider = false;
	private readonly pointSize = 10;
	private readonly knobWidth = this.pointSize * 1.5;
	private readonly knobHeight = this.pointSize * 1.2;
	private sliderTrackY = this.canvasHeight - this.padding.bottom;

	// Reference to the HTML element for the info box
	private infoBoxElement: HTMLElement | null = null;
	// Reference to the parent container element
	private parentElement: HTMLElement | null = null;

	constructor(
		p: p5,
		start: { currentRaceTime: string; date: Date },
		goal: { targetRaceTime: string; dateOfRace: Date },
		activities: StravaActivity[],
		parentContainerId: string, // Added parent container ID
		trialDay: string = 'sunday' // Match image data
	) {
		this.p = p;
		this.startData = start;
		this.goalData = goal;
		this.activities = activities;
		this.trialDay = trialDay.toLowerCase();
		this.parentElement = document.getElementById(parentContainerId);

		if (!this.parentElement) {
			throw new Error(`Parent container with ID '${parentContainerId}' not found.`);
		}

		// --- Initialize dimensions and create canvas ---
		// Use parent dimensions, fall back to defaults/window if needed
		this.canvasWidth = Math.min(this.parentElement.clientWidth || this.p.windowWidth - 20, 800);
		this.canvasHeight = this.parentElement.clientHeight || 500; // Use parent height

		// Create canvas and attach to parent
		const canvas = this.p.createCanvas(this.canvasWidth, this.canvasHeight);
		canvas.parent(this.parentElement);

		// --- Calculate graph dimensions based on dynamic canvas size ---
		this.graphWidth = this.canvasWidth - this.padding.left - this.padding.right;
		this.graphHeight = this.canvasHeight - this.padding.top - this.padding.bottom;
		this.sliderTrackY = this.canvasHeight - this.padding.bottom;

		this.processData();
		this.setupMouseInteraction();
	}

	// --- Data Processing (adapted from React component) ---
	private processData(): void {
		this.points = [];
		this.workoutColumns = [];
		const p = this.p; // Use class p5 instance

		const startDate = this.startData.date;
		const goalDate = this.goalData.dateOfRace;
		const totalTimeSpan = Math.max(1, goalDate.getTime() - startDate.getTime());

		// Add start point
		const startTimeSeconds = parseTimeToSeconds(this.startData.currentRaceTime);
		this.points.push({
			x: 0, y: 0, date: startDate, timeSeconds: startTimeSeconds,
			displayTime: formatSecondsToTime(startTimeSeconds), type: 'start',
		});

		// Add goal point
		const goalTimeSeconds = parseTimeToSeconds(this.goalData.targetRaceTime);
		this.points.push({
			x: 0, y: 0, date: goalDate, timeSeconds: goalTimeSeconds,
			displayTime: this.goalData.targetRaceTime, // Keep original format e.g., "01:10:00 HM"
			type: 'goal',
		});

		// Process activities
		this.activities.forEach(activity => {
			const activityDate = new Date(activity.start_date_local);
			if (activityDate < startDate || activityDate > goalDate) return; // Skip activities outside range

			const activityDay = getDayOfWeek(activityDate);
			const isValidTime = typeof activity.moving_time === 'number' && activity.moving_time > 0;

			// Identify Trials: Match trialDay OR check if activity type indicates a race/trial
			// Using `trialDay` matches the original logic, but `type: 'Race'` from sample data could also work
			const isTrial = activityDay === this.trialDay || activity.type?.toLowerCase() === 'race';


			if (isTrial && isValidTime) {
				// Use moving_time for the trial point's time
				this.points.push({
					x: 0, y: 0, date: activityDate, timeSeconds: activity.moving_time,
					displayTime: formatSecondsToTime(activity.moving_time), type: 'trial',
					activity: activity,
				});
			} else if (isValidTime) {
				// Regular workout column
				this.workoutColumns.push({
					x: 0, y: 0, width: 5, height: 0, // Mapped later
					activity: activity, date: activityDate,
				});
			}
		});

		// Sort points by date for drawing lines correctly
		this.points.sort((a, b) => a.date.getTime() - b.date.getTime());

		// Find min/max race times for Y-axis scaling
		const allTimes = this.points.map(p => p.timeSeconds).filter(t => !isNaN(t));
		if (allTimes.length > 0) {
			const minYValue = Math.min(...allTimes);
			const maxYValue = Math.max(...allTimes);
			const yBuffer = Math.max((maxYValue - minYValue) * 0.1, 30); // Ensure buffer is not tiny (30s)
			this.yMin = Math.max(0, minYValue - yBuffer);
			this.yMax = maxYValue + yBuffer;
		} else {
			// Default scaling if no valid points
			this.yMin = 0;
			this.yMax = parseTimeToSeconds("02:00:00"); // Default max Y
		}

		// Find max workout duration for column height scaling
		this.maxDuration = Math.max(1, ...this.workoutColumns.map(col => col.activity.moving_time)); // Avoid max of empty array or zero
		const columnAreaHeight = this.padding.bottom * 0.5; // Area at bottom for columns

		// --- Map data to canvas coordinates ---
		this.points.forEach(point => {
			const timeRatio = totalTimeSpan > 0 ? (point.date.getTime() - startDate.getTime()) / totalTimeSpan : 0;
			point.x = this.padding.left + timeRatio * this.graphWidth;
			point.y = this.padding.top + this.graphHeight - p.map(point.timeSeconds, this.yMin, this.yMax, 0, this.graphHeight);
		});

		this.workoutColumns.forEach(col => {
			const timeRatio = totalTimeSpan > 0 ? (col.date.getTime() - startDate.getTime()) / totalTimeSpan : 0;
			col.x = this.padding.left + timeRatio * this.graphWidth - col.width / 2;
			// Scale height relative to maxDuration within the allocated column area
			const colHeight = p.map(col.activity.moving_time, 0, this.maxDuration, 0, columnAreaHeight);
			col.height = Math.max(1, colHeight); // Ensure minimum visible height
			// Position columns starting from the bottom edge upwards
			col.y = this.canvasHeight - this.padding.bottom - col.height;
		});

		// Initialize sliderX if needed (set to start position)
		if (this.sliderX === null) {
			this.sliderX = this.padding.left;
		}
	}

	// --- p5 Drawing Logic (called in draw loop) ---
	public draw(): void {
		const p = this.p;
		p.background(255);
		this.hoveredPoint = null; // Reset hover states each frame
		this.hoveredColumn = null;

		this.drawXAxis();
		this.drawWorkoutColumns(); // Draw columns first (behind lines/points)
		this.drawConnectingLines();
		this.drawPoints();
		this.drawVerticalIndicator();
		this.drawSliderControl();
		// Note: Hover detection is now implicitly handled within draw methods based on sliderX
		this.drawInfoBox();
	}

	// --- Drawing Helper Functions (adapted from React component) ---

	private drawXAxis(): void {
		const p = this.p;
		p.textAlign(p.CENTER, p.TOP);
		p.textSize(10);
		p.fill(100); // Axis label color

		// Combine start, goal, and unique trial dates for labels
		const labelPoints = [
			this.points.find(pt => pt.type === 'start'),
			...this.points.filter(pt => pt.type === 'trial'),
			this.points.find(pt => pt.type === 'goal')
		].filter(pt => pt !== undefined) as Point[]; // Filter out undefined if start/goal missing

		// Use a Map to ensure only one label per day (preferring goal/trial over start if overlapping)
		const uniqueDateLabels = new Map<string, Point>();
		labelPoints.forEach(point => {
			const dateKey = point.date.toLocaleDateString(); // Simple date string key
			const existing = uniqueDateLabels.get(dateKey);
			// Add if not present, or if current point is goal/trial and existing is not, or if current point is goal
			if (!existing || (point.type !== 'start' && existing.type === 'start') || point.type === 'goal') {
				uniqueDateLabels.set(dateKey, point);
			}
		});


		uniqueDateLabels.forEach(point => {
			// Format like "Sun 30 Mar"
			const dateLabel = `${point.date.toLocaleString('en-US', { weekday: 'short' })} ${point.date.getDate()} ${point.date.toLocaleString('en-US', { month: 'short' })}`;
			p.push(); // Isolate transformations
			p.translate(point.x, this.canvasHeight - this.padding.bottom + 15); // Position below axis
			p.rotate(p.radians(45)); // Angle labels for readability
			p.textAlign(p.LEFT, p.BOTTOM); // Align rotated text origin

			// Color code labels based on type for emphasis
			let labelColor = '#ff7f0e'; // Default orange (trial)
			if (point.type === 'start') labelColor = '#2ca02c'; // Green
			else if (point.type === 'goal') labelColor = '#d62728'; // Red
			p.fill(labelColor);

			p.text(dateLabel, 5, 0); // Offset slightly from tick
			p.pop(); // Restore previous drawing state

			// Draw Tick mark on the x-axis line
			p.stroke(200); // Light grey for ticks
			p.strokeWeight(1);
			p.line(point.x, this.canvasHeight - this.padding.bottom, point.x, this.canvasHeight - this.padding.bottom + 5); // Small tick line
		});

		// Draw the actual X-axis line
		p.stroke(150); // Slightly darker axis line
		p.strokeWeight(1);
		p.line(this.padding.left, this.canvasHeight - this.padding.bottom, this.canvasWidth - this.padding.right, this.canvasHeight - this.padding.bottom);
	}


	private drawWorkoutColumns(): void {
		const p = this.p;
		p.strokeWeight(0.8); // Slightly thicker border for columns
		this.workoutColumns.forEach(col => {
			const baseColor = p.color(173, 216, 230, 200); // Light blue base with some transparency
			const hoverColor = p.color(100, 150, 230, 240); // Darker blue on hover

			// Check hover: if sliderX is within the column's horizontal bounds
			const isHovered = this.sliderX !== null &&
				this.sliderX >= col.x &&
				this.sliderX <= col.x + col.width;

			p.fill(isHovered ? hoverColor : baseColor);
			p.stroke(isHovered ? p.color(60, 100, 180) : p.color(100, 150, 200)); // Darker border on hover

			p.rect(col.x, col.y, col.width, col.height, 1); // Slightly rounded corners for columns

			if (isHovered) {
				this.hoveredColumn = col; // Set hover state if slider is over it
			}
		});
	}

	private drawConnectingLines(): void {
		const p = this.p;
		p.strokeWeight(1.5);
		for (let i = 0; i < this.points.length - 1; i++) {
			const currentPoint = this.points[i];
			const nextPoint = this.points[i + 1];

			let shouldDraw = true;
			let useDashedLine = false;

			// Special handling for the line connecting to the goal
			if (nextPoint.type === 'goal') {
				const lastActivityDate = currentPoint.date;
				const goalDate = nextPoint.date;

				// Draw dashed line ONLY if last point is same week or previous week
				if (areDatesInSameWeek(lastActivityDate, goalDate) || isDateInPreviousWeek(lastActivityDate, goalDate)) {
					useDashedLine = true;
				} else {
					// If the gap is larger, don't draw the line to avoid misleading extrapolation
					shouldDraw = false;
				}
			}

			if (shouldDraw) {
				p.stroke(80); // Dark grey for lines
				if (useDashedLine) {
					p.push();
					p.drawingContext.setLineDash([5, 5]); // Dashed line style
					p.line(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y);
					p.drawingContext.setLineDash([]); // Reset to solid
					p.pop();
				} else {
					p.line(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y);
				}
			}
		}
	}


	private drawPoints(): void {
		const p = this.p;
		this.points.forEach(point => {
			let pointColor: p5.Color;
			// Using d3 category10 colors for consistency if needed elsewhere
			if (point.type === 'start') pointColor = p.color('#2ca02c');       // Green
			else if (point.type === 'goal') pointColor = p.color('#d62728');    // Red
			else pointColor = p.color('#1f77b4');       // Blue

			// Check hover based on slider position
			const hoverRadius = this.pointSize / 2 + 3; // Slightly larger hover radius for slider collision
			const isHovered = this.sliderX !== null && Math.abs(this.sliderX - point.x) < hoverRadius;

			p.push(); // Isolate styles for each point
			if (isHovered) {
				pointColor.setAlpha(255); // Fully opaque
				p.stroke(0); // Black outline on hover
				p.strokeWeight(2);
				this.hoveredPoint = point; // Set hover state
			} else {
				pointColor.setAlpha(210); // Slight transparency otherwise
				p.noStroke();
			}

			p.fill(pointColor);
			p.ellipse(point.x, point.y, this.pointSize, this.pointSize);
			p.pop(); // Restore styles

			// --- Draw time label next to the point ---
			p.noStroke(); // Ensure text has no stroke
			p.fill(pointColor); // Use point color for its label for association
			p.textSize(9);
			p.textAlign(p.LEFT, p.CENTER);

			// Extract just the time part (HH:MM:SS) if extra text exists
			const timeLabel = point.displayTime.match(/^(\d{2}:\d{2}:\d{2})/)?.[1] || point.displayTime;

			// Position text slightly to the right and vertically centered with the point
			p.text(timeLabel, point.x + this.pointSize * 0.8, point.y);
		});
	}


	private drawVerticalIndicator(): void {
		if (this.sliderX === null) return;
		const p = this.p;
		p.stroke(120, 120, 120, 180); // Slightly darker, semi-transparent grey
		p.strokeWeight(1);
		p.drawingContext.setLineDash([4, 4]); // Dashed line style
		// Extend from top margin to bottom margin (where graph area is)
		p.line(this.sliderX, this.padding.top, this.sliderX, this.canvasHeight - this.padding.bottom);
		p.drawingContext.setLineDash([]); // Reset to solid lines
	}

	private drawSliderControl(): void {
		if (this.sliderX === null) return;
		const p = this.p;

		const trackXStart = this.padding.left;
		const trackXEnd = this.canvasWidth - this.padding.right;
		const trackY = this.sliderTrackY; // Use the pre-calculated y position

		// --- Draw the rectangular knob ---
		const sliderKnobY = trackY - this.knobHeight / 2; // Center knob vertically on track line
		p.push(); // Isolate knob styles
		if (this.isDraggingSlider) {
			p.fill(200); // Slightly darker when dragging
			p.stroke(50); // Darker border when dragging
			p.strokeWeight(1.5);
		} else {
			p.fill(230); // Lighter gray knob
			p.stroke(100); // Subtle border when not dragging
			p.strokeWeight(1);
		}
		// Draw the knob rectangle
		p.rect(this.sliderX - this.knobWidth / 2, sliderKnobY, this.knobWidth, this.knobHeight, 3); // Rounded corners

		// --- Draw three vertical grab lines inside the knob ---
		p.stroke(this.isDraggingSlider ? 50 : 100); // Match border color
		p.strokeWeight(1);
		const lineSpacing = this.knobWidth / 4;
		const lineHeightRatio = 0.6; // Lines are 60% of knob height
		const lineYStart = sliderKnobY + this.knobHeight * (1 - lineHeightRatio) / 2;
		const lineYEnd = sliderKnobY + this.knobHeight * (1 + lineHeightRatio) / 2;
		for (let i = 1; i <= 3; i++) {
			const lineX = this.sliderX - this.knobWidth / 2 + i * lineSpacing;
			p.line(lineX, lineYStart, lineX, lineYEnd);
		}
		p.pop(); // Restore styles
	}

	private drawInfoBox(): void {
		// Get the info box element from the DOM if we haven't already
		if (!this.infoBoxElement) {
			this.infoBoxElement = document.getElementById('info-box');
		}
		// If the element doesn't exist in the DOM, we can't proceed
		if (!this.infoBoxElement) {
			console.error('Info box element #info-box not found!');
			return;
		}

		const p = this.p;
		let infoText: string[] = [];

		if (this.hoveredPoint) {
			// --- Populate infoText for hovered point --- 
			infoText.push(`<strong>${this.hoveredPoint.type.charAt(0).toUpperCase() + this.hoveredPoint.type.slice(1)} Point</strong>`);
			infoText.push(`Date: ${this.hoveredPoint.date.toLocaleDateString('en-CA')}`);
			infoText.push(`Time: ${this.hoveredPoint.displayTime}`);

			if (this.hoveredPoint.activity) {
				infoText.push(`Activity: ${this.hoveredPoint.activity.name}`);
				if (typeof this.hoveredPoint.activity.distance === 'number') {
					infoText.push(`Distance: ${(this.hoveredPoint.activity.distance / 1000).toFixed(1)} km`);
				}
			} else if (this.hoveredPoint.type === 'start') {
				infoText.push(`Starting Time`);
			} else if (this.hoveredPoint.type === 'goal') {
				infoText.push(`Target Time`);
			}

			if (this.hoveredPoint.type === 'trial' && this.hoveredPoint.activity) {
				infoText.push('');
				infoText.push('<strong>Week Summary:</strong>');
				const weekStart = getStartOfWeek(this.hoveredPoint.date);
				const weekEnd = new Date(weekStart);
				weekEnd.setDate(weekStart.getDate() + 7);

				let weeklyDistance = 0;
				let weeklyTime = 0;
				let weekActivityCount = 0;

				this.activities.forEach(act => {
					const actDate = new Date(act.start_date_local);
					if (actDate >= weekStart && actDate < weekEnd) {
						weekActivityCount++;
						weeklyDistance += act.distance || 0;
						weeklyTime += act.moving_time || 0;
					}
				});

				infoText.push(`Activities: ${weekActivityCount}`);
				infoText.push(`Distance: ${(weeklyDistance / 1000).toFixed(1)} km`);
				infoText.push(`Duration: ${formatSecondsToTime(weeklyTime)}`);
			}

		} else if (this.hoveredColumn) {
			// --- Populate infoText for hovered column --- 
			const activity = this.hoveredColumn.activity;
			infoText.push(`<strong>Workout: ${activity.name}</strong>`);
			infoText.push(`Date: ${new Date(activity.start_date_local).toLocaleDateString('en-CA')}`);
			infoText.push(`Dist: ${(activity.distance / 1000).toFixed(2)} km`);
			infoText.push(`Time: ${formatSecondsToTime(activity.moving_time)}`);

			const paceSecondsPerKm = activity.distance > 0 ? (activity.moving_time / (activity.distance / 1000)) : 0;
			if (paceSecondsPerKm > 0) {
				const paceMinutes = Math.floor(paceSecondsPerKm / 60);
				const paceSeconds = Math.floor(paceSecondsPerKm % 60);
				infoText.push(`Pace: ${paceMinutes}:${String(paceSeconds).padStart(2, '0')} /km`);
			} else {
				infoText.push(`Pace: N/A`);
			}

			if (activity.average_heartrate) {
				infoText.push(`Avg HR: ${activity.average_heartrate.toFixed(0)} bpm`);
			}
			if (activity.suffer_score) {
				infoText.push(`Suffer Score: ${activity.suffer_score}`);
			}

		} else {
			// --- Default text when nothing is hovered --- 
			infoText.push("Move the slider over points or workout bars to see details.");
		}

		// --- Update the HTML info box element --- 
		// Generate HTML, allowing tags like <strong> and <hr>
		const infoHTML = infoText.map(line =>
			line === ''
				? '<hr>' // Use standard hr tag, styled by CSS
				: `<p>${line}</p>` // Wrap each line in a paragraph tag, allow inner HTML like <strong>
		).join('');
		this.infoBoxElement.innerHTML = infoHTML;
		// No longer need to set display style, it's always visible via CSS
		// this.infoBoxElement.style.display = 'block'; 
		// this.infoBoxElement.style.display = 'none'; 

		// REMOVE p5 drawing code for the info box background and text
	}


	// --- Setup Mouse Interaction Listeners ---
	private setupMouseInteraction(): void {
		const p = this.p;

		// Assign p5.js mouse event handlers directly to methods of this class instance
		// Need to bind `this` to ensure the methods are called in the context of the object
		p.mousePressed = this.handleMousePressed.bind(this);
		p.mouseDragged = this.handleMouseDragged.bind(this);
		p.mouseReleased = this.handleMouseReleased.bind(this);
	}

	// --- Mouse Event Handlers ---
	private handleMousePressed(): void {
		if (this.sliderX === null) return;
		const p = this.p;

		// Check if the mouse press occurred *on the slider knob*
		const sliderKnobY = this.sliderTrackY - this.knobHeight / 2;
		const knobLeft = this.sliderX - this.knobWidth / 2;
		const knobRight = this.sliderX + this.knobWidth / 2;
		const knobTop = sliderKnobY;
		const knobBottom = sliderKnobY + this.knobHeight;

		if (
			p.mouseX >= knobLeft && p.mouseX <= knobRight &&
			p.mouseY >= knobTop && p.mouseY <= knobBottom
		) {
			this.isDraggingSlider = true;
		}
		// Allow clicking anywhere on the track to jump the slider (optional behavior)
		/* else if (p.mouseY >= this.sliderTrackY - 10 && p.mouseY <= this.sliderTrackY + 10 &&
				  p.mouseX >= this.padding.left && p.mouseX <= this.canvasWidth - this.padding.right) {
			this.sliderX = p.constrain(p.mouseX, this.padding.left, this.canvasWidth - this.padding.right);
			this.isDraggingSlider = true; // Allow dragging immediately after jumping
		} */
	}

	private handleMouseDragged(): void {
		if (this.isDraggingSlider && this.sliderX !== null) {
			const p = this.p;
			// Constrain slider movement within the graph's horizontal bounds
			this.sliderX = p.constrain(p.mouseX, this.padding.left, this.canvasWidth - this.padding.right);
		}
	}

	private handleMouseReleased(): void {
		if (this.isDraggingSlider) {
			this.isDraggingSlider = false;
		}
	}

	// --- Handle Window Resizing ---
	public windowResized(): void {
		const p = this.p;
		if (!this.parentElement) return; // Should not happen if constructor succeeded

		// --- Recalculate canvas size based on parent container ---
		this.canvasWidth = Math.min(this.parentElement.clientWidth || this.p.windowWidth - 20, 800);
		this.canvasHeight = this.parentElement.clientHeight || 500; // Use parent height
		p.resizeCanvas(this.canvasWidth, this.canvasHeight);

		// --- Recalculate graph dimensions dependent on new canvas size ---
		this.graphWidth = this.canvasWidth - this.padding.left - this.padding.right;
		this.graphHeight = this.canvasHeight - this.padding.top - this.padding.bottom;
		this.sliderTrackY = this.canvasHeight - this.padding.bottom; // Update slider track y-position

		// Store the current slider position ratio before reprocessing data
		const currentGraphWidth = this.canvasWidth - this.padding.left - this.padding.right;
		const sliderRatio = this.sliderX !== null && currentGraphWidth > 0
			? (this.sliderX - this.padding.left) / currentGraphWidth
			: 0;


		// Re-process data to recalculate coordinates based on new dimensions
		this.processData();

		// Restore the slider position based on the ratio and NEW graphWidth
		// Ensure graphWidth is positive before calculating slider position
		const newGraphWidth = this.canvasWidth - this.padding.left - this.padding.right;
		if (newGraphWidth > 0) {
			this.sliderX = this.padding.left + sliderRatio * newGraphWidth;
		} else {
			this.sliderX = this.padding.left; // Default to start if width is zero/negative
		}
	}

} // End GoalGraphRenderer Class
