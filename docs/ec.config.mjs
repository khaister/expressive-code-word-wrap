import { defineEcConfig } from '@astrojs/starlight/expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { pluginWordWrap } from '@khaister/expressive-code-word-wrap';

export default defineEcConfig({
	plugins: [pluginLineNumbers(), pluginWordWrap()],
	defaultProps: {
		// Disable line numbers by default; opt in per block with `showLineNumbers`.
		showLineNumbers: false,
	},
	styleOverrides: {
		borderRadius: '0.5rem',
	},
});
