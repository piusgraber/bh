import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// Vercel adapter options
			runtime: 'nodejs20.x',
			regions: ['fra1'], // Frankfurt region for EU deployment
			maxDuration: 10 // Maximum execution time in seconds for serverless functions
		})
	}
};

export default config;
