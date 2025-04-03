import p5 from 'p5';
import { SummaryActivity } from './types/strava';
import { Point, WorkoutColumn, WeekMarker } from './types/graphRenderer';
import {
	parseTimeToSeconds,
	formatSecondsToTime,
	getDayOfWeek,
	getStartOfWeek,
	isDateInPreviousWeek,
	areDatesInSameWeek
} from './utils'; // Import helpers

// --- Renderer Class ---

export class GoalGraphRenderer {
	private p: p5;
	private startData: { currentRaceTime: string; date: Date };
	private goalData: { targetRaceTime: string; dateOfRace: Date };
	private activities: SummaryActivity[];
	private trialDay: string;

	// Week configuration
	private weekStartDay: number = 1; // Default: Monday (0=Sun, 1=Mon, ..., 6=Sat)

	// Canvas and layout properties
	private canvasWidth = 800;
	private canvasHeight = 500;
	private padding = { top: 50, right: 10, bottom: 120, left: 10 }; // Restored right padding
	private graphWidth = 0; // Visible graph area width
	private graphHeight = 0; // Visible graph area height

	// Font sizes
	private axisLabelFontSize = 11;
	private pointLabelFontSize = 15;

	// Data structures
	private points: Point[] = [];
	private workoutColumns: WorkoutColumn[] = [];
	private weekMarkers: { date: Date; originalX: number; currentX: number; weekNumber: number }[] = []; // Added for Monday markers
	private dayMarkers: { date: Date; originalX: number; currentX: number; dayName: string }[] = []; // Added for weekday markers (Tue-Sun)
	private yMin = 0;
	private yMax = 1;
	private maxDuration = 1;

	// Content boundaries based on data
	private contentMinX = 0;
	private contentMaxX = 0;

	// Interaction state
	private sliderX: number | null = null; // Slider position relative to visible canvas
	private hoveredItems: (Point | WorkoutColumn | WeekMarker)[] = [];
	private isDraggingSlider = false;
	private readonly pointSize = 10;
	private readonly knobWidth = this.pointSize * 1.6;
	private readonly knobHeight = this.pointSize * 2.0;
	private sliderTrackY = 0;

	// Horizontal Scroll / Pan / Zoom State
	private viewMode: '3weeks' | 'full' = 'full';
	private viewOffsetX = 0;
	private totalGraphContentWidth = 0;
	private isDraggingGraph = false;
	private dragStartX = 0;
	private dragStartOffsetX = 0;
	private readonly threeWeeksInMillis = 3 * 7 * 24 * 60 * 60 * 1000;

	// Wiggle Animation State
	private lastWiggleTime = 0;
	private isWiggling = true;
	private wiggleStartTime = 0;
	private readonly wiggleInterval = 8000; // 10 seconds
	private readonly wiggleDuration = 500; // 0.5 seconds
	private readonly wiggleAmplitude = 2; // pixels
	private readonly wiggleCycles = 4; // Number of back-and-forth cycles per animation

	// HTML Element References
	private infoBoxElement: HTMLElement | null = null;
	private parentElement: HTMLElement | null = null;
	private viewToggleCheckbox: HTMLInputElement | null = null;

	constructor(
		p: p5,
		start: { currentRaceTime: string; date: Date },
		goal: { targetRaceTime: string; dateOfRace: Date },
		activities: SummaryActivity[],
		parentContainerId: string,
		trialDay: string = 'sunday',
		weekStartDay: number = 1 // Default: Monday
	) {
		this.p = p;
		this.startData = start;
		this.goalData = goal;
		this.activities = activities;
		this.trialDay = trialDay.toLowerCase();
		this.weekStartDay = weekStartDay;
		this.parentElement = document.getElementById(parentContainerId);
		this.viewToggleCheckbox = document.getElementById('view-toggle-checkbox') as HTMLInputElement;

		if (!this.parentElement) {
			throw new Error(`Parent container with ID '${parentContainerId}' not found.`);
		}
		if (!this.viewToggleCheckbox) {
			console.warn(`View toggle checkbox with ID 'view-toggle-checkbox' not found.`);
		} else {
			this.viewToggleCheckbox.checked = this.viewMode === 'full';
			this.viewToggleCheckbox.addEventListener('change', this.handleViewToggleChange.bind(this));
		}

		this.updateDimensionsAndCanvas();
		this.setupMouseInteraction();
		this.lastWiggleTime = this.p.millis(); // Initialize wiggle timer
	}

	// --- Helper for Initial Setup & Resize ---
	private updateDimensionsAndCanvas(isResize = false): void {
		if (!this.parentElement) return;
		const p = this.p;

		const oldGraphWidth = this.graphWidth;
		const oldPaddingLeft = this.padding.left;

		// Update canvas dimensions based *directly* on parent container size
		this.canvasWidth = Math.max(50, this.parentElement.clientWidth); // Removed max 800 limit and fallback
		this.canvasHeight = Math.max(50, this.parentElement.clientHeight); // Removed fallback

		// Recalculate graph drawing area - Account for both left and right padding
		this.graphWidth = Math.max(1, this.canvasWidth - this.padding.left - this.padding.right);
		this.graphHeight = Math.max(1, this.canvasHeight - this.padding.top - this.padding.bottom);
		this.sliderTrackY = this.canvasHeight - this.padding.bottom;

		if (isResize) {
			p.resizeCanvas(this.canvasWidth, this.canvasHeight);
		} else {
			const canvas = p.createCanvas(this.canvasWidth, this.canvasHeight);
			canvas.parent(this.parentElement);
		}

		let sliderRatio = 0;
		if (isResize && this.sliderX !== null) {
			sliderRatio = oldGraphWidth > 0 ? (this.sliderX - oldPaddingLeft) / oldGraphWidth : 0;
		}

		// Re-process data which calculates totalGraphContentWidth and originalX/Y
		this.processData();

		// Restore slider position
		if (isResize) {
			this.sliderX = this.padding.left + sliderRatio * this.graphWidth;
			this.sliderX = p.constrain(this.sliderX, this.padding.left, this.canvasWidth - this.padding.right);
		} else {
			this.sliderX = this.padding.left; // Initial position
		}
		// Adjust offset if resize makes it invalid
		this.constrainViewOffset();
	}

	// --- View Mode Change Handler ---
	private handleViewToggleChange(): void {
		if (!this.viewToggleCheckbox) return;
		this.setViewMode(this.viewToggleCheckbox.checked ? 'full' : '3weeks');
	}

