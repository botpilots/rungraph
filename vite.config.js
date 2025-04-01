import { defineConfig } from 'vite';

export default defineConfig({
	base: '/rungraph/', // Set base to repository name for GitHub Pages
	server: {
		host: true, // Allows access from other devices
	},
}); 