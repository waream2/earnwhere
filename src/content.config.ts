import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
	loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		category: z.enum(['debugging', 'architecture', 'tooling', 'process', 'til', 'meta']),
		hook: z.string(),
		draft: z.boolean().default(false),
	}),
});

const projects = defineCollection({
	loader: glob({ base: './src/content/projects', pattern: '**/*.{md,mdx}' }),
	schema: z.object({
		title: z.string(),
		summary: z.string(),
		tldr: z.string().optional(),
		image: z.string().optional(),
		date: z.coerce.date(),
		category: z.enum(['professional', 'personal', 'craft']),
		role: z.string().optional(),
		stack: z.array(z.string()).optional(),
		timeline: z.string().optional(),
		status: z.enum(['shipped', 'archived', 'in-progress']).optional(),
		links: z
			.array(
				z.object({
					label: z.string(),
					href: z.string().url(),
				}),
			)
			.optional(),
		draft: z.boolean().default(false),
	}),
});

export const collections = { posts, projects };
