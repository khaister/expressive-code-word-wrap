# expressive-code-word-wrap

An [Expressive Code](https://expressive-code.com/) plugin that adds a button to every code block, letting readers manually toggle word wrap on and off — similar to the built-in "Copy to clipboard" button.

Expressive Code already supports word wrap, but only as a static, build-time setting (`wrap: true` in a code fence's meta string, or as a `defaultProps` config). This plugin adds a client-side toggle on top of that, so wrap can be turned on or off per code block at read time, regardless of how (or whether) `wrap` was configured for that block.

## Installation

```sh
npm install @khaister/expressive-code-word-wrap
```

## Usage

Import the plugin's initialization function and add it to your Expressive Code configuration's `plugins` array.

### Astro (`astro-expressive-code`)

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astroExpressiveCode from "astro-expressive-code";
import { pluginWordWrap } from "expressive-code-word-wrap";

export default defineConfig({
  integrations: [
    astroExpressiveCode({
      plugins: [pluginWordWrap()],
    }),
  ],
});
```

### Starlight

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import { pluginWordWrap } from "expressive-code-word-wrap";

export default defineConfig({
  integrations: [
    starlight({
      title: "My Docs",
      expressiveCode: {
        plugins: [pluginWordWrap()],
      },
    }),
  ],
});
```

### Plain Expressive Code (e.g. Next.js via `remark-expressive-code`)

```js
import { pluginWordWrap } from "expressive-code-word-wrap";

const config = {
  plugins: [pluginWordWrap()],
};
```

It composes with `@expressive-code/plugin-frames` — if you use both, the button joins the same button group as "Copy to clipboard", matching its size, spacing, and hover auto-hide behavior exactly. Plugin order in the `plugins` array doesn't matter.

## Options

```js
pluginWordWrap({
  // Set to `false` to hide the button and only compute the CSS
  // variables word wrap needs (useful if you want to build your own UI)
  // Default: true
  showButton: true,

  // Keep wrapped lines aligned with their original indentation level,
  // matching the built-in `preserveIndent` option
  // Default: true
  preserveIndent: true,
})
```

## Styling

This plugin registers a `wordWrap` style setting namespace that can be customized via Expressive Code's `styleOverrides` config option, the same way you'd customize any other plugin's styles:

```js
astroExpressiveCode({
  plugins: [pluginWordWrap()],
  styleOverrides: {
    wordWrap: {
      // icon: createInlineSvgUrl([...]),
    },
  },
});
```

## How it works

Expressive Code's built-in word wrap is a CSS class flip: a `wrap` class on the code block's `<pre>` element switches `white-space` from `pre` to `pre-wrap`. This plugin:

1. Always computes the `--ecMaxLine` and (optionally) `--ecIndent` CSS variables that Expressive Code's wrap styles rely on, even for blocks that weren't statically configured with `wrap: true`.
2. Renders a toggle button into each code block via the `postprocessRenderedBlock` hook.
3. Ships a small client-side script (`jsModules`) that toggles the `wrap` class on the nearest `<pre>` when the button is clicked, and re-initializes buttons after client-side navigation (including Astro view transitions).

## Credits

The default button icon is the [`text-wrap`](https://lucide.dev/icons/text-wrap) icon from [Lucide](https://lucide.dev/), used under Lucide's [ISC License](https://github.com/lucide-icons/lucide/blob/main/LICENSE).