	private setViewMode(mode: '3weeks' | 'full'): void {
		if (this.viewMode === mode) return;
		this.viewMode = mode;
		this.viewOffsetX = 0; // Reset scroll on mode change
		if (this.viewToggleCheckbox) {
			this.viewToggleCheckbox.checked = mode === 'full';
		}
		this.processData();
		this.sliderX = this.padding.left; // Reset slider
		this.constrainViewOffset();
	}

	private constrainViewOffset(): void {
		// Calculate maximum offset based on content width and padding
		const maxOffsetX = Math.max(0, this.contentMaxX - (this.canvasWidth - this.padding.right));
		// Calculate minimum offset based on content start and padding
		const minOffsetX = Math.max(0, this.contentMinX - this.padding.left);
		// Calculate the currently needed total width within the view
		const visibleContentWidth = this.contentMaxX - this.contentMinX;

		let targetOffsetX = this.viewOffsetX;

		// If the total content is narrower than the available graph area, center it.
		if (visibleContentWidth < this.graphWidth) {
			targetOffsetX = this.contentMinX - this.padding.left - (this.graphWidth - visibleContentWidth) / 2;
		} else {
			// Otherwise, constrain within calculated min/max
			targetOffsetX = Math.max(minOffsetX, Math.min(targetOffsetX, maxOffsetX));
		}

		this.viewOffsetX = Math.max(0, targetOffsetX); // Ensure offset is never negative
	}

