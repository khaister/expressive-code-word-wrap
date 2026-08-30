/**
 * Client-side script that is injected into every page containing code blocks
 * (via the plugin's `jsModules` property). It wires up click handling for all
 * word wrap toggle buttons, and re-initializes buttons that get added later,
 * e.g. by client-side routing or Astro view transitions.
 *
 * Modeled after `@expressive-code/plugin-frames`'s `copy-js-module.ts`.
 */
export const wordWrapClientScript = `
const buttonSelector = '.ec-word-wrap-button'

// The button either joins plugin-frames' copy button group (in which case it's
// always immediately preceded by that group's own "pre" sibling), or it renders
// standalone inside its own positioned container.
function findPre(button) {
	const copyDiv = button.closest('.copy')
	if (copyDiv) {
		const pre = copyDiv.previousElementSibling
		if (pre && pre.tagName === 'PRE') return pre
	}
	return button.closest('.ec-word-wrap-container')?.querySelector('pre') ?? null
}

function toggleWrap(event) {
	const button = event.currentTarget
	const pre = findPre(button)
	if (!pre) return
	const isWrapped = pre.classList.toggle('wrap')
	button.setAttribute('aria-pressed', isWrapped ? 'true' : 'false')
}

function initButtons(container) {
	container.querySelectorAll?.(buttonSelector).forEach((button) => {
		if (button.dataset.wordWrapInit) return
		button.dataset.wordWrapInit = 'true'
		button.addEventListener('click', toggleWrap)
	})
}

// Initialize all buttons that exist right now
initButtons(document)

// Initialize any new buttons added later
const wordWrapObserver = new MutationObserver((mutations) =>
	mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => initButtons(node)))
)
wordWrapObserver.observe(document.body, { childList: true, subtree: true })

// Re-initialize after view transitions initiated by popular frameworks
document.addEventListener('astro:page-load', () => initButtons(document))
`
