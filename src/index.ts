import { AttachedPluginData, createInlineSvgUrl, definePlugin, PluginStyleSettings, PluginTexts } from '@expressive-code/core'
import type { ResolverContext } from '@expressive-code/core'
import { getClassNames, getInlineStyles, h, matches, select, setInlineStyle } from '@expressive-code/core/hast'
import type { Element } from '@expressive-code/core/hast'
import { wordWrapClientScript } from './client-script'

export interface PluginWordWrapOptions {
	/**
	 * If `true`, a button is rendered on every code block that allows readers
	 * to manually toggle word wrap on and off.
	 *
	 * If you set this to `false`, the plugin will still compute the CSS
	 * variables required for word wrap to render correctly (see `preserveIndent`),
	 * but won't render or wire up a button. This can be useful if you want to
	 * build your own UI and just toggle the `wrap` class on the `pre` element yourself.
	 *
	 * @default true
	 */
	showButton?: boolean | undefined
	/**
	 * If `true`, wrapped lines will be indented to align with their original
	 * indentation level once word wrap is toggled on, matching the behavior of
	 * Expressive Code's built-in `preserveIndent` option.
	 *
	 * This is calculated for every code block regardless of its static `wrap`
	 * configuration, so that manually toggling wrap on the client always
	 * produces the same result as configuring `wrap: true` would at build time.
	 *
	 * @default true
	 */
	preserveIndent?: boolean | undefined
}

export interface WordWrapStyleSettings {
	/**
	 * An inline SVG URL for the toggle button icon.
	 *
	 * Expects a string in the format `url("data:image/svg+xml,...")`, which can
	 * be generated from the contents of an SVG file using `createInlineSvgUrl`.
	 */
	icon: string
}

declare module '@expressive-code/core' {
	export interface StyleSettings {
		wordWrap: WordWrapStyleSettings
	}
}

export const wordWrapStyleSettings = new PluginStyleSettings({
	defaultValues: {
		wordWrap: {
			icon: createInlineSvgUrl([
				`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'>`,
				`<path d='m16 16-3 3 3 3'/>`,
				`<path d='M3 12h14.5a1 1 0 0 1 0 7H13'/>`,
				`<path d='M3 19h6'/>`,
				`<path d='M3 5h18'/>`,
				`</svg>`,
			]),
		},
	},
})

export const pluginWordWrapTexts = new PluginTexts({
	tooltip: 'Toggle word wrap',
})

/**
 * Tracks the button built for each code block in `postprocessRenderedBlock` (where we still
 * have access to the block's locale), so it can be inserted into the right spot once every
 * plugin has finished rendering every block in the group (see `postprocessRenderedBlockGroup`).
 */
const wordWrapData = new AttachedPluginData<{ button?: Element | undefined }>(() => ({}))

function getWordWrapBaseStyles(context: ResolverContext) {
	const { cssVar } = context
	return `
		/* Positions the button when there's no frames copy button group to join
		   (e.g. plugin-frames isn't installed, or its copy button is disabled) */
		.ec-word-wrap-container {
			position: relative;
		}
		.ec-word-wrap-container > .word-wrap-button-slot {
			position: absolute;
			inset-block-start: calc(${cssVar('borderWidth')} + 0.4rem);
			inset-inline-end: calc(${cssVar('borderWidth')} + ${cssVar('uiPaddingInline')} / 2);
			z-index: 1;

			/* Hide the button when there is no JavaScript to make it work */
			@media (scripting: none) {
				display: none;
			}
		}

		/*
			Button appearance. Deliberately kept at low CSS specificity (a single class) so that
			when this button ends up inside plugin-frames' ".copy" button group, frames' own
			higher-specificity ".copy button" rules take over for sizing, spacing and the
			hover/focus auto-hide behavior, making our button look and behave exactly like the
			copy button it sits next to. These rules are only what's needed for the standalone case.
		*/
		.ec-word-wrap-button {
			position: relative;
			margin: 0;
			padding: 0;
			border: none;
			border-radius: 0.2rem;
			cursor: pointer;
			color: ${cssVar('codeForeground')};
			background: ${cssVar('codeBackground')};
			width: 2.5rem;
			height: 2.5rem;
			opacity: 0.75;
			transition-property: opacity, background;
			transition-duration: 0.2s;
			transition-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);

			&::after {
				content: '';
				position: absolute;
				pointer-events: none;
				inset: 0;
				background-color: currentColor;
				-webkit-mask-image: ${cssVar('wordWrap.icon')};
				-webkit-mask-repeat: no-repeat;
				mask-image: ${cssVar('wordWrap.icon')};
				mask-repeat: no-repeat;
				margin: 0.475rem;
				line-height: 0;
			}

			&:hover,
			&:focus-visible {
				opacity: 1;
			}
		}
		@media (hover: hover) {
			/* If a mouse is available, hide the button by default and make it smaller,
			   matching plugin-frames' own copy button behavior */
			.ec-word-wrap-button {
				opacity: 0;
				width: 2rem;
				height: 2rem;
			}
			.ec-word-wrap-container:hover .ec-word-wrap-button:not(:hover),
			.ec-word-wrap-container:focus-within .ec-word-wrap-button:not(:hover) {
				opacity: 0.75;
			}
		}

		/* When joining plugin-frames' copy button group, only the icon needs overriding —
		   everything else (size, spacing, auto-hide) is inherited from frames' own styles */
		.copy button.ec-word-wrap-button::after {
			-webkit-mask-image: ${cssVar('wordWrap.icon')};
			mask-image: ${cssVar('wordWrap.icon')};
		}

		/* Give the first line of code room for our extra button so wide lines don't run under it */
		pre:has(+ .copy > .ec-word-wrap-button) :nth-child(1 of .ec-line) .code {
			padding-inline-end: calc(4rem + ${cssVar('codePaddingInline')});
		}
	`
}

