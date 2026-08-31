// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://khaister.github.io',
	base: '/expressive-code-word-wrap',
	integrations: [
		starlight({
			title: 'Expressive Code Word Wrap',
			logo: {
				src: './src/assets/logo.svg',
				alt: 'Expressive Code Word Wrap logo',
			},
			description: 'An Expressive Code plugin that lets readers manually toggle word wrap on individual code blocks.',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/khaister/expressive-code-word-wrap',
				},
			],
			sidebar: ['usage'],
			customCss: ['./src/styles.css'],
		}),
	],
});
