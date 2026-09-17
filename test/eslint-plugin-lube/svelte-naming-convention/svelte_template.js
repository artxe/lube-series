import svelte_parser from "svelte-eslint-parser"
const language_options = { parser: svelte_parser }
/**
 * @param {import("eslint").RuleTester.ValidTestCase[]} valid
 * @param {import("eslint").RuleTester.InvalidTestCase[]} invalid
 */
export function cases(valid, invalid) {
	valid.push(
		{
			code: "<script>\n\tconst items = []\n</script>\n{#each items as itemValue}<b>{itemValue}</b>{/each}",
			filename: "a.svelte",
			languageOptions: language_options
		},
		{
			code: "<Comp let:slotValue>{slotValue}</Comp>",
			filename: "a.svelte",
			languageOptions: language_options
		},
		{
			code: "<script>\n\tconst Comp = null\n</script>\n<Comp />",
			filename: "a.svelte",
			languageOptions: language_options
		}
	)
	invalid.push(
		{
			code: "<script>\n\tconst fooBar = 1\n</script>\n<p>{fooBar}</p>",
			errors: [
				...new Array(2).fill({ messageId: "rename" })
			],
			filename: "a.svelte",
			languageOptions: language_options,
			output: "<script>\n\tconst fooBar = 1\n</script>\n<p>{foo_bar}</p>"
		},
		{
			code: "<script>\n\tconst fooBar = 1\n</script>\n<Comp {fooBar} />",
			errors: [
				...new Array(2).fill({ messageId: "rename" })
			],
			filename: "a.svelte",
			languageOptions: language_options,
			output: "<script>\n\tconst fooBar = 1\n</script>\n<Comp fooBar={foo_bar} />"
		},
		{
			code: "<script>\n\tconst fooBar = 1\n</script>\n<Comp attr={fooBar} {...fooBar} />",
			errors: [
				...new Array(3).fill({ messageId: "rename" })
			],
			filename: "a.svelte",
			languageOptions: language_options,
			output: "<script>\n\tconst fooBar = 1\n</script>\n<Comp attr={foo_bar} {...foo_bar} />"
		},
		{
			code: "<script>\n\tconst fooBar = []\n</script>\n{#if fooBar}a{/if}\n{#each fooBar as v}{v}{/each}\n{#key fooBar}x{/key}",
			errors: [
				...new Array(4).fill({ messageId: "rename" })
			],
			filename: "a.svelte",
			languageOptions: language_options,
			output: "<script>\n\tconst fooBar = []\n</script>\n{#if foo_bar}a{/if}\n{#each foo_bar as v}{v}{/each}\n{#key foo_bar}x{/key}"
		}
	)
}