/**
 * Finds the `pre` element inside the given AST node, whether it's the node itself
 * (the common case) or a descendant of it (e.g. when `plugin-frames` has already
 * wrapped it in a `figure` element).
 */
function findPreElement(node: Element): Element | undefined {
	if (matches('pre', node)) return node
	const found = select('pre', node)
	return found?.type === 'element' ? found : undefined
}

/**
 * Turns `node` into a wrapper around its own previous contents plus `extraChildren`, in place.
 *
 * This lets us "wrap" an already-rendered block without needing access to its parent's
 * children array (which `postprocessRenderedBlockGroup` doesn't expose per block).
 */
function wrapNodeInPlace(node: Element, className: string, extraChildren: Element[]) {
	const originalContents: Element = { type: 'element', tagName: node.tagName, properties: node.properties, children: node.children }
	node.tagName = 'div'
	node.properties = { className: [className] }
	node.children = [originalContents, ...extraChildren]
}

export function pluginWordWrap(options: PluginWordWrapOptions = {}) {
	const { showButton = true, preserveIndent = true } = options

	return definePlugin({
		name: 'Word Wrap',
		styleSettings: wordWrapStyleSettings,
		baseStyles: (context) => getWordWrapBaseStyles(context),
		jsModules: showButton ? [wordWrapClientScript] : undefined,
		hooks: {
			postprocessRenderedBlock: ({ codeBlock, renderData, locale }) => {
				const texts = pluginWordWrapTexts.get(locale)
				const blockAst = renderData.blockAst

				const preElement = findPreElement(blockAst)
				if (!preElement) return

				// Always provide the CSS variable the wrap styles rely on, even if this
				// block was not statically configured with `wrap: true`. This ensures
				// manually toggling wrap on the client works for every code block.
				const maxLineLength = codeBlock.getLines().reduce((max, line) => Math.max(max, line.text.length), 0)
				setInlineStyle(preElement, '--ecMaxLine', `${maxLineLength}ch`)

				// Compute a hanging indent for every line so wrapped continuations line up
				// under their line's original indentation, matching the built-in `preserveIndent` option
				if (preserveIndent) {
					const codeElement = select('code', preElement)
					const lineElements = (codeElement?.type === 'element' ? codeElement.children : []).filter((node): node is Element => node.type === 'element')
					codeBlock.getLines().forEach((line, lineIndex) => {
						const lineElement = lineElements[lineIndex]
						if (!lineElement) return
						// Don't override an indent that was already computed by core
						// because this block was statically configured with `wrap: true`
						if (getInlineStyles(lineElement).has('--ecIndent')) return
						const indent = line.text.match(/^\s*/)?.[0].length ?? 0
						if (indent > 0) setInlineStyle(lineElement, '--ecIndent', `${indent}ch`)
					})
				}

				if (!showButton) return

				const isWrapped = getClassNames(preElement).includes('wrap')

				// Build the button now (while we still have `locale` for its tooltip text), but
				// don't insert it yet — where it goes depends on whether plugin-frames has
				// rendered a copy button for this block, which we can't know for certain until
				// every plugin has finished processing every block (see below).
				const button = h(
					'button',
					{
						type: 'button',
						className: 'ec-word-wrap-button',
						title: texts.tooltip,
						'aria-label': texts.tooltip,
						'aria-pressed': isWrapped ? 'true' : 'false',
					},
					[h('div')]
				)
				wordWrapData.setFor(codeBlock, { button })
			},
			postprocessRenderedBlockGroup: ({ renderedGroupContents }) => {
				if (!showButton) return

				renderedGroupContents.forEach(({ codeBlock, renderedBlockAst }) => {
					const { button } = wordWrapData.getOrCreateFor(codeBlock)
					if (!button) return

					// If plugin-frames rendered a copy button for this block (regardless of
					// whether it's listed before or after this plugin), join its button group
					// so ours matches its size, spacing and auto-hide behavior exactly.
					const copyDiv = select('.copy', renderedBlockAst)
					if (copyDiv?.type === 'element') {
						copyDiv.children.unshift(button)
						return
					}

					// Otherwise, render our own positioned button
					wrapNodeInPlace(renderedBlockAst, 'ec-word-wrap-container', [h('div', { className: 'word-wrap-button-slot' }, [button])])
				})
			},
		},
	})
}
