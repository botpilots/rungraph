#!/bin/bash

# Description: Exchanges a Strava authorization code for an access token and refresh token,
#              then updates the .env and .secrets files with the new tokens.
# Usage: ./scripts/exchange_strava_code.sh <authorization_code>
# Make sure this script is run from the repository root where the .env and .secrets files exist.

set -e # Exit immediately if a command exits with a non-zero status.

# --- Configuration ---
SECRETS_FILE=".secrets"
ENV_FILE=".env"
# --- End Configuration ---

# --- Helper Functions ---
# Function to update a key-value pair in a file
# Usage: update_file <file_path> <key_name> <new_value>
update_file() {
	local file_path="$1"
	local key_name="$2"
	local new_value="$3"
	local temp_file
	temp_file=$(mktemp)

	if [ ! -f "$file_path" ]; then
		echo "Error: File '$file_path' not found for updating." >&2
		rm "$temp_file"
		return 1
	fi

	# Escape slashes in the new value for sed
	escaped_value=$(echo "$new_value" | sed 's/\//\\\//g')

	# Use sed to replace the line starting with key_name=, handling potential existing comments
	# This pattern replaces the whole line starting with the key to avoid partial replacements
	sed "s/^${key_name}=.*/${key_name}=${escaped_value}/" "$file_path" >"$temp_file"

	# Check if sed command was successful and actually made a change
	if [ $? -ne 0 ]; then
		echo "Error: sed command failed while updating '$key_name' in '$file_path'." >&2
		rm "$temp_file"
		return 1
	fi

	# Check if the key existed and was replaced (crude check)
	if ! grep -q "^${key_name}=${escaped_value}" "$temp_file"; then
		echo "Error: Failed to find/update key '$key_name=' in '$file_path'. Key might be missing or commented out." >&2
		rm "$temp_file"
		return 1
	fi

	# Replace original file with the temporary file
	mv "$temp_file" "$file_path"
	if [ $? -ne 0 ]; then
		echo "Error: Failed to move temp file to '$file_path'." >&2
		return 1
	fi

	echo "Successfully updated '$key_name' in '$file_path'."
	return 0
}
# --- End Helper Functions ---

# Check for jq dependency
if ! command -v jq &>/dev/null; then
	echo "Error: 'jq' command not found. Please install jq (e.g., brew install jq or sudo apt-get install jq)." >&2
	exit 1
fi

# Check if secrets file exists
if [ ! -f "$SECRETS_FILE" ]; then
	echo "Error: Secrets file not found at '$SECRETS_FILE'." >&2
	exit 1
fi

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
	echo "Error: Environment file not found at '$ENV_FILE'." >&2
	exit 1
fi

# Read secrets from the file
CLIENT_ID=$(grep '^STRAVA_CLIENT_ID=' "$SECRETS_FILE" | cut -d'=' -f2-)
CLIENT_SECRET=$(grep '^STRAVA_CLIENT_SECRET=' "$SECRETS_FILE" | cut -d'=' -f2-)

# Validate that secrets were read
if [ -z "$CLIENT_ID" ]; then
	echo "Error: Could not read STRAVA_CLIENT_ID from $SECRETS_FILE." >&2
	exit 1
fi
if [ -z "$CLIENT_SECRET" ]; then
	echo "Error: Could not read STRAVA_CLIENT_SECRET from $SECRETS_FILE." >&2
	exit 1
fi

# Check if authorization code is provided as an argument
if [ -z "$1" ]; then
	echo "Usage: $0 <authorization_code>"
	echo "Please provide the 'code' parameter from the Strava redirect URL as the first argument."
	exit 1
fi

AUTH_CODE="$1"

# Perform the token exchange using curl and capture the output
echo "Exchanging authorization code for tokens..."
RESPONSE=$(
	curl -s -X POST https://www.strava.com/api/v3/oauth/token \
		-d client_id="$CLIENT_ID" \
		-d client_secret="$CLIENT_SECRET" \
		-d code="$AUTH_CODE" \
		-d grant_type=authorization_code \
		--fail # Exit with error if HTTP request fails
)

# Check if curl command failed
if [ $? -ne 0 ]; then
	echo "Error: curl command failed during token exchange. Response was:" >&2
	echo "$RESPONSE" >&2 # Print response even on failure if curl didn't use --fail correctly
	exit 1
fi

# Parse the response using jq
echo "Parsing response..."
ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')
REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.refresh_token')
EXPIRES_AT=$(echo "$RESPONSE" | jq -r '.expires_at')

# Validate extracted tokens
if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" == "null" ]; then
	echo "Error: Failed to extract access_token from Strava response." >&2
	echo "Response: $RESPONSE" >&2
	exit 1
fi
if [ -z "$REFRESH_TOKEN" ] || [ "$REFRESH_TOKEN" == "null" ]; then
	echo "Error: Failed to extract refresh_token from Strava response." >&2
	echo "Response: $RESPONSE" >&2
	exit 1
fi

echo "Tokens received successfully."
# echo "  Access Token: $ACCESS_TOKEN" # Optionally print for verification, but be careful with logs
echo "  Refresh Token: $REFRESH_TOKEN"
# echo "  Expires At: $EXPIRES_AT"

# Update .env file
echo "Updating $ENV_FILE..."
update_file "$ENV_FILE" "VITE_STRAVA_ACCESS_TOKEN" "$ACCESS_TOKEN"
if [ $? -ne 0 ]; then exit 1; fi

# Update .secrets file
echo "Updating $SECRETS_FILE..."
update_file "$SECRETS_FILE" "STRAVA_REFRESH_TOKEN" "$REFRESH_TOKEN"
if [ $? -ne 0 ]; then exit 1; fi

echo "--- Script finished successfully ---"