	// --- Data Processing ---
	private processData(): void {
		this.points = [];
		this.workoutColumns = [];
		this.weekMarkers = []; // Clear week markers
		this.dayMarkers = []; // Clear day markers
		const p = this.p;

		const startDate = this.startData.date;
		const goalDate = this.goalData.dateOfRace;
		const fullTimeSpan = Math.max(1, goalDate.getTime() - startDate.getTime());

		let effectiveTimeSpan: number;
		if (this.viewMode === '3weeks') {
			const threeWeeksBeforeGoal = goalDate.getTime() - this.threeWeeksInMillis;
			// Start date for 3 week view is either the actual start date or 3 weeks before goal, whichever is later
			const effectiveStartTime = Math.max(startDate.getTime(), threeWeeksBeforeGoal);
			effectiveTimeSpan = Math.max(1, goalDate.getTime() - effectiveStartTime);
		} else {
			effectiveTimeSpan = fullTimeSpan;
		}

		// Calculate total content width based on scaling
		if (this.graphWidth > 0 && effectiveTimeSpan > 0) {
			this.totalGraphContentWidth = (fullTimeSpan / effectiveTimeSpan) * this.graphWidth;
		} else {
			this.totalGraphContentWidth = this.graphWidth;
		}

		// Calculate width of a single day in pixels
		const millisecondsPerDay = 24 * 60 * 60 * 1000;
		const dayWidth = (millisecondsPerDay / fullTimeSpan) * this.totalGraphContentWidth;
		const halfDayWidth = dayWidth / 2; // Calculate half day width for centering points

		// --- Add points/columns, calculate originalX relative to total width ---
		const mapTimeToX = (date: Date): number => {
			const timeRatioInFullSpan = fullTimeSpan > 0 ? (date.getTime() - startDate.getTime()) / fullTimeSpan : 0;
			return this.padding.left + timeRatioInFullSpan * this.totalGraphContentWidth;
		};

		const startTimeSeconds = parseTimeToSeconds(this.startData.currentRaceTime);
		// Calculate start point position based on start of day + half day width
		const startOfDayStartDate = new Date(startDate);
		startOfDayStartDate.setHours(0, 0, 0, 0);
		this.points.push({
			originalX: mapTimeToX(startOfDayStartDate) + halfDayWidth, // Use start of day + half width
			currentX: 0, y: 0, date: startDate, timeSeconds: startTimeSeconds,
			displayTime: formatSecondsToTime(startTimeSeconds), type: 'start',
		});

		const goalTimeSeconds = parseTimeToSeconds(this.goalData.targetRaceTime);
		// Calculate goal point position based on start of day + half day width
		const startOfDayGoalDate = new Date(goalDate);
		startOfDayGoalDate.setHours(0, 0, 0, 0);
		this.points.push({
			originalX: mapTimeToX(startOfDayGoalDate) + halfDayWidth, // Use start of day + half width
			currentX: 0, y: 0, date: goalDate, timeSeconds: goalTimeSeconds,
			displayTime: this.goalData.targetRaceTime, type: 'goal',
		});

		// --- Generate Week Markers (Mondays) ---
		const startDateMs = startDate.getTime();
		const goalDateMs = goalDate.getTime();
		const startDayOfWeek = startDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

		// Calculate days until the next week start day 
		// If the start date is already on the week start day, this will be 0 if we want the same day,
		// or 7 if we want to skip to the next week
		let daysToNextWeekStart;
		if (startDayOfWeek === this.weekStartDay) {
			// Start date is already on week start day, so set to 0 to include it, or 7 to skip to next week
			daysToNextWeekStart = 0; // Include current day as first week start
		} else if (startDayOfWeek < this.weekStartDay) {
			// Start date is before week start day in the same week
			daysToNextWeekStart = this.weekStartDay - startDayOfWeek;
		} else {
			// Start date is after week start day, so go to next week
			daysToNextWeekStart = 7 - (startDayOfWeek - this.weekStartDay);
		}

		let currentWeekStart = new Date(startDate);
		if (daysToNextWeekStart > 0) {
			currentWeekStart.setDate(startDate.getDate() + daysToNextWeekStart);
		}
		currentWeekStart.setHours(0, 0, 0, 0); // Normalize to start of day

		let firstWeekStartChecked = false;
		const startWeekBeginning = getStartOfWeek(startDate); // Assumes getStartOfWeek exists and works
		let displayedWeekCounter = 2; // Initialize counter for displayed week numbers

		while (currentWeekStart.getTime() <= goalDateMs) {
			const currentWeekStartMs = currentWeekStart.getTime();

			// Check 3-day condition for the *first* potential week marker
			if (!firstWeekStartChecked) {
				firstWeekStartChecked = true;
				const daysDiff = (currentWeekStartMs - startDateMs) / (1000 * 60 * 60 * 24);
				if (daysDiff < 3) {
					// Skip this first week start if it's too close to the start date
					currentWeekStart.setDate(currentWeekStart.getDate() + 7); // Move to next week
					continue;
				}
			}

			// Add the marker using the sequential counter
			this.weekMarkers.push({
				date: new Date(currentWeekStart), // Store a copy
				originalX: mapTimeToX(currentWeekStart), // Map week start date
				currentX: 0, // Will be updated in draw loop
				weekNumber: displayedWeekCounter, // Assign sequential number starting from 2
			});

			displayedWeekCounter++; // Increment for the next marker

			// Move to the next week start day
			currentWeekStart.setDate(currentWeekStart.getDate() + 7);
		}

		// --- Generate Day Markers (Tuesday through Sunday) - only in 3-week view ---
		if (this.viewMode === '3weeks') {
			// Create a full array of weekday names for reference
			const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

			// Generate an ordered array of day names starting from our configured week start day
			const orderedDayNames = [];
			for (let i = 0; i < 7; i++) {
				const dayIndex = (this.weekStartDay + i) % 7;
				orderedDayNames.push(fullDayNames[dayIndex]);
			}

			// --- Add markers for the initial partial week ---
			const firstWeekMarkerDate = this.weekMarkers.length > 0 ? this.weekMarkers[0].date : goalDate;
			let currentDay = new Date(startDate);
			currentDay.setDate(startDate.getDate() + 1); // Start from the day AFTER the start date
			currentDay.setHours(0, 0, 0, 0);

			while (currentDay.getTime() < firstWeekMarkerDate.getTime() && currentDay.getTime() <= goalDateMs) {
				const dayIndex = currentDay.getDay();
				this.dayMarkers.push({
					date: new Date(currentDay),
					originalX: mapTimeToX(currentDay),
					currentX: 0,
					dayName: fullDayNames[dayIndex] // Use the standard day name
				});
				currentDay.setDate(currentDay.getDate() + 1);
			}

			// --- Add markers for the full weeks based on weekMarkers ---
			const weekStartDates = this.weekMarkers.map(marker => new Date(marker.date));
			// Get the names of the days excluding the week start day itself
			const weekdayNames = orderedDayNames.slice(1);

			// For each week start date, create markers for the remaining 6 days of the week
			weekStartDates.forEach(weekStart => {
				for (let i = 1; i <= 6; i++) { // 1 through 6 days after week start
					const dayDate = new Date(weekStart);
					dayDate.setDate(weekStart.getDate() + i);

					// Skip if the day is outside our date range
					if (dayDate.getTime() > goalDateMs) continue;

					// Add a marker for this day
					this.dayMarkers.push({
						date: dayDate,
						originalX: mapTimeToX(dayDate),
						currentX: 0, // Will be calculated in draw loop
						dayName: weekdayNames[i - 1] // Get appropriate day name from the ordered list
					});
				}
			});
		}

		// --- Process Activities ---
		this.activities.forEach(activity => {
			const activityDate = new Date(activity.start_date_local);
			if (activityDate < startDate || activityDate > goalDate) return;

			const isValidTime = typeof activity.moving_time === 'number' && activity.moving_time > 0;

			// If not valid time, skip and give a console warning.
			if (!isValidTime) {
				console.warn(`Invalid time for activity ${activity.name} on ${activityDate}`);
				return;
			}

			const isTrial = activity.workout_type === 1;

			// Calculate position based on the START of the day for columns and points.
			const startOfDayDate = new Date(activityDate);
			startOfDayDate.setHours(0, 0, 0, 0); // Set to beginning of the day
			const columnStartX = mapTimeToX(startOfDayDate); // Get X position for 00:00:00

			// Display points for trials only.
			if (isTrial) {
				this.points.push({
					originalX: columnStartX + halfDayWidth, // Use column start X + half day width
					currentX: 0, y: 0, date: activityDate, timeSeconds: activity.moving_time,
					displayTime: formatSecondsToTime(activity.moving_time), type: 'trial',
					activity: activity,
				});
			}

			// Display columns for all activities, including trials.
			this.workoutColumns.push({
				originalX: columnStartX, // Use the calculated start-of-day X
				currentX: 0, y: 0, width: dayWidth, height: 0,
				activity: activity, date: activityDate,
			});
		});

		this.points.sort((a, b) => a.date.getTime() - b.date.getTime());

		// --- Y-Axis Scaling ---
		const allTimes = this.points.map(p => p.timeSeconds).filter(t => !isNaN(t));
		if (allTimes.length > 0) {
			const minYValue = Math.min(...allTimes);
			const maxYValue = Math.max(...allTimes);
			const yBuffer = Math.max((maxYValue - minYValue) * 0.1, 30);
			this.yMin = Math.max(0, minYValue - yBuffer);
			this.yMax = maxYValue + yBuffer;
		} else {
			this.yMin = 0; this.yMax = parseTimeToSeconds("02:00:00");
		}
		this.maxDuration = Math.max(1, ...this.workoutColumns.map(col => col.activity.moving_time));

		// --- Map Y Coordinates and Heights ---
		const columnAreaHeight = this.padding.bottom * 0.5;
		const pointsMappingHeight = this.graphHeight * 0.9; // Use 90% of graphHeight for points

		this.points.forEach(point => {
			// Map points within the top 90% of the graphHeight area
			point.y = this.padding.top + p.map(point.timeSeconds, this.yMin, this.yMax, pointsMappingHeight, 0);
		});
		this.workoutColumns.forEach(col => {
			// Keep column height calculation relative to bottom padding area
			const colHeight = p.map(col.activity.moving_time, 0, this.maxDuration, 0, columnAreaHeight);
			col.height = Math.max(1, colHeight);
			// Keep column Y position relative to the bottom padding line
			col.y = this.canvasHeight - this.padding.bottom - col.height;
		});

		this.constrainViewOffset(); // Ensure offset is valid after data processing

		// Calculate actual content horizontal boundaries after processing all points
		if (this.points.length > 0) {
			this.contentMinX = this.points.reduce((min, p) => Math.min(min, p.originalX), this.points[0].originalX);
			this.contentMaxX = this.points.reduce((max, p) => Math.max(max, p.originalX), this.points[0].originalX);
		} else {
			// Default if no points
			this.contentMinX = this.padding.left;
			this.contentMaxX = this.canvasWidth - this.padding.right;
		}
	}

	// --- p5 Drawing Logic ---
	public draw(): void {
		const p = this.p;
		p.background(255);

		// Only reset hover states if we're not currently dragging the graph
		if (!this.isDraggingGraph) {
			this.hoveredItems = [];
		}

		// Calculate current X positions based on offset
		this.points.forEach(pt => pt.currentX = pt.originalX - this.viewOffsetX);
		this.workoutColumns.forEach(col => col.currentX = col.originalX - this.viewOffsetX);
		this.weekMarkers.forEach(wm => wm.currentX = wm.originalX - this.viewOffsetX); // Update week marker currentX
		this.dayMarkers.forEach(dm => dm.currentX = dm.originalX - this.viewOffsetX); // Update day marker currentX

		// Define visible boundaries for drawing/clipping
		const visibleLeft = this.padding.left;
		const visibleRight = this.canvasWidth - this.padding.right;
		const drawBuffer = 50; // Pixels outside visible area to still consider

		// Draw elements, passing boundaries
		this.drawXAxis(visibleLeft, visibleRight, drawBuffer);
		this.drawWorkoutColumns(visibleLeft, visibleRight, drawBuffer);
		this.drawConnectingLines(visibleLeft, visibleRight, drawBuffer);
		this.drawPoints(visibleLeft, visibleRight, drawBuffer);
		this.drawVerticalIndicator();
		this.drawSliderControl();
		this.drawInfoBox();
		this.drawLegend();
	}

