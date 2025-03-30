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

// --- Data Interfaces ---

interface Point {
	originalX: number; // Calculated during processData based on full timescale
	currentX: number; // Calculated in draw loop based on originalX and viewOffsetX
	y: number;
	date: Date;
	timeSeconds: number;
	displayTime: string;
	type: 'start' | 'trial' | 'goal';
	activity?: StravaActivity;
}

interface WorkoutColumn {
	originalX: number; // Calculated during processData based on full timescale (left edge)
	currentX: number; // Calculated in draw loop based on originalX and viewOffsetX
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
	private padding = { top: 50, right: 80, bottom: 120, left: 40 }; // Increased right padding from 40 to 70
	private graphWidth = 0; // Visible graph area width
	private graphHeight = 0; // Visible graph area height

	// Font sizes
	private axisLabelFontSize = 15;
	private pointLabelFontSize = 15;

	// Data structures
	private points: Point[] = [];
	private workoutColumns: WorkoutColumn[] = [];
	private yMin = 0;
	private yMax = 1;
	private maxDuration = 1;

	// Interaction state
	private sliderX: number | null = null; // Slider position relative to visible canvas
	private hoveredPoint: Point | null = null;
	private hoveredColumn: WorkoutColumn | null = null;
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

	// HTML Element References
	private infoBoxElement: HTMLElement | null = null;
	private parentElement: HTMLElement | null = null;
	private viewToggleCheckbox: HTMLInputElement | null = null;

	constructor(
		p: p5,
		start: { currentRaceTime: string; date: Date },
		goal: { targetRaceTime: string; dateOfRace: Date },
		activities: StravaActivity[],
		parentContainerId: string,
		trialDay: string = 'sunday'
	) {
		this.p = p;
		this.startData = start;
		this.goalData = goal;
		this.activities = activities;
		this.trialDay = trialDay.toLowerCase();
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

		// Recalculate graph drawing area
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
		const maxOffsetX = Math.max(0, this.totalGraphContentWidth - this.graphWidth);
		this.viewOffsetX = Math.max(0, Math.min(this.viewOffsetX, maxOffsetX));
	}

