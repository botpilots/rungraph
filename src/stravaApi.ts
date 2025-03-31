import { promises } from 'dns';
import { write } from 'fs';

// src/stravaApi.ts

// Basic interface for the Strava SummaryActivity object
// Based on common fields, might need adjustment based on actual API response
export interface StravaSummaryActivity {
	id: number;
	name: string;
	distance: number; // meters
	moving_time: number; // seconds
	elapsed_time: number; // seconds
	total_elevation_gain: number; // meters
	type: string; // e.g., "Run", "Ride"
	sport_type: string; // Added based on common usage
	start_date: string; // ISO 8601 format
	start_date_local: string; // ISO 8601 format
	timezone: string;
	utc_offset: number;
	location_city: string | null;
	location_state: string | null;
	location_country: string | null;
	achievement_count: number;
	kudos_count: number;
	comment_count: number;
	athlete_count: number;
	photo_count: number;
	map: {
		id: string;
		summary_polyline: string | null;
		resource_state: number;
	};
	trainer: boolean;
	commute: boolean;
	manual: boolean;
	private: boolean;
	visibility: string;
	flagged: boolean;
	gear_id: string | null;
	start_latlng: [number, number] | null;
	end_latlng: [number, number] | null;
	average_speed: number; // meters per second
	max_speed: number; // meters per second
	average_cadence?: number;
	average_watts?: number;
	max_watts?: number;
	weighted_average_watts?: number;
	kilojoules?: number;
	device_watts?: boolean;
	has_heartrate: boolean;
	average_heartrate?: number;
	max_heartrate?: number;
	heartrate_opt_out: boolean;
	display_hide_heartrate_option: boolean;
	elev_high?: number; // meters
	elev_low?: number; // meters
	upload_id: number | null;
	upload_id_str?: string;
	external_id: string | null;
	from_accepted_tag: boolean;
	pr_count: number;
	total_photo_count: number;
	has_kudoed: boolean;
	suffer_score?: number | null; // Added based on common usage
}


const STRAVA_API_BASE_URL = 'https://www.strava.com/api/v3';

/**
 * Fetches the logged-in athlete's activities from the Strava API.
 *
 * @param accessToken - The Strava API access token (obtained via OAuth).
 * @param before - An epoch timestamp to use for filtering activities that have taken place before a certain time.
 * @param after - An epoch timestamp to use for filtering activities that have taken place after a certain time.
 * @param page - Page number. Defaults to 1.
 * @param perPage - Number of items per page. Defaults to 30. Max 200.
 * @returns A promise that resolves to an array of StravaSummaryActivity objects.
 */
export async function fetchStravaActivities(
	accessToken: string,
	before?: number,
	after?: number,
	page: number = 1,
	perPage: number = 30 // Strava's default is 30, max is 200
): Promise<StravaSummaryActivity[]> {

	if (!accessToken) {
		throw new Error("Strava Access Token is required.");
	}

	// Clamp perPage to Strava's limits
	const validPerPage = Math.max(1, Math.min(perPage, 200));

	const params = new URLSearchParams({
		page: page.toString(),
		per_page: validPerPage.toString(),
	});

	if (before !== undefined) {
		params.append('before', before.toString());
	}
	if (after !== undefined) {
		params.append('after', after.toString());
	}

	const url = `${STRAVA_API_BASE_URL}/athlete/activities?${params.toString()}`;

	console.log(`Fetching Strava activities from: ${url}`); // Log the URL being fetched

	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
			},
		});

		console.log(`Strava API response status: ${response.status}`); // Log response status

		if (!response.ok) {
			// Attempt to read error details from the response body
			let errorBody = 'Could not read error body.';
			try {
				errorBody = await response.text(); // Use text() first in case it's not JSON
				console.error("Strava API Error Body:", errorBody);
				// Try parsing as JSON if it looks like it might be
				if (errorBody.trim().startsWith('{') || errorBody.trim().startsWith('[')) {
					const errorJson = JSON.parse(errorBody);
					errorBody = JSON.stringify(errorJson, null, 2); // Pretty print JSON
				}
			} catch (e) {
				console.error("Failed to parse error body:", e);
			}
			throw new Error(`Strava API request failed with status ${response.status}: ${response.statusText}. Body: ${errorBody}`);
		}

		const activities: StravaSummaryActivity[] = await response.json();
		console.log(`Successfully fetched ${activities.length} Strava activities.`); // Log success
		return activities;
	} catch (error) {
		console.error('Error fetching Strava activities:', error);
		// Re-throw the error so the calling code knows something went wrong
		throw error;
	}
}