	// --- Drawing Helper Functions ---

	private drawXAxis(visibleLeft: number, visibleRight: number, buffer: number): void {
		const p = this.p;
		const axisY = this.canvasHeight - this.padding.bottom;
		const labelOffsetY = 12; // Vertical offset for start/end labels
		const connectingLineLength = 10; // Length of the small line connecting tilted labels
		let tiltedLabelOffsetX = -5; // Horizontal offset for tilted labels
		let tiltedLabelOffsetY = 15; // Vertical offset specifically for tilted labels
		const markerHoverRadius = 5; // Interaction radius for week markers

		p.fill(150); // Use gray for all text labels
		p.stroke(150); // Use gray for lines
		p.strokeWeight(1); // Thin lines
		p.textSize(this.axisLabelFontSize * 0.9); // Slightly smaller font for dates

		// Calculate slider position in content coordinates only once
		const sliderContentX = this.sliderX !== null ? this.sliderX + this.viewOffsetX : -Infinity;

		// Find the very first and very last points for special vertical labeling
		const firstPoint = this.points[0];
		const lastPoint = this.points[this.points.length - 1];

		// --- Pre-calculate hovered status for items --- 
		const hoveredItemsSet = new Set(this.hoveredItems);

		// --- Draw Start and Goal Labels (check if hovered) ---
		[firstPoint, lastPoint].forEach(point => {
			if (!point) return;
			const drawX = point.currentX;
			if (drawX < visibleLeft - buffer || drawX > visibleRight + buffer) return;

			const isHovered = hoveredItemsSet.has(point);
			const dateStr = point.date.toISOString().split('T')[0];

			p.push();
			p.translate(drawX, axisY + labelOffsetY);
			p.rotate(p.radians(-90));
			p.textAlign(p.RIGHT, p.CENTER);
			p.noStroke();
			p.fill(isHovered ? 50 : 150); // Darker if hovered
			p.text(dateStr, 0, 0);
			p.pop();
			p.stroke(isHovered ? 100 : 200); p.strokeWeight(isHovered ? 1.5 : 1);
			p.line(drawX, axisY, drawX, axisY + 5);
		});

		// --- Draw Monday Week Marker Labels (check if hovered) ---
		this.weekMarkers.forEach(marker => {
			const drawX = marker.currentX;
			if (drawX < visibleLeft - buffer || drawX > visibleRight + buffer) return;

			// Check hover status from the pre-calculated set
			const isHovered = hoveredItemsSet.has(marker);
			// Add to hoveredItems during check phase (if slider active)
			if (this.sliderX !== null && !this.isDraggingGraph && Math.abs(sliderContentX - marker.originalX) < markerHoverRadius) {
				if (!isHovered) { // Avoid duplicates if already added
					this.hoveredItems.push(marker);
				}
			}

			let labelText = `Week ${marker.weekNumber}`;
			tiltedLabelOffsetX = -5; // Reset offsets for standard view
			tiltedLabelOffsetY = 15;

			if (this.viewMode === '3weeks') {
				tiltedLabelOffsetX = -15;
				tiltedLabelOffsetY = 30;
				const weekStartDateStr = marker.date.toISOString().split('T')[0];
				labelText = `Week ${marker.weekNumber}\n${weekStartDateStr}`;
			}

			// Draw connecting line based on hover status
			p.stroke(isHovered ? 100 : 180);
			p.strokeWeight(isHovered ? 1.5 : 1);
			p.line(drawX, axisY, drawX, axisY + connectingLineLength);

			// Draw tilted text based on hover status
			p.push();
			p.translate(drawX, axisY + connectingLineLength + tiltedLabelOffsetY);
			p.rotate(p.radians(45));
			p.textAlign(p.LEFT, p.BOTTOM);
			p.noStroke();
			p.fill(isHovered ? 50 : 150);
			p.text(labelText, tiltedLabelOffsetX, 0);
			p.pop();
		});

		// --- Draw Day Markers (Tues-Sun) in 3-week view ---
		if (this.viewMode === '3weeks') {
			// Use a smaller font and shorter connecting line for day markers
			const dayLabelFontSize = this.axisLabelFontSize * 0.8;
			const dayConnectingLineLength = connectingLineLength * 0.7;
			const dayTiltedLabelOffsetY = tiltedLabelOffsetY * 0.7;

			p.textSize(dayLabelFontSize);

			this.dayMarkers.forEach(marker => {
				const drawX = marker.currentX;
				if (drawX < visibleLeft - buffer || drawX > visibleRight + buffer) return; // Clipping

				// Draw shorter connecting line
				p.stroke(190); // Slightly lighter gray for day markers
				p.strokeWeight(0.8); // Thinner line for day markers
				p.line(drawX, axisY, drawX, axisY + dayConnectingLineLength);

				// Draw day name in tilted format, smaller than week markers
				p.push();
				p.translate(drawX, axisY + dayConnectingLineLength + dayTiltedLabelOffsetY);
				p.rotate(p.radians(45));
				p.textAlign(p.LEFT, p.BOTTOM);
				p.noStroke();
				p.fill(170); // Lighter fill for day markers
				p.text(marker.dayName.substring(0, 3), -3, 0); // Use 3-letter day abbreviation
				p.pop();
			});

			// Restore text size and stroke weight
			p.textSize(this.axisLabelFontSize * 0.9);
			p.strokeWeight(1);
		}

		// Draw main axis line
		const lineStartX = Math.max(this.padding.left, this.contentMinX - this.viewOffsetX);
		const visualAxisEndX = this.canvasWidth - this.padding.right;
		const contentEndXOnScreen = Math.max(lineStartX, this.contentMaxX - this.viewOffsetX);
		const lineEndX = Math.min(visualAxisEndX, contentEndXOnScreen);

		p.stroke(150); p.strokeWeight(1); // Reset stroke for axis line
		if (lineEndX > lineStartX) { // Only draw if there's a visible line segment
			p.line(lineStartX, axisY, lineEndX, axisY);
		}
	}