	// --- Data Processing ---
	private processData(): void {
		this.points = [];
		this.workoutColumns = [];
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
		// Half day in milliseconds for centering points
		const halfDayInMillis = millisecondsPerDay / 2;

		// --- Add points/columns, calculate originalX relative to total width ---
		const mapTimeToX = (date: Date): number => {
			const timeRatioInFullSpan = fullTimeSpan > 0 ? (date.getTime() - startDate.getTime()) / fullTimeSpan : 0;
			return this.padding.left + timeRatioInFullSpan * this.totalGraphContentWidth;
		};

		// Map time to X with point centered in day
		const mapPointTimeToX = (date: Date): number => {
			// Create a new date with time shifted to middle of the day
			const centeredDate = new Date(date.getTime() + halfDayInMillis);
			return mapTimeToX(centeredDate);
		};

		const startTimeSeconds = parseTimeToSeconds(this.startData.currentRaceTime);
		this.points.push({
			originalX: mapPointTimeToX(startDate),
			currentX: 0, y: 0, date: startDate, timeSeconds: startTimeSeconds,
			displayTime: formatSecondsToTime(startTimeSeconds), type: 'start',
		});

		const goalTimeSeconds = parseTimeToSeconds(this.goalData.targetRaceTime);
		this.points.push({
			originalX: mapPointTimeToX(goalDate),
			currentX: 0, y: 0, date: goalDate, timeSeconds: goalTimeSeconds,
			displayTime: this.goalData.targetRaceTime, type: 'goal',
		});

		this.activities.forEach(activity => {
			const activityDate = new Date(activity.start_date_local);
			if (activityDate < startDate || activityDate > goalDate) return;

			const isValidTime = typeof activity.moving_time === 'number' && activity.moving_time > 0;
			const isTrial = getDayOfWeek(activityDate) === this.trialDay || activity.type?.toLowerCase() === 'race';
			const activityOriginalX = mapTimeToX(activityDate);

			if (isTrial && isValidTime) {
				this.points.push({
					originalX: mapPointTimeToX(activityDate),
					currentX: 0, y: 0, date: activityDate, timeSeconds: activity.moving_time,
					displayTime: formatSecondsToTime(activity.moving_time), type: 'trial',
					activity: activity,
				});
			} else if (isValidTime) {
				// Set column width to represent a full day
				this.workoutColumns.push({
					originalX: activityOriginalX - (dayWidth / 2), // Center the column on the activity date
					currentX: 0, y: 0, width: dayWidth, height: 0,
					activity: activity, date: activityDate,
				});
			}
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
	}

	// --- p5 Drawing Logic ---
	public draw(): void {
		const p = this.p;
		p.background(255);

		// Only reset hover states if we're not currently dragging the graph
		if (!this.isDraggingGraph) {
			this.hoveredPoint = null;
			this.hoveredColumn = null;
		}

		// Calculate current X positions based on offset
		this.points.forEach(pt => pt.currentX = pt.originalX - this.viewOffsetX);
		this.workoutColumns.forEach(col => col.currentX = col.originalX - this.viewOffsetX);

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
	}

	// --- Drawing Helper Functions ---

	private drawXAxis(visibleLeft: number, visibleRight: number, buffer: number): void {
		const p = this.p;
		const axisY = this.canvasHeight - this.padding.bottom;
		p.textAlign(p.CENTER, p.TOP); p.textSize(this.axisLabelFontSize); p.fill(100);

		const labelPoints = [ /* ... get points ... */
			this.points.find(pt => pt.type === 'start'),
			...this.points.filter(pt => pt.type === 'trial'),
			this.points.find(pt => pt.type === 'goal')
		].filter(pt => pt !== undefined) as Point[];
		const uniqueDateLabels = new Map<string, Point>();
		labelPoints.forEach(point => { /* ... find unique labels ... */
			const dateKey = point.date.toLocaleDateString();
			const existing = uniqueDateLabels.get(dateKey);
			if (!existing || (point.type !== 'start' && existing.type === 'start') || point.type === 'goal') {
				uniqueDateLabels.set(dateKey, point);
			}
		});

		uniqueDateLabels.forEach(point => {
			const drawX = point.currentX;
			if (drawX < visibleLeft - buffer || drawX > visibleRight + buffer) return; // Clipping

			const dateLabel = `${point.date.toLocaleString('en-US', { weekday: 'short' })} ${point.date.getDate()} ${ /* ... month ... */ point.date.toLocaleString('en-US', { month: 'short' })}`;
			p.push();
			p.translate(drawX, axisY + 15); p.rotate(p.radians(45)); p.textAlign(p.LEFT, p.BOTTOM);
			let labelColor = '#ff7f0e';
			if (point.type === 'start') labelColor = '#2ca02c'; else if (point.type === 'goal') labelColor = '#d62728';
			p.fill(labelColor); p.text(dateLabel, 5, 0);
			p.pop();
			p.stroke(200); p.strokeWeight(1); p.line(drawX, axisY, drawX, axisY + 5); // Tick
		});

		p.stroke(150); p.strokeWeight(1); p.line(visibleLeft, axisY, visibleRight, axisY); // Axis line
	}

	private drawWorkoutColumns(visibleLeft: number, visibleRight: number, buffer: number): void {
		const p = this.p;
		p.strokeWeight(0.8);

		// Sort columns by date for drawing in order
		const sortedColumns = [...this.workoutColumns].sort((a, b) => a.date.getTime() - b.date.getTime());

		sortedColumns.forEach((col, index) => {
			const drawX = col.currentX;
			if (drawX + col.width < visibleLeft - buffer || drawX > visibleRight + buffer) return; // Clipping

			const baseColor = p.color(173, 216, 230, 200);
			const hoverColor = p.color(100, 150, 230, 240);
			const sliderContentX = (this.sliderX ?? -Infinity) + this.viewOffsetX;
			const isHoveredBySlider = this.sliderX !== null && sliderContentX >= col.originalX && sliderContentX <= col.originalX + col.width;

			p.fill(isHoveredBySlider ? hoverColor : baseColor);
			p.stroke(isHoveredBySlider ? p.color(60, 100, 180) : p.color(100, 150, 200));

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

			p.rect(drawX, col.y, drawWidth, col.height, 1);

			// Only update hover state if we're not dragging the graph
			if (isHoveredBySlider && !this.isDraggingGraph) {
				this.hoveredColumn = col;
			}
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
		const hoverRadius = this.pointSize / 2 + 3;
		this.points.forEach(point => {
			const drawX = point.currentX;
			if (drawX < visibleLeft - buffer || drawX > visibleRight + buffer) return; // Clipping

			let pointColor: p5.Color;
			if (point.type === 'start') pointColor = p.color('#2ca02c');
			else if (point.type === 'goal') pointColor = p.color('#d62728');
			else pointColor = p.color('#1f77b4');

			const sliderContentX = (this.sliderX ?? -Infinity) + this.viewOffsetX;
			const isHoveredBySlider = this.sliderX !== null && Math.abs(sliderContentX - point.originalX) < hoverRadius;

			p.push();
			if (isHoveredBySlider) {
				pointColor.setAlpha(255); p.stroke(0); p.strokeWeight(2);
				// Only update hover state if we're not dragging the graph
				if (!this.isDraggingGraph) {
					this.hoveredPoint = point;
				}
			} else {
				pointColor.setAlpha(210); p.noStroke();
			}
			p.fill(pointColor);
			p.ellipse(drawX, point.y, this.pointSize, this.pointSize);
			p.pop();

			// Draw label if point is roughly visible (use a wider visibility check)
			if (drawX >= visibleLeft - buffer / 2 && drawX <= visibleRight + buffer / 2) {
				p.noStroke(); p.fill(pointColor); p.textSize(this.pointLabelFontSize);
				// Fix the regex pattern and ensure we always have a valid label
				let timeLabel = point.displayTime;
				// Only try to parse/format if it's not the goal (which might have a different format)
				if (point.type !== 'goal') {
					const match = point.displayTime.match(/^(\d{2}:\d{2}:\d{2})/);
					if (match && match[1]) {
						timeLabel = match[1];
					}
				}

				// Always position text above the point
				p.textAlign(p.CENTER, p.BOTTOM);
				p.text(timeLabel, drawX, point.y - this.pointSize);
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

		// If no points are visible, use default bounds
		if (minY === this.canvasHeight || maxY === this.padding.top) {
			minY = this.padding.top;
			maxY = this.canvasHeight - this.padding.bottom;
		}

		// Draw the vertical indicator line between min and max Y
		p.stroke(120, 120, 120, 180); p.strokeWeight(1); p.drawingContext.setLineDash([4, 4]);
		p.line(this.sliderX, minY, this.sliderX, maxY);
		p.drawingContext.setLineDash([]);
	}

	private drawSliderControl(): void {
		if (this.sliderX === null) return;
		const p = this.p;
		const trackY = this.sliderTrackY;
		const sliderKnobY = trackY - this.knobHeight / 2;
		p.push();
		if (this.isDraggingSlider) { p.fill(200); p.stroke(50); p.strokeWeight(1.5); }
		else { p.fill(230); p.stroke(100); p.strokeWeight(1); }
		p.rect(this.sliderX - this.knobWidth / 2, sliderKnobY, this.knobWidth, this.knobHeight, 3);
		p.stroke(this.isDraggingSlider ? 50 : 100); p.strokeWeight(1);
		const lineSpacing = this.knobWidth / 4;
		const lineHeightRatio = 0.6;
		const lineYStart = sliderKnobY + this.knobHeight * (1 - lineHeightRatio) / 2;
		const lineYEnd = sliderKnobY + this.knobHeight * (1 + lineHeightRatio) / 2;
		for (let i = 1; i <= 3; i++) { const lineX = this.sliderX - this.knobWidth / 2 + i * lineSpacing; p.line(lineX, lineYStart, lineX, lineYEnd); }
		p.pop();
	}

	// --- Info Box (No changes needed here, uses hover state) ---
	private drawInfoBox(): void {
		if (!this.infoBoxElement) this.infoBoxElement = document.getElementById('info-box');
		if (!this.infoBoxElement) { console.error('#info-box not found!'); return; }

		// Skip updating the info box if we're dragging the graph
		if (this.isDraggingGraph) {
			return;
		}

		let infoText: string[] = [];
		if (this.hoveredPoint) { /* ... populate for point ... */
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
				const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
				let weeklyDistance = 0, weeklyTime = 0, weekActivityCount = 0;
				this.activities.forEach(act => {
					const actDate = new Date(act.start_date_local);
					if (actDate >= weekStart && actDate < weekEnd) {
						weekActivityCount++; weeklyDistance += act.distance || 0; weeklyTime += act.moving_time || 0;
					}
				});
				infoText.push(`Activities: ${weekActivityCount}`);
				infoText.push(`Distance: ${(weeklyDistance / 1000).toFixed(1)} km`);
				infoText.push(`Duration: ${formatSecondsToTime(weeklyTime)}`);
			}
		} else if (this.hoveredColumn) { /* ... populate for column ... */
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
			} else { infoText.push(`Pace: N/A`); }
			if (activity.average_heartrate) { infoText.push(`Avg HR: ${activity.average_heartrate.toFixed(0)} bpm`); }
			if (activity.suffer_score) { infoText.push(`Suffer Score: ${activity.suffer_score}`); }
		} else {
			infoText.push("Move the slider over points or workout bars to see details.");
		}
		const infoHTML = infoText.map(line => line === '' ? '<hr>' : `<p>${line}</p>`).join('');
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
			const isInsidePanArea = touchPos.y > this.padding.top && touchPos.y < this.canvasHeight - this.padding.bottom &&
				touchPos.x > this.padding.left && touchPos.x < this.canvasWidth - this.padding.right;

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
			const newSliderX = this.p.constrain(touchPos.x, this.padding.left, this.canvasWidth - this.padding.right);
			this.sliderX = newSliderX;
		}
		// Handle Graph Pan 
		else if (this.isDraggingGraph) {
			const dx = touchPos.x - this.dragStartX;
			const newOffsetX = this.dragStartOffsetX - dx;
			const maxOffsetX = Math.max(0, this.totalGraphContentWidth - this.graphWidth);
			const constrainedOffsetX = this.p.constrain(newOffsetX, 0, maxOffsetX);
			this.viewOffsetX = constrainedOffsetX;
		}
	}

	private handleTouchEnd(event: TouchEvent): void {
		if (event.touches.length === 0) {
			if (this.isDraggingSlider) {
				this.isDraggingSlider = false;
			}
			if (this.isDraggingGraph) {
				this.isDraggingGraph = false;
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
			p.mouseY > this.padding.top && p.mouseY < this.canvasHeight - this.padding.bottom &&
			p.mouseX > this.padding.left && p.mouseX < this.canvasWidth - this.padding.right) {
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
			this.sliderX = p.constrain(p.mouseX, this.padding.left, this.canvasWidth - this.padding.right);
		}
		else if (this.isDraggingGraph) {
			const dx = p.mouseX - this.dragStartX;
			const newOffsetX = this.dragStartOffsetX - dx;
			this.viewOffsetX = p.constrain(newOffsetX, 0, Math.max(0, this.totalGraphContentWidth - this.graphWidth));
			p.cursor('grabbing');
		}
	}

	private handleMouseReleased(): void {
		const p = this.p;
		if (this.isDraggingSlider) {
			this.isDraggingSlider = false;
			p.cursor(p.ARROW);
		}
		if (this.isDraggingGraph) {
			this.isDraggingGraph = false;
			p.cursor(p.ARROW);
		}
	}

	// --- Window Resize Handler ---
	public windowResized(): void {
		this.updateDimensionsAndCanvas(true);
	}

} // End GoalGraphRenderer Class
