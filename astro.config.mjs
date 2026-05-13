// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://earnwhere.vercel.app',
	output: 'static',
	adapter: vercel(),
	integrations: [mdx(), sitemap(), svelte()],
});