	private drawWorkoutColumns(visibleLeft: number, visibleRight: number, buffer: number): void {
		const p = this.p;
		p.strokeWeight(0.8);

		const dailyAccumulatedHeight: Map<string, number> = new Map();
		const sortedColumns = [...this.workoutColumns].sort((a, b) => a.date.getTime() - b.date.getTime());
		const sliderContentX = this.sliderX !== null ? this.sliderX + this.viewOffsetX : -Infinity;
		const hoveredItemsSet = new Set(this.hoveredItems);

		sortedColumns.forEach((col, index) => {
			const drawX = col.currentX;
			if (drawX + col.width < visibleLeft - buffer || drawX > visibleRight + buffer) return; // Clipping

			const dayKey = col.date.toISOString().split('T')[0];
			const yOffset = dailyAccumulatedHeight.get(dayKey) || 0;
			const drawY = col.y - yOffset;

			// Check if the slider X is over the column stack
			const isHoveredBySliderX = this.sliderX !== null && !this.isDraggingGraph && sliderContentX >= col.originalX && sliderContentX <= col.originalX + col.width;

			// Add to hoveredItems if X matches
			if (isHoveredBySliderX) {
				if (!hoveredItemsSet.has(col)) {
					this.hoveredItems.push(col);
				}
			}

			// Check hover status from the (potentially updated) set for drawing
			const isHovered = hoveredItemsSet.has(col) || (isHoveredBySliderX); // Visually hover if X matches

			const baseColor = p.color(173, 216, 230, 200);
			const hoverColor = p.color(100, 150, 230, 240);

			p.fill(isHovered ? hoverColor : baseColor);
			p.stroke(isHovered ? p.color(60, 100, 180) : p.color(100, 150, 200));

			// Determine if this column should connect with the next one (consecutive days)
			let drawWidth = col.width;
			if (index < sortedColumns.length - 1) {
				const nextCol = sortedColumns[index + 1];
				const dayDifference = Math.round((nextCol.date.getTime() - col.date.getTime()) / (24 * 60 * 60 * 1000));

				// If columns are consecutive days, extend this column to touch the next one
				if (dayDifference === 1) {
					drawWidth = nextCol.currentX - col.currentX;
				}
			}

			p.rect(drawX, drawY, drawWidth, col.height, 1);

			// Update accumulated height for this day AFTER drawing
			dailyAccumulatedHeight.set(dayKey, yOffset + col.height);
		});
	}

	private drawConnectingLines(visibleLeft: number, visibleRight: number, buffer: number): void {
		const p = this.p;
		p.strokeWeight(1.5);
		for (let i = 0; i < this.points.length - 1; i++) {
			const currentPoint = this.points[i];
			const nextPoint = this.points[i + 1];
			const currentDrawX = currentPoint.currentX;
			const nextDrawX = nextPoint.currentX;

			if ((currentDrawX < visibleLeft - buffer && nextDrawX < visibleLeft - buffer) ||
				(currentDrawX > visibleRight + buffer && nextDrawX > visibleRight + buffer)) continue; // Basic Clipping

			let shouldDraw = true;
			let useDashedLine = false;
			if (nextPoint.type === 'goal') { /* ... existing goal line logic ... */
				const lastActivityDate = currentPoint.date;
				const goalDate = nextPoint.date;
				if (areDatesInSameWeek(lastActivityDate, goalDate) || isDateInPreviousWeek(lastActivityDate, goalDate)) {
					useDashedLine = true;
				} else {
					shouldDraw = false;
				}
			}

			if (shouldDraw) {
				p.stroke(80);
				if (useDashedLine) {
					p.push(); p.drawingContext.setLineDash([5, 5]);
					p.line(currentDrawX, currentPoint.y, nextDrawX, nextPoint.y);
					p.drawingContext.setLineDash([]); p.pop();
				} else {
					p.line(currentDrawX, currentPoint.y, nextDrawX, nextPoint.y);
				}
			}
		}
	}

	private drawPoints(visibleLeft: number, visibleRight: number, buffer: number): void {
		const p = this.p;
		const hoverRadius = this.pointSize / 2;
		const sliderContentX = this.sliderX !== null ? this.sliderX + this.viewOffsetX : -Infinity;
		const hoveredItemsSet = new Set(this.hoveredItems);

		this.points.forEach(point => {
			const drawX = point.currentX;
			if (drawX < visibleLeft - buffer || drawX > visibleRight + buffer) return;

			// Check if slider X is over the point
			const isHoveredBySlider = this.sliderX !== null && !this.isDraggingGraph && Math.abs(sliderContentX - point.originalX) < hoverRadius;

			// Add to hoveredItems if slider X matches
			if (isHoveredBySlider) {
				if (!hoveredItemsSet.has(point)) {
					this.hoveredItems.push(point);
				}
			}

			// Check hover status from the (potentially updated) set for drawing
			const isHovered = hoveredItemsSet.has(point) || isHoveredBySlider;

			let pointColor: p5.Color;
			if (point.type === 'start') pointColor = p.color('#2ca02c');
			else if (point.type === 'goal') pointColor = p.color('#d62728');
			else pointColor = p.color('#1f77b4');

			p.push();
			if (isHovered) {
				pointColor.setAlpha(255); p.stroke(0); p.strokeWeight(2);
			} else {
				pointColor.setAlpha(210); p.noStroke();
			}
			p.fill(pointColor);
			p.ellipse(drawX, point.y, this.pointSize, this.pointSize);
			p.pop();

			// Draw label if point is roughly visible (use a wider visibility check)
			if (drawX >= visibleLeft - buffer / 2 && drawX <= visibleRight + buffer / 2) {
				// Only draw labels for TRIAL points now
				if (point.type === 'trial') {
					p.noStroke();
					// Use the point's color for the label text for consistency
					p.fill(pointColor);
					p.textSize(this.pointLabelFontSize);
					// Fix the regex pattern and ensure we always have a valid label
					let timeLabel = point.displayTime;
					// Only try to parse/format if it's not the goal (which might have a different format)
					const match = point.displayTime.match(/^(\d{2}:\d{2}:\d{2})/);
					if (match && match[1]) {
						timeLabel = match[1];
					}

					// Always position text above the point
					p.textAlign(p.CENTER, p.BOTTOM);
					p.text(timeLabel, drawX, point.y - this.pointSize);
				}
			}
		});
	}

