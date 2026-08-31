import { defineEcConfig } from '@astrojs/starlight/expressive-code';
import { pluginWordWrap } from '@khaister/expressive-code-word-wrap';

export default defineEcConfig({
	plugins: [pluginWordWrap()],
});