	// --- Indicator and Slider Control (use canvas relative sliderX) ---
	private drawVerticalIndicator(): void {
		if (this.sliderX === null) return;
		const p = this.p;

		// Find the top and bottom y positions of points near the slider
		const sliderContentX = (this.sliderX ?? 0) + this.viewOffsetX;

		// Find the minimum and maximum y values of all visible points
		let minY = this.canvasHeight;
		let maxY = this.padding.top;

		// Check all points to find min/max Y values
		this.points.forEach(point => {
			if (point.currentX >= this.padding.left && point.currentX <= this.canvasWidth - this.padding.right) {
				minY = Math.min(minY, point.y);
				maxY = Math.max(maxY, point.y);
			}
		});

		// Check all workout columns heights
		this.workoutColumns.forEach(col => {
			if (col.currentX >= this.padding.left && col.currentX <= this.canvasWidth - this.padding.right) {
				maxY = Math.max(maxY, col.y + col.height);
			}
		});

		// If no points or columns are visible, use default vertical bounds
		if (minY === this.canvasHeight && maxY === this.padding.top) {
			minY = this.padding.top;
			maxY = this.canvasHeight - this.padding.bottom;
		} else {
			// Add small buffer to min/max Y if points/columns were found
			minY = Math.max(this.padding.top, minY - 10);
			maxY = Math.min(this.canvasHeight - this.padding.bottom, maxY + 10);
		}

		// Draw the vertical indicator line between min and max Y at the slider's X position
		p.stroke(120, 120, 120, 180); p.strokeWeight(1); p.drawingContext.setLineDash([4, 4]);
		if (maxY > minY) { // Only draw if there's a valid vertical span
			p.line(this.sliderX, minY, this.sliderX, maxY);
		}
		p.drawingContext.setLineDash([]);
	}

	private drawSliderControl(): void {
		if (this.sliderX === null) return;
		const p = this.p;
		const trackY = this.sliderTrackY;
		const sliderKnobY = trackY - this.knobHeight / 2;

		// Wiggle animation logic
		const currentTime = p.millis();
		let wiggleOffsetX = 0;

		// Start wiggle?
		if (!this.isWiggling && !this.isDraggingSlider && currentTime - this.lastWiggleTime > this.wiggleInterval) {
			this.isWiggling = true;
			this.wiggleStartTime = currentTime;
			this.lastWiggleTime = currentTime; // Reset timer immediately
		}

		// Apply wiggle?
		if (this.isWiggling) {
			const wiggleElapsedTime = currentTime - this.wiggleStartTime;
			if (wiggleElapsedTime < this.wiggleDuration) {
				// Use a sine wave for smooth oscillation
				const wiggleProgress = wiggleElapsedTime / this.wiggleDuration; // 0 to 1
				// Multiplied by 2*PI makes it one full cycle. Multiply by wiggleCycles for desired number.
				wiggleOffsetX = this.wiggleAmplitude * Math.sin(wiggleProgress * Math.PI * 2 * this.wiggleCycles);
			} else {
				this.isWiggling = false; // End wiggle
				// Ensure lastWiggleTime reflects the end of the *last* wiggle attempt
				this.lastWiggleTime = currentTime;
			}
		}

		// Calculate the draw position including the wiggle offset
		const drawSliderX = this.sliderX + wiggleOffsetX;

		p.push();
		if (this.isDraggingSlider) { p.fill(200); p.stroke(50); p.strokeWeight(1.5); }
		else { p.fill(230); p.stroke(100); p.strokeWeight(1); }
		// Use drawSliderX for drawing the knob
		p.rect(drawSliderX - this.knobWidth / 2, sliderKnobY, this.knobWidth, this.knobHeight, 3);
		p.stroke(this.isDraggingSlider ? 50 : 100); p.strokeWeight(1);
		const lineSpacing = this.knobWidth / 4;
		const lineHeightRatio = 0.6;
		const lineYStart = sliderKnobY + this.knobHeight * (1 - lineHeightRatio) / 2;
		const lineYEnd = sliderKnobY + this.knobHeight * (1 + lineHeightRatio) / 2;
		for (let i = 1; i <= 3; i++) {
			// Use drawSliderX for drawing the lines inside the knob
			const lineX = drawSliderX - this.knobWidth / 2 + i * lineSpacing;
			p.line(lineX, lineYStart, lineX, lineYEnd);
		}
		p.pop();
	}

	// --- Legend ---
	private drawLegend(): void {
		const p = this.p;
		const startPoint = this.points.find(pt => pt.type === 'start');
		const goalPoint = this.points.find(pt => pt.type === 'goal');

		if (!startPoint || !goalPoint) return; // Don't draw if data isn't ready

		const legendPadding = 15;
		const markerSize = 8;
		const lineSpacing = 18;
		const legendTextSize = 12;

		let currentY = this.padding.top + legendPadding;
		const legendX = this.canvasWidth - this.padding.right - legendPadding; // Align to right padding

		p.push(); // Isolate legend drawing styles

		p.textSize(legendTextSize);
		p.textAlign(p.RIGHT, p.CENTER); // Align text to the right of the marker pos

		// Draw Start Point Info
		p.fill('#2ca02c'); // Start color
		p.noStroke();
		p.ellipse(legendX, currentY, markerSize, markerSize); // Marker
		p.fill(50); // Text color
		p.text(`Start: ${startPoint.displayTime}`, legendX - markerSize - 5, currentY); // Text to the left

		// Draw Goal Point Info
		currentY += lineSpacing;
		p.fill('#d62728'); // Goal color
		p.noStroke();
		p.ellipse(legendX, currentY, markerSize, markerSize); // Marker
		p.fill(50); // Text color
		p.text(`Goal: ${goalPoint.displayTime}`, legendX - markerSize - 5, currentY); // Text to the left

		p.pop(); // Restore previous drawing styles
	}

	// --- Info Box (No changes needed here, uses hover state) ---
	private drawInfoBox(): void {
		if (!this.infoBoxElement) this.infoBoxElement = document.getElementById('info-box');
		if (!this.infoBoxElement) { console.error('#info-box not found!'); return; }

		// Skip updating the info box if we're dragging the graph
		if (this.isDraggingGraph) {
			return;
		}

		// Helper function to format time (HH:MM)
		const formatStartTime = (date: Date): string => {
			const hours = String(date.getHours()).padStart(2, '0');
			const minutes = String(date.getMinutes()).padStart(2, '0');
			return `${hours}:${minutes}`;
		};

		let infoHTML = '';

		if (this.hoveredItems.length > 0) {
			// Preflight check to determine which items to render
			const itemsToRender = this.hoveredItems.filter(item =>
				// Allowed items are weekNumbers, points or workout columns that don't have a trial point with the same activity ID.
				('weekNumber' in item) ||
				('type' in item) ||
				('height' in item && !this.hoveredItems.some(hoveredItem =>
					'type' in hoveredItem &&
					hoveredItem.type === 'trial' &&
					hoveredItem.activity?.id === item.activity.id
				))
			).sort((a, b) => {
				// The one without acitivity comes first
				if (!('activity' in a) && 'activity' in b) return -1;

				// If both have activity, sort by date
				if ('activity' in a && 'activity' in b && a.activity && b.activity) {
					return new Date(a.activity.start_date_local).getTime() - new Date(b.activity.start_date_local).getTime();
				}

				return 0;
			});

			// Render the filtered items
			itemsToRender.forEach((item, index) => {
				// Add horizontal rule between items
				if (index > 0) {
					infoHTML += '<hr>';
				}

				// Use property checking for interfaces
				if ('type' in item) {
					// --- Point ---
					const point = item as Point;
					const pointDate = point.date.toLocaleDateString('en-CA');

					// Handle each point type separately
					if (point.type === 'start') {
						infoHTML += `
							<p><strong>Start</strong></p>
							<p>Date: ${pointDate}</p>
							<p>Starting Time: ${point.displayTime}</p>
						`;
					} else if (point.type === 'goal') {
						infoHTML += `
							<p><strong>Goal</strong></p>
							<p>Date: ${pointDate}</p>
							<p>Target Time: ${point.displayTime}</p>
						`;
					} else if (point.type === 'trial') {
						const activityDate = new Date(point.activity!.start_date_local);
						const distance = typeof point.activity!.distance === 'number'
							? `<p>Distance: ${(point.activity!.distance / 1000).toFixed(1)} km</p>`
							: '';

						infoHTML += `
							<p><strong>Trial: ${point.activity!.name}</strong></p>
							<p>Date: ${pointDate}</p>
							<p>Start Time: ${formatStartTime(activityDate)}</p>
							<p>Result Time: ${point.displayTime}</p>
							${distance}
						`;
					}
				} else if ('height' in item) {
					// --- WorkoutColumn ---
					const column = item as WorkoutColumn;
					const activity = column.activity;
					const activityDate = new Date(activity.start_date_local);

					// Calculate pace
					const paceSecondsPerKm = activity.distance > 0 ? (activity.moving_time / (activity.distance / 1000)) : 0;
					let paceText = 'N/A';
					if (paceSecondsPerKm > 0) {
						const paceMinutes = Math.floor(paceSecondsPerKm / 60);
						const paceSeconds = Math.floor(paceSecondsPerKm % 60);
						paceText = `${paceMinutes}:${String(paceSeconds).padStart(2, '0')} /km`;
					}

					infoHTML += `
						<p><strong>Workout: ${activity.name}</strong></p>
						<p>Date: ${activityDate.toLocaleDateString('en-CA')}</p>
						<p>Start Time: ${formatStartTime(activityDate)}</p>
						<p>Dist: ${(activity.distance / 1000).toFixed(2)} km</p>
						<p>Duration: ${formatSecondsToTime(activity.moving_time)}</p>
						<p>Pace: ${paceText}</p>
					`;
				} else if ('weekNumber' in item) {
					// --- WeekMarker ---
					const marker = item as WeekMarker;

					infoHTML += `
						<p><strong>Week ${marker.weekNumber} Start</strong></p>
						<p>${marker.date.toLocaleDateString('en-CA')}</p>
					`;
				}
			});
		} else {
			infoHTML = '<p>Move the slider over the graph to see details.</p>';
		}

		this.infoBoxElement.innerHTML = infoHTML;
	}

	// --- Setup Mouse Interaction Listeners ---
	private setupMouseInteraction(): void {
		const p = this.p;
		p.mousePressed = this.handleMousePressed.bind(this);
		p.mouseDragged = this.handleMouseDragged.bind(this);
		p.mouseReleased = this.handleMouseReleased.bind(this);

		// --- Add direct touch event listeners for mobile devices ---
		// NOTE on Touch Coordinates: Touch events (like TouchEvent.touches[0].clientX/Y)
		// provide coordinates relative to the browser viewport. These must be converted
		// to the logical coordinate system used by p5.js for drawing and interaction
		// (based on this.canvasWidth/this.canvasHeight), NOT the raw drawing buffer
		// dimensions (canvas.width/canvas.height), especially on high-DPI displays
		// where these can differ significantly. The getTouchPosition helper handles this.
		const canvasElement = p.drawingContext.canvas;
		if (canvasElement) {
			canvasElement.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
			canvasElement.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
			canvasElement.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
			canvasElement.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: false });
		} else {
			console.warn('Could not get canvas element to attach touch listeners.');
		}
		// Prevent page scroll when mouse wheel is used over the graph container
		this.parentElement?.addEventListener('wheel', (e) => {
			// Check if the event target is the canvas or inside the graph container
			if (e.target === canvasElement || this.parentElement?.contains(e.target as Node)) {
				// Check roughly if mouse is within graph area (excluding padding maybe?)
				if (p.mouseX > this.padding.left && p.mouseX < this.canvasWidth - this.padding.right &&
					p.mouseY > this.padding.top && p.mouseY < this.canvasHeight - this.padding.bottom) {
					e.preventDefault();
				}
			}
		}, { passive: false });
	}

	// --- Helper to get canvas-relative touch position ---
	private getTouchPosition(touch: Touch): { x: number, y: number } | null {
		const canvas = this.p.drawingContext.canvas as HTMLCanvasElement | null;
		if (!canvas) {
			console.error("getTouchPosition: Canvas element not found!"); // Keep error for actual issues
			return null;
		}
		const rect = canvas.getBoundingClientRect();

		// Corrected Calculation: Map viewport coords to logical canvas coords
		const relativeX = touch.clientX - rect.left;
		const relativeY = touch.clientY - rect.top;
		const logicalX = (relativeX / rect.width) * this.canvasWidth;
		const logicalY = (relativeY / rect.height) * this.canvasHeight;

		return { x: logicalX, y: logicalY };
	}

	// --- Touch Event Handlers (Direct) ---
	private handleTouchStart(event: TouchEvent): void {
		if (!event.touches || event.touches.length === 0) return;

		const touch = event.touches[0];
		const touchPos = this.getTouchPosition(touch);
		if (!touchPos) return;

		let shouldPreventDefault = false;

		// Check for Slider Drag Start 
		if (this.sliderX !== null) {
			const sliderKnobY = this.sliderTrackY - this.knobHeight / 2;
			const touchPadding = 25;
			const knobLeft = this.sliderX - (this.knobWidth / 2) - touchPadding;
			const knobRight = this.sliderX + (this.knobWidth / 2) + touchPadding;
			const knobTop = sliderKnobY - touchPadding;
			const knobBottom = sliderKnobY + this.knobHeight + touchPadding;

			if (touchPos.x >= knobLeft && touchPos.x <= knobRight &&
				touchPos.y >= knobTop && touchPos.y <= knobBottom) {
				this.isDraggingSlider = true;
				this.isDraggingGraph = false;
				shouldPreventDefault = true;
			}
		}

		// Check for Graph Pan Start 
		if (!this.isDraggingSlider && this.totalGraphContentWidth > this.graphWidth) {
			// Allow panning if touch is within the visual graph area (left padding to canvas edge minus left padding)
			const isInsidePanArea = touchPos.y > this.padding.top && touchPos.y < this.canvasHeight - this.padding.bottom &&
				touchPos.x > this.padding.left && touchPos.x < this.canvasWidth - this.padding.left;

			if (isInsidePanArea) {
				this.isDraggingGraph = true;
				this.isDraggingSlider = false;
				this.dragStartX = touchPos.x;
				this.dragStartOffsetX = this.viewOffsetX;
				shouldPreventDefault = true;
			}
		}

		if (shouldPreventDefault) {
			event.preventDefault();
		}
	}

	private handleTouchMove(event: TouchEvent): void {
		if (!event.touches || event.touches.length === 0) return;
		if (!this.isDraggingSlider && !this.isDraggingGraph) return;

		const touch = event.touches[0];
		const touchPos = this.getTouchPosition(touch);
		if (!touchPos) return;

		event.preventDefault();

		// Handle Slider Drag
		if (this.isDraggingSlider && this.sliderX !== null) {
			// Calculate visible content boundaries for clamping
			const visibleContentStartX = Math.max(this.padding.left, this.contentMinX - this.viewOffsetX);
			const visibleContentEndX = Math.max(visibleContentStartX, this.contentMaxX - this.viewOffsetX); // Ensure end >= start
			// Visual max slider position is near canvas edge (respecting left padding)
			const visualSliderMaxX = this.canvasWidth - this.padding.left;
			// Actual max is limited by the visual max OR the content end, whichever is smaller
			const actualSliderMaxX = Math.min(visualSliderMaxX, visibleContentEndX);

			// Clamp slider position
			const newSliderX = this.p.constrain(touchPos.x, visibleContentStartX, actualSliderMaxX);
			this.sliderX = newSliderX;
		}
		// Handle Graph Pan
		else if (this.isDraggingGraph) {
			const dx = touchPos.x - this.dragStartX;
			const newOffsetX = this.dragStartOffsetX - dx;
			// Constraining offset is handled by constrainViewOffset, just update it here
			this.viewOffsetX = newOffsetX;
			this.constrainViewOffset(); // Apply constraints immediately during drag
		}
	}

	private handleTouchEnd(event: TouchEvent): void {
		if (event.touches.length === 0) {
			if (this.isDraggingSlider) {
				this.isDraggingSlider = false;
				this.lastWiggleTime = this.p.millis(); // Reset wiggle timer on release
			}
			if (this.isDraggingGraph) {
				this.isDraggingGraph = false;
				this.lastWiggleTime = this.p.millis(); // Reset wiggle timer on release
			}
		}
	}

	// --- Mouse Event Handlers (Panning and Slider) ---
	private handleMousePressed(): void {
		if (this.sliderX === null) return;
		const p = this.p;

		// Slider Knob Check
		const sliderKnobY = this.sliderTrackY - this.knobHeight / 2;
		const knobLeft = this.sliderX - this.knobWidth / 2;
		const knobRight = this.sliderX + this.knobWidth / 2;
		const knobTop = sliderKnobY;
		const knobBottom = sliderKnobY + this.knobHeight;

		if (p.mouseX >= knobLeft && p.mouseX <= knobRight && p.mouseY >= knobTop && p.mouseY <= knobBottom) {
			this.isDraggingSlider = true;
			this.isDraggingGraph = false;
			p.cursor('grabbing');
		}
		// Graph Panning Check (if not dragging slider and content is scrollable)
		else if (this.totalGraphContentWidth > this.graphWidth &&
			// Allow panning if mouse is within the visual graph area (left padding to canvas edge minus left padding)
			p.mouseY > this.padding.top && p.mouseY < this.canvasHeight - this.padding.bottom &&
			p.mouseX > this.padding.left && p.mouseX < this.canvasWidth - this.padding.left) {
			this.isDraggingGraph = true;
			this.isDraggingSlider = false;
			this.dragStartX = p.mouseX;
			this.dragStartOffsetX = this.viewOffsetX;
			p.cursor('grab');
		}
	}

	private handleMouseDragged(): void {
		const p = this.p;
		if (this.isDraggingSlider && this.sliderX !== null) {
			// Calculate visible content boundaries for clamping
			const visibleContentStartX = Math.max(this.padding.left, this.contentMinX - this.viewOffsetX);
			const visibleContentEndX = Math.max(visibleContentStartX, this.contentMaxX - this.viewOffsetX); // Ensure end >= start
			// Visual max slider position is near canvas edge (respecting left padding)
			const visualSliderMaxX = this.canvasWidth - this.padding.left;
			// Actual max is limited by the visual max OR the content end, whichever is smaller
			const actualSliderMaxX = Math.min(visualSliderMaxX, visibleContentEndX);

			// Clamp slider position
			this.sliderX = p.constrain(p.mouseX, visibleContentStartX, actualSliderMaxX);
		}
		else if (this.isDraggingGraph) {
			const dx = p.mouseX - this.dragStartX;
			const newOffsetX = this.dragStartOffsetX - dx;
			// Constraining offset is handled by constrainViewOffset, just update it here
			this.viewOffsetX = newOffsetX;
			this.constrainViewOffset(); // Apply constraints immediately during drag
			p.cursor('grabbing');
		}
	}

	private handleMouseReleased(): void {
		const p = this.p;
		if (this.isDraggingSlider) {
			this.isDraggingSlider = false;
			this.lastWiggleTime = p.millis(); // Reset wiggle timer on release
			p.cursor(p.ARROW);
		}
		if (this.isDraggingGraph) {
			this.isDraggingGraph = false;
			this.lastWiggleTime = p.millis(); // Reset wiggle timer on release
			p.cursor(p.ARROW);
		}
	}

	// --- Window Resize Handler ---
	public windowResized(): void {
		this.updateDimensionsAndCanvas(true);
	}

} // End GoalGraphRenderer Class
